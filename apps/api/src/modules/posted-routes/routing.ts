import { AppError } from '../../shared/errors/app-error';
export type Point=[number,number];
export type VerifiedRoute={source:string;mode:'bike'|'scooter'|'car';geometry:{type:'LineString';coordinates:Point[]};cumulativeMeters:number[];distanceMeters:number;durationSeconds:number};
export type RoutingAdapter={verify(input:{origin:Point;destination:Point;mode:'bike'|'scooter'|'car'}):Promise<VerifiedRoute>};
const validPoint=(p:unknown):p is Point=>Array.isArray(p)&&p.length===2&&p.every((n)=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
export function isVerifiedRouteShape(value:unknown):value is VerifiedRoute{
  if(!value||typeof value!=='object')return false;
  const route=value as Partial<VerifiedRoute>;
  const points=route.geometry?.coordinates,metres=route.cumulativeMeters;
  return typeof route.source==='string'&&['bike','scooter','car'].includes(route.mode??'')&&
    route.geometry?.type==='LineString'&&Array.isArray(points)&&points.length>=2&&points.length<=5000&&points.every(validPoint)&&
    Array.isArray(metres)&&metres.length===points.length&&metres[0]===0&&
    metres.every((m,i)=>Number.isSafeInteger(m)&&m>=0&&(i===0||m>metres[i-1]))&&
    metres.at(-1)===route.distanceMeters&&typeof route.distanceMeters==='number'&&Number.isSafeInteger(route.distanceMeters)&&
    route.distanceMeters>=1&&route.distanceMeters<=50000&&
    typeof route.durationSeconds==='number'&&Number.isSafeInteger(route.durationSeconds)&&
    route.durationSeconds>=1&&route.durationSeconds<=5400;
}
let adapter:RoutingAdapter|null=null;
// Test-only seam. Production has no selected provider and fails closed.
export function setRoutingAdapterForTests(value:RoutingAdapter|null){
  if(process.env.NODE_ENV!=='test')throw new Error('Synthetic routing is test only');
  adapter=value;
}
export async function verifyRoute(input:{origin:Point;destination:Point;mode:'bike'|'scooter'|'car'}){
  if(!adapter)throw new AppError(503,'Routing provider unavailable','ROUTING_UNAVAILABLE');
  let route:VerifiedRoute;
  try{route=await adapter.verify(input);}catch{throw new AppError(503,'Routing provider unavailable','ROUTING_UNAVAILABLE');}
  if(!isVerifiedRouteShape(route)||route.source!=='synthetic-test'||route.mode!==input.mode||
    JSON.stringify(input.origin)===JSON.stringify(input.destination)||
    JSON.stringify(route.geometry.coordinates[0])!==JSON.stringify(input.origin)||
    JSON.stringify(route.geometry.coordinates.at(-1))!==JSON.stringify(input.destination))
    throw new AppError(422,'Route verification failed','ROUTE_INVALID');
  return route;
}
