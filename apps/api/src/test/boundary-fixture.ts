import {createHash} from 'node:crypto';
import type {Point} from '../modules/posted-routes/routing';
import type {valhallaFixture} from './valhalla-fixture';

export const rectangle=(west:number,south:number,east:number,north:number):Point[]=>
  [[west,south],[east,south],[east,north],[west,north],[west,south]];

// Invented geometry, never an SOI extract or an approximation of Maharashtra.
export function boundaryFixture(coordinates:Point[][][]=[[rectangle(77.74,20.89,77.78,20.91)]]){
  const geometry={type:'MultiPolygon' as const,coordinates};
  return {datasetId:'synthetic-boundary-only',edition:'fixture-1',archiveSha256:'a'.repeat(64),
    geometrySha256:createHash('sha256').update(JSON.stringify(geometry)).digest('hex'),
    sourceCrs:'OGC:CRS84',normalizedCrs:'OGC:CRS84',transformation:'identity; synthetic fixture',
    topologyValidation:'synthetic topology checks',reuseEvidence:'invented test coordinates',
    uncertaintyMetres:10,policyVersion:'2026-10-03.2',geometry};
}

export function setFixtureRoute(provider:ReturnType<typeof valhallaFixture>,coordinates:Point[],metres:number[],seconds:number[]){
  let lat=0,lon=0,shape='',elapsed=0;
  const encode=(delta:number)=>{
    let value=delta<0?-delta*2-1:delta*2,result='';
    while(value>=32){result+=String.fromCharCode((value%32)+95);value=Math.floor(value/32);}
    return result+String.fromCharCode(value+63);
  };
  for(const [x,y] of coordinates){const nextLat=Math.round(y*1e6),nextLon=Math.round(x*1e6);
    shape+=encode(nextLat-lat)+encode(nextLon-lon);lat=nextLat;lon=nextLon;}
  provider.trace.shape=shape;
  provider.trace.edges=metres.map((length,i)=>({begin_shape_index:i,end_shape_index:i+1,length:length/1000,
    way_id:i+1,drive_on_right:false,end_node:{elapsed_time:elapsed+=seconds[i]}}));
  provider.route.trip.legs[0]={shape,summary:{length:metres.reduce((a,b)=>a+b,0)/1000,time:elapsed}};
  provider.locate[0].edges=[{way_id:1,correlated_lon:coordinates[0][0],correlated_lat:coordinates[0][1]}];
  const last=coordinates.at(-1)!;
  provider.locate[1].edges=[{way_id:metres.length,correlated_lon:last[0],correlated_lat:last[1]}];
}
