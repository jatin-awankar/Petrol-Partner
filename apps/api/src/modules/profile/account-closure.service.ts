import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { pilotReceiptStore, restrictProtectedWrites } from "../protected-mutation/receipt-evidence";
import { backupStatus } from "../operator/backup-status";
import { withTransaction } from "../../db/transaction";
import { closureQuery } from "./account-closure.repo";

type ClosureReceipt={operationId:string;closureId:string;event:string;actorId:string|null;
  subjectId:string;snapshot:unknown;recordedAt:string};
const store=()=>pilotReceiptStore<ClosureReceipt>("account-closure","Closure recovery evidence unavailable");
const receipt=(row:any):ClosureReceipt=>({operationId:row.id,closureId:row.closure_id,
  event:row.event,actorId:row.actor_id,subjectId:row.subject_id,
  snapshot:row.snapshot,recordedAt:new Date(row.recorded_at).toISOString()});
async function acknowledge(event:any) {
  if(event.state==='acknowledged'||event.state==='recovered') {
    try {
      const independent=(await store().list()).find(item=>item.operationId===event.id);
      if(JSON.stringify(independent)!==JSON.stringify(receipt(event)))
        throw new AppError(503,"Closure recovery evidence missing","RECOVERY_MISSING");
      return;
    } catch(error) {
      await restrictProtectedWrites(pool,"account_closure_evidence_unavailable");
      throw error;
    }
  }
  try {
    await store().append(receipt(event));
    await withTransaction(async client=>{
      const current=(await closureQuery(client,"eventForUpdate",[event.id])).rows[0];
      if(current.state!=='committed') return;
      const backup=await backupStatus(client);
      if(backup.required&&!backup.healthy)
        throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      await closureQuery(client,"acknowledgeEvent",[event.id]);
    });
  } catch {
    await restrictProtectedWrites(pool,"account_closure_evidence_pending");
    throw new AppError(503,"Closure operation committed; recovery evidence pending",
      "OPERATION_PENDING",{operationId:event.id});
  }
}
async function assertWritable(client:import("pg").PoolClient){
  const mode=(await closureQuery(client,"recoveryModeForUpdate")).rows[0]?.mode;
  if(mode!=="open") throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
}

