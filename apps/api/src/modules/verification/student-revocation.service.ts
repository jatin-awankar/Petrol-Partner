import {createHash} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {pool} from "../../db/pool";
import {AppError} from "../../shared/errors/app-error";
import {inProtectedTransaction} from "../protected-mutation/protocol";
import {pilotReceiptStore,restrictProtectedWrites} from "../protected-mutation/receipt-evidence";
import {backupStatus} from "../operator/backup-status";
import {assertCurrentOperator} from "../operator/operator.authorization";
import {operatorQuery} from "../operator/operator.repo";
import {recordDurableNotification} from "../notifications/contract.repo";
import * as repo from "./student-revocation.repo";
import * as effects from "./revocation-effects.repo";

type Receipt={operationId:string;operatorId:string;studentId:string;key:string;digest:string;
  reason:string;previousStatus:string;effectSnapshot:effects.Effect[];committedAt:string};
const store=()=>pilotReceiptStore<Receipt>("student-revocation","Revocation recovery evidence unavailable");
const digest=(studentId:string,reason:string)=>createHash("sha256")
  .update(JSON.stringify({studentId,reason})).digest("hex");
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,operatorId:row.operator_id,
  studentId:row.student_id,key:row.idempotency_key,digest:row.payload_digest,
  reason:row.reason,previousStatus:row.previous_status,effectSnapshot:row.effect_snapshot,
  committedAt:row.committed_at.toISOString()});
const result=(row:repo.Operation)=>({operation_id:row.id,student_id:row.student_id,state:row.state});

async function notifications(client:PoolClient,row:repo.Operation,items:effects.Effect[]) {
  await recordDurableNotification(client,{originType:"student_revocation",operationId:row.id,
    recipientId:row.student_id,eventType:"student_revoked",relatedEntityType:"student_verification",
    relatedEntityId:row.student_id,title:"Student eligibility suspended",
    body:"Your student eligibility is suspended. See your account and contact operator support."});
  const operators=await repo.operatorRecipients(client);
  for(const item of items) for(const recipientId of new Set([item.driver_id,...item.passenger_ids,
    ...(item.kind==="incident" ? operators : [])])) {
    await recordDurableNotification(client,{originType:"student_revocation",operationId:row.id,
      recipientId,eventType:`${item.kind}:${item.id}`,relatedEntityType:item.kind==="hold"
        ? "pilot_revocation_hold":"pilot_revocation_incident",relatedEntityId:item.id,
      title:item.kind==="hold" ? "Seat on hold":"Urgent trip incident",
      body:item.kind==="hold" ? "Eligibility changed. The confirmed seat remains reserved pending a recorded decision."
        : "Eligibility changed during an active trip. Operator support is reviewing it."});
  }
}

