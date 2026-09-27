import { randomUUID, createHmac } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import https from 'node:https';
import pg from 'pg';

const execFileAsync=promisify(execFile);
const url=process.env.DATABASE_URL;
if(!url||process.env.TEST_DATABASE_DISPOSABLE!=='true'||
  new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('_ticket27_test'))
  throw Error('Use an isolated localhost _ticket27_test database with TEST_DATABASE_DISPOSABLE=true');
const root=resolve(import.meta.dirname,'..');
const directory=await mkdtemp(join(tmpdir(),'pilot27-rehearsal-'));
const db=new pg.Pool({connectionString:url,max:3});
let server;let worker;let monitorProcess;
const observations={emailAttempts:0,alerts:[],workerStopped:false,fallbackRecorded:false};
function child(command,args,env,input) {
  return new Promise((resolveChild,reject)=>{
    const process=spawn(command,args,{cwd:root,env,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';
    process.stdout.on('data',chunk=>stdout+=chunk);
    process.stderr.on('data',chunk=>stderr+=chunk);
    process.on('error',reject);
    process.on('close',code=>code===0?resolveChild({stdout,stderr}):reject(Error(`${command} exited ${code}: ${stderr.slice(0,500)}`)));
    process.stdin.end(input);
  });
}
async function waitUntil(check,timeout=30000) {
  const until=Date.now()+timeout;
  while(Date.now()<until) {const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,200));}
  throw Error('Timed out waiting for process or durable state');
}
function totp(secret) {
  const count=Buffer.alloc(8);count.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(secret,'hex')).update(count).digest();
  return String((digest.readUInt32BE(digest[digest.length-1]&15)&0x7fffffff)%1000000).padStart(6,'0');
}
async function event(userId,readyAt) {
  const id=randomUUID();
  await db.query(`INSERT INTO pilot_notification_events
    (id,origin_type,operation_id,recipient_id,event_type,related_entity_type,related_entity_id,title,body,ready_at)
    VALUES($1,'ticket27_rehearsal',$1,$2,'synthetic_alert','synthetic',$1,'Synthetic notice','Synthetic only',$3)`,
    [id,userId,readyAt]);
  const row=await db.query(`INSERT INTO pilot_email_jobs(event_id,recipient_id)
    VALUES($1,$2) RETURNING id`,[id,userId]);
  return row.rows[0].id;
}
try {
  if((await db.query('SELECT count(*)::int AS n FROM pilot_email_jobs')).rows[0].n!==0)
    throw Error('Use a freshly migrated isolated rehearsal database');
  const cert=join(directory,'cert.pem'),key=join(directory,'key.pem');
  await execFileAsync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-keyout',key,'-out',cert,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost']);
  server=https.createServer({key:await readFile(key),cert:await readFile(cert)},(request,response)=>{
    const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{
      if(request.url==='/email') {observations.emailAttempts++;response.writeHead(200).end();return;}
      if(request.url==='/alert') {
        const payload=JSON.parse(Buffer.concat(chunks).toString());
        observations.alerts.push(payload.signals);
        response.writeHead(202).end();return;
      }
      response.writeHead(404).end();
    });
  });
  await new Promise(resolveListen=>server.listen(0,'localhost',resolveListen));
  const port=server.address().port;
  const email=`ticket27-${randomUUID()}@example.test`;
  const user=(await db.query("INSERT INTO users(email,role) VALUES($1,'admin') RETURNING id",[email])).rows[0].id;
  await db.query("INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at) VALUES($1,true,'synthetic rehearsal',now())",[user]);
  const participant=(await db.query("INSERT INTO users(email) VALUES($1) RETURNING id",[`ticket27-participant-${randomUUID()}@example.test`])).rows[0].id;
  const first=await event(user,new Date());
  worker=spawn(process.execPath,[resolve(root,'apps/worker/dist/index.js')],{cwd:root,
    env:{...process.env,NODE_ENV:'test',TEST_DATABASE_DISPOSABLE:'true',
      REDIS_URL:'redis://127.0.0.1:56379',PILOT_EMAIL_ENDPOINT:`https://localhost:${port}/email`,
      PILOT_EMAIL_TOKEN:'synthetic-token',NODE_EXTRA_CA_CERTS:cert},stdio:'ignore'});
  await waitUntil(async()=>{
    if(worker.exitCode!==null)throw Error(`Worker exited early: ${worker.exitCode}`);
    return (await db.query("SELECT status FROM pilot_email_jobs WHERE id=$1",[first])).rows[0]?.status==='sent';
  });
  const firstAt=(await db.query("SELECT min(started_at) AS first_at FROM pilot_email_attempts WHERE job_id=$1",[first])).rows[0].first_at;
  const created=(await db.query("SELECT created_at FROM pilot_email_jobs WHERE id=$1",[first])).rows[0].created_at;
  if(new Date(firstAt)-new Date(created)>60000)throw Error('First important attempt exceeded one minute');
  monitorProcess=spawn(process.execPath,[resolve(root,'scripts/pilot-notification-watch.mjs')],{cwd:root,
    env:{...process.env,MONITOR_DATABASE_URL:url,PILOT_OUTAGE_ALERT_ENDPOINT:`https://localhost:${port}/alert`,
      PILOT_OUTAGE_ALERT_TOKEN:'synthetic-monitor-token',NODE_EXTRA_CA_CERTS:cert,
      PILOT_MONITOR_INTERVAL_MS:'250',PILOT_SUPPORT_WINDOW_START:new Date(Date.now()-3600000).toISOString(),
      PILOT_SUPPORT_WINDOW_END:new Date(Date.now()+3600000).toISOString()},stdio:'ignore'});
  await new Promise(r=>setTimeout(r,500));
  worker.kill('SIGTERM');
  await waitUntil(()=>worker.exitCode!==null,10000);observations.workerStopped=true;
  // Controlled clock: six minutes after a real process stop, without waiting six wall-clock minutes.
  await db.query("UPDATE pilot_email_worker_state SET last_seen_at=now()-interval '6 minutes' WHERE singleton=true");
  for(let i=0;i<21;i++)await event(user,new Date(Date.now()-6*60000));
  const required=['worker_stalled','important_queue_stalled','important_queue_growth'];
  await waitUntil(()=>observations.alerts.some(list=>required.every(x=>list.includes(x))),10000);
  const signals=observations.alerts.find(list=>required.every(x=>list.includes(x)));
  monitorProcess.kill('SIGTERM');
  await waitUntil(()=>monitorProcess.exitCode!==null,10000);
  const credentialPath=join(directory,'operator.json'),fallbackPath=join(directory,'fallback.jsonl');
  const signingSecret=randomUUID()+randomUUID(),totpSecret='1234567890123456789012345678901234567890';
  await writeFile(credentialPath,JSON.stringify({operatorId:user,signingSecret,totpSecret}),{mode:0o600});
  await chmod(credentialPath,0o600);
  const fallbackEnv={...process.env,DATABASE_URL:'',PILOT_OUTAGE_OPERATOR_CREDENTIAL_PATH:credentialPath,
    PILOT_OUTAGE_OUTREACH_PATH:fallbackPath};
  await child(process.execPath,[resolve(root,'scripts/pilot-outage-outreach.mjs'),'record'],fallbackEnv,
    JSON.stringify({participantId:participant,method:'phone',reason:'service_outage',
      outcome:'follow_up_required',otp:totp(totpSecret)}));
  observations.fallbackRecorded=true;
  await child(process.execPath,[resolve(root,'scripts/pilot-outage-outreach.mjs'),'reconcile'],
    {...fallbackEnv,DATABASE_URL:url});
  const row=(await db.query("SELECT count(*)::int AS n FROM pilot_urgent_outreach WHERE participant_id=$1 AND state='recovered'",[participant])).rows[0];
  if(row.n!==1)throw Error('Fallback record was not reconciled exactly once');
  console.log(JSON.stringify({result:'passed',firstAttemptMs:new Date(firstAt)-new Date(created),
    emailAttempts:observations.emailAttempts,workerStopped:observations.workerStopped,
    signals,alertReceived:observations.alerts.length>0,fallbackRecorded:observations.fallbackRecorded,
    fallbackReconciled:row.n}));
} finally {
  if(worker&&worker.exitCode===null)worker.kill('SIGTERM');
  if(monitorProcess&&monitorProcess.exitCode===null)monitorProcess.kill('SIGTERM');
  if(server)await new Promise(resolveClose=>server.close(resolveClose));
  await db.end();await rm(directory,{recursive:true,force:true});
}
