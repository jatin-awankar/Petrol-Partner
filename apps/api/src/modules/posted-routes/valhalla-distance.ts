import type {Point} from './routing';

type Edge={begin_shape_index:number;end_shape_index:number;length:number};
type Trace={shape:string;edges:Edge[];shape_attributes?:{length?:number[]}};
type Input={routeShape:string;routeLengthKm:number;trace:Trace};

// Frozen normalization rule selected by route policy 2026-10-03.2.
function invalid():never{throw new Error('Valhalla route distance cannot be verified');}

function decodePolyline6(shape:string):Point[]{
  if(typeof shape!=='string'||!shape||shape.length>200000)invalid();
  const coordinates:Point[]=[];
  let latitude=0,longitude=0,index=0;
  const component=()=>{
    let value=0,shift=0,byte:number;
    do{
      if(index>=shape.length||shift>50)invalid();
      byte=shape.charCodeAt(index++)-63;
      if(byte<0||byte>63)invalid();
      value+=(byte%32)*2**shift;
      shift+=5;
    }while(byte>=32);
    if(!Number.isSafeInteger(value))invalid();
    return value%2===0?value/2:-(value+1)/2;
  };
  while(index<shape.length){
    latitude+=component();longitude+=component();
    const point:Point=[longitude/1e6,latitude/1e6];
    if(!Number.isSafeInteger(latitude)||!Number.isSafeInteger(longitude)||
      Math.abs(point[0])>180||Math.abs(point[1])>90)invalid();
    coordinates.push(point);
    if(coordinates.length>5000)invalid();
  }
  if(coordinates.length<2)invalid();
  return coordinates;
}

function chordMetres(a:Point,b:Point){
  const radians=Math.PI/180,latitude=(a[1]+b[1])*radians/2;
  return Math.hypot((a[0]-b[0])*radians*6371000*Math.cos(latitude),
    (a[1]-b[1])*radians*6371000);
}

export function buildValhallaDistanceProgression(input:Input){
  if(!input||!input.trace||input.routeShape!==input.trace.shape||
    !Number.isFinite(input.routeLengthKm)||input.routeLengthKm<=0||input.routeLengthKm>50)invalid();
  const coordinates=decodePolyline6(input.routeShape);
  const edges=input.trace.edges;
  if(!Array.isArray(edges)||edges.length<1||edges.length>=coordinates.length)invalid();
  const cumulativeMeters=[0];
  let nextShapeIndex=0,totalMetres=0;
  for(const edge of edges){
    const begin=edge.begin_shape_index,end=edge.end_shape_index;
    if(!Number.isSafeInteger(begin)||!Number.isSafeInteger(end)||
      begin!==nextShapeIndex||end<=begin||end>=coordinates.length||
      !Number.isFinite(edge.length)||edge.length<=0)invalid();
    const edgeMetres=Math.round(edge.length*1000),count=end-begin;
    if(!Number.isSafeInteger(edgeMetres)||edgeMetres<count||totalMetres+edgeMetres>50000)invalid();
    const weights:number[]=[];
    for(let i=begin;i<end;i++){
      const length=chordMetres(coordinates[i],coordinates[i+1]);
      if(!Number.isFinite(length)||length<=0)invalid();
      weights.push(length);
    }
    const weightTotal=weights.reduce((sum,value)=>sum+value,0);
    if(Math.abs(weightTotal-edgeMetres)>Math.max(5,edgeMetres*0.02))invalid();
    const remaining=edgeMetres-count;
    const quotas=weights.map(weight=>remaining*weight/weightTotal);
    const allocations=quotas.map(quota=>Math.floor(quota));
    const remainder=remaining-allocations.reduce((sum,value)=>sum+value,0);
    if(!Number.isSafeInteger(remainder)||remainder<0||remainder>count)invalid();
    const order=quotas.map((quota,index)=>({index,fraction:quota-allocations[index]}))
      .sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
    for(let i=0;i<remainder;i++)allocations[order[i].index]++;
    for(const allocated of allocations){
      totalMetres+=allocated+1;
      cumulativeMeters.push(totalMetres);
    }
    nextShapeIndex=end;
  }
  // Trace edge lengths are reported to whole metres. Their individual rounding
  // can accumulate; keep an absolute fail-closed cap while allowing that error.
  const summaryToleranceMetres=Math.min(20,Math.ceil(edges.length/2)+1);
  if(nextShapeIndex!==coordinates.length-1||
    Math.abs(totalMetres-Math.round(input.routeLengthKm*1000))>summaryToleranceMetres)invalid();
  return {geometry:{type:'LineString' as const,coordinates},cumulativeMeters,
    distanceMeters:totalMetres};
}
