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
import {published} from './posted-routes.repo';
import {verifiedPublication} from './passenger-routes';
import * as repo from './outcomes.repo';
import * as recoveryRepo from './outcome-recovery.repo';

export type OutcomePayload={allocation_id?:string;reason?:string;boarded_ids?:string[];
  travelled?:boolean;completed?:boolean;method?:'cash'|'upi';
  outcome?:'travelled'|'not_travelled'|'interrupted';receipt_established?:boolean;recipient_confirmed?:boolean;
  evidence_refs?:string[];source_operation_id?:string;subject_id?:string;kind?:'absence'|'interruption'|'safety'|'disagreement'};
let clock=()=>Date.now();
export function setOutcomeClockForTests(value:(()=>number)|null){
  if(process.env.NODE_ENV!=='test')throw new Error('Test clock unavailable');
  clock=value??(()=>Date.now());
}
type Receipt={operationId:string;actorId:string;key:string;digest:string;offerId:string;
  allocationId:string|null;action:repo.Action;payload:Record<string,unknown>;
  result:Record<string,unknown>;createdAt:string};
const store=()=>pilotReceiptStore<Receipt>('posted-route-outcome','Route outcome recovery evidence unavailable');
const digest=(action:repo.Action,id:string,payload:OutcomePayload)=>createHash('sha256')
  .update(JSON.stringify({action,id,payload:Object.fromEntries(Object.entries(payload)
    .sort(([a],[b])=>a.localeCompare(b)))})).digest('hex');
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,actorId:row.actor_id,key:row.idempotency_key,
  digest:row.payload_digest,offerId:row.offer_id,allocationId:row.allocation_id,
  action:row.action,payload:row.payload,result:row.result,createdAt:row.created_at.toISOString()});
