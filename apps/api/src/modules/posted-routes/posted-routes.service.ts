import type {PoolClient} from 'pg';
import {assertPassengerPreviewEnabled,previewStoppingPlaces,confirmedPublication,verifiedPublication,passengerView,passengerQuote,type PassengerPublication} from './passenger-routes';
import {assertCurrentAdultDeclaration} from '../adult-declaration/adult-declaration.service';
import {SERVICE_AREA} from './service-area';
import {verifyRouteBoundary} from './route-boundary';
import {createHash} from 'node:crypto';
import {pool} from '../../db/pool';
import {AppError} from '../../shared/errors/app-error';
import {inProtectedTransaction} from '../protected-mutation/protocol';
import {pilotReceiptStore,restrictProtectedWrites} from '../protected-mutation/receipt-evidence';
import {operatorQuery} from '../operator/operator.repo';
import {assertCurrentOperator} from '../operator/operator.authorization';
import {backupStatus} from '../operator/backup-status';
import {recordDurableNotification} from '../notifications/contract.repo';
import {assertCurrentDriverVehicle} from '../driver-vehicle-declaration/driver-vehicle-declaration.service';
import {lockCommitmentActors,lockVehicleRegistration,lockStudentActor} from '../rides/commitment.repo';
import {verifyRoute,type VerifiedRoute,type Point} from './routing';
import * as repo from './posted-routes.repo';
import {ROUTE_POLICY_VERSION,ROUTE_OPERATING_POLICY_VERSION} from './policy';
import {quoteSegment} from './segment-quote';
export type Input={vehicle_id:string;mode:'bike'|'scooter'|'car';origin:Point;destination:Point;departure_at:string;capacity:number;stop_points?:Point[];passenger_publication?:PassengerPublication;replaces_offer_id?:string;endpoint_confirmation?:EndpointConfirmation};
export type EndpointConfirmation={preview_digest:string;origin:Point;destination:Point;safe_stopping_places:true;correct_side_and_direction:true;helmet_space?:true};
type Receipt={operationId:string;actorId:string;key:string;digest:string;offerId:string;result:Record<string,unknown>;snapshot:Record<string,unknown>;createdAt:string};
const store=()=>pilotReceiptStore<Receipt>('posted-route','Posted route recovery evidence unavailable');
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,actorId:row.actor_id,key:row.idempotency_key,digest:row.payload_digest,
  offerId:row.offer_id,result:row.result,snapshot:row.offer_snapshot,createdAt:row.created_at.toISOString()});
