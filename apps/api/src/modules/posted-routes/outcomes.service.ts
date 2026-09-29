import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {pool} from '../../db/pool';
import {AppError} from '../../shared/errors/app-error';
import {assertCurrentAdultDeclaration} from '../adult-declaration/adult-declaration.service';
import {assertCurrentDriverVehicle} from '../driver-vehicle-declaration/driver-vehicle-declaration.service';
import {recordDurableNotification} from '../notifications/contract.repo';
import {backupStatus} from '../operator/backup-status';
import {operatorQuery} from '../operator/operator.repo';
import {assertCurrentOperator} from '../operator/operator.authorization';
import {assertNoAccountRestriction} from '../operator/account-restrictions.policy';
import {pauseService} from '../operator/pause.service';
import {inProtectedTransaction} from '../protected-mutation/protocol';
import {pilotReceiptStore,restrictProtectedWrites} from '../protected-mutation/receipt-evidence';
import {lockCommitmentActors} from '../rides/commitment.repo';
import {ROUTE_OPERATING_POLICY_VERSION} from './policy';
import * as repo from './outcomes.repo';

export type OutcomePayload={allocation_id?:string;reason?:string;boarded_ids?:string[];
  travelled?:boolean;completed?:boolean;method?:'cash'|'upi';
  outcome?:'travelled'|'not_travelled'|'interrupted';receipt_established?:boolean};
type Receipt={operationId:string;actorId:string;key:string;digest:string;offerId:string;
  allocationId:string|null;action:repo.Action;payload:Record<string,unknown>;
  result:Record<string,unknown>;createdAt:string};
const store=()=>pilotReceiptStore<Receipt>('posted-route-outcome','Route outcome recovery evidence unavailable');
const digest=(action:repo.Action,id:string,payload:OutcomePayload)=>createHash('sha256')
  .update(JSON.stringify({action,id,payload})).digest('hex');
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,actorId:row.actor_id,key:row.idempotency_key,
  digest:row.payload_digest,offerId:row.offer_id,allocationId:row.allocation_id,
  action:row.action,payload:row.payload,result:row.result,createdAt:row.created_at.toISOString()});
const visible=(row:repo.Operation)=>({operation_id:row.id,state:row.state,action:row.action,...row.result});
function boundary(){if(process.env.NODE_ENV!=='test')
  throw new AppError(503,'Route booking outcomes are unavailable','ROUTE_BOOKINGS_DISABLED');}
function requireReason(value:string|undefined){if(!value||value.trim().length<8)
  throw new AppError(400,'A reason of at least eight characters is required','REASON_REQUIRED');}
