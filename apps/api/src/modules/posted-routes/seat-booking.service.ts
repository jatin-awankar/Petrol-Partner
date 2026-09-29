import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {pool} from '../../db/pool';
import {AppError} from '../../shared/errors/app-error';
import {assertCurrentAdultDeclaration} from '../adult-declaration/adult-declaration.service';
import {assertCurrentDriverVehicle} from '../driver-vehicle-declaration/driver-vehicle-declaration.service';
import {recordDurableNotification} from '../notifications/contract.repo';
import {backupStatus} from '../operator/backup-status';
import {assertNoAccountRestriction} from '../operator/account-restrictions.policy';
import {operatorQuery} from '../operator/operator.repo';
import {assertCurrentOperator} from '../operator/operator.authorization';
import {pauseService} from '../operator/pause.service';
import {pilotReceiptStore,restrictProtectedWrites} from '../protected-mutation/receipt-evidence';
import {inProtectedTransaction} from '../protected-mutation/protocol';
import {lockCommitmentActors} from '../rides/commitment.repo';
import {quoteSegment} from './segment-quote';
import {ROUTE_POLICY_VERSION,ROUTE_OPERATING_POLICY_VERSION} from './policy';
import * as repo from './seat-booking.repo';

type Action='requested'|'accepted'|'rejected';
type Receipt={operationId:string;actorId:string;key:string;digest:string;action:Action;
  requestId:string;result:Record<string,unknown>;requestSnapshot:repo.SeatRequest;
  allocationSnapshot:repo.Allocation|null;createdAt:string};
const store=()=>pilotReceiptStore<Receipt>('posted-route-seat','Posted route seat recovery evidence unavailable');
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,actorId:row.actor_id,key:row.idempotency_key,
  digest:row.payload_digest,action:row.action,requestId:row.request_id,result:row.result,
  requestSnapshot:row.request_snapshot,allocationSnapshot:row.allocation_snapshot,
  createdAt:row.created_at.toISOString()});
const digest=(action:Action,id:string,selection?:repo.Selection)=>createHash('sha256')
  .update(JSON.stringify({action,id,selection:selection?{route_version:selection.route_version,
    pickup:selection.pickup,dropoff:selection.dropoff}:null})).digest('hex');
function canonical(value:unknown):unknown{
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
    .sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
const sameTerms=(a:Record<string,unknown>,b:Record<string,unknown>)=>
  JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const visible=(row:repo.Operation)=>({operation_id:row.id,state:row.state,...row.result});

function assertSyntheticBoundary(){
  if(process.env.NODE_ENV!=='test')throw new AppError(503,'Route bookings are unavailable','ROUTE_BOOKINGS_DISABLED');
}
function coverage(row:repo.Offer){
  if(row.operating_policy_version!==ROUTE_OPERATING_POLICY_VERSION)
    throw new AppError(409,'Operating policy changed','OPERATING_POLICY_STALE');
  const start=process.env.ROUTE_SUPPORT_WINDOW_START,end=process.env.ROUTE_SUPPORT_WINDOW_END;
  if(process.env.ROUTE_SUPPORT_WINDOW_APPROVED!=='true'||!start||!end||
    !Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end)))
    throw new AppError(503,'Support coverage unavailable','SUPPORT_WINDOW_UNAVAILABLE');
  const now=Date.now();
  if(now<Date.parse(start)||now>=Date.parse(end)||row.departure_at.getTime()<Date.parse(start)||
    row.commitment_until.getTime()>=Date.parse(end))
    throw new AppError(409,'Support coverage closed','SUPPORT_WINDOW_CLOSED');
}
function routeTerms(row:repo.Offer,selection:repo.Selection){
  if(row.status!=='prepared')throw new AppError(409,'Route unavailable','ROUTE_UNAVAILABLE');
  if(row.route_version!==selection.route_version)throw new AppError(409,'Route version changed','ROUTE_VERSION_STALE');
  if(row.policy_version!==ROUTE_POLICY_VERSION)throw new AppError(409,'Route policy changed','ROUTE_POLICY_STALE');
  if(row.routing_source!=='synthetic-test')throw new AppError(503,'Route cannot be verified','SEGMENT_UNVERIFIABLE');
  return quoteSegment({source:row.routing_source,mode:row.routing_mode,geometry:row.geometry,
    cumulativeMeters:row.cumulative_meters,distanceMeters:row.distance_meters,
    durationSeconds:row.duration_seconds},{pickup:selection.pickup,dropoff:selection.dropoff});
}
async function assertPause(client:PoolClient,action:Action){
  const capabilities=action==='requested'?['booking','requests']:['booking','acceptance'];
  const state=await client.query<{capability:string;paused:boolean}>(
    'SELECT capability,paused FROM pilot_pause_state WHERE capability=ANY($1::text[]) FOR SHARE',[capabilities]);
  if(state.rows.length!==2||state.rows.some(row=>row.paused))
    throw new AppError(503,'Booking activity paused','PILOT_PAUSED');
}
async function notice(client:PoolClient,row:repo.Operation){
  const recipient=row.action==='requested'?row.request_snapshot.driver_id:row.request_snapshot.passenger_id;
  await recordDurableNotification(client,{eventId:row.id,originType:'posted_route_seat',operationId:row.id,
    recipientId:recipient,eventType:row.action,relatedEntityType:'posted_route_seat_request',
    relatedEntityId:row.request_id,title:row.action==='requested'?'Seat requested':
      row.action==='accepted'?'Seat confirmed':'Seat request rejected',
    body:row.action==='requested'?'One seat was requested. It is pending and has no allocation.':
      row.action==='accepted'?'Your driver accepted one whole-ride seat.':'Your driver rejected the request.'});
  if(row.action==='accepted')await recordDurableNotification(client,{
    originType:'posted_route_seat',operationId:row.id,recipientId:row.request_snapshot.driver_id,
    eventType:'accepted_driver',relatedEntityType:'posted_route_seat_request',relatedEntityId:row.request_id,
    title:'Seat confirmed',body:'You accepted one whole-ride seat.'});
  for(const withdrawn of (row.result.withdrawn_requests as repo.SeatRequest[]|undefined)??[])
    await recordDurableNotification(client,{
      originType:'posted_route_seat',operationId:row.id,recipientId:withdrawn.passenger_id,
      eventType:`withdrawn:${withdrawn.id}`,relatedEntityType:'posted_route_seat_request',
      relatedEntityId:withdrawn.id,title:'Seat request withdrawn',
      body:'An overlapping confirmed ride withdrew this pending request.'});
}

