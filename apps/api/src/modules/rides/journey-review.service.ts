import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {pool} from '../../db/pool';
import {AppError} from '../../shared/errors/app-error';
import {recordDurableNotification} from '../notifications/contract.repo';
import {backupStatus} from '../operator/backup-status';
import {operatorQuery} from '../operator/operator.repo';
import {assertCurrentOperator} from '../operator/operator.authorization';
import {inProtectedTransaction} from '../protected-mutation/protocol';
import {pilotReceiptStore,restrictProtectedWrites} from '../protected-mutation/receipt-evidence';
import * as repo from './journey-review.repo';

type Command={outcome:repo.Outcome;contribution_owed:boolean|null;reason:string;evidence_refs:string[]};
type Receipt={operationId:string;reviewId:string;operatorId:string;key:string;digest:string;
  command:Command;decidedAt:string};
const store=()=>pilotReceiptStore<Receipt>('journey-review-decision','Journey review evidence unavailable');
const digest=(reviewId:string,command:Command)=>createHash('sha256').update(JSON.stringify({reviewId,command})).digest('hex');
const command=(row:repo.Decision):Command=>({outcome:row.outcome,contribution_owed:row.contribution_owed,
  reason:row.reason,evidence_refs:row.evidence_refs});
const receipt=(row:repo.Decision):Receipt=>({operationId:row.id,reviewId:row.review_id,
  operatorId:row.operator_id,key:row.idempotency_key,digest:row.payload_digest,
  command:command(row),decidedAt:row.decided_at.toISOString()});
const result=(row:repo.Decision)=>({operation_id:row.id,review_id:row.review_id,state:row.state,
  outcome:row.outcome,contribution_owed:row.contribution_owed,decided_at:row.decided_at});
