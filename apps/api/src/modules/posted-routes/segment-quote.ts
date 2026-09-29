import {AppError} from '../../shared/errors/app-error';
import {isVerifiedRouteShape,type Point,type VerifiedRoute} from './routing';

export const MATCH_TOLERANCE_METERS=30;
export const MIN_SEGMENT_METERS=500;
export const ROUNDING_RULE='nearest_paise_half_up';

export type StopEvidence={placeId:string;driverConfirmed:boolean;legal:boolean;correctSide:boolean;
  correctDirection:boolean;helmetSpace:boolean};
type StopCheck=(point:Point,kind:'pickup'|'dropoff',mode:VerifiedRoute['mode'])=>Promise<StopEvidence>;
let stopCheck:StopCheck|null=null;
// Until a production stopping-place source is approved, only controlled tests can certify stops.
export function setStopCheckForTests(check:StopCheck|null){
  if(process.env.NODE_ENV!=='test')throw new Error('Synthetic stop checks are test only');
  stopCheck=check;
}

function metres(a:Point,b:Point){
  const rad=Math.PI/180,lat=(a[1]+b[1])*rad/2;
  return Math.hypot((a[0]-b[0])*rad*6371000*Math.cos(lat),(a[1]-b[1])*rad*6371000);
}
function position(route:VerifiedRoute,point:Point){
  const candidates:{distance:number;along:number}[]=[];
  const coordinates=route.geometry.coordinates;
  for(let i=0;i<coordinates.length-1;i++){
    const a=coordinates[i],b=coordinates[i+1],lat=point[1]*Math.PI/180;
    const scaleX=6371000*Math.PI/180*Math.cos(lat),scaleY=6371000*Math.PI/180;
    const x=(point[0]-a[0])*scaleX,y=(point[1]-a[1])*scaleY;
    const dx=(b[0]-a[0])*scaleX,dy=(b[1]-a[1])*scaleY;
    const fraction=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy)));
    if(!Number.isFinite(fraction))throw new AppError(422,'Segment cannot be verified','SEGMENT_UNVERIFIABLE');
    const snapped:Point=[a[0]+fraction*(b[0]-a[0]),a[1]+fraction*(b[1]-a[1])];
    const distance=metres(point,snapped);
    if(distance<=MATCH_TOLERANCE_METERS)
      candidates.push({distance,along:route.cumulativeMeters[i]+fraction*(route.cumulativeMeters[i+1]-route.cumulativeMeters[i])});
  }
  if(!candidates.length)throw new AppError(422,'Point is off the posted route','POINT_OFF_ROUTE');
  candidates.sort((a,b)=>a.distance-b.distance);
  // Adjacent edges share a vertex. Distinct passes near the same place cannot be selected safely.
  if(candidates.some(c=>Math.abs(c.along-candidates[0].along)>1))
    throw new AppError(422,'Point matches multiple route positions','POINT_AMBIGUOUS');
  return candidates[0].along;
}

export async function quoteSegment(route:VerifiedRoute,input:{pickup:Point;dropoff:Point}){
  if(!isVerifiedRouteShape(route))
    throw new AppError(422,'Saved route cannot be verified','SEGMENT_UNVERIFIABLE');
  if(!stopCheck)throw new AppError(503,'Stopping-place verification unavailable','STOP_VERIFICATION_UNAVAILABLE');
  let pickupStop:StopEvidence,dropoffStop:StopEvidence;
  try{[pickupStop,dropoffStop]=await Promise.all([
    stopCheck(input.pickup,'pickup',route.mode),stopCheck(input.dropoff,'dropoff',route.mode)]);
  }catch{throw new AppError(503,'Stopping-place verification unavailable','STOP_VERIFICATION_UNAVAILABLE');}
  const safe=(stop:StopEvidence)=>Boolean(stop&&typeof stop.placeId==='string'&&stop.placeId.length>0&&
    stop.driverConfirmed===true&&stop.legal===true&&stop.correctSide===true&&stop.correctDirection===true&&
    (route.mode==='car'||stop.helmetSpace===true));
  if(!safe(pickupStop!)||!safe(dropoffStop!)||pickupStop!.placeId===dropoffStop!.placeId)
    throw new AppError(422,'Unsafe stopping place','STOP_UNSAFE');
  const pickupMeters=position(route,input.pickup),dropoffMeters=position(route,input.dropoff);
  if(dropoffMeters<=pickupMeters)throw new AppError(422,'Points are not forward ordered','SEGMENT_REVERSED');
  const exactSegmentMeters=dropoffMeters-pickupMeters;
  if(exactSegmentMeters<MIN_SEGMENT_METERS)throw new AppError(422,'Segment is too short','SEGMENT_TOO_SHORT');
  const segmentMeters=Math.round(exactSegmentMeters);
  const ratePaisePerKm=route.mode==='car'?700:500;
  return {segment_meters:segmentMeters,pickup_stop_id:pickupStop!.placeId,dropoff_stop_id:dropoffStop!.placeId,
    pickup_route_meters:Math.round(pickupMeters),
    dropoff_route_meters:Math.round(dropoffMeters),vehicle_category:route.mode,
    rate_paise_per_km:ratePaisePerKm,rounding_rule:ROUNDING_RULE,currency:'INR' as const,
    total_paise:Math.floor((segmentMeters*ratePaisePerKm+500)/1000),additional_charges_paise:0};
}
