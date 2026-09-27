import {createHmac, randomUUID, timingSafeEqual} from 'node:crypto';
import {open,readFile,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname} from 'node:path';
import pg from 'pg';

const methods=new Set(['email','phone','in_person','other']);
const reasons=new Set(['safety_check','pickup_exception','service_outage','delivery_failure','other_support']);
const outcomes=new Set(['contacted','no_answer','follow_up_required','resolved','escalated']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateRecord(record) {
  if(!uuid.test(record.id)||!uuid.test(record.operatorId)||!uuid.test(record.participantId)||
    !methods.has(record.method)||!reasons.has(record.reason)||!outcomes.has(record.outcome)||
    !Number.isFinite(Date.parse(record.occurredAt))) throw Error('Invalid outage outreach record');
  return record;
}
export function signRecord(record, secret) {
  return createHmac('sha256',secret).update(JSON.stringify(record)).digest('hex');
}
export function verifyTotp(secretHex,code,now=Date.now()) {
  if(!/^[0-9a-f]{40,}$/i.test(secretHex)||!/^\d{6}$/.test(code??'')) return false;
  for(const shift of [-1,0,1]) {
    const step=Math.floor(now/30000)+shift;
    if(step<0) continue;
    const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
    const digest=createHmac('sha1',Buffer.from(secretHex,'hex')).update(counter).digest();
    const offset=digest[digest.length-1]&15;
    const value=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;
    const expected=Buffer.from(String(value).padStart(6,'0'));
    if(timingSafeEqual(expected,Buffer.from(code))) return true;
  }
  return false;
}
export async function appendFallback(path,secret,input) {
  const record=validateRecord({id:randomUUID(),...input});
  const line=JSON.stringify({record,signature:signRecord(record,secret)})+'\n';
  const file=await open(path,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
  try { const stats=await file.stat(); if ((stats.mode&0o077)!==0) throw Error('Fallback record permissions are too broad');
    await file.writeFile(line);await file.sync();
  } finally {await file.close();}
  const directory=await open(dirname(path),'r');
  try {await directory.sync();} finally {await directory.close();}
  return record.id;
}
export async function reconcileFallback(path,secret,client) {
  const lines=(await readFile(path,'utf8')).trim().split('\n').filter(Boolean);
  const records=lines.map(line=>{
    const item=JSON.parse(line);validateRecord(item.record);
    const expected=Buffer.from(signRecord(item.record,secret),'hex');
    const actual=Buffer.from(item.signature??'','hex');
    if(expected.length!==actual.length||!timingSafeEqual(expected,actual)) throw Error('Fallback signature mismatch');
    return item.record;
  });
  await client.query('BEGIN');
  try {
    for(const record of records) {
      const existing=await client.query(`SELECT operator_id,participant_id,method,occurred_at,reason,outcome,payload_digest,state
        FROM pilot_urgent_outreach WHERE id=$1`,[record.id]);
      if(existing.rowCount) {
        const row=existing.rows[0];
        if(row.operator_id!==record.operatorId||row.participant_id!==record.participantId||
          row.method!==record.method||new Date(row.occurred_at).toISOString()!==record.occurredAt||
          row.reason!==record.reason||row.outcome!==record.outcome||
          row.payload_digest!==signRecord(record,secret)||row.state!=='recovered')
          throw Error('Fallback record conflicts with existing state');
        continue;
      }
      const operator=await client.query(`SELECT 1 FROM users u JOIN operator_allowlist a ON a.user_id=u.id
        WHERE u.id=$1 AND u.role='admin' AND a.active=true`,[record.operatorId]);
      if(!operator.rowCount) throw Error('Fallback operator no longer authorized; manual review required');
      const participant=await client.query('SELECT 1 FROM users WHERE id=$1',[record.participantId]);
      if(!participant.rowCount) throw Error('Fallback participant missing; manual review required');
      await client.query(`INSERT INTO pilot_urgent_outreach(id,operator_id,idempotency_key,participant_id,method,occurred_at,reason,outcome,payload_digest,state)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'recovered')`,[record.id,record.operatorId,`fallback:${record.id}`,
        record.participantId,record.method,record.occurredAt,record.reason,record.outcome,signRecord(record,secret)]);
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id)
        VALUES($1,'urgent_outreach_reconciled','pilot_urgent_outreach',$2)`,[record.operatorId,record.id]);
    }
    await client.query('COMMIT');
    return records.length;
  } catch(error) {await client.query('ROLLBACK');throw error;}
}

if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href) {
  const [command]=process.argv.slice(2);
  const path=process.env.PILOT_OUTAGE_OUTREACH_PATH;
  const credentialPath=process.env.PILOT_OUTAGE_OPERATOR_CREDENTIAL_PATH;
  try {
    if(!path||!credentialPath) throw Error('Private fallback path and operator credential are required');
    const stats=await lstat(credentialPath);
    if(!stats.isFile()||(stats.mode&0o077)!==0) throw Error('Operator credential must be a private regular file');
    const credential=JSON.parse(await readFile(credentialPath,'utf8'));
    if(!uuid.test(credential.operatorId)||typeof credential.signingSecret!=='string'||
      credential.signingSecret.length<32) throw Error('Invalid operator credential');
    if(command==='record') {
      let input='';for await(const chunk of process.stdin) input+=chunk;
      const {participantId,method,reason,outcome,otp}=JSON.parse(input);
      if(!verifyTotp(credential.totpSecret,otp)) throw Error('Operator MFA failed');
      const id=await appendFallback(path,credential.signingSecret,{operatorId:credential.operatorId,
        participantId,method,reason,outcome,occurredAt:new Date().toISOString()});
      console.log(`Recorded fallback outreach ${id}`);
    } else if(command==='reconcile') {
      if(!process.env.DATABASE_URL) throw Error('DATABASE_URL is required for reconciliation');
      const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
      try {await client.connect();console.log(`Reconciled ${await reconcileFallback(path,credential.signingSecret,client)} fallback records`);}
      finally {await client.end().catch(()=>undefined);}
    } else throw Error('Use record or reconcile');
  } catch(error) {console.error(error instanceof Error?error.message:'Fallback failed');process.exitCode=1;}
}
