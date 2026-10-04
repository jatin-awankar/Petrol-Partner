import {readFile} from 'node:fs/promises';
import {vi} from 'vitest';
import {manifestDigest} from '../modules/posted-routes/valhalla';

// Opt-in local compatibility rehearsal, not production gateway evidence.
// Bodies come unchanged from the real engine. Only the build attestation is
// supplied by this test harness after comparing the inventoried engine version.
export async function liveValhallaRehearsal(){
  const url=new URL(process.env.VALHALLA_REHEARSAL_URL!);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||
    url.pathname!=='/'||url.search||url.hash)throw new Error('Rehearsal requires a loopback Valhalla root URL');
  const manifest=JSON.parse(await readFile(process.env.VALHALLA_REHEARSAL_MANIFEST!, 'utf8'));
  const digest=manifestDigest(manifest),realFetch=globalThis.fetch;
  const status=await realFetch(new URL('status',url),{signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!status.ok||(await status.json()).version!==manifest.engineVersion)throw new Error('Rehearsal engine mismatch');
  process.env.VALHALLA_URL=url.href;
  process.env.VALHALLA_BUILD_MANIFEST=JSON.stringify(manifest);
  vi.stubGlobal('fetch',async(input:URL,init:RequestInit)=>{
    if(input.origin!==url.origin)throw new Error('Unexpected rehearsal destination');
    const response=await realFetch(input,init);
    const headers=new Headers(response.headers);
    headers.set('x-petrol-routing-build',digest);
    return new Response(response.body,{status:response.status,headers});
  });
  return manifest;
}
