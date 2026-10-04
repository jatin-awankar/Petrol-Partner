import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {AppError} from '../../shared/errors/app-error';
import {isVerifiedRouteShape,type Point,type VerifiedRoute} from './routing';

export const SERVICE_AREA={id:'amravati-core-v1',kind:'original-business-service-area',
  geometrySha256:'b342438fbb8aecf2e3f5cf82cf1ddfa2ea7d6ae02343e3319a41220b1d4eb42c',
  crs:'OGC:CRS84',encoding:'polyline6',policyVersion:'2026-10-04.1',
  calculationVersion:'amravati-convex-microdegree-envelope-2026-10-04.1',
  authorship:'Original numerical business limits approved for implementation by Jatin Awankar on 2026-10-04; no third-party boundary geometry.',
  assurance:'Saved coordinate containment only; no administrative, ground-location or road-safety determination.'} as const;
const unavailable=()=>new AppError(503,'Reviewed service area unavailable','BOUNDARY_UNAVAILABLE');
const invalid=()=>new AppError(422,'Route outside service area or coordinate precision limits','BOUNDARY_INVALID');
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const directory=join(__dirname,'service-area');
export function loadServiceArea(){
  try{
    const bytes=readFileSync(join(directory,'amravati-core-v1.json'));
    if(sha(bytes)!==SERVICE_AREA.geometrySha256)throw unavailable();
    // The exact pin defines a single convex rectangular shell, no holes or islands.
    return SERVICE_AREA;
  }catch{throw unavailable();}
}
// Decimal arithmetic on the canonical JSON-number spelling. Never multiply a
// binary floating point coordinate then floor/ceil it at an eligibility edge.
export function coordinateEnvelope(value:number,encoded=false):[bigint,bigint]{
  if(!Number.isFinite(value)||Math.abs(value)>180)throw invalid();
  const match=/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value));
  if(!match)throw invalid();
  const fractional=match[3]??'',power=6+Number(match[4]??0)-fractional.length;
  let numerator=BigInt(match[2]+fractional)*(match[1]?-BigInt(1):BigInt(1));
  let denominator=BigInt(1);
  if(power>=0)numerator*=BigInt(10)**BigInt(power);else denominator=BigInt(10)**BigInt(-power);
  if(encoded&&numerator%denominator!==BigInt(0))throw invalid();
  const quotient=numerator/denominator,remainder=numerator%denominator;
  const floor=quotient-(remainder<BigInt(0)?BigInt(1):BigInt(0)),ceil=quotient+(remainder>BigInt(0)?BigInt(1):BigInt(0));
  return [floor-BigInt(1),ceil+BigInt(1)];
}
export function serviceAreaPoint(point:Point,encoded=false){
  if(!Array.isArray(point)||point.length!==2)throw invalid();
  const [west,east]=coordinateEnvelope(point[0],encoded),[south,north]=coordinateEnvelope(point[1],encoded);
  return west>BigInt(77730000)&&east<BigInt(77830000)&&south>BigInt(20890000)&&north<BigInt(20970000);
}
export function evaluateServiceArea(route:VerifiedRoute){
  const area=loadServiceArea();
  if(!isVerifiedRouteShape(route)||route.source!=='valhalla'||!route.verification||
    route.verification.normalizationVersion!=='valhalla-edge-metres-2026-10-03.1')throw invalid();
  const {requested,routed}=route.verification,points=route.geometry.coordinates;
  if(![requested.origin,requested.destination].every(p=>serviceAreaPoint(p))||
    ![routed.origin,routed.destination,...points].every(p=>serviceAreaPoint(p,true))||
    JSON.stringify(routed.origin)!==JSON.stringify(points[0])||
    JSON.stringify(routed.destination)!==JSON.stringify(points.at(-1)))throw invalid();
  // Convexity is guaranteed by the immutable rectangle pin: every segment and
  // its linearly interpolated precision envelope is inside if its vertices are.
  try{
    const edges=z.array(z.object({begin_shape_index:z.number().int().nonnegative(),
      end_shape_index:z.number().int().positive(),end_node:z.object({elapsed_time:z.number().positive().max(5400)})}))
      .min(1).max(4999).parse(route.verification.edges);
    let index=0,seconds=0;
    for(const edge of edges){
      if(edge.begin_shape_index!==index||edge.end_shape_index<=index||edge.end_shape_index>=points.length||edge.end_node.elapsed_time<=seconds)throw invalid();
      index=edge.end_shape_index;seconds=edge.end_node.elapsed_time;
    }
    if(index!==points.length-1||Math.ceil(seconds)!==route.durationSeconds)throw invalid();
  }catch{throw invalid();}
  return {artifactSha256:area.geometrySha256,policyVersion:area.policyVersion,artifact:area,
    calculationVersion:area.calculationVersion,outsideMetres:0,outsideSeconds:0,
    outsideShapeSegments:[],crossingCount:0};
}
const approvalSchema=z.strictObject({status:z.literal('approved'),approver:z.literal('Jatin Awankar'),
  reviewedAt:z.iso.datetime(),areaId:z.literal(SERVICE_AREA.id),geometrySha256:z.literal(SERVICE_AREA.geometrySha256),
  calculationVersion:z.literal(SERVICE_AREA.calculationVersion),evidenceSha256:z.string().regex(/^[a-f0-9]{64}$/),
  modes:z.tuple([z.literal('car'),z.literal('bike'),z.literal('scooter')]),
  coverageAndMeetingPlacesReviewed:z.literal(true),completeRoutesReviewed:z.literal(true),
  authorshipAndLimitationsAcknowledged:z.literal(true),reviewNotes:z.string().min(1).max(20000)});
let testApproval:unknown=null;
export function setServiceAreaApprovalForTests(value:unknown){
  if(process.env.NODE_ENV!=='test')throw new Error('Synthetic approval is test only');
  testApproval=structuredClone(value);
}
export function serviceAreaReviewEvidenceHash(){return sha(readFileSync(join(directory,'review-evidence.json')));}
export async function verifyServiceArea(route:VerifiedRoute){
  let approval:z.infer<typeof approvalSchema>;
  try{
    loadServiceArea();
    const raw=process.env.NODE_ENV==='test'&&testApproval!==null?testApproval:JSON.parse(readFileSync(join(directory,'operator-review.json'),'utf8'));
    approval=approvalSchema.parse(raw);
    if(approval.evidenceSha256!==serviceAreaReviewEvidenceHash()||Date.parse(approval.reviewedAt)>Date.now())throw unavailable();
  }catch{throw unavailable();}
  return {...evaluateServiceArea(route),approval,approvalEvidenceKind:
    process.env.NODE_ENV==='test'&&testApproval!==null?'synthetic-test-only':'recorded-operator-review'};
}