function schedule(departure:Date,now:Date,until?:Date){
  if(!Number.isFinite(departure.getTime())||departure.getTime()<now.getTime()+2*3600000||departure.getTime()>now.getTime()+7*86400000)
    throw new AppError(409,'Departure must be two hours to seven days ahead','DEPARTURE_INVALID');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(departure);
  const part=(name:string)=>parts.find(x=>x.type===name)?.value??'';
  if(!['Mon','Tue','Wed','Thu','Fri'].includes(part('weekday'))||`${part('hour')}:${part('minute')}`<'09:00'||`${part('hour')}:${part('minute')}`>='18:00')
    throw new AppError(409,'Departure outside proposed support hours','SUPPORT_WINDOW_CLOSED');
  // Broader-area coverage must be explicitly provided, independent of the corridor window.
  const start=process.env.ROUTE_SUPPORT_WINDOW_START,end=process.env.ROUTE_SUPPORT_WINDOW_END;
  if(process.env.ROUTE_SUPPORT_WINDOW_APPROVED!=='true'||!start||!end||
    !Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end)))
    throw new AppError(503,'Route support coverage unapproved','SUPPORT_WINDOW_UNAVAILABLE');
  if(now<new Date(start)||now>=new Date(end)||departure<new Date(start)||(until??departure)>=new Date(end))
    throw new AppError(409,'Route support coverage closed','SUPPORT_WINDOW_CLOSED');
}
export async function verifyEvidence(retry?:{actor:string;key:string}){
  try{
    const backup=await backupStatus(pool);if(backup.required&&!backup.healthy)throw new Error('Backup unhealthy');
    const evidenced=new Map((await store().list()).map(x=>[x.operationId,x]));
    for(const item of evidenced.values()){const row=await repo.byId(pool,item.operationId);
      if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))throw new Error('Receipt conflicts with database');}
    for(const row of await repo.acknowledged(pool))if(JSON.stringify(evidenced.get(row.id))!==JSON.stringify(receipt(row)))throw new Error('Receipt missing');
    if((await repo.pending(pool)).some(row=>!retry||row.actor_id!==retry.actor||row.idempotency_key!==retry.key))throw new Error('Operation pending');
  }catch{await restrictProtectedWrites(pool,'posted_route_evidence_unavailable');throw new AppError(503,'Posted route recovery evidence unavailable','RECOVERY_UNAVAILABLE');}
}
async function lockPassengerRead(client:PoolClient,actor:string,rows:repo.PassengerRoute[],quotes=false){
  const state=await repo.lockPassengerState(client,quotes);
  if(!state.open)throw new AppError(503,'Route state awaits recovery','RECOVERY_RESTRICTED');
  if(state.paused)throw new AppError(503,'Booking activity paused','PILOT_PAUSED');
  for(const id of [...new Set([actor,...rows.map(r=>r.driver_id)])].sort())await lockStudentActor(client,id);
}
async function passengerAccess(client:PoolClient,actor:string){
  assertPassengerPreviewEnabled();
  await assertCurrentAdultDeclaration(client,actor);
  const recovery=await operatorQuery<{mode:string}>(client,'recoveryMode');
  if(recovery.rows[0]?.mode!=='open')throw new AppError(503,'Route state awaits recovery','RECOVERY_RESTRICTED');
}
async function eligiblePassengerRoute(client:PoolClient,row:repo.PassengerRoute){
  if(row.status!=='prepared'||row.request_cutoff_at<=new Date())
    throw new AppError(404,'Posted route not found','ROUTE_NOT_FOUND');
  const driver=await assertCurrentDriverVehicle(client,row.driver_id,row.vehicle_declaration_id,row.capacity);
  if(driver.category!==row.routing_mode)throw new AppError(409,'Vehicle category changed','ROUTE_MODE_INVALID');
  const start=Date.parse(process.env.ROUTE_SUPPORT_WINDOW_START??''),end=Date.parse(process.env.ROUTE_SUPPORT_WINDOW_END??'');
  if(process.env.ROUTE_SUPPORT_WINDOW_APPROVED!=='true'||!Number.isFinite(start)||!Number.isFinite(end)||
    Date.now()<start||Date.now()>=end||row.departure_at.getTime()<start||row.commitment_until.getTime()>=end)
    throw new AppError(503,'Support coverage unavailable','SUPPORT_WINDOW_UNAVAILABLE');
  return verifiedPublication(row);
}
export async function discover(actor:string){
  return inProtectedTransaction(pool,async client=>{
    const candidates=await repo.published(client);
    await lockPassengerRead(client,actor,candidates);
    await passengerAccess(client,actor);
    const offers=[];
    for(const candidate of candidates){
      if(candidate.driver_id===actor)continue;
      const [row]=await repo.published(client,candidate.id,true);
      if(!row)continue;
      try{offers.push(passengerView(row,await eligiblePassengerRoute(client,row)));}
      catch(error){if(!(error instanceof AppError))throw error;}
    }
    return offers;
  });
}
export async function mine(actor:string){return repo.mine(pool,actor);}
export async function read(actor:string,id:string){
  const owned=await repo.owned(pool,actor,id);
  if(!owned)throw new AppError(404,'Posted route not found','ROUTE_NOT_FOUND');return owned;
}
export async function passengerRead(actor:string,id:string){
  // Preserve the private-route 404 without disclosing its existence or contents.
  const [row]=await repo.published(pool,id);
  if(!row)throw new AppError(404,'Posted route not found','ROUTE_NOT_FOUND');
  return inProtectedTransaction(pool,async client=>{
    await lockPassengerRead(client,actor,[row]);
    await passengerAccess(client,actor);
    const [current]=await repo.published(client,id,true);
    if(!current)throw new AppError(404,'Posted route not found','ROUTE_NOT_FOUND');
    return passengerView(current,await eligiblePassengerRoute(client,current));
  });
}
export async function quote(actor:string,id:string,version:number,pickup:Point,dropoff:Point){
  // Real-booking activation remains a separate, explicit release decision.
  if(process.env.NODE_ENV!=='test')throw new AppError(503,'Route quotes are not available','ROUTE_QUOTES_DISABLED');
  const [published]=await repo.published(pool,id);
  if(published){await verifyEvidence();return inProtectedTransaction(pool,async client=>{
    await lockPassengerRead(client,actor,[published],true);
    await passengerAccess(client,actor);
    const [current]=await repo.published(client,id,true);
    if(!current)throw new AppError(404,'Posted route not found','ROUTE_NOT_FOUND');
    if(published.driver_id===actor)throw new AppError(403,'Choose another driver’s offer','SELF_QUOTE_FORBIDDEN');
    await eligiblePassengerRoute(client,current);
    return passengerQuote(current,version,pickup,dropoff);
  });}
  const row=await repo.ownedForQuote(pool,actor,id);
  if(!row)throw new AppError(404,'Posted route not found','ROUTE_NOT_FOUND');
  if(row.status!=='prepared')throw new AppError(409,'Route is unavailable','ROUTE_UNAVAILABLE');
  if(row.route_version!==version)throw new AppError(409,'Route version changed','ROUTE_VERSION_STALE');
  if(row.routing_source!=='synthetic-test')throw new AppError(503,'Route cannot be verified','SEGMENT_UNVERIFIABLE');
  const result=await quoteSegment({source:row.routing_source,mode:row.routing_mode,geometry:row.geometry,
    cumulativeMeters:row.cumulative_meters,distanceMeters:row.distance_meters,durationSeconds:row.duration_seconds},
    {pickup,dropoff});
  return {route_id:row.id,route_version:row.route_version,policy_version:row.policy_version,
    distance_source:'saved_posted_route',...result,real_bookings_enabled:false};
}
export async function operation(actor:string,id:string){const row=await repo.byId(pool,id);
  if(!row||row.actor_id!==actor)throw new AppError(404,'Operation not found','OPERATION_NOT_FOUND');
  return {operation_id:row.id,state:row.state,...row.result};}
