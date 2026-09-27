import {createHash} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {pool} from "../../db/pool";
import {AppError} from "../../shared/errors/app-error";
import {recordDurableNotification} from "../notifications/contract.repo";
import {backupStatus} from "../operator/backup-status";
import {operatorQuery} from "../operator/operator.repo";
import {assertCurrentOperator} from "../operator/operator.authorization";
import {pauseService} from "../operator/pause.service";
import {inProtectedTransaction} from "../protected-mutation/protocol";
import {pilotReceiptStore,restrictProtectedWrites} from "../protected-mutation/receipt-evidence";
import {operatorRecipients} from "./pilot-departure.repo";
import * as repo from "./pilot-journey.repo";

type Receipt={operationId:string;offerId:string;allocationId:string|null;actorId:string;
  key:string;digest:string;kind:repo.Operation['kind'];claims:repo.Claim[];recordedAt:string};
const store=()=>pilotReceiptStore<Receipt>("pilot-journey","Journey recovery evidence unavailable");
const normalized=(claims:repo.Claim[])=>[...claims].sort((a,b)=>a.allocation_id.localeCompare(b.allocation_id))
  .map(c=>({allocation_id:c.allocation_id,travelled:c.travelled,completed:c.completed}));
const digest=(offerId:string,allocationId:string|null,kind:string,claims:repo.Claim[])=>createHash('sha256')
  .update(JSON.stringify({offerId,allocationId,kind,claims:normalized(claims)})).digest('hex');
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,offerId:row.offer_id,
  allocationId:row.allocation_id,actorId:row.actor_id,key:row.idempotency_key,
  digest:row.payload_digest,kind:row.kind,claims:normalized(row.claims),recordedAt:row.recorded_at.toISOString()});
const result=(row:repo.Operation)=>({operation_id:row.id,offer_id:row.offer_id,
  allocation_id:row.allocation_id,state:row.state,kind:row.kind,recorded_at:row.recorded_at.toISOString()});
