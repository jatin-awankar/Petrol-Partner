import { AppError } from '../../shared/errors/app-error';
export type Point=[number,number];
export type VerifiedRoute={source:string;mode:'bike'|'scooter'|'car';geometry:{type:'LineString';coordinates:Point[]};distanceMeters:number;durationSeconds:number};
export type RoutingAdapter={verify(input:{origin:Point;destination:Point;mode:'bike'|'scooter'|'car'}):Promise<VerifiedRoute>};
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
  const validPoint=(p:unknown):p is Point=>Array.isArray(p)&&p.length===2&&p.every((n)=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
  const points=route?.geometry?.coordinates;
  if(route?.source!=='synthetic-test'||route.mode!==input.mode||route.geometry?.type!=='LineString'||
    !Array.isArray(points)||points.length<2||points.length>5000||!points.every(validPoint)||
    JSON.stringify(points[0])!==JSON.stringify(input.origin)||JSON.stringify(points.at(-1))!==JSON.stringify(input.destination)||
    !Number.isSafeInteger(route.distanceMeters)||route.distanceMeters<1||route.distanceMeters>50000||
    !Number.isSafeInteger(route.durationSeconds)||route.durationSeconds<1||route.durationSeconds>5400)
    throw new AppError(422,'Route verification failed','ROUTE_INVALID');
  return route;
}