function previewDigest(route:VerifiedRoute){return createHash('sha256').update(JSON.stringify({route,serviceArea:SERVICE_AREA})).digest('hex');}
async function checkDriver(actor:string,input:Input){
  await inProtectedTransaction(pool,async client=>{
    const declaration=await assertCurrentDriverVehicle(client,actor,input.vehicle_id,input.capacity);
    if(declaration.category!==input.mode)throw new AppError(400,'Routing mode differs from declared vehicle','ROUTE_MODE_INVALID');
  });
}
export async function preview(actor:string,input:Input){
  await checkDriver(actor,input);
  schedule(new Date(input.departure_at),new Date());
  const route=await verifyRoute(input);
  const stop_previews=input.stop_points?await previewStoppingPlaces(route,input.stop_points):undefined;
  return {...(stop_previews?{stop_previews}:{}),route,preview_digest:previewDigest(route),real_bookings_enabled:false,
    boundary_verified:false,service_area:SERVICE_AREA,confirmation_required:true};
}
async function publicationEvidence(route:VerifiedRoute,input:Input){
  // Preserve the pre-existing synthetic seam for historical lifecycle tests.
  if(route.source==='synthetic-test'&&process.env.NODE_ENV==='test'&&!input.passenger_publication)return null;
  const confirmation=input.endpoint_confirmation;
  if(!route.verification||!confirmation||confirmation.preview_digest!==previewDigest(route)||
    JSON.stringify(confirmation.origin)!==JSON.stringify(route.geometry.coordinates[0])||
    JSON.stringify(confirmation.destination)!==JSON.stringify(route.geometry.coordinates.at(-1))||
    confirmation.safe_stopping_places!==true||confirmation.correct_side_and_direction!==true||
    (input.mode!=='car'&&confirmation.helmet_space!==true))
    throw new AppError(422,'Confirm the safe routed endpoints from a fresh preview','ENDPOINT_CONFIRMATION_REQUIRED');
  const boundary=await verifyRouteBoundary(route);
  const passengerPublication=input.passenger_publication?await confirmedPublication(route,input.passenger_publication):undefined;
  if(input.passenger_publication)await previewStoppingPlaces(route,input.passenger_publication.stops.map(s=>s.point));
  return {...route.verification,confirmation,boundary,...(passengerPublication?{passengerPublication}:{})};
}
export async function prepare(actor:string,key:string,input:Input){
  if(input.passenger_publication)assertPassengerPreviewEnabled();
  const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const existing=await repo.byKey(pool,actor,key);
  if(existing&&existing.payload_digest!==digest)throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');
  await verifyEvidence({actor,key});
  if(input.replaces_offer_id){
    const {postedRouteOutcomesService}=await import('./outcomes.service');
    await postedRouteOutcomesService.verifyEvidence();
  }
  if(existing)return operation(actor,existing.id);
  await checkDriver(actor,input);
  const departure=new Date(input.departure_at);schedule(departure,new Date());
  const route=await verifyRoute({origin:input.origin,destination:input.destination,mode:input.mode});
  const verification=await publicationEvidence(route,input);
  const until=new Date(departure.getTime()+route.durationSeconds*1000+30*60000);
  schedule(departure,new Date(),until);
  const row=await inProtectedTransaction(pool,async client=>{
    const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
    await operatorQuery(client,'lockIdempotencyKey',[`posted-route:${actor}:${key}`]);
    const prior=await repo.byKey(client,actor,key);
    if(prior){if(prior.payload_digest!==digest)throw new AppError(409,'Idempotency payload mismatch','IDEMPOTENCY_PAYLOAD_MISMATCH');return prior;}
    if(recovery.rows[0]?.mode!=='open')throw new AppError(503,'Protected writes restricted','RECOVERY_RESTRICTED');
    store();
    if(input.passenger_publication&&await repo.publicationPaused(client))
      throw new AppError(503,'Publication paused','PILOT_PAUSED');
    await lockCommitmentActors(client,actor,input.vehicle_id,[]);
    if(input.replaces_offer_id){
      const source=await repo.replacementSource(client,input.replaces_offer_id);
      if(!source||source.driver_id!==actor||source.status!=='cancelled'||!source.cancel_acknowledged)
        throw new AppError(409,'Replacement requires your acknowledged cancellation','REPLACEMENT_INVALID');
      if(await repo.replacementExists(client,input.replaces_offer_id))
        throw new AppError(409,'A replacement already exists','REPLACEMENT_EXISTS');
    }
    const declaration=await assertCurrentDriverVehicle(client,actor,input.vehicle_id,input.capacity);
    const registration=await repo.registration(client,input.vehicle_id);
    if(!registration)throw new AppError(404,'Vehicle not found','VEHICLE_NOT_FOUND');
    await lockVehicleRegistration(client,registration);
    if(declaration.category!==input.mode)throw new AppError(400,'Routing mode differs from declared vehicle','ROUTE_MODE_INVALID');
    schedule(departure,new Date(),until);
    if(await repo.conflict(client,actor,input.vehicle_id,departure,until))throw new AppError(409,'Overlapping commitment','COMMITMENT_CONFLICT');
    const saved=await repo.save(client,{driver:actor,vehicle:input.vehicle_id,route,departure,until,
      capacity:input.capacity,verification,policy:ROUTE_POLICY_VERSION,replacesOfferId:input.replaces_offer_id});
    const snapshot=await repo.snapshot(client,saved.id);
    const result={id:saved.id,route_version:1,policy_version:ROUTE_POLICY_VERSION,operating_policy_version:ROUTE_OPERATING_POLICY_VERSION,status:'prepared',real_bookings_enabled:false,...(input.passenger_publication?{visibility:'published'}:{}),
      ...(input.replaces_offer_id?{replaces_offer_id:input.replaces_offer_id}:{})};
    const created=await repo.insertOperation(client,{actor,key,digest,offerId:saved.id,result,snapshot});
    await repo.audit(client,created);
    await recordDurableNotification(client,{originType:'posted_route',operationId:created.id,recipientId:actor,
      eventType:'prepared',relatedEntityType:'posted_route_offer',relatedEntityId:saved.id,
      ...routeNotice(created.result)});
    return created;
  });
  if(row.state!=='committed')return operation(actor,row.id);
  try{
    await store().append(receipt(row));
    await inProtectedTransaction(pool,async client=>{const backup=await backupStatus(client);
      if(backup.required&&!backup.healthy)throw new Error('Backup unhealthy');
      await repo.acknowledge(client,row.id);});
  }catch{await restrictProtectedWrites(pool,'posted_route_evidence_pending');
    throw new AppError(503,'Route committed; acknowledgement pending','OPERATION_PENDING',{operationId:row.id});}
  return {operation_id:row.id,state:'acknowledged',...row.result};
}