async function notify(db:PoolClient,row:repo.Decision){
  const item=await repo.detail(db,row.review_id);
  if(!item) throw new AppError(409,'Journey review is missing','RECOVERY_INCOMPLETE');
  for(const recipientId of new Set([item.driver_id,item.passenger_id])) await recordDurableNotification(db,{
    originType:'journey_review_decision',operationId:row.id,recipientId,
    eventType:'journey_review_decision',relatedEntityType:'pilot_journey_review',relatedEntityId:row.review_id,
    title:row.outcome==='insufficient_evidence'?'Journey review remains open':'Journey review decision',
    body:'An operator recorded a journey outcome. Check your journey review status and contribution due.'});
}
export class JourneyReviewService {
  constructor(private readonly db:Pool=pool){}
  async receipts(){return store().list();}
  async pending(){return (await repo.all(this.db)).filter(row=>row.state==='committed');}
  async queue(operatorId:string){await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,operatorId));
    return repo.queue(this.db);}
  async detail(operatorId:string,id:string){await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,operatorId));
    const item=await repo.detail(this.db,id);
    if(!item) throw new AppError(404,'Journey review not found','REVIEW_NOT_FOUND');
    return {case:item,decisions:await repo.history(this.db,id)};}
  async participantDetail(actorId:string,id:string){
    const item=await repo.detail(this.db,id);
    if(!item||![item.driver_id,item.passenger_id].includes(actorId))
      throw new AppError(404,'Journey review not found','REVIEW_NOT_FOUND');
    const {evidence_refs:_refs,operator_id:_operator,...publicCase}=item;
    void _refs; void _operator;
    return {case:publicCase,decisions:(await repo.history(this.db,id)).map(row=>({id:row.id,
      outcome:row.outcome,contribution_owed:row.contribution_owed,reason:row.reason,
      decided_at:row.decided_at}))};
  }
  async verifyEvidence(retry?:{operatorId:string;key:string}){
    try{
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup is stale','BACKUP_STALE');
      const receipts=new Map((await store().list()).map(r=>[r.operationId,r]));
      for(const row of await repo.all(this.db)){
        if(row.state==='committed'){
          if(!retry||row.operator_id!==retry.operatorId||row.idempotency_key!==retry.key)
            throw new AppError(503,'Journey decision awaits evidence','OPERATION_PENDING',{operationId:row.id});
          continue;
        }
        if(JSON.stringify(receipts.get(row.id))!==JSON.stringify(receipt(row)))
          throw new AppError(503,'Journey decision evidence missing','RECOVERY_MISSING');
        const item=await repo.detail(this.db,row.review_id);
        if(!item||!await this.stateMatches(row,item))
          throw new AppError(503,'Journey decision state differs from evidence','RECOVERY_CONFLICT');
      }
      for(const r of receipts.values()) if(r.digest!==digest(r.reviewId,r.command)||
        !await repo.byId(this.db,r.operationId))
        throw new AppError(503,'Journey decision receipt conflicts','RECOVERY_CONFLICT');
    }catch(error){if(!(error instanceof AppError&&error.code==='OPERATION_PENDING'))
      await restrictProtectedWrites(this.db,'journey_review_evidence_unavailable');throw error;}
  }
  private async stateMatches(row:repo.Decision,item:Record<string,unknown>){
    const evidence=await repo.recoveryEvidence(this.db,row.id);
    if(!evidence.audit||!evidence.recipients.includes(String(item.driver_id))||
      !evidence.recipients.includes(String(item.passenger_id))) return false;
    if(row.outcome==='insufficient_evidence') return item.final_decision_id!==null ||
      (item.status==='open'&&item.obligation_id===null);
    if(item.status!=='resolved'||item.final_decision_id!==row.id) return false;
    if(!row.contribution_owed) return item.obligation_id===null;
    return item.obligation_review_decision_id===row.id&&item.obligation_paise===item.frozen_paise&&
      item.obligation_currency===item.currency&&item.obligation_policy_version===item.policy_version&&
      item.obligation_confirmed_at instanceof Date&&
      item.obligation_confirmed_at.getTime()===row.decided_at.getTime()&&
      item.obligation_due_at instanceof Date&&
      item.obligation_due_at.getTime()-row.decided_at.getTime()===86_400_000;
  }
  async operation(operatorId:string,id:string){
    await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,operatorId));
    const row=await repo.byId(this.db,id);
    if(!row||row.operator_id!==operatorId) throw new AppError(404,'Decision not found','OPERATION_NOT_FOUND');
    const recovery=await operatorQuery<{mode:string}>(this.db,'recoveryMode');
    return row.state==='committed'||recovery.rows[0]?.mode==='restricted'
      ?{operation_id:id,state:'pending_unknown'}:result(row);
  }
  async decide(operatorId:string,key:string,reviewId:string,input:Command){
    const normalized={...input,evidence_refs:[...new Set(input.evidence_refs)].sort()};
    const payloadDigest=digest(reviewId,normalized);
    const prior=await repo.byKey(this.db,operatorId,key);
    if(prior&&prior.payload_digest!==payloadDigest)
      throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');
    if(prior&&prior.state!=='committed') return this.operation(operatorId,prior.id);
    await this.verifyEvidence({operatorId,key});
    try{await store().probe();}catch(error){
      await restrictProtectedWrites(this.db,'journey_review_evidence_unavailable');throw error;}
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
      await assertCurrentOperator(client,operatorId);
      await operatorQuery(client,'lockIdempotencyKey',[`journey-review:${operatorId}:${key}`]);
      const existing=await repo.byKey(client,operatorId,key);
      if(existing){if(existing.payload_digest!==payloadDigest)
        throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');return existing;}
      if(recovery.rows[0]?.mode!=='open') throw new AppError(503,'Protected writes restricted','RECOVERY_RESTRICTED');
      const item=await repo.detail(client,reviewId,true);
      if(!item) throw new AppError(404,'Journey review not found','REVIEW_NOT_FOUND');
      if(item.status!=='open'||item.obligation_id)
        throw new AppError(409,'Journey review already resolved','REVIEW_RESOLVED');
      const row=await repo.insert(client,{reviewId,operatorId,key,digest:payloadDigest,
        outcome:normalized.outcome,owed:normalized.contribution_owed,reason:normalized.reason,
        evidenceRefs:normalized.evidence_refs});
      await repo.apply(client,row);
      await notify(client,row);
      return row;
    });
    if(operation.state!=='committed') return result(operation);
    try{
      const saved=await inProtectedTransaction(this.db,async client=>{
        const row=await repo.byId(client,operation.id,true);
        if(!row) throw new AppError(503,'Journey decision missing','RECOVERY_MISSING');
        if(row.state!=='committed') return row;
        await store().append(receipt(row));
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup is stale','BACKUP_STALE');
        const done=await repo.acknowledge(client,row.id);
        await repo.ready(client,row.id);
        return done;
      });
      return result(saved);
    }catch{await restrictProtectedWrites(this.db,'journey_review_evidence_pending');
      throw new AppError(503,'Decision committed; recovery evidence pending','OPERATION_PENDING',
        {operationId:operation.id});}
  }
  async reconcileReceipts(operatorId:string){
    const items=(await store().list()).sort((a,b)=>a.decidedAt.localeCompare(b.decidedAt));
    for(const item of items) await inProtectedTransaction(this.db,async client=>{
      await assertCurrentOperator(client,operatorId);
      if(item.digest!==digest(item.reviewId,item.command)) throw new AppError(409,'Receipt conflicts','RECOVERY_CONFLICT');
      const current=await repo.byId(client,item.operationId);
      if(current&&JSON.stringify(receipt(current))!==JSON.stringify(item))
        throw new AppError(409,'Decision conflicts','RECOVERY_CONFLICT');
      const review=await repo.detail(client,item.reviewId,true);
      if(!review) throw new AppError(409,'Review source missing','RECOVERY_INCOMPLETE');
      const row=current??await repo.insert(client,{reviewId:item.reviewId,operatorId:item.operatorId,
        key:item.key,digest:item.digest,outcome:item.command.outcome,
        owed:item.command.contribution_owed,reason:item.command.reason,
        evidenceRefs:item.command.evidence_refs,id:item.operationId,at:new Date(item.decidedAt),state:'recovered'});
      await repo.apply(client,row);
      await notify(client,row);
      await repo.ready(client,row.id);
      await repo.suppressRestoredEmail(client,row.id);
    });
    return items.length;
  }
}
export const journeyReviewService=new JourneyReviewService();
