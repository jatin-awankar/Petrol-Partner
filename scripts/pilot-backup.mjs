import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

const required = ['PILOT_BACKUP_DATABASE_URL', 'PILOT_BACKUP_B2_ENDPOINT', 'PILOT_BACKUP_B2_BUCKET', 'PILOT_BACKUP_B2_KEY_ID', 'PILOT_BACKUP_B2_KEY', 'PILOT_BACKUP_B2_PREFIX', 'PILOT_BACKUP_ENCRYPTION_KEY'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);
if (process.env.PILOT_BACKUP_DATA_APPROVED !== 'true') throw new Error('An explicit synthetic or sanitized-data backup approval is required');
const endpoint = new URL(process.env.PILOT_BACKUP_B2_ENDPOINT);
if (endpoint.protocol !== 'https:' || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(endpoint.hostname)) throw new Error('Expected a Backblaze B2 HTTPS endpoint');
const prefix = process.env.PILOT_BACKUP_B2_PREFIX;
if (!/^[a-z0-9][a-z0-9/-]*[a-z0-9]$/.test(prefix) || prefix.includes('//')) throw new Error('Invalid backup prefix');
const key = Buffer.from(process.env.PILOT_BACKUP_ENCRYPTION_KEY, 'base64');
if (key.length !== 32) throw new Error('Backup encryption key must be 32 bytes encoded as base64');
const databaseUrl = process.env.PILOT_BACKUP_DATABASE_URL;
const database = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const s3 = new S3Client({ endpoint: endpoint.href, region: endpoint.hostname.split('.')[1], forcePathStyle: true, maxAttempts: 2, credentials: { accessKeyId: process.env.PILOT_BACKUP_B2_KEY_ID, secretAccessKey: process.env.PILOT_BACKUP_B2_KEY } });
const directory = await mkdtemp(join(tmpdir(), 'pilot-backup-'));
const attemptId = randomUUID();
let attemptRecorded = false;
let lockClient;

function run(binary, args, connection = databaseUrl) {
  return new Promise((resolve, reject) => {
    const target = new URL(connection);
    const child = spawn(binary, args, { env: {
      ...process.env,
      PGHOST: target.hostname, PGPORT: target.port || '5432',
      PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password),
      PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
      PGSSLMODE: target.searchParams.get('sslmode') ?? process.env.PGSSLMODE ?? 'prefer',
      PGCONNECT_TIMEOUT: '10',
    }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (part) => { stderr = `${stderr}${part}`.slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${binary} failed (${code}): ${stderr}`)));
  });
}

async function digestStream(stream) {
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

try {
  lockClient = await database.connect();
  const lock = await lockClient.query("SELECT pg_try_advisory_lock(hashtext('petrol-partner-pilot-backup')) AS acquired");
  if (!lock.rows[0].acquired) throw new Error('Another pilot backup is still running');
  await database.query(`INSERT INTO pilot_backup_attempts (id, status) VALUES ($1, 'running')`, [attemptId]);
  attemptRecorded = true;
  const snapshotAt = new Date();
  const dump = join(directory, 'database.dump');
  const roles = join(directory, 'roles.sql');
  await run('pg_dump', ['--format=custom', '--no-owner', '--file', dump]);
  await run('pg_dumpall', ['--globals-only', '--file', roles], process.env.PILOT_BACKUP_GLOBALS_DATABASE_URL ?? databaseUrl);
  const manifest = { format: 1, snapshotAt: snapshotAt.toISOString(), dumpSha256: await digestStream(createReadStream(dump)), rolesSha256: await digestStream(createReadStream(roles)), dumpBytes: (await stat(dump)).size, rolesBytes: (await stat(roles)).size };
  const archive = join(directory, 'backup.tar');
  await run('tar', ['-cf', archive, '-C', directory, 'database.dump', 'roles.sql']);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = join(directory, 'backup.enc');
  await pipeline(createReadStream(archive), cipher, createWriteStream(encrypted, { mode: 0o600 }));
  const objectKey = `${prefix}/backups/${attemptId}.enc`;
  const ciphertextSha256 = await digestStream(createReadStream(encrypted));
  const metadata = { ...manifest, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertextSha256, objectKey };
  const uploaded = await s3.send(new PutObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: objectKey, Body: createReadStream(encrypted), ContentLength: (await stat(encrypted)).size, ContentType: 'application/octet-stream', ServerSideEncryption: 'AES256' }));
  if (!uploaded.VersionId) throw new Error('Backup upload did not return a version ID');
  const readback = await s3.send(new GetObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: objectKey, VersionId: uploaded.VersionId }));
  if (!readback.Body || await digestStream(readback.Body) !== ciphertextSha256) throw new Error('Uploaded backup checksum mismatch');
  const metadataKey = `${prefix}/backups/${attemptId}.json`;
  const metadataBody = Buffer.from(JSON.stringify({ ...metadata, versionId: uploaded.VersionId }));
  const metadataUpload = await s3.send(new PutObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: metadataKey, Body: metadataBody, ContentType: 'application/json', ServerSideEncryption: 'AES256' }));
  if (!metadataUpload.VersionId) throw new Error('Backup metadata upload did not return a version ID');
  const metadataReadback = await s3.send(new GetObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: metadataKey, VersionId: metadataUpload.VersionId }));
  if (!metadataReadback.Body || await digestStream(metadataReadback.Body) !== createHash('sha256').update(metadataBody).digest('hex')) throw new Error('Uploaded backup metadata checksum mismatch');
  await database.query(`UPDATE pilot_backup_attempts SET status = 'complete', snapshot_at = $2, uploaded_at = now(), finished_at = now(), object_key = $3, ciphertext_sha256 = $4 WHERE id = $1`, [attemptId, snapshotAt, objectKey, ciphertextSha256]);
  console.log(JSON.stringify({ attemptId, snapshotAt: snapshotAt.toISOString(), objectKey, ciphertextSha256 }));
} catch (error) {
  if (attemptRecorded) await database.query(`UPDATE pilot_backup_attempts SET status = 'failed', finished_at = now(), error_code = $2 WHERE id = $1`, [attemptId, error.code ?? error.name ?? 'BACKUP_FAILED']).catch(() => undefined);
  throw error;
} finally {
  if (lockClient) {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext('petrol-partner-pilot-backup'))").catch(() => undefined);
    lockClient.release();
  }
  await database.end();
  s3.destroy();
  await rm(directory, { recursive: true, force: true });
}