async function notify(db:PoolClient,row:repo.Operation,recipients:string[]) {
  for(const recipientId of new Set(recipients)) await recordDurableNotification(db,{
    originType:'pilot_journey',operationId:row.id,recipientId,
    eventType:row.kind,relatedEntityType:'ride_offer',relatedEntityId:row.offer_id,
    title:row.kind==='driver_completion'?'Driver reported journey completion':'Passenger reported journey outcome',
    body:'Check your confirmed trip for individual journey and contribution status.'});
  if(await repo.reviewRequiredForOperation(db,row.id)) for(const recipientId of await operatorRecipients(db))
    await recordDurableNotification(db,{originType:'pilot_journey',operationId:row.id,recipientId,
      eventType:'journey_review',relatedEntityType:'ride_offer',relatedEntityId:row.offer_id,
      title:'Journey needs review',body:'One or more passenger journey outcomes need an operator decision.'});
}
export class PilotJourneyService {
  constructor(private readonly db:Pool=pool){}
  async receipts(){return store().list();}
  async visible(actorId:string,offerId?:string){return repo.visible(this.db,actorId,offerId);}
  async participantReviews(actorId:string){return repo.participantReviews(this.db,actorId);}
  async reviews(operatorId:string){
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    return repo.openReviews(this.db);
  }
  async verifyEvidence(retry?:{actorId:string;key:string}) {
    try {
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup is stale','BACKUP_STALE');
      const receipts=new Map((await store().list()).map(item=>[item.operationId,item]));
      for(const item of receipts.values()) if(item.digest!==digest(item.offerId,item.allocationId,item.kind,item.claims))
        throw new AppError(503,'Journey receipt is inconsistent','RECOVERY_CONFLICT');
      for(const row of await repo.acknowledged(this.db))
        if(JSON.stringify(receipts.get(row.id))!==JSON.stringify(receipt(row))||!await repo.stateMatches(this.db,row))
          throw new AppError(503,'Journey recovery evidence is missing','RECOVERY_MISSING');
      const pending=await repo.pending(this.db);
      if(pending.length&&(!retry||pending.some(row=>row.actor_id!==retry.actorId||row.idempotency_key!==retry.key)))
        throw new AppError(503,'Journey awaits recovery evidence','OPERATION_PENDING',{operationId:pending[0].id});
    } catch(error){await restrictProtectedWrites(this.db,'pilot_journey_evidence_unavailable');throw error;}
  }
  async operation(actorId:string,id:string){
    const row=await repo.byId(this.db,id);
    if(!row||row.actor_id!==actorId) throw new AppError(404,'Operation not found','OPERATION_NOT_FOUND');
    const recovery=await operatorQuery<{mode:string}>(this.db,'recoveryMode');
    return row.state==='committed'||recovery.rows[0]?.mode==='restricted'
      ?{operation_id:id,state:'pending_unknown'}:result(row);
  }
  async complete(driverId:string,key:string,offerId:string,claims:repo.Claim[],now=new Date()){
    return this.mutate(driverId,key,offerId,null,'driver_completion',claims,now);
  }
  async confirm(passengerId:string,key:string,offerId:string,allocationId:string,
    travelled:boolean,completed:boolean,now=new Date()){
    return this.mutate(passengerId,key,offerId,allocationId,'passenger_confirmation',
      [{allocation_id:allocationId,travelled,completed}],now);
  }
  private async mutate(actorId:string,key:string,offerId:string,allocationId:string|null,
    kind:repo.Operation['kind'],claims:repo.Claim[],now:Date){
    if(claims.some(c=>c.completed&&!c.travelled)||new Set(claims.map(c=>c.allocation_id)).size!==claims.length)
      throw new AppError(400,'Invalid journey claims','JOURNEY_INVALID');
    const sorted=normalized(claims);
    const payloadDigest=digest(offerId,allocationId,kind,sorted);
    const prior=await repo.byKey(this.db,actorId,key);
    if(prior&&prior.payload_digest!==payloadDigest)
      throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');
    if(prior) return this.operation(actorId,prior.id);
    await pauseService.assertAvailable('booking');
    await this.verifyEvidence({actorId,key});
    try{await store().probe();}catch(error){
      await restrictProtectedWrites(this.db,'pilot_journey_evidence_unavailable');throw error;
    }
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
      await operatorQuery(client,'lockIdempotencyKey',[`pilot-journey:${actorId}:${key}`]);
      const existing=await repo.byKey(client,actorId,key);
      if(existing){
        if(existing.payload_digest!==payloadDigest)
          throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');
        return existing;
      }
      if(recovery.rows[0]?.mode!=='open') throw new AppError(503,'Protected writes are restricted','RECOVERY_RESTRICTED');
      const offer=await repo.offer(client,offerId);
      if(!offer) throw new AppError(404,'Pilot offer not found','RIDE_NOT_FOUND');
      if(offer.status!=='departed') throw new AppError(409,'Trip has not started','JOURNEY_NOT_STARTED');
      const seats=await repo.seats(client,offerId);
      const boarded=seats.filter(s=>s.boarded);
      if(kind==='driver_completion'){
        if(offer.driver_id!==actorId) throw new AppError(403,'Only the driver may complete','FORBIDDEN');
        if(sorted.length!==boarded.length||sorted.some((c,i)=>c.allocation_id!==boarded[i].id))
          throw new AppError(409,'Completion must report every boarded passenger','JOURNEY_INVALID');
        if(await repo.driverCompletion(client,offerId))
          throw new AppError(409,'Driver completion already recorded','JOURNEY_ALREADY_RECORDED');
      }else{
        const seat=boarded.find(s=>s.id===allocationId);
        if(!seat) throw new AppError(409,'Passenger was not boarded','BOARDING_REQUIRED');
        if(seat.passenger_id!==actorId) throw new AppError(403,'Only this passenger may confirm','FORBIDDEN');
        if(await repo.passengerConfirmation(client,allocationId!))
          throw new AppError(409,'Passenger confirmation already recorded','JOURNEY_ALREADY_RECORDED');
      }
      const row=await repo.insert(client,{offerId,allocationId,actorId,key,digest:payloadDigest,kind,
        claims:sorted,at:now});
      for(const claim of sorted) await repo.settle(client,claim.allocation_id,now);
      await notify(client,row,[offer.driver_id,...seats.map(s=>s.passenger_id)]);
      return row;
    });
    if(operation.state!=='committed') return result(operation);
    try{
      const saved=await inProtectedTransaction(this.db,async client=>{
        const row=await repo.byId(client,operation.id,true);
        if(!row) throw new AppError(503,'Journey operation missing','RECOVERY_MISSING');
        if(row.state!=='committed') return row;
        await store().append(receipt(row));
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup is stale','BACKUP_STALE');
        const acknowledged=await repo.acknowledge(client,row.id);
        if(!acknowledged) throw new AppError(503,'Journey acknowledgement failed','RECOVERY_INCOMPLETE');
        await repo.ready(client,row.id);
        return acknowledged;
      });
      return result(saved);
    }catch{
      await restrictProtectedWrites(this.db,'pilot_journey_evidence_pending');
      throw new AppError(503,'Journey committed; recovery evidence pending','OPERATION_PENDING',
        {operationId:operation.id});
    }
  }
  async reconcileReceipts(operatorId:string){
    const items=await store().list();
    for(const item of items){
      if(item.digest!==digest(item.offerId,item.allocationId,item.kind,item.claims))
        throw new AppError(409,'Journey receipt is inconsistent','RECOVERY_CONFLICT');
      await inProtectedTransaction(this.db,async client=>{
        await assertCurrentOperator(client,operatorId);
        const current=await repo.byId(client,item.operationId);
        if(current&&JSON.stringify(receipt(current))!==JSON.stringify(item))
          throw new AppError(409,'Journey recovery conflict','RECOVERY_CONFLICT');
        const row=current??await repo.insert(client,{offerId:item.offerId,allocationId:item.allocationId,
          actorId:item.actorId,key:item.key,digest:item.digest,kind:item.kind,claims:item.claims,
          at:new Date(item.recordedAt),id:item.operationId,state:'recovered'});
        for(const claim of item.claims) await repo.settle(client,claim.allocation_id,new Date(item.recordedAt));
        const seats=await repo.seats(client,item.offerId);
        const ride=await repo.offer(client,item.offerId);
        if(!ride) throw new AppError(409,'Journey offer needs manual recovery','RECOVERY_INCOMPLETE');
        await notify(client,row,[ride.driver_id,...seats.map(s=>s.passenger_id)]);
        await repo.ready(client,row.id);
        await client.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
          last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
          WHERE event_id IN(SELECT id FROM pilot_notification_events WHERE origin_type='pilot_journey'
            AND operation_id=$1) AND status<>'sent'`,[row.id]);
      });
    }
    return items.length;
  }
}
export const pilotJourneyService=new PilotJourneyService();
