import {createHash} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {pool} from "../../db/pool";
import {AppError} from "../../shared/errors/app-error";
import {recordDurableNotification} from "../notifications/contract.repo";
import {inProtectedTransaction} from "../protected-mutation/protocol";
import {pilotReceiptStore,restrictProtectedWrites} from "../protected-mutation/receipt-evidence";
import * as effects from "../verification/revocation-effects.repo";
import {backupStatus} from "./backup-status";
import {assertCurrentOperator} from "./operator.authorization";
import {operatorQuery} from "./operator.repo";
import * as repo from "./account-restrictions.repo";

type Receipt={operationId:string;operatorId:string;key:string;digest:string;
  command:repo.Command;effectSnapshot:effects.Effect[];committedAt:string};
const store=()=>pilotReceiptStore<Receipt>("account-restriction",
  "Restriction recovery evidence unavailable");
const digest=(c:repo.Command)=>createHash("sha256")
  .update(JSON.stringify({action:c.action,targetUserId:c.targetUserId,scope:c.scope,
    sourceType:c.sourceType,sourceId:c.sourceId,reason:c.reason,
    reviewedEvidence:c.reviewedEvidence,reversesId:c.reversesId})).digest("hex");
const command=(row:repo.Operation):repo.Command=>({action:row.action,targetUserId:row.target_user_id,
  scope:row.scope,sourceType:row.source_type,sourceId:row.source_id,reason:row.reason,
  reviewedEvidence:row.reviewed_evidence,reversesId:row.reverses_id});
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,operatorId:row.operator_id,
  key:row.idempotency_key,digest:row.payload_digest,command:command(row),
  effectSnapshot:row.effect_snapshot,committedAt:row.committed_at.toISOString()});
const result=(row:repo.Operation)=>({operation_id:row.id,target_user_id:row.target_user_id,
  action:row.action,scope:row.scope,state:row.state,recorded_at:row.committed_at});

async function notifications(client:PoolClient,row:repo.Operation){
  await recordDurableNotification(client,{originType:"account_restriction",operationId:row.id,
    recipientId:row.target_user_id,eventType:row.action,relatedEntityType:"pilot_account_restriction",
    relatedEntityId:row.action==="reverse"?row.reverses_id!:row.id,
    title:row.action==="restrict"?"Travel permission restricted":"Travel restriction reversed",
    body:row.action==="restrict"
      ? "An operator reviewed your account. Check your account restrictions and trip details."
      : "An operator reversed a travel restriction. Other eligibility requirements still apply."});
  if(row.action==="reverse") return;
  const operators=await repo.operatorRecipients(client);
  for(const effect of row.effect_snapshot){
    for(const recipientId of new Set([effect.driver_id,...effect.passenger_ids,
      ...(effect.kind==="incident"?operators:[])])){
      await recordDurableNotification(client,{originType:"account_restriction",operationId:row.id,
        recipientId,eventType:`${effect.kind}:${effect.id}`,
        relatedEntityType:effect.kind==="hold"?"pilot_revocation_hold":"pilot_revocation_incident",
        relatedEntityId:effect.id,title:effect.kind==="hold"?"Trip commitment on hold":"Trip incident under review",
        body:effect.kind==="hold"
          ? "A confirmed commitment is on hold. The seat remains reserved until recorded cancellation."
          : "An active trip needs operator review. Check trip details and support notices."});
    }
  }
}

