import {pointMetres,singleEndpointPass} from './endpoint-position';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {AppError} from '../../shared/errors/app-error';
import {buildValhallaDistanceProgression} from './valhalla-distance';
import type {Point,RoutingAdapter,VerifiedRoute} from './routing';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema=z.strictObject({engineVersion:z.string().min(1).max(100),imageDigest:hash,
  osmExtractDate:z.iso.date(),osmExtractSha256:hash,graphBuildId:z.string().min(1).max(200),
  graphSha256:hash,configSha256:hash});
export type ValhallaManifest=z.infer<typeof manifestSchema>;
export const NORMALIZATION_VERSION='valhalla-edge-metres-2026-10-03.1';
export function manifestDigest(manifest:ValhallaManifest){
  return createHash('sha256').update(JSON.stringify(manifestSchema.parse(manifest))).digest('hex');
}
const invalid=()=>new AppError(422,'Valhalla route cannot be verified','ROUTE_INVALID');
const unavailable=()=>new AppError(503,'Routing provider unavailable','ROUTING_UNAVAILABLE');
const edgeSchema=z.object({begin_shape_index:z.number().int().nonnegative(),end_shape_index:z.number().int().positive(),
  length:z.number().positive(),way_id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),drive_on_right:z.boolean(),
  end_node:z.object({elapsed_time:z.number().nonnegative().max(5400)}).optional()});
const noWarnings=z.array(z.unknown()).max(0).optional();
const routeSchema=z.object({warnings:noWarnings,trip:z.object({warnings:noWarnings,status:z.literal(0),units:z.literal('kilometers'),
  locations:z.array(z.object({side_of_street:z.enum(['left','right']).optional()})).length(2),
  legs:z.array(z.object({shape:z.string(),summary:z.object({length:z.number().positive(),time:z.number().positive().max(5400)})})).length(1)})});
const traceSchema=z.object({warnings:noWarnings,shape:z.string(),edges:z.array(edgeSchema).min(1).max(4999)});
const locateSchema=z.array(z.object({warnings:noWarnings,edges:z.array(z.object({way_id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  correlated_lon:z.number().min(-180).max(180),correlated_lat:z.number().min(-90).max(90)})).min(1).max(100)})).length(2);
let activeJobs=0;