const visible=(row:repo.Operation)=>{const {recovery_snapshot:_,...result}=row.result;
  return {operation_id:row.id,state:row.state,action:row.action,...result};};
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
  const now=clock();
  if(now<Date.parse(start)||now>=Date.parse(end)||offer.departure_at.getTime()<Date.parse(start)||
    offer.commitment_until.getTime()>=Date.parse(end))
    throw new AppError(409,'Support coverage closed','SUPPORT_WINDOW_CLOSED');
}
async function notify(db:PoolClient,row:repo.Operation,recipients:string[]){
  for(const recipientId of new Set(recipients))await recordDurableNotification(db,{
    eventId:createHash('md5').update(`${row.id}:${recipientId}:${row.action}`).digest('hex'),
    originType:'posted_route_outcome',operationId:row.id,recipientId,
    eventType:row.action,relatedEntityType:'posted_route_offer',relatedEntityId:row.offer_id,
    title:'Route booking update',body:`A ${row.action.replace(/_/g,' ')} outcome was recorded. Review your booking.`});
}
export class PostedRouteOutcomesService{
  constructor(private readonly db:Pool=pool){}
  // Called inside the declaration/restriction transaction, under recovery's shared
  // serialization lock. The source cannot acknowledge before these receipts exist.
  async recordEligibilityEffects(client:PoolClient,actor:string,source:string,user:string,
    scope:'all'|'driver'|'passenger'='all',vehicle?:string){
    for(const offer of await repo.affectedEligibility(client,user,scope,vehicle)){
      const seats=await repo.seats(client,offer.id,true);
      const whole=offer.driver_id===user&&scope!=='passenger';
      const affected=seats.filter(s=>['confirmed','held'].includes(s.status)&&(whole||s.passenger_id===user));
      const action=offer.status==='departed'?'eligibility_incident':'eligibility_hold';
      const allocation=whole?null:affected[0]?.id??null;
      const payload={source_operation_id:source,subject_id:user,reason:'Eligibility withdrawn or restricted'};
      const recipients=[offer.driver_id,...affected.map(s=>s.passenger_id),...await repo.operatorRecipients(client)];
      const row=await repo.write(client,{actor,key:`eligibility:${source}:${offer.id}`,
        digest:digest(action,allocation??offer.id,payload),offer:offer.id,allocation,action,payload,
        result:{offer_id:offer.id,allocation_id:allocation,notification_recipients:[...new Set(recipients)].sort()}});
      if(action==='eligibility_hold'){
        if(whole)await repo.setOfferStatus(client,offer.id,'held');
        for(const seat of affected)await repo.setSeatStatus(client,seat.id,'held');
      }else{
        const incident=await repo.insertIncident(client,{offer:offer.id,allocation,actor,operation:row.id,
          kind:'safety',reason:payload.reason,priority:'high'});
        row.result.incident_id=incident.id;
      }
      row.result.recovery_snapshot=await recoveryRepo.snapshot(client,offer.id);
      await repo.updateOperationResult(client,row.id,row.result);
      await repo.audit(client,row);await notify(client,row,recipients);
    }
  }
  async acknowledgeEligibilityEffects(source:string){
    for(const row of await repo.sourceEffects(this.db,source))if(row.state==='committed'){
      try{await store().append(receipt(row));
        await inProtectedTransaction(this.db,client=>repo.acknowledge(client,row.id));
      }catch{await restrictProtectedWrites(this.db,'route_eligibility_evidence_pending');
        throw new AppError(503,'Eligibility effects await recovery evidence','OPERATION_PENDING',{operationId:source});}
    }
  }
  async receipts(){return store().list();}
  async evidencedRecord(table:string,current:Record<string,unknown>){
    for(const item of await store().list()){
      const snap=item.result.recovery_snapshot as recoveryRepo.Snapshot|undefined;
      if(snap?.[table]?.some(row=>recoveryRepo.sameRecord(row,current)))return true;
    }
    return false;
  }
  async incidents(operatorId:string){boundary();
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    return repo.openIncidents(this.db);}
  async pending(){return (await repo.all(this.db)).filter(row=>row.state==='committed');}
  async reconcileReceipts(operatorId:string){
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    const guard=await repo.acquireMutationGuard(this.db);
    try{
    const rows=await repo.all(this.db),evidence=new Map((await store().list()).map(item=>[item.operationId,item]));
    for(const row of rows){
      const item=evidence.get(row.id);
      if(item&&JSON.stringify(item)!==JSON.stringify(receipt(row)))
        throw new AppError(409,'Outcome receipt conflicts','RECOVERY_CONFLICT');
      if(!item){
        if(row.state!=='committed'||!await this.stateMatches(row,true))
          throw new AppError(409,'Outcome recovery evidence missing','RECOVERY_CONFLICT');
        await store().append(receipt(row));evidence.set(row.id,receipt(row));
      }
    }
    const items=[...evidence.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.operationId.localeCompare(b.operationId));
    await inProtectedTransaction(this.db,async client=>{
      await assertCurrentOperator(client,operatorId);
      await operatorQuery(client,'recoveryModeForUpdate');
      const history:recoveryRepo.Snapshot[]=[];
      for(const item of items){
        const row:repo.Operation={id:item.operationId,actor_id:item.actorId,idempotency_key:item.key,
          payload_digest:item.digest,offer_id:item.offerId,allocation_id:item.allocationId,
          action:item.action,payload:item.payload,result:item.result,state:'recovered',created_at:new Date(item.createdAt)};
        if(row.payload_digest!==digest(row.action==='incident_report'&&row.result.requested_action
          ?row.result.requested_action as repo.Action:row.action,row.action==='operator_incident'?row.result.incident_id as string:
          row.allocation_id??row.offer_id,row.payload as OutcomePayload))
          throw new AppError(409,'Outcome payload conflicts','RECOVERY_CONFLICT');
        const existing=await repo.byId(client,row.id);
        if(!existing){
          if(!row.result.recovery_snapshot)throw new AppError(409,'Historical outcome needs manual recovery','RECOVERY_INCOMPLETE');
          await recoveryRepo.restoreOperation(client,row);
        }
        if(row.result.recovery_snapshot)history.push(row.result.recovery_snapshot as recoveryRepo.Snapshot);
        if(!await repo.hasAudit(client,row.id))await repo.audit(client,row);
        await notify(client,row,row.result.notification_recipients as string[]);
        await repo.acknowledge(client,row.id);
        await repo.suppressRestoredEmail(client,row.id);
      }
      await recoveryRepo.restoreSnapshots(client,history);
    });
    for(const row of await repo.all(this.db))if(!await this.stateMatches(row))
      throw new AppError(409,'Outcome state needs manual recovery','RECOVERY_CONFLICT');
    return items.length;
    }finally{await repo.releaseMutationGuard(guard);}
  }
  private async stateMatches(row:repo.Operation,pending=false){
    if(row.result.recovery_snapshot&&!await recoveryRepo.factsMatch(this.db,row.result.recovery_snapshot as recoveryRepo.Snapshot))return false;
    const audited=await repo.hasAudit(this.db,row.id);
    const notified=await repo.notifiedRecipients(this.db,row,pending);
    const expected=(row.result.notification_recipients as string[]|undefined)?.sort();
    if(!audited||!expected||JSON.stringify(notified)!==JSON.stringify(expected))return false;
    const offer=await repo.offer(this.db,row.offer_id),seat=row.allocation_id?await repo.seat(this.db,row.allocation_id):null;
    if(!offer||row.allocation_id&&!seat)return false;
    if(row.action==='driver_cancel'){
      if(offer.status!=='cancelled')return false;
      const cancelled=(row.result.cancelled_allocation_ids as string[]|undefined)??[];
      const withdrawn=(row.result.withdrawn_request_ids as string[]|undefined)??[];
      const seats=await repo.seats(this.db,row.offer_id);
      if(seats.some(item=>['confirmed','held'].includes(item.status)))return false;
      if(seats.some(item=>cancelled.includes(item.id)&&item.status!=='cancelled'))return false;
      const requests=await repo.requestsForOffer(this.db,row.offer_id);
      if(requests.some(item=>item.status==='pending'))return false;
      if(requests.some(item=>withdrawn.includes(item.id)&&item.status!=='withdrawn'))return false;
    }
    if(row.action==='passenger_cancel'&&seat?.status!=='cancelled')return false;
    if(row.action==='eligibility_incident'&&!await repo.incidentForOperation(this.db,row.id,'safety'))return false;
    if(row.action==='incident_report'){
      if(!await repo.incidentForOperation(this.db,row.id,row.result.incident_type as string))return false;
    }
    if(row.action==='operator_incident'){
      if(!await repo.resolvedIncidentForOperation(this.db,row.result.incident_id as string,row.id))return false;
    }
    if(row.action==='depart'){
      if(offer.status!=='departed')return false;
      const seats=await repo.seats(this.db,row.offer_id);
      const boarded=(row.result.boarded_ids as string[]|undefined)??[];
      const confirmed=(row.result.confirmed_ids as string[]|undefined)??[];
      const currentConfirmed=seats.filter(item=>item.status==='confirmed').map(item=>item.id).sort();
      if(JSON.stringify([...confirmed].sort())!==JSON.stringify(currentConfirmed)||
        new Set(boarded).size!==boarded.length||boarded.some(id=>!confirmed.includes(id)))return false;
      if(seats.filter(item=>confirmed.includes(item.id)).some(item=>item.boarded!==boarded.includes(item.id)))
        return false;
    }
    if(row.action==='hold'||row.action==='release_hold'){
      const latest=await repo.latestRouteAction(this.db,row.offer_id);
      if(latest==='hold'&&offer.status!=='held'||
        latest==='release_hold'&&offer.status!=='prepared')return false;
    }
    if(row.action==='driver_journey'||row.action==='passenger_journey'){
      const claims=await repo.claimsForOperation(this.db,row.id);
      if(!claims.some(item=>item.role===(row.action==='driver_journey'?'driver':'passenger')&&
        item.travelled===row.payload.travelled&&item.completed===row.payload.completed))return false;
    }
    if(row.action==='payment_claim'){
      const obligation=await repo.obligation(this.db,row.allocation_id!);
      if(!obligation||!await repo.hasPaymentClaim(this.db,obligation.id,row.id,row.payload.method))return false;
    }
    if(row.action==='receipt'||row.action==='dispute'){
      if(!await repo.hasReceiptDecision(this.db,row.id,row.action))return false;
    }
    if(row.action==='operator_journey'){
      if(!await repo.hasJourneyDecision(this.db,row))return false;
    }
    if(row.action==='operator_settlement'){
      if(!await repo.hasSettlementDecision(this.db,row))return false;
    }
    return true;
  }
  async operation(actor:string,id:string){boundary();const row=await repo.byId(this.db,id);
    if(!row||row.actor_id!==actor)throw new AppError(404,'Operation not found','OPERATION_NOT_FOUND');
    const recovery=await operatorQuery<{mode:string}>(this.db,'recoveryMode');
    return row.state==='committed'||recovery.rows[0]?.mode!=='open'
      ?{operation_id:id,state:'pending_unknown'}:visible(row);}
  async verifyEvidence(retry?:{actor:string;key:string}){
    const guard=await repo.acquireMutationGuard(this.db);
    try{await this.verifyEvidenceUnlocked(retry);}
    finally{await repo.releaseMutationGuard(guard);}
  }
  private async verifyEvidenceUnlocked(retry?:{actor:string;key:string}){
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
      const history=(await repo.all(this.db)).map(row=>row.result.recovery_snapshot as recoveryRepo.Snapshot|undefined)
        .filter((snap):snap is recoveryRepo.Snapshot=>Boolean(snap));
      if(!await recoveryRepo.latestCommitmentsMatch(this.db,history))throw new Error('Outcome commitment state missing');
      for(const item of evidence.values()){
        const row=await repo.byId(this.db,item.operationId);
        if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))throw new Error('Outcome evidence conflicts');
      }
    }catch{await restrictProtectedWrites(this.db,'posted_route_outcome_evidence_unavailable');
      throw new AppError(503,'Route outcome recovery evidence unavailable','RECOVERY_UNAVAILABLE');}
  }
  async mutate(actor:string,key:string,action:repo.Action,id:string,payload:OutcomePayload={}){
    boundary();
    // Incident reconciliation must remain available while unsupported departures are paused.
    const prior=await repo.byKey(this.db,actor,key);
    if(!prior&&['depart','release_hold'].includes(action))
      await pauseService.assertAvailable('booking');
    const guard=await repo.acquireMutationGuard(this.db);
    try{return await this.mutateLocked(actor,key,action,id,payload);}
    finally{await repo.releaseMutationGuard(guard);}
  }
  private async mutateLocked(actor:string,key:string,action:repo.Action,id:string,payload:OutcomePayload={}){
    boundary();const hash=digest(action,id,payload),prior=await repo.byKey(this.db,actor,key);
    if(prior&&prior.payload_digest!==hash)
      throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');
    await this.verifyEvidenceUnlocked({actor,key});
    if(prior){
      if(prior.state==='committed'){
        if(!await this.stateMatches(prior,true))throw new AppError(409,'Pending outcome state conflicts','RECOVERY_CONFLICT');
        await this.acknowledgeOutcome(prior);
      }
      return this.operation(actor,prior.id);
    }
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
      await operatorQuery(client,'lockIdempotencyKey',[`posted-route-outcome:${actor}:${key}`]);
      const existing=await repo.byKey(client,actor,key);
      if(existing){if(existing.payload_digest!==hash)
        throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');return existing;}
      if(recovery.rows[0]?.mode!=='open')throw new AppError(503,'Protected writes restricted','RECOVERY_RESTRICTED');
      if(['depart','release_hold'].includes(action)&&await repo.bookingPaused(client))
        throw new AppError(503,'Booking activity paused','PILOT_PAUSED');
      store();
      const seatAction=!['driver_cancel','hold','release_hold','depart','operator_incident'].includes(action);
      const incident=action==='operator_incident'?await repo.incident(client,id):null;
      if(action==='operator_incident'&&!incident)throw new AppError(404,'Incident not found','INCIDENT_NOT_FOUND');
      const preview=seatAction?await repo.seat(client,id):
        incident?.allocation_id?await repo.seat(client,incident.allocation_id):null;
      if(seatAction&&!preview)throw new AppError(404,'Booking not found','BOOKING_NOT_FOUND');
      const offerId=preview?.offer_id??incident?.offer_id??id;
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
      // Seat-specific outcomes are private to that passenger and the driver.
      // Offer-wide changes reach only currently affected allocations.
      let recipients=seat?[offer.driver_id,seat.passenger_id]:
        [offer.driver_id,...seats.filter(item=>['confirmed','held'].includes(item.status))
          .map(item=>item.passenger_id)];
      const result:Record<string,unknown>={offer_id:offerId,allocation_id:seat?.id??null};
      if(action==='passenger_cancel'){
        if(seat!.passenger_id!==actor)throw new AppError(403,'Passenger only','FORBIDDEN');
        if(offer.status==='departed'){
          if(seat!.status!=='confirmed')throw new AppError(409,'Booking is not active','BOOKING_INVALID');
          result.incident_type='attempted_cancellation';result.requested_action='passenger_cancel';
        }else{
          if(!['confirmed','held'].includes(seat!.status))
            throw new AppError(409,'Booking is not active','BOOKING_INVALID');
          await repo.setSeatStatus(client,seat!.id,'cancelled');
        }
        recipients=[offer.driver_id,seat!.passenger_id];
      }else if(action==='incident_report'){
        if(![offer.driver_id,seat!.passenger_id].includes(actor))
          throw new AppError(403,'Participant only','FORBIDDEN');
        if(offer.status!=='departed'||seat!.status!=='confirmed')
          throw new AppError(409,'Active trip required','INCIDENT_INVALID');
        if(!payload.kind)throw new AppError(400,'Incident type required','INCIDENT_INVALID');
        requireReason(payload.reason);
        result.incident_type=payload.kind;
      }else if(action==='driver_cancel'){
        if(offer.driver_id!==actor)throw new AppError(403,'Driver only','FORBIDDEN');
        requireReason(payload.reason);
        if(offer.status==='departed'){
          result.incident_type='attempted_cancellation';result.requested_action='driver_cancel';
        }else{
        if(!['prepared','held'].includes(offer.status))throw new AppError(409,'Ride cannot be cancelled','RIDE_INVALID');
        await repo.setOfferStatus(client,offerId,'cancelled');
        result.cancelled_allocation_ids=seats.filter(item=>['confirmed','held'].includes(item.status))
          .map(item=>item.id).sort();
        for(const item of seats)if(['confirmed','held'].includes(item.status))
          await repo.setSeatStatus(client,item.id,'cancelled');
        const withdrawn=await repo.cancelRequests(client,offerId);
        recipients.push(...withdrawn.map(item=>item.passenger_id));
        result.withdrawn_request_ids=withdrawn.map(item=>item.id);
        }
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
          await assertNoAccountRestriction(client,offer.driver_id,'driver');
          for(const item of seats.filter(s=>s.status==='held')){
            await assertCurrentAdultDeclaration(client,item.passenger_id);
            await assertNoAccountRestriction(client,item.passenger_id,'passenger');
          }
          await repo.setOfferStatus(client,offerId,'prepared');
          for(const item of seats)if(item.status==='held')await repo.setSeatStatus(client,item.id,'confirmed');
        }
      }else if(action==='depart'){
        if(offer.driver_id!==actor)throw new AppError(403,'Driver only','FORBIDDEN');
        if(offer.status!=='prepared'||seats.some(item=>item.status==='held'))
          throw new AppError(409,'Ride is unavailable for departure','DEPARTURE_INVALID');
        operatingCoverage(offer);
        if(offer.routing_source==='valhalla'){
          const [publication]=await published(client,offerId);
          if(!publication)throw new AppError(409,'Published route evidence missing','ROUTE_NOT_FOUND');
          await verifiedPublication(publication);
        }
        await assertCurrentDriverVehicle(client,actor,offer.vehicle_declaration_id,offer.capacity);
        await assertNoAccountRestriction(client,actor,'driver');
        for(const item of seats.filter(s=>s.status==='confirmed')){
          await assertCurrentAdultDeclaration(client,item.passenger_id);
          await assertNoAccountRestriction(client,item.passenger_id,'passenger');
        }
        if(await repo.departureConflicts(client,offer))
          throw new AppError(409,'Departure commitments conflict','COMMITMENT_CONFLICT');
        const delta=clock()-offer.departure_at.getTime();
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
        if(action==='operator_settlement'&&payload.receipt_established&&
          (payload.recipient_confirmed!==true||!payload.evidence_refs?.length))
          throw new AppError(400,'Recipient confirmation evidence is required','RECIPIENT_EVIDENCE_REQUIRED');
      }else if(action==='operator_incident'){
        await assertCurrentOperator(client,actor);requireReason(payload.reason);
        if(incident?.status!=='open')throw new AppError(409,'Incident is not open','INCIDENT_INVALID');
        result.incident_id=incident.id;
      }
      const recordedAction=['passenger_cancel','driver_cancel'].includes(action)&&offer.status==='departed'?'incident_report':action;
      if(recordedAction==='incident_report')recipients.push(...await repo.operatorRecipients(client));
      const row=await repo.write(client,{actor,key,digest:hash,offer:offerId,allocation:seat?.id??null,
        action:recordedAction,payload:payload as Record<string,unknown>,result:{...result,
          notification_recipients:[...new Set(recipients)].sort()}});
      if(recordedAction==='incident_report'){
        const incident=await repo.insertIncident(client,{offer:offerId,allocation:seat?.id??null,actor,
          operation:row.id,kind:result.incident_type as string,
          reason:payload.reason?.trim()||'Attempted post-departure cancellation',priority:'high'});
        row.result.incident_id=incident.id;
        await repo.updateOperationResult(client,row.id,row.result);
      }else if(action==='operator_incident'){
        if(!await repo.resolveIncident(client,id,actor,row.id,payload.reason!,payload.evidence_refs??[]))
          throw new AppError(409,'Incident is not open','INCIDENT_INVALID');
      }else if(action==='driver_journey'||action==='passenger_journey'){
        const role=action==='driver_journey'?'driver':'passenger';
        await repo.insertClaim(client,seat!.id,row.id,role,payload.travelled!,payload.completed!);
        const claims=await repo.journeyClaim(client,seat!.id);
        if(claims.length===2){
          if(await repo.hasIncidentForAllocation(client,seat!.id))
            await repo.reviewJourney(client,seat!.id,'active_trip_incident');
          else if(!await repo.hasJourneyReview(client,seat!.id)&&claims.every(item=>item.travelled&&item.completed))await repo.insertObligation(client,seat!);
          else await repo.reviewJourney(client,seat!.id,'conflicting_or_incomplete_journey');
        }
      }else if(action==='payment_claim')await repo.insertPaymentClaim(client,result.obligation_id as string,row.id,payload.method!);
      else if(action==='receipt'||action==='dispute'){
        await repo.insertReceipt(client,result.claim_id as string,row.id,action);
        if(action==='dispute')await repo.reviewSettlement(client,result.obligation_id as string,'recipient_dispute');
      }else if(action==='operator_journey'){
        if(!await repo.resolveJourney(client,seat!.id,actor,payload.outcome!,payload.reason!,row.id,payload.evidence_refs??[]))
          throw new AppError(409,'Open journey review required','REVIEW_REQUIRED');
        if(payload.outcome==='travelled'&&!await repo.obligation(client,seat!.id))
          await repo.insertObligation(client,seat!);
      }else if(action==='operator_settlement'){
        const obligation=await repo.obligation(client,seat!.id);
        if(!obligation||!await repo.resolveSettlement(client,obligation.id,actor,
          payload.receipt_established!,payload.reason!,row.id,payload.evidence_refs??[]))
          throw new AppError(409,'Open settlement review required','REVIEW_REQUIRED');
      }
      row.result.recovery_snapshot=await recoveryRepo.snapshot(client,offerId);
      await repo.updateOperationResult(client,row.id,row.result);
      await repo.audit(client,row);
      await notify(client,row,recipients);
      return (await repo.byId(client,row.id))!;
    });
    if(operation.state!=='committed')return this.operation(actor,operation.id);
    await this.acknowledgeOutcome(operation);
    return {...visible(operation),state:'acknowledged'};
  }
  private async acknowledgeOutcome(operation:repo.Operation){
    try{await store().append(receipt(operation));
      await inProtectedTransaction(this.db,async client=>{
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy)throw new Error('Backup unhealthy');
        await repo.acknowledge(client,operation.id);
      });
    }catch{await restrictProtectedWrites(this.db,'posted_route_outcome_evidence_pending');
      throw new AppError(503,'Outcome committed; acknowledgement pending','OPERATION_PENDING',
        {operationId:operation.id});}
  }

}
export const postedRouteOutcomesService=new PostedRouteOutcomesService();
