import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {pool} from '../../db/pool';
import {AppError} from '../../shared/errors/app-error';
import {recordDurableNotification} from '../notifications/contract.repo';
import {backupStatus} from '../operator/backup-status';
import {operatorQuery} from '../operator/operator.repo';
import {pauseService} from '../operator/pause.service';
import {inProtectedTransaction} from '../protected-mutation/protocol';
import {pilotReceiptStore,restrictProtectedWrites} from '../protected-mutation/receipt-evidence';
import {assertCurrentDriverCarEligibility,assertCurrentStudentForSubmission} from '../verification/verification.service';
import {operatorRecipients} from './pilot-departure.repo';
import * as repo from './direct-settlement.repo';

type Receipt={operationId:string;obligationId:string;actorId:string;key:string;digest:string;
  kind:repo.Operation['kind'];method:'cash'|'upi'|null;recordedAt:string};
const store=()=>pilotReceiptStore<Receipt>('pilot-direct-settlement','Settlement recovery evidence unavailable');
const digest=(id:string,kind:string,method:string|null)=>createHash('sha256')
  .update(JSON.stringify({id,kind,method})).digest('hex');
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,obligationId:row.obligation_id,
  actorId:row.actor_id,key:row.idempotency_key,digest:row.payload_digest,kind:row.kind,
  method:row.method,recordedAt:row.recorded_at.toISOString()});
const result=(row:repo.Operation)=>({operation_id:row.id,obligation_id:row.obligation_id,
  kind:row.kind,state:row.state,recorded_at:row.recorded_at.toISOString()});
