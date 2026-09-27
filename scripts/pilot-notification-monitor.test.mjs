import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monitorSignals,runMonitor} from './pilot-notification-monitor.mjs';
const now=new Date('2026-09-27T12:00:00Z');
const env={PILOT_SUPPORT_WINDOW_START:'2026-09-27T10:00:00Z',PILOT_SUPPORT_WINDOW_END:'2026-09-27T14:00:00Z',
  PILOT_OUTAGE_ALERT_ENDPOINT:'https://alert.example.test/notify',PILOT_OUTAGE_ALERT_TOKEN:'secret'};
test('healthy worker stays quiet and first-attempt window is observable',()=>{
  assert.deepEqual(monitorSignals({now,windowStart:env.PILOT_SUPPORT_WINDOW_START,windowEnd:env.PILOT_SUPPORT_WINDOW_END,
    workerSeenAt:'2026-09-27T11:59:30Z',oldestReadyAt:'2026-09-27T11:59:30Z',queueSize:1}),[]);
});
test('stopped worker, prolonged wait and queue growth alert without worker participation',async()=>{
  let sent;
  const result=await runMonitor({env,now,query:async()=>({rows:[{worker_seen_at:'2026-09-27T11:54:00Z',
    oldest_ready_at:'2026-09-27T11:54:00Z',queue_size:21}]}),send:async(_url,options)=>{
      sent=JSON.parse(options.body);return {ok:true};}});
  assert.deepEqual(result.signals,['worker_stalled','important_queue_stalled','important_queue_growth']);
  assert.deepEqual(sent.signals,result.signals);
  assert.equal(JSON.stringify(sent).includes('secret'),false);
});
test('database outage uses independent alert channel',async()=>{
  let sent;
  await runMonitor({env,now,query:async()=>{throw Error('private database detail');},send:async(_url,options)=>{
    sent=JSON.parse(options.body);return {ok:true};}});
  assert.deepEqual(sent.signals,['notification_database_unavailable']);
  assert.equal(JSON.stringify(sent).includes('private database detail'),false);
});
test('alert gateway failure exits as failure',async()=>{
  await assert.rejects(runMonitor({env,now,query:async()=>({rows:[{worker_seen_at:null,oldest_ready_at:null,queue_size:0}]}),
    send:async()=>({ok:false,status:503})}),/HTTP 503/);
});
test('outside operating window does not alert for a stale worker',()=>{
  assert.deepEqual(monitorSignals({now:new Date('2026-09-27T15:00:00Z'),windowStart:env.PILOT_SUPPORT_WINDOW_START,
    windowEnd:env.PILOT_SUPPORT_WINDOW_END,workerSeenAt:null,oldestReadyAt:null,queueSize:0}),[]);
});

test('unconfigured operating window alerts instead of silently passing',()=>{
  assert.deepEqual(monitorSignals({now,windowStart:undefined,windowEnd:undefined,workerSeenAt:null,oldestReadyAt:null,queueSize:0}),['operating_window_unconfigured']);
});