export class PostedRouteSeatService{
  constructor(private readonly db:Pool=pool){}
  async receipts(){return store().list();}
  async pending(){return repo.pending(this.db);}
  async verifyEvidence(retry?:{actorId:string;key:string}){
    try{
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy)throw new Error('Backup unhealthy');
      const evidence=new Map((await store().list()).map(item=>[item.operationId,item]));
      const rows=await repo.allOperations(this.db);
      for(const row of rows){
        if(row.state==='committed'){
          if(!retry||retry.actorId!==row.actor_id||retry.key!==row.idempotency_key)
            throw new Error('Seat operation pending');
        }else if(JSON.stringify(evidence.get(row.id))!==JSON.stringify(receipt(row)))
          throw new Error('Seat receipt missing');
      }
      for(const item of evidence.values()){
        const row=rows.find(value=>value.id===item.operationId);
        if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))throw new Error('Seat receipt conflicts');
        if(item.allocationSnapshot){
          const allocation=(await this.db.query<repo.Allocation>(
            'SELECT * FROM posted_route_seat_allocations WHERE id=$1',[item.allocationSnapshot.id])).rows[0];
          if(!allocation||!sameTerms(allocation as unknown as Record<string,unknown>,
            item.allocationSnapshot as unknown as Record<string,unknown>))
            throw new Error('Seat allocation missing or changed');
        }
      }
    }catch{await restrictProtectedWrites(this.db,'posted_route_seat_evidence_unavailable');
      throw new AppError(503,'Posted route seat recovery evidence unavailable','RECOVERY_UNAVAILABLE');}
  }
  async operation(actor:string,id:string){assertSyntheticBoundary();
    const row=await repo.byId(this.db,id);
    if(!row||row.actor_id!==actor)throw new AppError(404,'Operation not found','OPERATION_NOT_FOUND');
    const recovery=await operatorQuery<{mode:string}>(this.db,'recoveryMode');
    if(row.state==='committed'||recovery.rows[0]?.mode!=='open')
      return {operation_id:row.id,state:'pending_unknown'};
    return visible(row);}
  async mutate(actor:string,key:string,action:Action,id:string,selection?:repo.Selection){
    assertSyntheticBoundary();
    const hash=digest(action,id,selection),existing=await repo.byKey(this.db,actor,key);
    if(existing?.payload_digest!==undefined&&existing.payload_digest!==hash)
      throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');
    await this.verifyEvidence({actorId:actor,key});
    if(!existing)await pauseService.assertAvailable(action==='requested'?'requests':'acceptance');
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
      await operatorQuery(client,'lockIdempotencyKey',[`posted-route-seat:${actor}:${key}`]);
      const prior=await repo.byKey(client,actor,key);
      if(prior){if(prior.payload_digest!==hash)throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');return prior;}
      if(recovery.rows[0]?.mode!=='open')throw new AppError(503,'Protected writes restricted','RECOVERY_RESTRICTED');
      await assertPause(client,action);
      store();
      let routeId=id;
      if(action!=='requested'){
        const preview=await repo.requestSnapshot(client,id);
        if(!preview)throw new AppError(404,'Request not found','REQUEST_NOT_FOUND');
        routeId=preview.offer_id;
      }
      // The same actor locks serialize declarations, route decisions, and competing acceptances.
      const initial=action==='requested'?null:await repo.requestSnapshot(client,id);
      const preliminary=await client.query<{driver_id:string;vehicle_declaration_id:string}>(
        'SELECT driver_id,vehicle_declaration_id FROM posted_route_offers WHERE id=$1',[routeId]);
      const owner=preliminary.rows[0];
      if(!owner)throw new AppError(404,'Route not found','ROUTE_NOT_FOUND');
      await lockCommitmentActors(client,owner.driver_id,owner.vehicle_declaration_id,
        [action==='requested'?actor:initial!.passenger_id]);
      const offer=await repo.offer(client,routeId);
      if(!offer)throw new AppError(404,'Route not found','ROUTE_NOT_FOUND');
      coverage(offer);
      let request:repo.SeatRequest,allocation:repo.Allocation|null=null,withdrawn:repo.SeatRequest[]=[];
      if(action==='requested'){
        if(!selection)throw new AppError(400,'Segment required','SEGMENT_REQUIRED');
        if(offer.driver_id===actor)throw new AppError(409,'Cannot request your own ride','SELF_BOOKING_FORBIDDEN');
        if(offer.request_cutoff_at<=new Date())throw new AppError(409,'Request deadline passed','REQUEST_WINDOW_CLOSED');
        await assertCurrentAdultDeclaration(client,actor);
        await assertNoAccountRestriction(client,actor,'passenger');
        await assertCurrentDriverVehicle(client,offer.driver_id,offer.vehicle_declaration_id,offer.capacity);
        await assertNoAccountRestriction(client,offer.driver_id,'driver');
        const terms=await routeTerms(offer,selection);
        if(await repo.overlapping(client,offer,actor))throw new AppError(409,'Overlapping commitment','COMMITMENT_CONFLICT');
        try{request=await repo.insertRequest(client,offer,actor,selection,
          {route_id:offer.id,route_version:offer.route_version,...terms});}
        catch(error){if((error as {code?:string}).code==='23505')throw new AppError(409,'Request already pending','DUPLICATE_REQUEST');throw error;}
      }else{
        request=await repo.request(client,id);
        if(!request||request.offer_id!==offer.id)throw new AppError(404,'Request not found','REQUEST_NOT_FOUND');
        if(request.driver_id!==actor||offer.driver_id!==actor)throw new AppError(403,'Driver only','FORBIDDEN');
        if(request.status!=='pending'||request.decision_deadline_at<=new Date()||offer.acceptance_cutoff_at<=new Date())
          throw new AppError(409,'Request deadline passed','REQUEST_NOT_PENDING');
        await assertCurrentDriverVehicle(client,actor,offer.vehicle_declaration_id,offer.capacity);
        await assertNoAccountRestriction(client,actor,'driver');
        if(action==='accepted'){
          await assertCurrentAdultDeclaration(client,request.passenger_id);
          await assertNoAccountRestriction(client,request.passenger_id,'passenger');
          const segment=await routeTerms(offer,request.selection);
          const terms={route_id:offer.id,route_version:offer.route_version,
            pickup:request.selection.pickup,dropoff:request.selection.dropoff,
            distance_source:'saved_posted_route',policy_version:offer.policy_version,...segment};
          if(!sameTerms({route_id:offer.id,route_version:offer.route_version,...segment},request.proposed_terms))
            throw new AppError(409,'Segment or price changed','SEGMENT_TERMS_CHANGED');
          if(await repo.countSeats(client,offer.id)>=offer.capacity)
            throw new AppError(409,'No seat remains','INSUFFICIENT_SEATS');
          if(await repo.overlapping(client,offer,request.passenger_id))
            throw new AppError(409,'Overlapping commitment','COMMITMENT_CONFLICT');
          allocation=await repo.allocate(client,offer,request,terms);
          withdrawn=await repo.withdrawIncompatible(client,offer,[request.passenger_id,offer.driver_id]);
        }
        request=await repo.decide(client,id,action);
      }
      const row=await repo.insertOperation(client,actor,key,hash,action,request,allocation,withdrawn);
      await repo.audit(client,row);
      await repo.auditWithdrawals(client,row,withdrawn);
      await notice(client,row);
      return row;
    });
    if(operation.state!=='committed')return this.operation(actor,operation.id);
    try{
      await store().append(receipt(operation));
      await inProtectedTransaction(this.db,async client=>{
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy)throw new Error('Backup unhealthy');
        await repo.acknowledge(client,operation.id);});
    }catch{await restrictProtectedWrites(this.db,'posted_route_seat_evidence_pending');
      throw new AppError(503,'Seat operation committed; acknowledgement pending','OPERATION_PENDING',{operationId:operation.id});}
    return {...visible(operation),state:'acknowledged'};
  }
  async reconcileReceipts(operatorId:string){
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    const items=await store().list();
    for(const row of await this.pending()){
      if(!items.some(item=>item.operationId===row.id)){
        const item=receipt(row);await store().append(item);items.push(item);
      }
    }
    items.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.operationId.localeCompare(b.operationId));
    const latest=new Map<string,repo.SeatRequest>();
    for(const item of items){
      if(item.digest!==digest(item.action,item.action==='requested'?item.requestSnapshot.offer_id:item.requestId,
        item.action==='requested'?item.requestSnapshot.selection:undefined))
        throw new AppError(409,'Receipt payload conflicts','RECOVERY_CONFLICT');
      await inProtectedTransaction(this.db,async client=>{
        await assertCurrentOperator(client,operatorId);
        await repo.restore(client,item);
        const row=await repo.byId(client,item.operationId);
        if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))
          throw new AppError(409,'Seat receipt conflicts','RECOVERY_CONFLICT');
        if(item.allocationSnapshot){
          const currentAllocation=(await client.query<repo.Allocation>(
            'SELECT * FROM posted_route_seat_allocations WHERE id=$1',[item.allocationSnapshot.id])).rows[0];
          if(!currentAllocation||!sameTerms(currentAllocation as unknown as Record<string,unknown>,
            item.allocationSnapshot as unknown as Record<string,unknown>))
            throw new AppError(409,'Seat allocation conflicts','RECOVERY_CONFLICT');
        }
        await client.query("UPDATE posted_route_seat_operations SET state='recovered',acknowledged_at=now() WHERE id=$1 AND state='committed'",[row.id]);
        await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
          SELECT $1,$2,'posted_route_seat_request',$3,jsonb_build_object('operationId',$4::text,'routeId',$5::text)
          WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$4)`,
          [row.actor_id,`posted_route_seat_${row.action}`,row.request_id,row.id,row.request_snapshot.offer_id]);
        for(const withdrawn of (row.result.withdrawn_requests as repo.SeatRequest[]|undefined)??[])
          await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
            SELECT $1,'posted_route_seat_withdrawn','posted_route_seat_request',$2,
              jsonb_build_object('operationId',$3::text,'routeId',$4::text)
            WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$3 AND entity_id=$2)`,
            [row.actor_id,withdrawn.id,row.id,withdrawn.offer_id]);
        await notice(client,row);
        await client.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='posted_route_seat' AND operation_id=$1",[row.id]);
        await client.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
          last_error='Suppressed after snapshot restore; delivery requires review',updated_at=now()
          WHERE event_id IN (SELECT id FROM pilot_notification_events WHERE origin_type='posted_route_seat' AND operation_id=$1)
          AND status<>'sent'`,[row.id]);
      });
      latest.set(item.requestId,item.requestSnapshot);
      for(const withdrawn of (item.result.withdrawn_requests as repo.SeatRequest[]|undefined)??[])
        latest.set(withdrawn.id,withdrawn);
    }
    for(const [id,expected] of latest){
      const current=await repo.requestSnapshot(this.db,id);
      if(!current||!sameTerms(current as unknown as Record<string,unknown>,
        expected as unknown as Record<string,unknown>))
        throw new AppError(409,'Seat request conflicts','RECOVERY_CONFLICT');
    }
    return items.length;
  }
}
export const postedRouteSeatService=new PostedRouteSeatService();
export const postedRouteSeatRecovery=postedRouteSeatService;