function routeNotice(result:Record<string,unknown>){
  return result.visibility==='published'?{title:'Route published for preview',
    body:'Eligible passengers can preview your route and confirmed stopping places. Real bookings remain disabled.'}:
    {title:'Route prepared',body:'Your draft route is available to you. It is not open for bookings.'};
}

export const postedRouteRecovery={verifyEvidence,receipts:()=>store().list(),pending:()=>repo.pending(pool),
  async reconcileReceipts(operatorId:string){
    const items=(await store().list()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    for(const item of items)await inProtectedTransaction(pool,async client=>{
      await assertCurrentOperator(client,operatorId);
      const previous=await repo.byId(client,item.operationId);
      if(previous&&JSON.stringify(receipt(previous))!==JSON.stringify(item))
        throw new AppError(409,'Route receipt conflicts with database','RECOVERY_CONFLICT');
      const live=await repo.owned(client,item.actorId,item.offerId);
      if(live&&JSON.stringify(await repo.snapshot(client,item.offerId))!==JSON.stringify(item.snapshot))
        throw new AppError(409,'Route snapshot conflicts with receipt','RECOVERY_CONFLICT');
      await repo.restore(client,item);
      const row=await repo.byId(client,item.operationId);
      if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))
        throw new AppError(409,'Route receipt cannot be restored','RECOVERY_CONFLICT');
      await repo.restoreAudit(client,row);
      await recordDurableNotification(client,{originType:'posted_route',operationId:row.id,recipientId:row.actor_id,
        eventType:'prepared',relatedEntityType:'posted_route_offer',relatedEntityId:row.offer_id,
        ...routeNotice(row.result)});
      await repo.acknowledge(client,row.id);
      await repo.suppressRestoredNotification(client,row.id);
    });
    for(const row of await repo.pending(pool)){
      await inProtectedTransaction(pool,async client=>{
        await assertCurrentOperator(client,operatorId);
        if(!await repo.pendingStateMatches(client,row))
          throw new AppError(409,'Route pending state incomplete','RECOVERY_INCOMPLETE');
      });
      await store().append(receipt(row));
      await inProtectedTransaction(pool,async client=>{await assertCurrentOperator(client,operatorId);await repo.acknowledge(client,row.id);});
    }
    return items.length;
  }};
