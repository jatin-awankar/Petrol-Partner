import {verifySavedStopPositions} from './valhalla';
import {z} from 'zod';
import {AppError} from '../../shared/errors/app-error';
import {quoteSegment,matchPosition,type StopEvidence} from './segment-quote';
import {verifyServiceArea,serviceAreaPoint,SERVICE_AREA} from './service-area';
import type {Point,VerifiedRoute} from './routing';
import type {PassengerRoute} from './posted-routes.repo';
import {ROUTE_POLICY_VERSION,ROUTE_OPERATING_POLICY_VERSION} from './policy';

const point=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
export const publicationSchema=z.strictObject({stops:z.array(z.strictObject({
  id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),name:z.string().trim().min(1).max(120),point,matched_point:point,
  safe_stopping_place:z.literal(true),legal_stopping:z.literal(true),correct_side:z.literal(true),correct_direction:z.literal(true),
  helmet_space:z.literal(true).optional(),
})).min(2).max(20)});
export type PassengerPublication=z.infer<typeof publicationSchema>;
export function assertPassengerPreviewEnabled(){
  // Ticket 18 must separately authorize activation. No environment approval flag.
  if(process.env.NODE_ENV!=='test')throw new AppError(503,'Passenger route previews are not available','ROUTE_QUOTES_DISABLED');
}
export async function previewStoppingPlaces(route:VerifiedRoute,points:Point[]){
  await verifyServiceArea(route);
  const previews=points.map(requested=>{
    const matched=matchPosition(route,requested);
    if(!serviceAreaPoint(requested)||!serviceAreaPoint(matched.point))
      throw new AppError(422,'Stopping place outside service area','BOUNDARY_INVALID');
    return {requested,matched:matched.point,route_meters:matched.along};
  });
  await verifySavedStopPositions(route,previews.map(p=>({requested:p.requested,matched:p.matched,along:p.route_meters})));
  return previews;
}
export async function confirmedPublication(route:VerifiedRoute,publication:PassengerPublication){
  await verifyServiceArea(route);
  const parsed=publicationSchema.parse(publication);
  if(new Set(parsed.stops.map(s=>s.id)).size!==parsed.stops.length||
    new Set(parsed.stops.map(s=>JSON.stringify(s.point))).size!==parsed.stops.length)
    throw new AppError(422,'Distinct stopping places required','STOP_UNSAFE');
  const stops=parsed.stops.map(stop=>{
    const matched=matchPosition(route,stop.point);
    if(JSON.stringify(stop.matched_point)!==JSON.stringify(matched.point))
      throw new AppError(422,'Confirm the actual matched stopping place','STOP_CONFIRMATION_REQUIRED');
    if(!serviceAreaPoint(stop.point)||!serviceAreaPoint(matched.point))
      throw new AppError(422,'Stopping place outside service area','BOUNDARY_INVALID');
    if(route.mode!=='car'&&stop.helmet_space!==true)
      throw new AppError(422,'Helmet space must be confirmed','STOP_UNSAFE');
    return {...stop,matched_point:matched.point,route_meters:matched.along};
  });
  return {stops,confirmation_kind:'driver_self_declaration' as const};
}
export function savedRoute(row:PassengerRoute):VerifiedRoute{
  return {source:row.routing_source,mode:row.routing_mode,geometry:row.geometry,
    cumulativeMeters:row.cumulative_meters,distanceMeters:row.distance_meters,
    durationSeconds:row.duration_seconds,verification:row.route_verification};
}
function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function verifiedPublication(row:PassengerRoute){
  if(row.policy_version!==ROUTE_POLICY_VERSION||row.operating_policy_version!==ROUTE_OPERATING_POLICY_VERSION)
    throw new AppError(409,'Route policy changed','ROUTE_POLICY_STALE');
  if(!row.evidence_matches||row.routing_source!=='valhalla'||!row.route_verification)
    throw new AppError(503,'Saved route evidence unavailable','SEGMENT_UNVERIFIABLE');
  const route=savedRoute(row),boundary=await verifyServiceArea(route);
  if(canonical(boundary)!==canonical(row.route_verification.boundary))
    throw new AppError(409,'Service area evidence changed','ROUTE_AREA_STALE');
  const publication=row.route_verification.passengerPublication;
  if(!publication)throw new AppError(404,'Posted route not found','ROUTE_NOT_FOUND');
  // Revalidate persisted declarations and matches; no client safety assertions are accepted in quotes.
  const current=await confirmedPublication(route,{stops:publication.stops.map(s=>({
    id:s.id,name:s.name,point:s.point,matched_point:s.matched_point,safe_stopping_place:s.safe_stopping_place,legal_stopping:s.legal_stopping,
    correct_side:s.correct_side,correct_direction:s.correct_direction,...(s.helmet_space?{helmet_space:s.helmet_space}:{})}))});
  if(canonical(current)!==canonical(publication))throw new AppError(503,'Stopping-place evidence changed','SEGMENT_UNVERIFIABLE');
  return publication;
}
export function passengerView(row:PassengerRoute,publication:Awaited<ReturnType<typeof confirmedPublication>>){
  return {id:row.id,route_version:row.route_version,policy_version:row.policy_version,
    operating_policy_version:row.operating_policy_version,visibility:'published',geometry:row.geometry,
    departure_at:row.departure_at,request_cutoff_at:row.request_cutoff_at,vehicle_category:row.routing_mode,
    stops:publication.stops,stop_confirmation_kind:publication.confirmation_kind,service_area:SERVICE_AREA,
    distance_meters:row.distance_meters,rate_paise_per_km:row.routing_mode==='car'?700:500,
    currency:'INR',additional_charges_paise:0,real_bookings_enabled:false};
}
export async function passengerQuote(row:PassengerRoute,version:number,pickup:Point,dropoff:Point){
  if(row.route_version!==version)throw new AppError(409,'Route version changed','ROUTE_VERSION_STALE');
  const publication=await verifiedPublication(row),route=savedRoute(row);
  for(const p of [pickup,dropoff])if(!serviceAreaPoint(p))
    throw new AppError(422,'Point outside service area','BOUNDARY_INVALID');
  // Match first so the user gets an actionable off-route/order error, even for an unconfirmed place.
  const start=matchPosition(route,pickup),end=matchPosition(route,dropoff);
  if(!serviceAreaPoint(start.point)||!serviceAreaPoint(end.point))
    throw new AppError(422,'Matched point outside service area','BOUNDARY_INVALID');
  if(end.along<=start.along)throw new AppError(422,'Points are not forward ordered','SEGMENT_REVERSED');
  const check=async(p:Point):Promise<StopEvidence>=>{
    const stop=publication.stops.find(s=>JSON.stringify(s.point)===JSON.stringify(p));
    if(!stop)throw new AppError(422,'Choose a stopping place confirmed by the driver','STOP_CONFIRMATION_REQUIRED');
    return {placeId:stop.id,driverConfirmed:true,legal:stop.legal_stopping,correctSide:stop.correct_side,
      correctDirection:stop.correct_direction,helmetSpace:stop.helmet_space===true};
  };
  const result=await quoteSegment(route,{pickup,dropoff},check);
  await verifySavedStopPositions(route,[{requested:pickup,matched:start.point,along:start.along},
    {requested:dropoff,matched:end.point,along:end.along}]);
  return {route_id:row.id,route_version:row.route_version,policy_version:row.policy_version,
    distance_source:'saved_posted_route',...result,pickup,dropoff,
    pickup_matched_point:start.point,dropoff_matched_point:end.point,
    service_area:SERVICE_AREA,stop_confirmation_kind:publication.confirmation_kind,
    expires_at:row.request_cutoff_at,expires_on_route_change:true,preview_only:true,real_bookings_enabled:false};
}