// The build header comes from the operator-controlled immutable gateway.
function connection(){
  try{
    const manifest=manifestSchema.parse(JSON.parse(process.env.VALHALLA_BUILD_MANIFEST??''));
    const base=new URL(process.env.VALHALLA_URL??'');
    if(base.username||base.password||base.search||base.hash||
      !(base.protocol==='https:'||(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname))))throw unavailable();
    return {base,manifest,digest:manifestDigest(manifest)};
  }catch{throw unavailable();}
}
type Post=(path:string,payload:unknown)=>Promise<unknown>;
async function routingJob<T>(config:ReturnType<typeof connection>,oversized:()=>AppError,work:(post:Post)=>Promise<T>){
  if(activeJobs>=2)throw unavailable();
  activeJobs++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const post:Post=async(path,payload)=>{
      const response=await fetch(new URL(path,config.base.href.endsWith('/')?config.base.href:`${config.base.href}/`),{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
        signal:controller.signal,redirect:'error'});
      if(!response.ok||response.headers.get('x-petrol-routing-build')!==config.digest||!response.body)throw unavailable();
      const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
      try{while(true){const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;if(size>2_000_000)throw oversized();chunks.push(value);}}
      finally{await reader.cancel();}
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    };
    return await work(post);
  }finally{clearTimeout(timer);activeJobs--;}
}
export function configuredValhalla():RoutingAdapter{
  const config=connection(),{manifest,digest}=config;
  return {async verify(input){
    try{return await routingJob(config,invalid,async post=>{
      const costing=input.mode==='car'?'auto':'motorcycle';
      const options={costing,costing_options:{[costing]:{}},units:'kilometers'};
      const locations=[input.origin,input.destination].map(([lon,lat])=>({lon,lat,type:'break',
        radius:30,search_cutoff:30,preferred_side:'same',street_side_tolerance:0,
        node_snap_tolerance:0,street_side_max_distance:30}));
      const routed=routeSchema.parse(await post('route',{...options,locations,alternates:0}));
      const leg=routed.trip.legs[0];
      const trace=traceSchema.parse(await post('trace_attributes',{...options,encoded_polyline:leg.shape,
        shape_match:'edge_walk',filters:{action:'include',attributes:['shape','edge.length','edge.begin_shape_index',
          'edge.end_shape_index','edge.way_id','edge.drive_on_right','node.elapsed_time']}}));
      const normalized=buildValhallaDistanceProgression({routeShape:leg.shape,routeLengthKm:leg.summary.length,trace});
      const located=locateSchema.parse(await post('locate',{...options,locations,verbose:false}));
      const endpoints=[normalized.geometry.coordinates[0],normalized.geometry.coordinates.at(-1)!];
      const endEdges=[trace.edges[0],trace.edges.at(-1)!];
      [input.origin,input.destination].forEach((requested,i)=>{
        if(pointMetres(requested,endpoints[i])>30)throw invalid();
        // Opposite directions on the same physical way/projected point are one
        // candidate. Different ways or projections (crossings, carriageways,
        // repeated passes) remain ambiguous, even if Valhalla preferred one.
        const candidates=new Set(located[i].edges.map(e=>JSON.stringify([e.way_id,
          Number(e.correlated_lon.toFixed(6)),Number(e.correlated_lat.toFixed(6))])));
        if(candidates.size!==1||located[i].edges.some(e=>e.way_id!==endEdges[i].way_id||
          pointMetres([e.correlated_lon,e.correlated_lat],endpoints[i])>0.2))throw invalid();
        const side=routed.trip.locations[i].side_of_street;
        if(side&&(side==='right')!==endEdges[i].drive_on_right)throw invalid();
        if(pointMetres(requested,endpoints[i])>0.2&&!side)throw invalid();
      });
      const result:VerifiedRoute={source:'valhalla',mode:input.mode,...normalized,durationSeconds:Math.ceil(leg.summary.time),
        verification:{manifest,manifestDigest:digest,costing,costingOptions:options.costing_options,
          normalizationVersion:NORMALIZATION_VERSION,edges:trace.edges,requested:{origin:input.origin,destination:input.destination},
          routed:{origin:endpoints[0],destination:endpoints[1]}}};
      if(!singleEndpointPass(normalized.geometry.coordinates,endpoints[0],false)||
        !singleEndpointPass(normalized.geometry.coordinates,input.origin,false)||
        !singleEndpointPass(normalized.geometry.coordinates,endpoints[1],true)||
        !singleEndpointPass(normalized.geometry.coordinates,input.destination,true))throw invalid();
      return result;
    });}catch(error){if(error instanceof AppError)throw error;
      if(error instanceof z.ZodError||error instanceof SyntaxError||
        (error instanceof Error&&error.message==='Valhalla route distance cannot be verified'))throw invalid();
      throw unavailable();
    }
  }};
}

// Verify road identity at confirmed stops without requesting a new route or distance.
// Safety, side, direction and helmet space remain explicit driver declarations.
export async function verifySavedStopPositions(route:VerifiedRoute,stops:{requested:Point;matched:Point;along:number}[]){
  const verification=route.verification;
  const config=connection();
  try{
    if(!verification||config.digest!==verification.manifestDigest||
      manifestDigest(verification.manifest)!==verification.manifestDigest||
      verification.costing!==(route.mode==='car'?'auto':'motorcycle')||
      verification.normalizationVersion!==NORMALIZATION_VERSION)throw unavailable();
    await routingJob(config,unavailable,async post=>{
    const located=locateSchema.element.array().length(stops.length).parse(await post('locate',{
      costing:verification.costing,costing_options:verification.costingOptions,
      locations:stops.map(s=>({lon:s.requested[0],lat:s.requested[1],radius:30,search_cutoff:30})),verbose:false}));
    const edges=z.array(edgeSchema).parse(verification.edges);
    for(let i=0;i<stops.length;i++){
      const stop=stops[i],candidates=located[i].edges;
      const ways=new Set(edges.filter(e=>stop.along>=route.cumulativeMeters[e.begin_shape_index]&&
        stop.along<=route.cumulativeMeters[e.end_shape_index]).map(e=>e.way_id));
      const matches=new Set(candidates.map(e=>JSON.stringify([e.way_id,
        Number(e.correlated_lon.toFixed(6)),Number(e.correlated_lat.toFixed(6))])));
      if(matches.size!==1||candidates.some(e=>!ways.has(e.way_id)||
        pointMetres([e.correlated_lon,e.correlated_lat],stop.matched)>0.2))
        throw new AppError(422,'Stopping place has ambiguous road position','POINT_AMBIGUOUS');
    }
    });
  }catch(error){if(error instanceof AppError)throw error;throw unavailable();}
}