export class StudentRevocationService {
  constructor(private readonly db:Pool=pool){}
  async receipts(){return store().list();}
  async pending(){return (await repo.all(this.db)).filter(row=>row.state==="committed");}
  async verifyEvidence(retry?:{operatorId:string;key:string}) {
    try {
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      const receipts=new Map((await this.receipts()).map(item=>[item.operationId,item]));
      const operations=await repo.all(this.db);
      for(const item of receipts.values()) {
        const row=operations.find(row=>row.id===item.operationId);
        if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item)||
          item.digest!==digest(item.studentId,item.reason))
          throw new AppError(503,"Student revocation evidence conflicts","RECOVERY_CONFLICT");
      }
      for(const row of operations) {
        if(row.state!=="committed"&&JSON.stringify(receipts.get(row.id))!==JSON.stringify(receipt(row)))
          throw new AppError(503,"Student revocation evidence is missing","RECOVERY_MISSING");
        if(row.state!=="committed"&&!await effects.matches(this.db,row.id,"student",row.student_id,
          row.reason,row.effect_snapshot))
          throw new AppError(503,"Student revocation effects are missing","RECOVERY_MISSING");
        if(row.state==="committed"&&(!retry||row.operator_id!==retry.operatorId||
          row.idempotency_key!==retry.key))
          throw new AppError(503,"Student revocation awaits recovery evidence","OPERATION_PENDING",{operationId:row.id});
      }
    } catch(error) {
      if(!(error instanceof AppError&&error.code==="OPERATION_PENDING"))
        await restrictProtectedWrites(this.db,"student_revocation_evidence_unavailable");
      throw error;
    }
  }
  async operation(operatorId:string,id:string) {
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    const row=await repo.byId(this.db,id);
    if(!row||row.operator_id!==operatorId) throw new AppError(404,"Operation not found","OPERATION_NOT_FOUND");
    const recovery=await operatorQuery<{mode:string}>(this.db,"recoveryMode");
    return row.state==="committed"||recovery.rows[0]?.mode==="restricted"
      ? {operation_id:id,state:"pending_unknown"}:result(row);
  }
  async revoke(operatorId:string,key:string,studentId:string,reason:string) {
    const payloadDigest=digest(studentId,reason);
    const existing=await repo.byKey(this.db,operatorId,key);
    if(existing?.payload_digest!==undefined&&existing.payload_digest!==payloadDigest)
      throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
    if(existing?.state!=="committed") {
      if(existing) return this.operation(operatorId,existing.id);
    }
    await this.verifyEvidence({operatorId,key});
    try {await store().probe();} catch(error) {
      await restrictProtectedWrites(this.db,"student_revocation_evidence_unavailable");throw error;
    }
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,"recoveryModeForUpdate");
      await assertCurrentOperator(client,operatorId);
      await operatorQuery(client,"lockIdempotencyKey",[`student-revocation:${operatorId}:${key}`]);
      const prior=await repo.byKey(client,operatorId,key);
      if(prior) {
        if(prior.payload_digest!==payloadDigest)
          throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
        return prior;
      }
      if(recovery.rows[0]?.mode!=="open")
        throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
      await effects.lockActors(client,"student",studentId);
      await effects.lockAffectedTrips(client,"student",studentId);
      const previousStatus=await repo.previousStatus(client,studentId);
      if(!previousStatus) throw new AppError(404,"Student verification not found","STUDENT_NOT_FOUND");
      if(!["verified","revalidation_due"].includes(previousStatus))
        throw new AppError(409,"Student is not currently approved","STUDENT_REVIEW_CONFLICT");
      const row=await repo.insert(client,{operatorId,studentId,key,digest:payloadDigest,reason,previousStatus});
      await repo.apply(client,row);
      const affected=await effects.apply(client,"student",studentId,row.id,reason);
      row.effect_snapshot=await repo.saveEffectSnapshot(client,row.id,affected);
      await repo.audit(client,row);
      await notifications(client,row,affected);
      return row;
    });
    if(operation.state!=="committed") return result(operation);
    try {
      const saved=await inProtectedTransaction(this.db,async client=>{
        const row=await repo.byId(client,operation.id,true);
        if(!row) throw new AppError(503,"Revocation operation missing","RECOVERY_MISSING");
        if(row.state!=="committed") return row;
        await store().append(receipt(row));
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
        const done=await repo.acknowledge(client,row.id);
        await repo.readyNotifications(client,row.id);
        return done;
      });
      return result(saved);
    } catch {
      await restrictProtectedWrites(this.db,"student_revocation_evidence_pending");
      throw new AppError(503,"Revocation committed; recovery evidence pending","OPERATION_PENDING",{operationId:operation.id});
    }
  }
  async reconcileReceipts(operatorId:string) {
    const items=(await this.receipts()).sort((a,b)=>a.committedAt.localeCompare(b.committedAt));
    for(const item of items) {
      if(item.digest!==digest(item.studentId,item.reason))
        throw new AppError(409,"Revocation receipt is inconsistent","RECOVERY_CONFLICT");
      await inProtectedTransaction(this.db,async client=>{
        await assertCurrentOperator(client,operatorId);
        await repo.recover(client,item);
        const row=await repo.byId(client,item.operationId,true);
        if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))
          throw new AppError(409,"Revocation recovery conflicts","RECOVERY_CONFLICT");
        const applied=await repo.apply(client,row,true);
        const affected=row.effect_snapshot;
        await effects.restore(client,"student",row.student_id,row.id,row.reason,affected,applied);
        await repo.audit(client,row);
        await notifications(client,row,affected);
        await repo.readyNotifications(client,row.id);
        await repo.suppressRestoredEmail(client,row.id);
      });
    }
    return items.length;
  }
}
export const studentRevocationService=new StudentRevocationService();
