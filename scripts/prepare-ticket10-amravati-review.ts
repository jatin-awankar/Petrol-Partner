// Local review evidence only. Does not write operator-review.json or contact a remote service.
import {readFileSync,writeFileSync} from 'node:fs';
import {configuredValhalla,manifestDigest} from '../apps/api/src/modules/posted-routes/valhalla';
import {evaluateServiceArea,SERVICE_AREA,serviceAreaPoint} from '../apps/api/src/modules/posted-routes/service-area';
import {decodePolyline6} from '../apps/api/src/modules/posted-routes/valhalla-distance';
import {pointMetres} from '../apps/api/src/modules/posted-routes/endpoint-position';
import type {Point} from '../apps/api/src/modules/posted-routes/routing';
async function main(){
if(JSON.parse(readFileSync('apps/api/src/modules/posted-routes/service-area/operator-review.json','utf8')).status!=='pending')throw Error('Preserve the recorded operator review; create a separately versioned review bundle for changes.');
const base='http://127.0.0.1:18002/';
const manifest=JSON.parse(readFileSync('docs/operations/evidence/ticket10-local-valhalla-manifest-2026-10-03.json','utf8'));
const nativeFetch=globalThis.fetch,status=await (await nativeFetch(base+'status')).json();
if(status.version!==manifest.engineVersion)throw Error('Engine version mismatch');
process.env.VALHALLA_URL=base;process.env.VALHALLA_BUILD_MANIFEST=JSON.stringify(manifest);
// Local rehearsal attestation, not the production gateway.
globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.origin!==new URL(base).origin)throw Error('Loopback only');
  const response=await nativeFetch(input,init),headers=new Headers(response.headers);
  headers.set('x-petrol-routing-build',manifestDigest(manifest));
  return new Response(response.body,{status:response.status,headers});
};
const seeds:{id:string;label:string;seed:Point}[]=[
  {id:'M1',label:'Central candidate',seed:[77.78,20.93]},
  {id:'M2',label:'South-west candidate',seed:[77.755,20.91]},
  {id:'M3',label:'South-east candidate',seed:[77.805,20.91]},
  {id:'M4',label:'North-west candidate',seed:[77.755,20.95]},
  {id:'M5',label:'North-east candidate',seed:[77.805,20.95]},
];
async function candidates(seed:Point){
  const result=await (await nativeFetch(base+'locate',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({locations:[{lon:seed[0],lat:seed[1],radius:500,search_cutoff:500}],costing:'auto',verbose:false})})).json();
  const seen=new Set<string>();
  return (result[0]?.edges??[]).map((edge:any)=>({point:[edge.correlated_lon,edge.correlated_lat] as Point,wayId:edge.way_id}))
    .filter((v:any)=>{const key=JSON.stringify(v.point);if(seen.has(key))return false;seen.add(key);return true;})
    .sort((a:any,b:any)=>pointMetres(seed,a.point)-pointMetres(seed,b.point)).slice(0,30).flatMap((p:any)=>[[0,0],[0.00005,0],[-0.00005,0],[0,0.00005],[0,-0.00005]].map(([dx,dy])=>({...p,point:[Number((p.point[0]+dx).toFixed(6)),Number((p.point[1]+dy).toFixed(6))] as Point})));
}
const points:any[]=[],routes:any[]=[],failures:any[]=[];
// Candidate map selections are derived from correlated road points with small
// trial side offsets, then accepted only by the unchanged application adapter.
// They are not verified stopping places.
for(const seed of seeds){
 const list=await candidates(seed.seed);let chosen=null;
 for(const candidate of list){
  if(!serviceAreaPoint(candidate.point,true))continue;
  const origin:Point=points.length?points[0].requested:[77.749113,20.901176];
  try{const route=await configuredValhalla().verify({origin,destination:candidate.point,mode:'car'});
   evaluateServiceArea(route);chosen={...seed,requested:candidate.point,wayId:candidate.wayId,routed:route.verification!.routed.destination,
    approval:'pending',localName:'Operator to identify and confirm a lawful stopping place',basis:'Pinned OSM graph only; no field/local safety attestation'};
   routes.push({id:'P'+seed.id,from:points.length?'M1':'reference-road-point',to:seed.id,route});break;
  }catch(error){failures.push({id:seed.id,point:candidate.point,error:(error as Error).message});}
 }
 if(!chosen){console.log(failures);throw Error('No valid preview candidate for '+seed.id);}points.push(chosen);
}
for(const mode of ['car','bike','scooter'] as const){
 const route=await configuredValhalla().verify({origin:points[0].requested,destination:points[4].requested,mode});
 evaluateServiceArea(route);routes.push({id:'R-'+mode,from:'M1',to:'M5',route});
}
const edges:any[]=[];
for(const [id,inside,outside] of [
 ['west',[77.7305,20.93],[77.728,20.93]],['east',[77.8295,20.91],[77.832,20.91]],
 ['south',[77.746,20.8905],[77.746,20.888]],['north',[77.78,20.9695],[77.78,20.972]],
] as [string,Point,Point][]){
 const inner=(await candidates(inside)).filter((p:any)=>serviceAreaPoint(p.point,true));
 const outer=(await candidates(outside)).filter((p:any)=>!serviceAreaPoint(p.point,true));
 let found=null;
 for(const a of inner){for(const b of outer){try{
  const response=await (await nativeFetch(base+'route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locations:[a.point,b.point].map(([lon,lat]:Point)=>({lon,lat})),costing:'auto',units:'kilometers'})})).json();
  const leg=response.trip.legs[0],coordinates=decodePolyline6(leg.shape);
  if(coordinates.every(p=>serviceAreaPoint(p,true)))continue;
  found={id,inside:a,outside:b,route:{source:'local-valhalla-raw-edge-example',mode:'car',geometry:{type:'LineString',coordinates},distanceMeters:Math.round(leg.summary.length*1000),durationSeconds:Math.ceil(leg.summary.time)},result:'outside-service-area',review:'pending',limitation:'Illustrative rejected route from actual engine. Not a successful application adapter preview; endpoint ambiguity/side checks are not attested for these deliberately ineligible examples.'};break;
 }catch{}}if(found)break;}
 if(!found)throw Error('No concrete edge route for '+id+' inner='+inner.length+' outer='+outer.length);edges.push(found);
}
const result={schemaVersion:1,preparedAt:new Date().toISOString(),status:'operator-review-pending',area:SERVICE_AREA,
 attestation:'Actual local pinned-engine responses; build header supplied only by local harness. No operator safety/coverage attestation.',
 attribution:'Road data © OpenStreetMap contributors, ODbL 1.0; https://www.openstreetmap.org/copyright . Original business rectangle is independent of road data.',
 manifest,points,routes,edges,rejectedCandidates:failures};
writeFileSync('apps/api/src/modules/posted-routes/service-area/review-evidence.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({points:points.map(p=>({id:p.id,requested:p.requested})),routes:routes.map(r=>({id:r.id,metres:r.route.distanceMeters,seconds:r.route.durationSeconds})),edges:edges.map(e=>({id:e.id,inside:e.inside,outside:e.outside}))},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