export const accountClosureService = {
  receipts(){return store().list();},
  async pending(){return (await closureQuery(pool,"pendingEvents")).rows;},
  async verifyEvidence(){
    try {
      const receipts=await this.receipts();
      const primary=(await closureQuery(pool,"allEvents")).rows;
      const byId=new Map(receipts.map(item=>[item.operationId,item]));
      for(const row of primary){
        if(row.state==='committed') throw new AppError(503,"Closure evidence pending","OPERATION_PENDING",
          {operationId:row.id});
        if(JSON.stringify(byId.get(row.id))!==JSON.stringify(receipt(row)))
          throw new AppError(503,"Closure recovery evidence missing","RECOVERY_MISSING");
      }
      for(const item of receipts){
        const row=primary.find(value=>value.id===item.operationId);
        if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))
          throw new AppError(503,"Closure recovery evidence conflicts","RECOVERY_CONFLICT");
      }
    }catch(error){
      if(!(error instanceof AppError&&error.code==='OPERATION_PENDING'))
        await restrictProtectedWrites(pool,"account_closure_evidence_unavailable");
      throw error;
    }
  },
  async reconcileReceipts(operatorId:string){
    const receipts=await this.receipts();
    for(const item of receipts.sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)
      || a.operationId.localeCompare(b.operationId))){
      await withTransaction(async client=>{
        await assertCurrentOperator(client,operatorId);
        const current=(await closureQuery(client,"eventById",[item.operationId])).rows[0];
        if(current){
          if(JSON.stringify(receipt(current))!==JSON.stringify(item))
            throw new AppError(409,"Closure recovery conflict","RECOVERY_CONFLICT");
          if(current.state==='committed') await closureQuery(client,"markRecovered",[item.operationId]);
          return;
        }
        const snapshot=item.snapshot as Record<string,unknown>;
        if(item.event==="requested"){
          if(snapshot.id!==item.closureId||snapshot.user_id!==item.actorId)
            throw new AppError(409,"Closure receipt is invalid","RECOVERY_CONFLICT");
          if(!(await closureQuery(client,"lockUser",[snapshot.user_id])).rowCount)
            throw new AppError(409,"Closure user missing","RECOVERY_INCOMPLETE");
          await closureQuery(client,"restoreClosure",[snapshot.id,snapshot.user_id,snapshot.requested_at,
            snapshot.due_at,snapshot.status,snapshot.last_error_code,snapshot.attempts,snapshot.updated_at]);
        } else if(item.event==="hold_added"){
          if(snapshot.id!==item.subjectId||snapshot.closure_id!==item.closureId||
            snapshot.operator_id!==item.actorId)
            throw new AppError(409,"Closure hold receipt is invalid","RECOVERY_CONFLICT");
          if(!(await closureQuery(client,"lockClosure",[item.closureId])).rowCount)
            throw new AppError(409,"Closure request missing","RECOVERY_INCOMPLETE");
          await closureQuery(client,"restoreHold",[snapshot.id,snapshot.closure_id,snapshot.scope,
            snapshot.reason,snapshot.operator_id,snapshot.review_at,snapshot.created_at,
            snapshot.idempotency_key]);
          await closureQuery(client,"markHeld",[item.closureId]);
        } else if(item.event==="hold_released"){
          if(snapshot.id!==item.subjectId||snapshot.closure_id!==item.closureId||
            snapshot.released_by!==item.actorId||!snapshot.released_at)
            throw new AppError(409,"Closure release receipt is invalid","RECOVERY_CONFLICT");
          const hold=(await closureQuery(client,"holdForUpdate",[item.subjectId])).rows[0];
          if(!hold) throw new AppError(409,"Closure hold missing","RECOVERY_INCOMPLETE");
          if(hold.released_at) throw new AppError(409,"Closure hold release conflicts","RECOVERY_CONFLICT");
          await closureQuery(client,"restoreHoldRelease",[item.subjectId,snapshot.released_at,
            snapshot.released_by,snapshot.release_reason,snapshot.release_key]);
          if(!(await closureQuery(client,"activeHolds",[item.closureId])).rowCount){
            const closure=(await closureQuery(client,"lockClosure",[item.closureId])).rows[0];
            const commitment=(await closureQuery(client,"activeCommitments",[closure.user_id])).rows[0].blocked;
            const cases=(await closureQuery(client,"openCases",[closure.user_id])).rows[0].blocked;
            if(!commitment&&!cases) await closureQuery(client,"markPending",[item.closureId]);
          }
        } else throw new AppError(409,"Closure event recovery needs review","RECOVERY_INCOMPLETE");
        await closureQuery(client,"restoreEvent",[item.operationId,item.closureId,item.event,item.actorId,
          item.subjectId,item.snapshot,item.recordedAt]);
      });
    }
    return receipts.length;
  },
  async request(userId: string) {
    const {closure,event}=await withTransaction(async client => {
      if (!(await closureQuery(client,"lockUser",[userId])).rowCount)
        throw new AppError(404,"Account not found","ACCOUNT_NOT_FOUND");
      const existing = (await closureQuery(client,"existing",[userId])).rows[0];
      if (existing) return {closure:existing,event:(await closureQuery(client,"eventBySubject",
        ["requested",existing.id])).rows[0]};
      await assertWritable(client);
      const commitment = (await closureQuery(client,"activeCommitments",[userId])).rows[0].blocked;
      const cases = (await closureQuery(client,"openCases",[userId])).rows[0].blocked;
      const closure = (await closureQuery(client,"create",[userId,commitment||cases?"held":"pending"])).rows[0];
      const event=(await closureQuery(client,"event",[closure.id,"requested",userId,closure.id,closure])).rows[0];
      return {closure,event};
    });
    await acknowledge(event);
    return closure;
  },
  async mine(userId: string) {
    const result = await closureQuery(pool,"mine",[userId]);
    return result.rows[0] ?? null;
  },
  async queue(operatorId: string, limit=100, offset=0) {
    return withTransaction(async client => {
      await assertCurrentOperator(client,operatorId);
      return (await closureQuery(client,"queue",[limit,offset])).rows;
    });
  },
  async status(operatorId: string) {
    return withTransaction(async client => {
      await assertCurrentOperator(client,operatorId);
      return (await closureQuery(client,"status")).rows[0];
    });
  },
  async hold(operatorId: string, key: string, closureId: string, scope: string, reason: string, reviewAt: Date) {
    const {hold,event}=await withTransaction(async client => {
      await assertCurrentOperator(client,operatorId);
      await closureQuery(client,"lockKey",[`retention-hold:${operatorId}:${key}`]);
      const prior=(await closureQuery(client,"holdByKey",[operatorId,key])).rows[0];
      if (prior) {
        if (prior.closure_id!==closureId || prior.scope!==scope || prior.reason!==reason ||
          new Date(prior.review_at).getTime()!==reviewAt.getTime())
          throw new AppError(409,"Idempotency key reused with different hold","IDEMPOTENCY_CONFLICT");
        return {hold:prior,event:(await closureQuery(client,"eventBySubject",
          ["hold_added",prior.id])).rows[0]};
      }
      await assertWritable(client);
      const closure=(await closureQuery(client,"lockClosure",[closureId])).rows[0];
      if (!closure || closure.status==='completed') throw new AppError(404,"Closure not found","CLOSURE_NOT_FOUND");
      const hold=(await closureQuery(client,"addHold",[closureId,scope,reason,operatorId,reviewAt,key])).rows[0];
      await closureQuery(client,"markHeld",[closureId]);
      const event=(await closureQuery(client,"event",[closureId,"hold_added",operatorId,hold.id,hold])).rows[0];
      return {hold,event};
    });
    await acknowledge(event);
    return hold;
  },
  async release(operatorId: string, key: string, holdId: string, reason: string) {
    const {event}=await withTransaction(async client => {
      await assertCurrentOperator(client,operatorId);
      await closureQuery(client,"lockKey",[`retention-release:${operatorId}:${key}`]);
      const hold=(await closureQuery(client,"holdForUpdate",[holdId])).rows[0];
      if (!hold) throw new AppError(404,"Hold not found","HOLD_NOT_FOUND");
      if (hold.released_at) {
        if (hold.released_by!==operatorId || hold.release_key!==key || hold.release_reason!==reason)
          throw new AppError(409,"Hold already released","HOLD_ALREADY_RELEASED");
        return {event:(await closureQuery(client,"eventBySubject",
          ["hold_released",hold.id])).rows[0]};
      }
      await assertWritable(client);
      const closure=(await closureQuery(client,"lockClosure",[hold.closure_id])).rows[0];
      if(hold.scope==='legal_review')
        throw new AppError(409,"Legal review hold needs an approved release decision",
          "HOLD_CONDITION_UNVERIFIED");
      const commitment=(await closureQuery(client,"activeCommitments",[closure.user_id])).rows[0].blocked;
      const cases=(await closureQuery(client,"openCases",[closure.user_id])).rows[0].blocked;
      if((hold.scope==='commitment'&&commitment)||(hold.scope!=='commitment'&&cases))
        throw new AppError(409,"The recorded hold condition remains active","HOLD_CONDITION_ACTIVE");
      const result=await closureQuery(client,"releaseHold",[holdId,operatorId,reason,key]);
      const closureId=result.rows[0].closure_id;
      if (!(await closureQuery(client,"activeHolds",[closureId])).rowCount) {
        if (!commitment && !cases) await closureQuery(client,"markPending",[closureId]);
      }
      const snapshot=(await closureQuery(client,"holdForUpdate",[holdId])).rows[0];
      const event=(await closureQuery(client,"event",[closureId,"hold_released",operatorId,holdId,snapshot])).rows[0];
      return {event};
    });
    await acknowledge(event);
    return {released:true};
  },
};
