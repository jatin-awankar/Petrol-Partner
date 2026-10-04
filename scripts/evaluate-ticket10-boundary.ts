// Offline candidate evaluation only. This does not load a production artifact.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {compileBoundary,type MultiPolygon} from '../apps/api/src/modules/posted-routes/boundary-geometry';
const file=process.argv[2];
if(!file)throw new Error('Pass the downloaded full geoBoundaries IND ADM1 GeoJSON');
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const raw=readFileSync(file);
assert.equal(raw.length,46170854);
assert.equal(sha(raw),'47aa0acb6f69868daee49143276f3ce323f18905ba7d38d0a86816b405028736');
const data=JSON.parse(raw.toString());
assert.equal(data.crs.properties.name,'urn:ogc:def:crs:OGC:1.3:CRS84');
const matches=data.features.filter((f:{properties:{shapeISO:string}})=>f.properties.shapeISO==='IN-MH');
assert.equal(matches.length,1);
assert.equal(matches[0].properties.shapeID,'1811400B15614733245507');
const source=matches[0].geometry;
const geometry:MultiPolygon={type:'MultiPolygon',coordinates:source.type==='Polygon'?[source.coordinates]:source.coordinates};
assert.equal(sha(JSON.stringify(geometry)),'71ed889b914ce89fb134533c8c9f209dfbbc46f403db10744cca530906f7667d');
const probes=[];
// Sensitivity values only: none is a validated or proposed source accuracy.
for(const band of [10,100,1000]){
  const start=performance.now(),b=compileBoundary(geometry,band),compileMs=performance.now()-start;
  b.begin();
  assert.equal(b.endpoint([77.75,20.9]),true);
  assert.equal(b.endpoint([72.8777,19.076]),true);
  assert.equal(b.endpoint([78.4867,17.385]),false);
  for(const polygon of geometry.coordinates)assert.equal(b.endpoint(polygon[0][0]),false);
  assert.deepEqual(b.outsideSegment([77.75,20.9],[77.765,20.9]),{outside:false,crossings:0});
  b.begin();let completed=0,budgetRejected=false;
  try{for(;completed<4999;completed++){
    const x=77.75+0.015*completed/4999,y=77.75+0.015*(completed+1)/4999;
    assert.deepEqual(b.outsideSegment([x,20.9],[y,20.9]),{outside:false,crossings:0});
  }}catch(error){if(!(error instanceof Error)||error.message!=='Boundary geometry cannot be verified')throw error;budgetRejected=true;}
  probes.push({hypotheticalBandMetres:band,compileMs,denseSyntheticSegmentsCompleted:completed,budgetRejected});
}
// Independent invented geometry tests transverse excursions, holes and ambiguity.
const rectangle=(w:number,s:number,e:number,n:number):[number,number][]=>[[w,s],[e,s],[e,n],[w,n],[w,s]];
const synthetic:MultiPolygon={type:'MultiPolygon',coordinates:[[rectangle(77,20,78,21),rectangle(77.4,20.4,77.6,20.6)]]};
const b=compileBoundary(synthetic,10);b.begin();
assert.equal(b.endpoint([77.5,20.5]),false);
assert.deepEqual(b.outsideSegment([77.3,20.5],[77.7,20.5]),{outside:true,crossings:2});
assert.throws(()=>b.outsideSegment([77.3,20.4],[77.7,20.4]));
const result={evaluationOnly:true,sourceSha256:sha(raw),geometrySha256:sha(JSON.stringify(geometry)),properties:matches[0].properties,
  parts:geometry.coordinates.length,holes:geometry.coordinates.reduce((sum,p)=>sum+p.length-1,0),vertices:geometry.coordinates.flat(2).length,
  probes,syntheticHoleCrossingAndAmbiguity:'passed',accuracyValidated:false};
console.log(JSON.stringify(result,null,2));
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