export class AccountRestrictionsService {
  constructor(private readonly db:Pool=pool){}
  async history(viewerId:string,targetUserId:string,operatorView=false){
    if(operatorView) await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,viewerId));
    else if(viewerId!==targetUserId) throw new AppError(403,"Restriction history is private","FORBIDDEN");
    const rows=await repo.history(this.db,targetUserId);
    return operatorView?rows:rows.map(row=>({id:row.id,action:row.action,scope:row.scope,
      reason:row.reason,recorded_at:row.committed_at,reverses_id:row.reverses_id}));
  }
  async receipts(){return store().list();}
  async pending(){return (await repo.all(this.db)).filter(row=>row.state==="committed");}
  async verifyEvidence(retry?:{operatorId:string;key:string}){
    try {
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      const receipts=new Map((await this.receipts()).map(item=>[item.operationId,item]));
      const operations=await repo.all(this.db);
      for(const row of operations){
        if(row.state==="committed"&&(!retry||retry.operatorId!==row.operator_id||
          retry.key!==row.idempotency_key)) throw new AppError(503,
            "Restriction operation awaits recovery evidence","OPERATION_PENDING",{operationId:row.id});
        if(row.state!=="committed"&&JSON.stringify(receipts.get(row.id))!==JSON.stringify(receipt(row)))
          throw new AppError(503,"Restriction recovery evidence missing","RECOVERY_MISSING");
        if(row.state!=="committed"&&row.action==="restrict"&&
          !await effects.matches(this.db,row.id,"restriction",row.target_user_id,row.reason,
            row.effect_snapshot)) throw new AppError(503,"Restriction trip effects missing","RECOVERY_MISSING");
        if(row.state!=="committed"&&!await repo.evidence(this.db,row))
          throw new AppError(503,"Restriction audit or notification missing","RECOVERY_MISSING");
      }
      for(const item of receipts.values()){
        const row=operations.find(row=>row.id===item.operationId);
        if(!row||item.digest!==digest(item.command)||
          JSON.stringify(receipt(row))!==JSON.stringify(item))
          throw new AppError(503,"Restriction recovery evidence conflicts","RECOVERY_CONFLICT");
      }
    } catch(error){
      if(!(error instanceof AppError&&error.code==="OPERATION_PENDING"))
        await restrictProtectedWrites(this.db,"account_restriction_evidence_unavailable");
      throw error;
    }
  }
  async operation(operatorId:string,id:string){
    await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,operatorId));
    const row=await repo.byId(this.db,id);
    if(!row||row.operator_id!==operatorId) throw new AppError(404,"Operation not found","OPERATION_NOT_FOUND");
    const recovery=await operatorQuery<{mode:string}>(this.db,"recoveryMode");
    return row.state==="committed"||recovery.rows[0]?.mode==="restricted"
      ? {operation_id:id,state:"pending_unknown"}:result(row);
  }
  async restrict(operatorId:string,key:string,input:Omit<repo.Command,"action"|"reversesId">){
    return this.mutate(operatorId,key,{...input,action:"restrict",reversesId:null});
  }
  async reverse(operatorId:string,key:string,id:string,reason:string,reviewedEvidence:string){
    await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,operatorId));
    const prior=await repo.byId(this.db,id);
    if(!prior||prior.action!=="restrict") throw new AppError(404,"Restriction not found","RESTRICTION_NOT_FOUND");
    return this.mutate(operatorId,key,{action:"reverse",targetUserId:prior.target_user_id,
      scope:prior.scope,sourceType:prior.source_type,sourceId:prior.source_id,
      reason,reviewedEvidence,reversesId:id});
  }
  private async mutate(operatorId:string,key:string,c:repo.Command){
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    const payloadDigest=digest(c);
    const prior=await repo.byKey(this.db,operatorId,key);
    if(prior&&prior.payload_digest!==payloadDigest)
      throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
    if(prior&&prior.state!=="committed") return this.operation(operatorId,prior.id);
    await this.verifyEvidence({operatorId,key});
    try {await store().probe();} catch(error){
      await restrictProtectedWrites(this.db,"account_restriction_evidence_unavailable");throw error;
    }
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,"recoveryModeForUpdate");
      await assertCurrentOperator(client,operatorId);
      await operatorQuery(client,"lockIdempotencyKey",[`account-restriction:${operatorId}:${key}`]);
      const existing=await repo.byKey(client,operatorId,key);
      if(existing){
        if(existing.payload_digest!==payloadDigest)
          throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      if(recovery.rows[0]?.mode!=="open")
        throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
      await effects.lockActors(client,"restriction",c.targetUserId);
      if(c.action==="restrict"){
        const participants=await repo.sourceParticipants(client,c.sourceType,c.sourceId);
        if(!participants) throw new AppError(404,"Reviewed source not found","SOURCE_NOT_FOUND");
        if((c.scope==="driver"&&!([participants.driver_id].includes(c.targetUserId)))||
          (c.scope==="passenger"&&!participants.passenger_ids.includes(c.targetUserId))||
          (c.scope==="all"&&participants.driver_id!==c.targetUserId&&
            !participants.passenger_ids.includes(c.targetUserId)))
          throw new AppError(409,"Target is not a participant in the reviewed source","SOURCE_TARGET_MISMATCH");
        await effects.lockAffectedTrips(client,"restriction",c.targetUserId,c.scope);
      } else {
        const active=await repo.activeForUpdate(client,c.reversesId!);
        if(!active||active.target_user_id!==c.targetUserId)
          throw new AppError(409,"Restriction is already reversed","RESTRICTION_NOT_ACTIVE");
      }
      const row=await repo.insert(client,operatorId,key,payloadDigest,c);
      if(c.action==="restrict") row.effect_snapshot=await repo.saveEffects(client,row.id,
        await effects.apply(client,"restriction",c.targetUserId,row.id,c.reason,c.scope));
      await repo.audit(client,row);
      await notifications(client,row);
      return row;
    });
    if(operation.state!=="committed") return result(operation);
    try {
      const saved=await inProtectedTransaction(this.db,async client=>{
        const row=await repo.byId(client,operation.id,true);
        if(!row) throw new AppError(503,"Restriction operation missing","RECOVERY_MISSING");
        if(row.state!=="committed") return row;
        await store().append(receipt(row));
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
        const done=await repo.acknowledge(client,row.id);
        await repo.ready(client,row.id);
        return done;
      });
      return result(saved);
    } catch {
      await restrictProtectedWrites(this.db,"account_restriction_evidence_pending");
      throw new AppError(503,"Restriction committed; recovery evidence pending",
        "OPERATION_PENDING",{operationId:operation.id});
    }
  }
  async reconcileReceipts(operatorId:string){
    const items=(await this.receipts()).sort((a,b)=>a.committedAt.localeCompare(b.committedAt));
    for(const item of items){
      if(item.digest!==digest(item.command))
        throw new AppError(409,"Restriction receipt is inconsistent","RECOVERY_CONFLICT");
      await inProtectedTransaction(this.db,async client=>{
        await assertCurrentOperator(client,operatorId);
        let row=await repo.byId(client,item.operationId,true);
        if(row&&JSON.stringify(receipt(row))!==JSON.stringify(item))
          throw new AppError(409,"Restriction recovery conflicts","RECOVERY_CONFLICT");
        if(!row){
          row=await repo.insert(client,item.operatorId,item.key,item.digest,
            item.command,item.operationId,new Date(item.committedAt),"recovered");
          row.effect_snapshot=await repo.saveEffects(client,row.id,item.effectSnapshot);
        }
        if(row.action==="restrict"){
          await effects.restore(client,"restriction",row.target_user_id,row.id,row.reason,
            item.effectSnapshot);
        }
        await repo.markRecovered(client,row.id);
        await repo.audit(client,row);
        await notifications(client,{...row,effect_snapshot:item.effectSnapshot});
        await repo.ready(client,row.id);
        await repo.suppressRestoredEmail(client,row.id);
      });
    }
    return items.length;
  }
}
export const accountRestrictionsService=new AccountRestrictionsService();
