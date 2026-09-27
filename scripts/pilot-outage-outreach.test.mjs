import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