async function notify(db:PoolClient,row:repo.Operation,item:repo.Obligation){
  const recipients=[item.driver_id,item.passenger_id,...(row.kind==='dispute'?await operatorRecipients(db):[])];
  for(const recipientId of new Set(recipients)) await recordDurableNotification(db,{
    originType:'pilot_direct_settlement',operationId:row.id,recipientId,
    eventType:`settlement_${row.kind}`,relatedEntityType:'pilot_contribution_obligation',
    relatedEntityId:row.obligation_id,title:row.kind==='claim'?'Passenger reported direct payment':
      row.kind==='confirm'?'Driver confirmed receipt':'Driver disputed payment',
    body:'Check the direct settlement record for this journey.'});
}
export class DirectSettlementService {
  constructor(private readonly db:Pool=pool){}
  async receipts(){return store().list();}
  async pending(){return (await repo.all(this.db)).filter(row=>row.state==='committed');}
  async openReviews(operatorId:string){
    const {assertCurrentOperator}=await import('../operator/operator.authorization');
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    return {cases:await repo.openReviews(this.db),overdue:await repo.overdue(this.db)};
  }
  async list(actorId:string,now=new Date()){
    return (await repo.list(this.db,actorId)).map(row=>this.view(row,now));
  }
  private view(row:repo.Obligation,now:Date){
    return {obligation_id:row.id,allocation_id:row.allocation_id,amount_paise:row.amount_paise,
      currency:row.currency,policy_version:row.policy_version,confirmed_at:row.confirmed_at,
      due_at:row.due_at,driver_id:row.driver_id,passenger_id:row.passenger_id,
      claim:row.claim_id?{id:row.claim_id,method:row.claim_method,recorded_at:row.claimed_at}:null,
      receipt:row.response_kind==='confirm'?{id:row.response_id,recorded_at:row.responded_at}:null,
      response:row.response_kind,review:row.review_id?{id:row.review_id,reason:row.review_reason}:
        row.claimed_at&&!row.response_id&&now.getTime()>=row.claimed_at.getTime()+86_400_000
          ?{id:null,reason:'driver_silence'}:null,
      status:row.response_kind==='confirm'?'settled':row.response_kind==='dispute'?'review':
        row.claimed_at?now.getTime()>=row.claimed_at.getTime()+86_400_000?'review':'claim_pending':
        now.getTime()>=row.due_at.getTime()?'overdue':'due'};
  }
  async detail(actorId:string,id:string,now=new Date()){
    const row=await repo.detail(this.db,id);
    if(!row||![row.driver_id,row.passenger_id].includes(actorId))
      throw new AppError(404,'Obligation not found','OBLIGATION_NOT_FOUND');
    return this.view(row,now);
  }
  async operation(actorId:string,id:string){
    const row=await repo.byId(this.db,id);
    if(!row||row.actor_id!==actorId) throw new AppError(404,'Operation not found','OPERATION_NOT_FOUND');
    const recovery=await operatorQuery<{mode:string}>(this.db,'recoveryMode');
    return row.state==='committed'||recovery.rows[0]?.mode==='restricted'
      ?{operation_id:id,state:'pending_unknown'}:result(row);
  }
  async verifyEvidence(retry?:{actorId:string;key:string}){
    try{
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup is stale','BACKUP_STALE');
      const items=new Map((await store().list()).map(x=>[x.operationId,x]));
      for(const row of await repo.all(this.db)){
        if(row.state==='committed'){
          if(!retry||row.actor_id!==retry.actorId||row.idempotency_key!==retry.key)
            throw new AppError(503,'Settlement awaits evidence','OPERATION_PENDING',{operationId:row.id});
          continue;
        }
        if(JSON.stringify(items.get(row.id))!==JSON.stringify(receipt(row))||
          !await this.stateMatches(row)) throw new AppError(503,'Settlement evidence is missing','RECOVERY_MISSING');
      }
      for(const item of items.values()) if(item.digest!==digest(item.obligationId,item.kind,item.method)||
        !await repo.byId(this.db,item.operationId))
        throw new AppError(503,'Settlement receipt conflicts','RECOVERY_CONFLICT');
    }catch(error){if(!(error instanceof AppError&&error.code==='OPERATION_PENDING'))
      await restrictProtectedWrites(this.db,'pilot_direct_settlement_evidence_unavailable');throw error;}
  }
  private async stateMatches(row:repo.Operation){
    const item=await repo.detail(this.db,row.obligation_id);
    if(!item||!(row.kind==='claim'?item.claim_id===row.id:item.response_id===row.id)) return false;
    if(row.kind==='dispute'&&item.review_reason!=='disputed') return false;
    const evidence=await repo.recoveryEvidence(this.db,row);
    return evidence.audited&&evidence.recipients.includes(item.driver_id)&&
      evidence.recipients.includes(item.passenger_id);
  }
  async mutate(actorId:string,key:string,id:string,kind:repo.Operation['kind'],
    method:'cash'|'upi'|null=null,now=new Date()){
    const payloadDigest=digest(id,kind,method);
    const previous=await repo.byKey(this.db,actorId,key);
    if(previous){if(previous.payload_digest!==payloadDigest) throw new AppError(409,
      'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');return this.operation(actorId,previous.id);}
    await pauseService.assertAvailable('booking');
    await this.verifyEvidence({actorId,key});
    try{await store().probe();}catch{await restrictProtectedWrites(this.db,
      'pilot_direct_settlement_evidence_unavailable');
      throw new AppError(503,'Settlement recovery evidence unavailable','RECOVERY_UNAVAILABLE');}
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
      await operatorQuery(client,'lockIdempotencyKey',[`pilot-direct-settlement:${actorId}:${key}`]);
      const existing=await repo.byKey(client,actorId,key);
      if(existing){if(existing.payload_digest!==payloadDigest) throw new AppError(409,
        'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');return existing;}
      if(recovery.rows[0]?.mode!=='open') throw new AppError(503,
        'Protected writes are restricted','RECOVERY_RESTRICTED');
      const item=await repo.detail(client,id,true);
      if(!item) throw new AppError(404,'Obligation not found','OBLIGATION_NOT_FOUND');
      if(kind==='claim'){
        if(item.passenger_id!==actorId) throw new AppError(403,'Only the passenger may claim','FORBIDDEN');
        await assertCurrentStudentForSubmission(client,actorId);
        if(item.claim_id) throw new AppError(409,'Payment already claimed','CLAIM_EXISTS');
      }else{
        if(item.driver_id!==actorId) throw new AppError(403,'Only the driver may respond','FORBIDDEN');
        const car=await repo.vehicleForAllocation(client,item.allocation_id);
        if(!car) throw new AppError(409,'Allocation missing','ALLOCATION_MISSING');
        await assertCurrentDriverCarEligibility(client,actorId,car);
        if(!item.claim_id) throw new AppError(409,'Payment claim required','CLAIM_REQUIRED');
        if(item.response_id) throw new AppError(409,'Driver already responded','RESPONSE_EXISTS');
        if(item.claimed_at&&now.getTime()>=item.claimed_at.getTime()+86_400_000)
          throw new AppError(409,'Driver response window elapsed; review required','REVIEW_REQUIRED');
      }
      const row=await repo.insert(client,{obligationId:id,actorId,key,digest:payloadDigest,kind,method,at:now});
      await notify(client,row,item);
      return row;
    });
    if(operation.state!=='committed') return result(operation);
    try{
      const saved=await inProtectedTransaction(this.db,async client=>{
        const row=await repo.byId(client,operation.id,true);
        if(!row) throw new AppError(503,'Settlement operation missing','RECOVERY_MISSING');
        if(row.state!=='committed') return row;
        await store().append(receipt(row));
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup is stale','BACKUP_STALE');
        const acknowledged=await repo.acknowledge(client,row.id);
        if(!acknowledged) throw new AppError(503,'Settlement acknowledgement failed','RECOVERY_INCOMPLETE');
        await repo.ready(client,row.id);
        return acknowledged;
      });
      return result(saved);
    }catch{
      await restrictProtectedWrites(this.db,'pilot_direct_settlement_evidence_pending');
      throw new AppError(503,'Settlement committed; recovery evidence pending','OPERATION_PENDING',
        {operationId:operation.id});
    }
  }
  async reconcileReceipts(operatorId:string){
    const {assertCurrentOperator}=await import('../operator/operator.authorization');
    const items=await store().list();
    for(const item of items){
      if(item.digest!==digest(item.obligationId,item.kind,item.method))
        throw new AppError(409,'Settlement receipt conflicts','RECOVERY_CONFLICT');
      await inProtectedTransaction(this.db,async client=>{
        await assertCurrentOperator(client,operatorId);
        const existing=await repo.byId(client,item.operationId);
        if(existing&&JSON.stringify(receipt(existing))!==JSON.stringify(item))
          throw new AppError(409,'Settlement recovery conflict','RECOVERY_CONFLICT');
        const obligation=await repo.detail(client,item.obligationId,true);
        if(!obligation) throw new AppError(409,'Obligation requires manual recovery','RECOVERY_INCOMPLETE');
        const row=existing??await repo.insert(client,{id:item.operationId,obligationId:item.obligationId,
          actorId:item.actorId,key:item.key,digest:item.digest,kind:item.kind,method:item.method,
          at:new Date(item.recordedAt),state:'recovered'});
        await repo.restoreEffects(client,row);
        await notify(client,row,obligation);
        await repo.ready(client,row.id);
        await repo.suppressRestoredEmail(client,row.id);
      });
    }
    return items.length;
  }
}
export const directSettlementService=new DirectSettlementService();
