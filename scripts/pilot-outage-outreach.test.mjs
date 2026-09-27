import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHmac} from 'node:crypto';
import {appendFallback,reconcileFallback} from './pilot-outage-outreach.mjs';
const operatorId='11111111-1111-4111-8111-111111111111';
const participantId='22222222-2222-4222-8222-222222222222';
const input={operatorId,participantId,method:'phone',reason:'service_outage',outcome:'contacted',
  occurredAt:'2026-09-27T12:00:00.000Z'};
test('fallback fsync record contains only coded details and rejects tampering',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'outreach-'));
  try {
    const path=join(dir,'record.jsonl');
    await appendFallback(path,'fallback-test-secret-with-32-characters',input);
    const content=await readFile(path,'utf8');
    assert.equal(content.includes('phone number'),false);
    const calls=[];
    const fake={async query(sql){calls.push(sql);return {rowCount:sql.includes('FROM pilot_urgent_outreach WHERE id=')?0:1,rows:[]};}};
    await reconcileFallback(path,'fallback-test-secret-with-32-characters',fake);
    assert.ok(calls.some(sql=>sql.includes('pilot_urgent_outreach')));
    await assert.rejects(reconcileFallback(path,'a-different-secret-with-32-characters',fake),/signature mismatch/);
    const link=join(dir,'link.jsonl');await symlink(path,link);
    await assert.rejects(appendFallback(link,'fallback-test-secret-with-32-characters',input));
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('offline one-time code is required',async()=>{
  const {verifyTotp}=await import('./pilot-outage-outreach.mjs');
  const secret=Buffer.from('12345678901234567890').toString('hex');
  assert.equal(verifyTotp(secret,'000000',0),false);
  assert.equal(verifyTotp(secret,'287082',59_000),true);
});
test('offline record requires an independently provisioned MFA verifier',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'outreach-mfa-'));
  try {
    const credentialPath=join(dir,'signing.json'),recordPath=join(dir,'outreach.jsonl');
    const {writeFile}=await import('node:fs/promises');
    const totpSecret=Buffer.from('12345678901234567890').toString('hex');
    await writeFile(credentialPath,JSON.stringify({operatorId,
      signingSecret:'fallback-test-secret-with-32-characters',totpSecret}),{mode:0o600});
    const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
    const digest=createHmac('sha1',Buffer.from(totpSecret,'hex')).update(counter).digest();
    const offset=digest[digest.length-1]&15;
    const otp=String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
    const result=spawnSync(process.execPath,[resolve(import.meta.dirname,'pilot-outage-outreach.mjs'),'record'],{
      env:{...process.env,PILOT_OUTAGE_OPERATOR_CREDENTIAL_PATH:credentialPath,
        PILOT_OUTAGE_MFA_VERIFIER_PATH:'',PILOT_OUTAGE_OUTREACH_PATH:recordPath},
      input:JSON.stringify({...input,otp}),encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/invalid operator credential/i);
    await assert.rejects(readFile(recordPath));
    await writeFile(credentialPath,JSON.stringify({operatorId,
      signingSecret:'fallback-test-secret-with-32-characters'}),{mode:0o600});
    const signingOnly=spawnSync(process.execPath,[resolve(import.meta.dirname,'pilot-outage-outreach.mjs'),'record'],{
      env:{...process.env,PILOT_OUTAGE_OPERATOR_CREDENTIAL_PATH:credentialPath,
        PILOT_OUTAGE_MFA_VERIFIER_PATH:'',PILOT_OUTAGE_OUTREACH_PATH:recordPath},
      input:JSON.stringify({...input,otp}),encoding:'utf8'});
    assert.notEqual(signingOnly.status,0);
    assert.match(signingOnly.stderr,/independent MFA verifier/i);
    await assert.rejects(readFile(recordPath));
  } finally {await rm(dir,{recursive:true,force:true});}
});
