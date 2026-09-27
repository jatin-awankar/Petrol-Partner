import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {pool} from '../../db/pool';
import {AppError} from '../../shared/errors/app-error';
import {recordDurableNotification} from '../notifications/contract.repo';
import {backupStatus} from '../operator/backup-status';
import {assertCurrentOperator} from '../operator/operator.authorization';
import {operatorQuery} from '../operator/operator.repo';
import {inProtectedTransaction} from '../protected-mutation/protocol';
import {pilotReceiptStore,restrictProtectedWrites} from '../protected-mutation/receipt-evidence';
import * as repo from './settlement-cases.repo';
type Receipt={operationId:string;obligationId:string;actorId:string;key:string;digest:string;
  command:repo.Command;recordedAt:string};
const store=()=>pilotReceiptStore<Receipt>('pilot-settlement-case','Settlement case recovery evidence unavailable');
const digest=(id:string,command:repo.Command)=>createHash('sha256').update(JSON.stringify({id,command})).digest('hex');
const command=(row:repo.Operation):repo.Command=>({kind:row.kind,contribution_owed:row.contribution_owed,
  receipt_established:row.receipt_established,case_resolution:row.case_resolution,reason:row.reason,
  evidence_refs:row.evidence_refs,participant_confirmation_id:row.participant_confirmation_id,
  receipt_basis:row.receipt_basis,reviewed_evidence_summary:row.reviewed_evidence_summary});
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,obligationId:row.obligation_id,
  actorId:row.actor_id,key:row.idempotency_key,digest:row.payload_digest,command:command(row),
  recordedAt:row.recorded_at.toISOString()});
const result=(row:repo.Operation)=>({operation_id:row.id,obligation_id:row.obligation_id,
  kind:row.kind,state:row.state,case_resolution:row.case_resolution,recorded_at:row.recorded_at});
