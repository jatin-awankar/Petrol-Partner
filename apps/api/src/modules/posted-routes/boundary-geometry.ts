import type {Point} from './routing';

export type MultiPolygon={type:'MultiPolygon';coordinates:Point[][][]};
type Segment={a:Point;b:Point;ring:number;index:number;size:number};
const epsilon=1e-12;
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const subtract=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const between=(t:number)=>t>=-epsilon&&t<=1+epsilon;
const same=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];
const invalid=():never=>{throw new Error('Boundary geometry cannot be verified');};
function overlaps(a:Segment,b:Segment,padding=0){
  return Math.max(a.a[0],a.b[0])+padding>=Math.min(b.a[0],b.b[0])&&
    Math.max(b.a[0],b.b[0])+padding>=Math.min(a.a[0],a.b[0])&&
    Math.max(a.a[1],a.b[1])+padding>=Math.min(b.a[1],b.b[1])&&
    Math.max(b.a[1],b.b[1])+padding>=Math.min(a.a[1],a.b[1]);
}
function intersection(a:Segment,b:Segment):{kind:'cross'|'touch'|'overlap';t:number}|null{
  if(!overlaps(a,b,epsilon))return null;
  const r=subtract(a.b,a.a),s=subtract(b.b,b.a),q=subtract(b.a,a.a),denominator=cross(r,s);
  if(Math.abs(denominator)<=epsilon){
    if(Math.abs(cross(q,r))>epsilon)return null;
    const axis=Math.abs(r[0])>=Math.abs(r[1])?0:1;
    const lo=Math.max(0,Math.min((b.a[axis]-a.a[axis])/r[axis],(b.b[axis]-a.a[axis])/r[axis]));
    const hi=Math.min(1,Math.max((b.a[axis]-a.a[axis])/r[axis],(b.b[axis]-a.a[axis])/r[axis]));
    return hi<lo-epsilon?null:{kind:hi-lo>epsilon?'overlap':'touch',t:lo};
  }
  const t=cross(q,s)/denominator,u=cross(q,r)/denominator;
  if(!between(t)||!between(u))return null;
  return {kind:t<=epsilon||t>=1-epsilon||u<=epsilon||u>=1-epsilon?'touch':'cross',t};
}
function inRing(point:Point,ring:Point[],spend:()=>void){
  let inside=false;
  for(let i=1;i<ring.length;i++){
    spend();
    const a=ring[i-1],b=ring[i];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
const inPolygon=(point:Point,polygon:Point[][],spend:()=>void)=>
  inRing(point,polygon[0],spend)&&!polygon.slice(1).some(ring=>inRing(point,ring,spend));
function pointDistance(point:Point,segment:Segment){
  const r=subtract(segment.b,segment.a),q=subtract(point,segment.a);
  const t=Math.max(0,Math.min(1,(q[0]*r[0]+q[1]*r[1])/(r[0]*r[0]+r[1]*r[1])));
  // Conservative clearance in the supported Maharashtra-region coordinate
  // extent (70–85 E, 10–25 N): 100 km/degree is below either local axis scale.
  // This deliberately expands, never shrinks, the supplied uncertainty band.
  return Math.hypot(q[0]-t*r[0],q[1]-t*r[1])*100000;
}
function segmentDistance(a:Segment,b:Segment){
  return Math.min(pointDistance(a.a,b),pointDistance(a.b,b),pointDistance(b.a,a),pointDistance(b.b,a));
}

// Polygon topology is checked once per artifact. Bounded work fails closed on
// pathological inputs; a real artifact must pass this check before adoption.
export function compileBoundary(geometry:MultiPolygon,uncertaintyMetres:number){
  let budget=5_000_000,ringId=0;
  const spend=()=>{if(--budget<0)invalid();};
  const segments:Segment[]=[];
  for(const polygon of geometry.coordinates)for(const ring of polygon){
    if(ring.length<4||!same(ring[0],ring.at(-1)!))invalid();
    let area=0;
    for(let i=1;i<ring.length;i++){
      spend();
      if(same(ring[i-1],ring[i]))invalid();
      area+=cross(subtract(ring[i-1],ring[0]),subtract(ring[i],ring[0]));
      segments.push({a:ring[i-1],b:ring[i],ring:ringId,index:i-1,size:ring.length-1});
    }
    if(Math.abs(area)<=epsilon)invalid();
    ringId++;
  }
  const ordered=[...segments].sort((a,b)=>Math.min(a.a[0],a.b[0])-Math.min(b.a[0],b.b[0]));
  for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
    const a=ordered[i],b=ordered[j];
    if(Math.min(b.a[0],b.b[0])>Math.max(a.a[0],a.b[0])+epsilon)break;
    spend();const hit=intersection(a,b);
    const adjacent=a.ring===b.ring&&(Math.abs(a.index-b.index)===1||Math.abs(a.index-b.index)===a.size-1);
    if(hit&&!(adjacent&&hit.kind==='touch'))invalid();
  }
  const polygons=geometry.coordinates;
  for(const polygon of polygons)for(let i=1;i<polygon.length;i++){
    if(!inRing(polygon[i][0],polygon[0],spend))invalid();
    for(let j=1;j<i;j++)if(inRing(polygon[i][0],polygon[j],spend)||inRing(polygon[j][0],polygon[i],spend))invalid();
  }
  for(let i=0;i<polygons.length;i++)for(let j=0;j<i;j++)
    if(inPolygon(polygons[i][0][0],polygons[j],spend)||inPolygon(polygons[j][0][0],polygons[i],spend))invalid();
  // A small spatial index keeps route checks local even for a detailed state
  // coast. The index is only an accelerator; exact ring/segment tests decide.
  const cells=new Map<string,Segment[]>();
  const visitCells=(west:number,south:number,east:number,north:number,visit:(key:string)=>void)=>{
    for(let x=Math.floor(west*10);x<=Math.floor(east*10);x++)
      for(let y=Math.floor(south*10);y<=Math.floor(north*10);y++){spend();visit(`${x}:${y}`);}
  };
  for(const segment of segments)visitCells(Math.min(segment.a[0],segment.b[0]),Math.min(segment.a[1],segment.b[1]),
    Math.max(segment.a[0],segment.b[0]),Math.max(segment.a[1],segment.b[1]),key=>{
      const bucket=cells.get(key)??[];bucket.push(segment);cells.set(key,bucket);
    });
  const candidates=(a:Point,b:Point,padding=0)=>{
    const result=new Set<Segment>();
    visitCells(Math.min(a[0],b[0])-padding,Math.min(a[1],b[1])-padding,
      Math.max(a[0],b[0])+padding,Math.max(a[1],b[1])+padding,key=>{
        for(const segment of cells.get(key)??[]){spend();result.add(segment);}
      });
    return result;
  };
  const inside=(point:Point)=>{
    let contained=false;
    // Valid, non-overlapping shells/holes permit even/odd parity across rings,
    // including an island component inside a different component's hole.
    for(const {a,b} of candidates(point,[85,point[1]]))
      if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])contained=!contained;
    return contained;
  };
  const clear=(point:Point)=>[...candidates(point,point,uncertaintyMetres/100000+epsilon)]
    .every(segment=>pointDistance(point,segment)>uncertaintyMetres);
  return {
    // Reset per route; callers use this synchronously, without sharing a budget
    // across requests or any awaits inside the calculation.
    begin(){budget=5_000_000;},
    endpoint(point:Point){return clear(point)&&inside(point);},
    outsideSegment(a:Point,b:Point){
      if(same(a,b)||!clear(a)||!clear(b))invalid();
      const routeSegment:Segment={a,b,ring:-1,index:0,size:1},cuts=[0,1];
      for(const segment of candidates(a,b,uncertaintyMetres/100000+epsilon)){
        spend();if(!overlaps(routeSegment,segment,uncertaintyMetres/100000))continue;
        const hit=intersection(routeSegment,segment);
        if(hit){if(hit.kind!=='cross')invalid();cuts.push(hit.t);}
        else if(segmentDistance(routeSegment,segment)<=uncertaintyMetres)invalid();
      }
      cuts.sort((x,y)=>x-y);
      let outside=false,previous:boolean|undefined;
      for(let i=1;i<cuts.length;i++){
        if(cuts[i]-cuts[i-1]<=epsilon)invalid();
        const t=(cuts[i]+cuts[i-1])/2,point:Point=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
        if(!clear(point))invalid();
        const current=inside(point);
        if(previous===current)invalid(); // Tangency or an unclassifiable crossing.
        previous=current;outside ||= !current;
      }
      return {outside,crossings:cuts.length-2};
    }
  };
}
