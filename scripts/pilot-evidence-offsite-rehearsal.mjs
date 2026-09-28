import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import https from 'node:https';
import { isIP } from 'node:net';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
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
async function storageRequest(method, path, { body, contentType, auth = true } = {}) {
  const target = new URL(path, url);
  if (target.origin !== new URL(url).origin) throw new Error('Unexpected Storage request origin');
  const bytes = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const outgoing = https.request(target, {
      method,
      autoSelectFamily: false,
      headers: {
        ...(auth ? { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } : {}),
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(bytes ? { 'Content-Length': bytes.length } : {}),
      },
      ...(dnsIp ? { lookup: (_hostname, _options, done) => done(null, dnsIp, 4) } : {}),
    }, (incoming) => {
      const chunks = [];
      incoming.on('data', (part) => chunks.push(part));
      incoming.on('error', reject);
      incoming.on('end', () => resolve({ status: incoming.statusCode, bytes: Buffer.concat(chunks) }));
    });
    outgoing.on('error', reject);
    outgoing.end(bytes);
  });
}
function storageJson(response, step) {
  try { return JSON.parse(response.bytes.toString('utf8')); }
  catch { throw new Error(`${step} returned non-JSON HTTP ${response.status}`); }
}
function expectStatus(response, wanted, step) {
  if (response.status !== wanted) throw new Error(`${step} returned HTTP ${response.status}, expected ${wanted}`);
}
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
  const response = await storageRequest('GET', `/storage/v1/object/${bucket}/${path}`);
  expectStatus(response, 200, 'Supabase download');
  return response.bytes;
}

async function removeStorage(path) {
  const response = await storageRequest('DELETE', `/storage/v1/object/${bucket}`, {
    body: { prefixes: [path] }, contentType: 'application/json',
  });
  expectStatus(response, 200, `Exact synthetic deletion ${path}`);
  if (storageJson(response, 'Synthetic deletion').length !== 1) {
    throw new Error(`Synthetic deletion did not report exactly one object: ${path}`);
  }
}

try {
  const bucketResponse = await storageRequest('GET', `/storage/v1/bucket/${bucket}`);
  expectStatus(bucketResponse, 200, 'Private staging bucket inventory');
  const bucketInfo = storageJson(bucketResponse, 'Bucket inventory');
  if (bucketInfo.public !== false) throw new Error('Staging bucket must be private');

  const uploaded = await storageRequest('POST', `/storage/v1/object/${bucket}/${sourceKey}`, {
    body: plain, contentType: 'application/pdf',
  });
  expectStatus(uploaded, 200, 'Synthetic source upload');
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
  const missing = await storageRequest('GET', `/storage/v1/object/info/${bucket}/${sourceKey}`);
  if (missing.status === 200) throw new Error('Source metadata remained readable after deletion');
  const restored = await storageRequest('POST', `/storage/v1/object/${bucket}/${restoredKey}`, {
    body: recoveredPlain, contentType: recovered.Metadata.contenttype,
  });
  expectStatus(restored, 200, 'Isolated restore');
  restoredCreated = true;
  if (!(await readStorage(restoredKey)).equals(plain)) throw new Error('Restored Supabase bytes mismatch');
  const publicResponse = await storageRequest('GET', `/storage/v1/object/public/${bucket}/${restoredKey}`, { auth: false });
  if (publicResponse.status === 200) throw new Error('Restored object is publicly readable');

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
