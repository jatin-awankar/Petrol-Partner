import {vi} from 'vitest';
import {manifestDigest} from '../modules/posted-routes/valhalla';

// Controlled external HTTP responses, never an actual graph or boundary artifact.
export function valhallaFixture(){
  const manifest={engineVersion:'fixture-3.9',imageDigest:'1'.repeat(64),osmExtractDate:'2026-10-01',
    osmExtractSha256:'2'.repeat(64),graphBuildId:'synthetic-only',graphSha256:'3'.repeat(64),configSha256:'4'.repeat(64)};
  process.env.VALHALLA_URL='http://127.0.0.1:8002/';
  process.env.VALHALLA_BUILD_MANIFEST=JSON.stringify(manifest);
  const shape='_iszf@_nnhsC?owH?owH?owH';
  const route={trip:{status:0,units:'kilometers',locations:[{side_of_street:'left'},{side_of_street:'left'}],
    legs:[{shape,summary:{length:1.562,time:180.1}}]}};
  const trace={shape,edges:[{begin_shape_index:0,end_shape_index:2,length:1.04,way_id:1,drive_on_right:false},
    {begin_shape_index:2,end_shape_index:3,length:0.52,way_id:2,drive_on_right:false}]};
  const locate=[{edges:[{way_id:1,correlated_lon:77.75,correlated_lat:20.9}]},
    {edges:[{way_id:2,correlated_lon:77.765,correlated_lat:20.9}]}];
  const state={build:manifestDigest(manifest),status:200,route,trace,locate,calls:[] as Record<string,unknown>[],
    fail:false,malformed:false,wait:false};
  const fetcher=vi.fn(async(url:URL,init:RequestInit)=>{
    state.calls.push(JSON.parse(String(init.body)));
    if(state.wait)await new Promise((_resolve,reject)=>init.signal!.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
    if(state.fail)throw new Error('provider offline');
    const body=url.pathname==='/route'?route:url.pathname==='/trace_attributes'?trace:locate;
    return new Response(state.malformed?'bad json':JSON.stringify(body),{status:state.status,
      headers:{'x-petrol-routing-build':state.build}});
  });
  vi.stubGlobal('fetch',fetcher);
  return state;
}