let afterReceiptHookForTests:(()=>void|Promise<void>)|null=null;
export function setSettlementCaseAfterReceiptHookForTests(hook:(()=>void|Promise<void>)|null){
  if(process.env.NODE_ENV!=='test') throw new Error('Test hook is unavailable');
  afterReceiptHookForTests=hook;
}
async function notify(db:PoolClient,row:repo.Operation,source:NonNullable<Awaited<ReturnType<typeof repo.source>>>){
  for(const recipientId of new Set([source.driver_id,source.passenger_id])) await recordDurableNotification(db,{
    originType:'pilot_settlement_case',operationId:row.id,recipientId,
    eventType:row.kind==='report'?'settlement_dispute_report':'settlement_case_decision',
    relatedEntityType:'pilot_contribution_obligation',relatedEntityId:row.obligation_id,
    title:row.kind==='report'?'Settlement dispute reported':
      row.case_resolution==='unresolved'?'Settlement review remains open':'Settlement case resolved',
    body:'Check the direct settlement case for the recorded outcome.'});
}
export class SettlementCasesService {
  constructor(private readonly db:Pool=pool){}
  async receipts(){return store().list();}
  async pending(){return (await repo.all(this.db)).filter(row=>row.state==='committed');}
  async queue(operatorId:string,now=new Date()){
    await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,operatorId));
    return repo.queue(this.db,now);
  }
  async detail(actorId:string,id:string,operator=false){
    if(operator) await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,actorId));
    const source=await repo.source(this.db,id);
    if(!source||(!operator&&![source.driver_id,source.passenger_id].includes(actorId)))
      throw new AppError(404,'Settlement case not found','CASE_NOT_FOUND');
    const history=await repo.history(this.db,id);
    const audit=await repo.audit(this.db,id);
    return {obligation:{id:source.id,amount_paise:source.amount_paise,currency:source.currency,
      due_at:source.due_at},claim:source.claim_id?{id:source.claim_id,method:source.claim_method,
      recorded_at:source.claimed_at}:null,response:source.response_id?{id:source.response_id,
      kind:source.response_kind,recorded_at:source.responded_at}:null,
      review:source.review_id?{id:source.review_id,status:source.review_status,
        reason:source.review_reason}:null,
      decisions:history.filter(x=>x.kind==='decision').map(x=>({id:x.id,
        contribution_owed:x.contribution_owed,receipt_established:x.receipt_established,
        case_resolution:x.case_resolution,reason:x.reason,recorded_at:x.recorded_at,
        receipt_basis:x.receipt_basis,
        ...(operator?{evidence_refs:x.evidence_refs,reviewed_evidence_summary:x.reviewed_evidence_summary,
          operator_id:x.actor_id}: {})})),
      reports:history.filter(x=>x.kind==='report').map(x=>({id:x.id,reason:x.reason,
        recorded_at:x.recorded_at,actor_id:x.actor_id})),
      audit:audit.map(x=>({action:x.action,created_at:x.created_at,
        operation_id:x.metadata?.operationId}))};
  }
  async operation(actorId:string,id:string,operator=false){
    if(operator) await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,actorId));
    const row=await repo.byId(this.db,id);
    if(!row||row.actor_id!==actorId) throw new AppError(404,'Operation not found','OPERATION_NOT_FOUND');
    const recovery=await operatorQuery<{mode:string}>(this.db,'recoveryMode');
    return row.state==='committed'||recovery.rows[0]?.mode==='restricted'
      ?{operation_id:id,state:'pending_unknown'}:result(row);
  }
  async verifyEvidence(retry?:{actorId:string;key:string}){
    try{
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup stale','BACKUP_STALE');
      const receipts=new Map((await store().list()).map(r=>[r.operationId,r]));
      for(const row of await repo.all(this.db)){
        if(row.state==='committed'){
          if(!retry||row.actor_id!==retry.actorId||row.idempotency_key!==retry.key)
            throw new AppError(503,'Case operation awaits evidence','OPERATION_PENDING',{operationId:row.id});
          continue;
        }
        const source=await repo.source(this.db,row.obligation_id);
        const evidence=await repo.evidence(this.db,row);
        if(JSON.stringify(receipts.get(row.id))!==JSON.stringify(receipt(row))||
          !source||!evidence.audited||!evidence.recipients.includes(source.driver_id)||
          !evidence.recipients.includes(source.passenger_id)||
          (row.kind==='report'&&!source.review_id)||
          (row.kind==='decision'&&row.case_resolution==='resolved'&&source.final_decision_id!==row.id))
          throw new AppError(503,'Case evidence missing','RECOVERY_MISSING');
      }
      for(const item of receipts.values()) if(item.digest!==digest(item.obligationId,item.command)||
        !await repo.byId(this.db,item.operationId))
        throw new AppError(503,'Case receipt conflicts','RECOVERY_CONFLICT');
    }catch(error){if(!(error instanceof AppError&&error.code==='OPERATION_PENDING'))
      await restrictProtectedWrites(this.db,'pilot_settlement_case_evidence_unavailable');
      if(!(error instanceof AppError)) throw new AppError(503,'Case recovery evidence unavailable',
        'RECOVERY_UNAVAILABLE');
      throw error;}
  }
  async mutate(actorId:string,key:string,id:string,input:repo.Command,now=new Date()){
    const normalized={...input,evidence_refs:[...new Set(input.evidence_refs)].sort(),
      receipt_basis:input.receipt_basis??null,
      reviewed_evidence_summary:input.reviewed_evidence_summary?.trim()??null};
    const payloadDigest=digest(id,normalized);
    if(input.kind==='decision') await inProtectedTransaction(this.db,c=>assertCurrentOperator(c,actorId));
    const prior=await repo.byKey(this.db,actorId,key);
    if(prior){if(prior.payload_digest!==payloadDigest) throw new AppError(409,
      'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');
      if(prior.state!=='committed') return this.operation(actorId,prior.id,input.kind==='decision');}
    await this.verifyEvidence({actorId,key});
    try{await store().probe();}catch{await restrictProtectedWrites(this.db,
      'pilot_settlement_case_evidence_unavailable');
      throw new AppError(503,'Case recovery evidence unavailable','RECOVERY_UNAVAILABLE');}
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
      await operatorQuery(client,'lockIdempotencyKey',[`pilot-settlement-case:${actorId}:${key}`]);
      if(input.kind==='decision') await assertCurrentOperator(client,actorId);
      const existing=await repo.byKey(client,actorId,key);
      if(existing){if(existing.payload_digest!==payloadDigest) throw new AppError(409,
        'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');return existing;}
      if(recovery.rows[0]?.mode!=='open') throw new AppError(503,'Protected writes restricted','RECOVERY_RESTRICTED');
      const source=await repo.source(client,id,true);
      if(!source) throw new AppError(404,'Obligation not found','OBLIGATION_NOT_FOUND');
      if(input.kind==='report'){
        if(![source.driver_id,source.passenger_id].includes(actorId))
          throw new AppError(403,'Participant access required','FORBIDDEN');
        if(!source.claim_id) throw new AppError(409,'Payment claim required','CLAIM_REQUIRED');
        if(source.review_status==='resolved') throw new AppError(409,'Case resolved','CASE_RESOLVED');
        if((await repo.history(client,id)).some(x=>x.kind==='report'&&x.actor_id===actorId))
          throw new AppError(409,'Dispute already reported','REPORT_EXISTS');
      }else{
        if(!source.claim_id) throw new AppError(409,'Payment claim required','CLAIM_REQUIRED');
        if(source.review_status==='resolved') throw new AppError(409,'Case resolved','CASE_RESOLVED');
        if(!source.review_id&&(!source.claimed_at||source.response_kind!=='dispute'&&
          now.getTime()<source.claimed_at.getTime()+86_400_000))
          throw new AppError(409,'No reviewable case','CASE_NOT_OPEN');
        if(normalized.receipt_established===true){
          if(normalized.receipt_basis==='participant_confirmation'){
            if(!normalized.participant_confirmation_id||normalized.evidence_refs.length||
              normalized.reviewed_evidence_summary||source.response_kind!=='confirm'||
              source.response_id!==normalized.participant_confirmation_id)
              throw new AppError(409,'Recorded participant confirmation required','CONFIRMATION_MISSING');
          }else if(normalized.receipt_basis==='reviewed_evidence'){
            if(normalized.participant_confirmation_id||!normalized.evidence_refs.length||
              !normalized.reviewed_evidence_summary||normalized.reviewed_evidence_summary.length<8)
              throw new AppError(409,'Reviewed evidence and summary required','EVIDENCE_REQUIRED');
          }else throw new AppError(409,'Receipt basis required','EVIDENCE_REQUIRED');
        }else if(normalized.receipt_basis||normalized.participant_confirmation_id||
          normalized.reviewed_evidence_summary){
          throw new AppError(409,'Receipt basis requires established receipt','INVALID_RECEIPT_BASIS');
        }
        if(input.case_resolution==='resolved'&&(input.contribution_owed===null||input.receipt_established===null))
          throw new AppError(409,'Resolution requires both findings','INCOMPLETE_FINDINGS');
        if(!source.review_id) await repo.ensureReview(client,id,now,'driver_silence');
      }
      const row=await repo.insert(client,{obligationId:id,actorId,key,digest:payloadDigest,
        command:normalized,at:now});
      await repo.apply(client,row);
      await notify(client,row,source);
      return row;
    });
    if(operation.state!=='committed') return result(operation);
    try{
      const saved=await inProtectedTransaction(this.db,async client=>{
        const row=await repo.byId(client,operation.id,true);
        if(!row) throw new AppError(503,'Case operation missing','RECOVERY_MISSING');
        if(row.state!=='committed') return row;
        await store().append(receipt(row));
        await afterReceiptHookForTests?.();
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup stale','BACKUP_STALE');
        const acknowledged=await repo.acknowledge(client,row.id);
        if(!acknowledged) throw new AppError(503,'Acknowledgement failed','RECOVERY_INCOMPLETE');
        await repo.ready(client,row.id);
        return acknowledged;
      });
      return result(saved);
    }catch{await restrictProtectedWrites(this.db,'pilot_settlement_case_evidence_pending');
      throw new AppError(503,'Case committed; recovery evidence pending','OPERATION_PENDING',
        {operationId:operation.id});}
  }
  async reconcileReceipts(operatorId:string){
    const items=(await store().list()).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
    for(const item of items) await inProtectedTransaction(this.db,async client=>{
      await assertCurrentOperator(client,operatorId);
      if(item.digest!==digest(item.obligationId,item.command))
        throw new AppError(409,'Receipt conflicts','RECOVERY_CONFLICT');
      const current=await repo.byId(client,item.operationId);
      if(current&&JSON.stringify(receipt(current))!==JSON.stringify(item))
        throw new AppError(409,'Case operation conflicts','RECOVERY_CONFLICT');
      const source=await repo.source(client,item.obligationId,true);
      if(!source||!source.claim_id)
        throw new AppError(409,'Settlement case source missing','RECOVERY_INCOMPLETE');
      if(item.command.kind==='decision'&&!source.review_id){
        if(source.response_kind==='dispute') await repo.ensureReview(client,item.obligationId,
          new Date(item.recordedAt),'disputed');
        else if(!source.response_id&&source.claimed_at&&
          new Date(item.recordedAt).getTime()>=source.claimed_at.getTime()+86_400_000)
          await repo.ensureReview(client,item.obligationId,new Date(item.recordedAt),'driver_silence');
        else throw new AppError(409,'Review source missing','RECOVERY_INCOMPLETE');
      }
      const row=current??await repo.insert(client,{id:item.operationId,obligationId:item.obligationId,
        actorId:item.actorId,key:item.key,digest:item.digest,command:item.command,
        at:new Date(item.recordedAt),state:'recovered'});
      await repo.apply(client,row);
      await notify(client,row,source);
      await repo.markRecovered(client,row.id);
      await repo.ready(client,row.id);
      await repo.suppressRestoredEmail(client,row.id);
    });
    return items.length;
  }
}
export const settlementCasesService=new SettlementCasesService();
