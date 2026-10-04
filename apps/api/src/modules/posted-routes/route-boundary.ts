import {createHash} from 'node:crypto';
import {z} from 'zod';
import {AppError} from '../../shared/errors/app-error';
import {compileBoundary} from './boundary-geometry';
import {isVerifiedRouteShape,type VerifiedRoute} from './routing';

const hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().min(1).max(500);
const point=z.tuple([z.number().min(70).max(85),z.number().min(10).max(25)]);
const artifactSchema=z.strictObject({datasetId:text,edition:text,archiveSha256:hash,geometrySha256:hash,
  sourceCrs:text,normalizedCrs:z.literal('OGC:CRS84'),transformation:text,topologyValidation:text,reuseEvidence:text,
  uncertaintyMetres:z.number().positive().max(1000),policyVersion:z.literal('2026-10-03.2'),
  geometry:z.strictObject({type:z.literal('MultiPolygon'),coordinates:z.array(z.array(z.array(point).min(4).max(100000)).min(1).max(1000)).min(1).max(1000)})});
type BoundaryEvidence={artifactSha256:string;policyVersion:string;outsideMetres:number;outsideSeconds:number};
type BoundaryCheck=(route:VerifiedRoute)=>Promise<BoundaryEvidence>;
let testCheck:BoundaryCheck|null=null,testArtifact:unknown=null;
export function setBoundaryCheckForTests(check:BoundaryCheck|null){
  if(process.env.NODE_ENV!=='test')throw new Error('Synthetic boundary checks are test only');
  testCheck=check;
}
export function setBoundaryArtifactForTests(artifact:unknown){
  if(process.env.NODE_ENV!=='test')throw new Error('Synthetic boundary artifacts are test only');
  testArtifact=structuredClone(artifact);
}
const unavailable=()=>new AppError(503,'Verified Maharashtra boundary unavailable','BOUNDARY_UNAVAILABLE');
const invalid=()=>new AppError(422,'Route outside operating boundary limits','BOUNDARY_INVALID');
function polygonEvidence(route:VerifiedRoute,raw:unknown){
  let artifact:z.infer<typeof artifactSchema>,boundary:ReturnType<typeof compileBoundary>;
  try{
    artifact=artifactSchema.parse(raw);
    if(artifact.geometry.coordinates.flat(2).length>100000||
      createHash('sha256').update(JSON.stringify(artifact.geometry)).digest('hex')!==artifact.geometrySha256)throw unavailable();
    boundary=compileBoundary(artifact.geometry,artifact.uncertaintyMetres);
  }catch{throw unavailable();}
  try{
    if(!isVerifiedRouteShape(route)||!route.verification)throw invalid();
    const coordinates=route.geometry.coordinates;
    if(!coordinates.every(p=>point.safeParse(p).success))throw invalid();
    const requested=route.verification.requested,routed=route.verification.routed;
    boundary.begin();
    for(const endpoint of [requested.origin,requested.destination,routed.origin,routed.destination])
      if(!point.safeParse(endpoint).success||!boundary.endpoint(endpoint))throw invalid();
    if(JSON.stringify(routed.origin)!==JSON.stringify(coordinates[0])||
      JSON.stringify(routed.destination)!==JSON.stringify(coordinates.at(-1)))throw invalid();
    const outsideShapeSegments:number[]=[];
    let outsideMetres=0,crossingCount=0;
    for(let i=1;i<coordinates.length;i++){
      const segment=boundary.outsideSegment(coordinates[i-1],coordinates[i]);
      crossingCount+=segment.crossings;
      if(segment.outside){
        outsideShapeSegments.push(i-1);
        // Charge the entire crossing segment, including its uncertain border
        // portion. Never interpolate travel time by distance or assume speed.
        outsideMetres+=route.cumulativeMeters[i]-route.cumulativeMeters[i-1];
      }
    }
    const timedEdges=z.array(z.object({begin_shape_index:z.number().int().nonnegative(),
      end_shape_index:z.number().int().positive(),end_node:z.object({elapsed_time:z.number().nonnegative().max(5400)})}))
      .min(1).max(4999).parse(route.verification.edges);
    let nextIndex=0,previousSeconds=0,outsideSeconds=0;
    for(const edge of timedEdges){
      const end=edge.end_shape_index,seconds=edge.end_node.elapsed_time;
      if(edge.begin_shape_index!==nextIndex||end<=nextIndex||end>=coordinates.length||seconds<=previousSeconds)throw invalid();
      if(outsideShapeSegments.some(index=>index>=nextIndex&&index<end))
        outsideSeconds+=Math.ceil(seconds-previousSeconds);
      nextIndex=end;previousSeconds=seconds;
    }
    if(nextIndex!==coordinates.length-1||Math.ceil(previousSeconds)!==route.durationSeconds||
      outsideMetres>5000||outsideSeconds>600)throw invalid();
    const {geometry:_,...provenance}=artifact;
    return {artifactSha256:artifact.geometrySha256,policyVersion:artifact.policyVersion,
      artifact:provenance,calculationVersion:'boundary-whole-segment-upper-bounds-2026-10-04.1',
      timingMethod:'whole-provider-edge-upper-bound',outsideMetres,outsideSeconds,outsideShapeSegments,crossingCount};
  }catch{throw invalid();}
}
export async function verifyRouteBoundary(route:VerifiedRoute){
  // No production artifact is installed. Metadata strings or environment flags
  // cannot assert SOI approval. Even retained test fixtures fail in production.
  if(process.env.NODE_ENV!=='test'||(!testArtifact&&!testCheck))throw unavailable();
  if(testArtifact)return polygonEvidence(route,testArtifact);
  const result=await testCheck!(route);
  if(!/^[a-f0-9]{64}$/.test(result.artifactSha256)||result.policyVersion!=='2026-10-03.2'||
    !Number.isFinite(result.outsideMetres)||result.outsideMetres<0||result.outsideMetres>5000||
    !Number.isFinite(result.outsideSeconds)||result.outsideSeconds<0||result.outsideSeconds>600)throw invalid();
  return result;
}