function operatingCoverage(offer:repo.Offer){
  if(offer.operating_policy_version!==ROUTE_OPERATING_POLICY_VERSION)
    throw new AppError(409,'Operating policy changed','OPERATING_POLICY_STALE');
  const start=process.env.ROUTE_SUPPORT_WINDOW_START,end=process.env.ROUTE_SUPPORT_WINDOW_END;
  if(process.env.ROUTE_SUPPORT_WINDOW_APPROVED!=='true'||!start||!end||
    !Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end)))
    throw new AppError(503,'Support coverage unavailable','SUPPORT_WINDOW_UNAVAILABLE');
  const now=Date.now();
  if(now<Date.parse(start)||now>=Date.parse(end)||offer.departure_at.getTime()<Date.parse(start)||
    offer.commitment_until.getTime()>=Date.parse(end))
    throw new AppError(409,'Support coverage closed','SUPPORT_WINDOW_CLOSED');
}
async function notify(db:PoolClient,row:repo.Operation,recipients:string[]){
  for(const recipientId of new Set(recipients))await recordDurableNotification(db,{
    originType:'posted_route_outcome',operationId:row.id,recipientId,
    eventType:row.action,relatedEntityType:'posted_route_offer',relatedEntityId:row.offer_id,
    title:'Route booking update',body:`A ${row.action.replace(/_/g,' ')} outcome was recorded. Review your booking.`});
}
export class PostedRouteOutcomesService{
  constructor(private readonly db:Pool=pool){}
  async receipts(){return store().list();}
  async pending(){return (await repo.all(this.db)).filter(row=>row.state==='committed');}
  async reconcileReceipts(operatorId:string){
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    const rows=await repo.all(this.db),evidence=new Map((await store().list()).map(item=>[item.operationId,item]));
    for(const row of rows){
      if(row.payload_digest!==digest(row.action,row.allocation_id??row.offer_id,row.payload as OutcomePayload))
        throw new AppError(409,'Outcome payload conflicts','RECOVERY_CONFLICT');
      const item=evidence.get(row.id);
      if(item&&JSON.stringify(item)!==JSON.stringify(receipt(row)))
        throw new AppError(409,'Outcome receipt conflicts','RECOVERY_CONFLICT');
      if(!item&&row.state!=='committed')
        throw new AppError(409,'Acknowledged outcome evidence missing','RECOVERY_CONFLICT');
      if(!(await this.stateMatches(row)))
        throw new AppError(409,'Outcome state needs manual recovery','RECOVERY_CONFLICT');
      if(!item){await store().append(receipt(row));evidence.set(row.id,receipt(row));}
      await inProtectedTransaction(this.db,async client=>{
        await assertCurrentOperator(client,operatorId);
        await repo.acknowledge(client,row.id);
      });
    }
    return rows.length;
  }
  private async stateMatches(row:repo.Operation){
    const audited=Boolean((await this.db.query("SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$1",[row.id])).rowCount);
    const notified=Boolean((await this.db.query(`SELECT 1 FROM pilot_notification_events e
      JOIN pilot_email_jobs j ON j.event_id=e.id WHERE e.origin_type='posted_route_outcome'
      AND e.operation_id=$1 LIMIT 1`,[row.id])).rowCount);
    if(!audited||!notified)return false;
    const offer=await repo.offer(this.db,row.offer_id),seat=row.allocation_id?await repo.seat(this.db,row.allocation_id):null;
    if(!offer||row.allocation_id&&!seat)return false;
    if(row.action==='driver_cancel'&&offer.status!=='cancelled')return false;
    if(row.action==='passenger_cancel'&&seat?.status!=='cancelled')return false;
    if(row.action==='depart'&&offer.status!=='departed')return false;
    if(row.action==='driver_journey'||row.action==='passenger_journey'){
      const claims=await repo.journeyClaim(this.db,row.allocation_id!);
      if(!claims.some(item=>item.role===(row.action==='driver_journey'?'driver':'passenger')&&
        item.travelled===row.payload.travelled&&item.completed===row.payload.completed))return false;
    }
    if(row.action==='payment_claim'){
      const obligation=await repo.obligation(this.db,row.allocation_id!);
      if(!obligation||!await repo.paymentClaim(this.db,obligation.id))return false;
    }
    return true;
  }
  async operation(actor:string,id:string){boundary();const row=await repo.byId(this.db,id);
    if(!row||row.actor_id!==actor)throw new AppError(404,'Operation not found','OPERATION_NOT_FOUND');
    const recovery=await operatorQuery<{mode:string}>(this.db,'recoveryMode');
    return row.state==='committed'||recovery.rows[0]?.mode!=='open'
      ?{operation_id:id,state:'pending_unknown'}:visible(row);}
  async verifyEvidence(retry?:{actor:string;key:string}){
    try{const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy)throw new Error('Backup unhealthy');
      const evidence=new Map((await store().list()).map(item=>[item.operationId,item]));
      for(const row of await repo.all(this.db)){
        if(row.state==='committed'){
          if(!retry||row.actor_id!==retry.actor||row.idempotency_key!==retry.key)
            throw new Error('Outcome pending');
        }else if(JSON.stringify(evidence.get(row.id))!==JSON.stringify(receipt(row))||
          !await this.stateMatches(row))
          throw new Error('Outcome evidence missing');
      }
      for(const item of evidence.values()){
        const row=await repo.byId(this.db,item.operationId);
        if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))throw new Error('Outcome evidence conflicts');
      }
    }catch{await restrictProtectedWrites(this.db,'posted_route_outcome_evidence_unavailable');
      throw new AppError(503,'Route outcome recovery evidence unavailable','RECOVERY_UNAVAILABLE');}
  }
  async mutate(actor:string,key:string,action:repo.Action,id:string,payload:OutcomePayload={}){
    boundary();const hash=digest(action,id,payload),prior=await repo.byKey(this.db,actor,key);
    if(prior&&prior.payload_digest!==hash)
      throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');
    await this.verifyEvidence({actor,key});
    if(prior)return this.operation(actor,prior.id);
    await pauseService.assertAvailable('booking');
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
      await operatorQuery(client,'lockIdempotencyKey',[`posted-route-outcome:${actor}:${key}`]);
      const existing=await repo.byKey(client,actor,key);
      if(existing){if(existing.payload_digest!==hash)
        throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');return existing;}
      if(recovery.rows[0]?.mode!=='open')throw new AppError(503,'Protected writes restricted','RECOVERY_RESTRICTED');
      store();
      const seatAction=!['driver_cancel','hold','release_hold','depart'].includes(action);
      const preview=seatAction?await repo.seat(client,id):null;
      if(seatAction&&!preview)throw new AppError(404,'Booking not found','BOOKING_NOT_FOUND');
      const offerId=preview?.offer_id??id;
      const initial=await repo.offer(client,offerId);
      if(!initial)throw new AppError(404,'Route not found','ROUTE_NOT_FOUND');
      const initialSeats=await repo.seats(client,offerId);
      await lockCommitmentActors(client,initial.driver_id,initial.vehicle_declaration_id,
        initialSeats.map(item=>item.passenger_id));
      const offer=await repo.offer(client,offerId,true);
      if(!offer)throw new AppError(404,'Route not found','ROUTE_NOT_FOUND');
      const seats=await repo.seats(client,offerId,true);
      const seat=preview?seats.find(item=>item.id===preview.id):undefined;
      if(preview&&!seat)throw new AppError(409,'Booking changed','BOOKING_CHANGED');
      let recipients=[offer.driver_id,...seats.map(item=>item.passenger_id)];
      const result:Record<string,unknown>={offer_id:offerId,allocation_id:seat?.id??null};
      if(action==='passenger_cancel'){
        if(seat!.passenger_id!==actor)throw new AppError(403,'Passenger only','FORBIDDEN');
        if(offer.status==='departed')throw new AppError(409,'Started rides need incident review','RIDE_STARTED');
        if(!['confirmed','held'].includes(seat!.status))throw new AppError(409,'Booking is not active','BOOKING_INVALID');
        await repo.setSeatStatus(client,seat!.id,'cancelled');
        recipients=[offer.driver_id,seat!.passenger_id];
      }else if(action==='driver_cancel'){
        if(offer.driver_id!==actor)throw new AppError(403,'Driver only','FORBIDDEN');
        if(!['prepared','held'].includes(offer.status))throw new AppError(409,'Ride cannot be cancelled','RIDE_INVALID');
        requireReason(payload.reason);
        await repo.setOfferStatus(client,offerId,'cancelled');
        for(const item of seats)if(['confirmed','held'].includes(item.status))
          await repo.setSeatStatus(client,item.id,'cancelled');
        const withdrawn=await repo.cancelRequests(client,offerId);
        recipients.push(...withdrawn.map(item=>item.passenger_id));
        result.withdrawn_request_ids=withdrawn.map(item=>item.id);
      }else if(action==='hold'||action==='release_hold'){
        await assertCurrentOperator(client,actor);requireReason(payload.reason);
        if(action==='hold'){
          if(offer.status!=='prepared')throw new AppError(409,'Ride cannot be held','RIDE_INVALID');
          await repo.setOfferStatus(client,offerId,'held');
          for(const item of seats)if(item.status==='confirmed')await repo.setSeatStatus(client,item.id,'held');
        }else{
          if(offer.status!=='held')throw new AppError(409,'Ride is not held','RIDE_INVALID');
          operatingCoverage(offer);
          await assertCurrentDriverVehicle(client,offer.driver_id,offer.vehicle_declaration_id,offer.capacity);
          await repo.setOfferStatus(client,offerId,'prepared');
          for(const item of seats)if(item.status==='held')await repo.setSeatStatus(client,item.id,'confirmed');
        }
      }else if(action==='depart'){
        if(offer.driver_id!==actor)throw new AppError(403,'Driver only','FORBIDDEN');
        if(offer.status!=='prepared'||seats.some(item=>item.status==='held'))
          throw new AppError(409,'Ride is unavailable for departure','DEPARTURE_INVALID');
        operatingCoverage(offer);
        await assertCurrentDriverVehicle(client,actor,offer.vehicle_declaration_id,offer.capacity);
        await assertNoAccountRestriction(client,actor,'driver');
        for(const item of seats.filter(s=>s.status==='confirmed')){
          await assertCurrentAdultDeclaration(client,item.passenger_id);
          await assertNoAccountRestriction(client,item.passenger_id,'passenger');
        }
        const delta=Date.now()-offer.departure_at.getTime();
        if(delta< -15*60_000||delta>30*60_000)
          throw new AppError(409,'Departure window closed','DEPARTURE_WINDOW_CLOSED');
        const confirmed=seats.filter(item=>item.status==='confirmed').map(item=>item.id).sort();
        const boarded=[...(payload.boarded_ids??[])].sort();
        if(new Set(boarded).size!==boarded.length||boarded.some(item=>!confirmed.includes(item)))
          throw new AppError(409,'Boarding requires confirmed seats','BOARDING_INVALID');
        await repo.setOfferStatus(client,offerId,'departed');
        for(const item of seats.filter(s=>s.status==='confirmed'))
          await repo.setBoarding(client,item.id,boarded.includes(item.id));
        result.boarded_ids=boarded;result.confirmed_ids=confirmed;
      }else if(action==='driver_journey'||action==='passenger_journey'){
        if(offer.status!=='departed'||seat!.status!=='confirmed'||seat!.boarded!==true)
          throw new AppError(409,'Boarded journey required','BOARDING_REQUIRED');
        const role=action==='driver_journey'?'driver':'passenger';
        if((role==='driver'?offer.driver_id:seat!.passenger_id)!==actor)
          throw new AppError(403,'Participant only','FORBIDDEN');
        if(payload.travelled===undefined||payload.completed===undefined||
          payload.completed&&!payload.travelled)throw new AppError(400,'Invalid journey claim','JOURNEY_INVALID');
        const claims=await repo.journeyClaim(client,seat!.id);
        if(claims.some(item=>item.role===role))throw new AppError(409,'Journey already recorded','JOURNEY_ALREADY_RECORDED');
        result.claim_role=role;
      }else if(action==='payment_claim'||action==='receipt'||action==='dispute'){
        const obligation=await repo.obligation(client,seat!.id);
        if(!obligation)throw new AppError(409,'No contribution obligation','OBLIGATION_REQUIRED');
        result.obligation_id=obligation.id;
        const claim=await repo.paymentClaim(client,obligation.id);
        if(action==='payment_claim'){
          if(seat!.passenger_id!==actor)throw new AppError(403,'Passenger only','FORBIDDEN');
          if(!['cash','upi'].includes(payload.method??''))throw new AppError(400,'Cash or UPI required','METHOD_INVALID');
          if(claim)throw new AppError(409,'Payment already claimed','CLAIM_EXISTS');
        }else{
          if(offer.driver_id!==actor)throw new AppError(403,'Driver only','FORBIDDEN');
          if(!claim)throw new AppError(409,'Payment claim required','CLAIM_REQUIRED');
          if(await repo.receipt(client,claim.id))throw new AppError(409,'Receipt decision exists','RECEIPT_EXISTS');
          result.claim_id=claim.id;
        }
      }else if(action==='operator_journey'||action==='operator_settlement'){
        await assertCurrentOperator(client,actor);requireReason(payload.reason);
        if(action==='operator_journey'){
          if(!['travelled','not_travelled','interrupted'].includes(payload.outcome??''))
            throw new AppError(400,'Journey outcome required','JOURNEY_INVALID');
        }else if(typeof payload.receipt_established!=='boolean')
          throw new AppError(400,'Receipt decision required','RECEIPT_INVALID');
      }
      const row=await repo.write(client,{actor,key,digest:hash,offer:offerId,allocation:seat?.id??null,
        action,payload:payload as Record<string,unknown>,result});
      if(action==='driver_journey'||action==='passenger_journey'){
        const role=action==='driver_journey'?'driver':'passenger';
        await repo.insertClaim(client,seat!.id,row.id,role,payload.travelled!,payload.completed!);
        const claims=await repo.journeyClaim(client,seat!.id);
        if(claims.length===2){
          if(claims.every(item=>item.travelled&&item.completed))await repo.insertObligation(client,seat!);
          else await repo.reviewJourney(client,seat!.id,'conflicting_or_incomplete_journey');
        }
      }else if(action==='payment_claim')await repo.insertPaymentClaim(client,result.obligation_id as string,row.id,payload.method!);
      else if(action==='receipt'||action==='dispute'){
        await repo.insertReceipt(client,result.claim_id as string,row.id,action);
        if(action==='dispute')await repo.reviewSettlement(client,result.obligation_id as string,'recipient_dispute');
      }else if(action==='operator_journey'){
        if(!await repo.resolveJourney(client,seat!.id,actor,payload.outcome!,payload.reason!))
          throw new AppError(409,'Open journey review required','REVIEW_REQUIRED');
        if(payload.outcome==='travelled'&&!await repo.obligation(client,seat!.id))
          await repo.insertObligation(client,seat!);
      }else if(action==='operator_settlement'){
        const obligation=await repo.obligation(client,seat!.id);
        if(!obligation||!await repo.resolveSettlement(client,obligation.id,actor,
          payload.receipt_established!,payload.reason!))
          throw new AppError(409,'Open settlement review required','REVIEW_REQUIRED');
      }
      await repo.audit(client,row);
      await notify(client,row,recipients);
      return row;
    });
    if(operation.state!=='committed')return this.operation(actor,operation.id);
    try{await store().append(receipt(operation));
      await inProtectedTransaction(this.db,async client=>{
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy)throw new Error('Backup unhealthy');
        await repo.acknowledge(client,operation.id);
      });
    }catch{await restrictProtectedWrites(this.db,'posted_route_outcome_evidence_pending');
      throw new AppError(503,'Outcome committed; acknowledgement pending','OPERATION_PENDING',
        {operationId:operation.id});}
    return {...visible(operation),state:'acknowledged'};
  }
}
export const postedRouteOutcomesService=new PostedRouteOutcomesService();
