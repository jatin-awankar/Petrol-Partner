import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import https from 'node:https';
import { isIP } from 'node:net';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { backupStorageConfig } from './pilot-backup-common.mjs';

if (process.env.PILOT_EVIDENCE_SYNTHETIC_APPROVED !== 'true') {
  throw new Error('Set PILOT_EVIDENCE_SYNTHETIC_APPROVED=true for synthetic staging data only');
}
const url = process.env.PILOT_EVIDENCE_SUPABASE_URL;
const serviceKey = process.env.PILOT_EVIDENCE_SUPABASE_SERVICE_KEY;
if (!url || new URL(url).protocol !== 'https:' || !serviceKey) {
  throw new Error('An HTTPS staging Supabase URL and service key are required');
}
const dnsIp = process.env.PILOT_STORAGE_DNS_IP;
if (dnsIp && isIP(dnsIp) !== 4) throw new Error('PILOT_STORAGE_DNS_IP must be an IPv4 address');
const { prefix, key, client: b2 } = backupStorageConfig();
if (!prefix.startsWith('ticket07synthetic/')) {
  throw new Error('The B2 prefix must be dedicated to ticket07synthetic/');
}

const bucket = 'pilot-student-evidence';
async function storageFetch(input, init) {
  const request = new Request(input, init);
  const target = new URL(request.url);
  if (target.origin !== new URL(url).origin) throw new Error('Unexpected Storage request origin');
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
  return new Promise((resolve, reject) => {
    const outgoing = https.request(target, {
      method: request.method,
      autoSelectFamily: false,
      headers: Object.fromEntries(request.headers),
      ...(dnsIp ? { lookup: (_hostname, _options, done) => done(null, dnsIp, 4) } : {}),
    }, (incoming) => {
      const chunks = [];
      incoming.on('data', (part) => chunks.push(part));
      incoming.on('error', reject);
      incoming.on('end', () => resolve(new Response(
        incoming.statusCode === 204 ? null : Buffer.concat(chunks),
        { status: incoming.statusCode, headers: incoming.headers },
      )));
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: storageFetch },
});
const attemptId = randomUUID();
const sourceKey = `ticket07-synthetic/${attemptId}-source.pdf`;
const restoredKey = `ticket07-synthetic/${attemptId}-restored.pdf`;
const b2Key = `${prefix}/supabase-evidence/${attemptId}.enc`;
const plain = Buffer.from('%PDF-1.4\nTicket 07 synthetic evidence recovery drill\n%%EOF\n');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const startedAt = new Date().toISOString();
let sourceCreated = false;
let restoredCreated = false;
let report;

async function readStorage(path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? 'empty response'}`);
  return Buffer.from(await data.arrayBuffer());
}

async function removeStorage(path) {
  const { data, error } = await supabase.storage.from(bucket).remove([path]);
  if (error || data?.length !== 1) throw new Error(`Synthetic Storage cleanup failed for ${path}: ${error?.message ?? 'unexpected result'}`);
}

try {
  const { data: bucketInfo, error: bucketError } = await supabase.storage.getBucket(bucket);
  if (bucketError || bucketInfo?.public !== false) {
    throw new Error(`Staging bucket must exist and be private: ${bucketError?.message ?? 'unexpected bucket policy'}`);
  }

  const uploaded = await supabase.storage.from(bucket).upload(sourceKey, plain, {
    contentType: 'application/pdf', upsert: false,
  });
  if (uploaded.error) throw new Error(`Synthetic upload failed: ${uploaded.error.message}`);
  sourceCreated = true;
  const source = await readStorage(sourceKey);
  if (!source.equals(plain)) throw new Error('Supabase source readback mismatch');

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(source), cipher.final()]);
  const tag = cipher.getAuthTag();
  const stored = await b2.send(new PutObjectCommand({
    Bucket: process.env.PILOT_BACKUP_B2_BUCKET,
    Key: b2Key,
    Body: ciphertext,
    ContentType: 'application/octet-stream',
    ServerSideEncryption: 'AES256',
    Metadata: {
      format: 'ticket07-synthetic-aes-256-gcm-v1',
      iv: iv.toString('base64'), tag: tag.toString('base64'),
      plaintextsha256: sha256(source), ciphertextsha256: sha256(ciphertext),
      contenttype: 'application/pdf',
    },
  }));
  if (!stored.VersionId) throw new Error('B2 write did not return an object version');
  const recovered = await b2.send(new GetObjectCommand({
    Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: b2Key, VersionId: stored.VersionId,
  }));
  if (!recovered.Body || recovered.Metadata?.format !== 'ticket07-synthetic-aes-256-gcm-v1') {
    throw new Error('B2 versioned read or recovery metadata missing');
  }
  const downloaded = Buffer.from(await recovered.Body.transformToByteArray());
  if (sha256(downloaded) !== recovered.Metadata.ciphertextsha256) {
    throw new Error('B2 ciphertext checksum mismatch');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(recovered.Metadata.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(recovered.Metadata.tag, 'base64'));
  const recoveredPlain = Buffer.concat([decipher.update(downloaded), decipher.final()]);
  if (sha256(recoveredPlain) !== recovered.Metadata.plaintextsha256 || !recoveredPlain.equals(plain)) {
    throw new Error('B2 decrypted evidence mismatch');
  }

  await removeStorage(sourceKey);
  sourceCreated = false;
  const missing = await supabase.storage.from(bucket).download(sourceKey);
  if (!missing.error) throw new Error('Source remained readable after deletion');
  const restored = await supabase.storage.from(bucket).upload(restoredKey, recoveredPlain, {
    contentType: recovered.Metadata.contenttype, upsert: false,
  });
  if (restored.error) throw new Error(`Isolated restore failed: ${restored.error.message}`);
  restoredCreated = true;
  if (!(await readStorage(restoredKey)).equals(plain)) throw new Error('Restored Supabase bytes mismatch');
  const publicResponse = await storageFetch(`${url}/storage/v1/object/public/${bucket}/${restoredKey}`);
  if (publicResponse.ok) throw new Error('Restored object is publicly readable');

  report = {
    result: 'PASS', startedAt, completedAt: new Date().toISOString(), bucket,
    sourceKey, restoredKey, b2Key, b2VersionId: stored.VersionId,
    bytes: plain.length, plaintextSha256: sha256(plain), ciphertextSha256: sha256(ciphertext),
    publicReadStatus: publicResponse.status,
  };
} finally {
  const failures = [];
  if (sourceCreated) await removeStorage(sourceKey).catch((error) => failures.push(error.message));
  if (restoredCreated) await removeStorage(restoredKey).catch((error) => failures.push(error.message));
  b2.destroy();
  if (failures.length) throw new Error(`Synthetic cleanup incomplete: ${failures.join('; ')}`);
}
if (report) console.log(JSON.stringify(report, null, 2));
