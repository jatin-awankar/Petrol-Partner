import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { backupStorageConfig, runPgCommand, sha256File, sha256Stream } from './pilot-backup-common.mjs';

if (!process.env.PILOT_BACKUP_DATABASE_URL) throw new Error('PILOT_BACKUP_DATABASE_URL is required');
if (process.env.PILOT_BACKUP_DATA_APPROVED !== 'true') throw new Error('An explicit synthetic or sanitized-data backup approval is required');
const { prefix, key, client: s3 } = backupStorageConfig();
const databaseUrl = process.env.PILOT_BACKUP_DATABASE_URL;
const database = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const directory = await mkdtemp(join(tmpdir(), 'pilot-backup-'));
const attemptId = randomUUID();
let attemptRecorded = false;
let lockClient;

try {
  lockClient = await database.connect();
  const lock = await lockClient.query("SELECT pg_try_advisory_lock(hashtext('petrol-partner-pilot-backup')) AS acquired");
  if (!lock.rows[0].acquired) {
    await database.query(`INSERT INTO pilot_backup_attempts (id, status, finished_at, error_code)
      VALUES ($1, 'failed', now(), 'BACKUP_OVERLAP')`, [attemptId]);
    throw new Error('Another pilot backup is still running');
  }
  await database.query(`INSERT INTO pilot_backup_attempts (id, status) VALUES ($1, 'running')`, [attemptId]);
  attemptRecorded = true;
  const snapshotAt = new Date();
  const dump = join(directory, 'database.dump');
  const roles = join(directory, 'roles.sql');
  await runPgCommand('pg_dump', ['--format=custom', '--no-owner', '--file', dump], databaseUrl);
  await runPgCommand('pg_dumpall', ['--globals-only', '--file', roles], process.env.PILOT_BACKUP_GLOBALS_DATABASE_URL ?? databaseUrl);
  const manifest = { format: 1, snapshotAt: snapshotAt.toISOString(), dumpSha256: await sha256File(dump), rolesSha256: await sha256File(roles), dumpBytes: (await stat(dump)).size, rolesBytes: (await stat(roles)).size };
  const archive = join(directory, 'backup.tar');
  await runPgCommand('tar', ['-cf', archive, '-C', directory, 'database.dump', 'roles.sql'], databaseUrl);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = join(directory, 'backup.enc');
  await pipeline(createReadStream(archive), cipher, createWriteStream(encrypted, { mode: 0o600 }));
  const objectKey = `${prefix}/backups/${attemptId}.enc`;
  const ciphertextSha256 = await sha256File(encrypted);
  const metadata = { ...manifest, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertextSha256, objectKey };
  const uploaded = await s3.send(new PutObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: objectKey, Body: createReadStream(encrypted), ContentLength: (await stat(encrypted)).size, ContentType: 'application/octet-stream', ServerSideEncryption: 'AES256' }));
  if (!uploaded.VersionId) throw new Error('Backup upload did not return a version ID');
  const readback = await s3.send(new GetObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: objectKey, VersionId: uploaded.VersionId }));
  if (!readback.Body || await sha256Stream(readback.Body) !== ciphertextSha256) throw new Error('Uploaded backup checksum mismatch');
  const metadataKey = `${prefix}/backups/${attemptId}.json`;
  const metadataBody = Buffer.from(JSON.stringify({ ...metadata, versionId: uploaded.VersionId }));
  const metadataUpload = await s3.send(new PutObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: metadataKey, Body: metadataBody, ContentType: 'application/json', ServerSideEncryption: 'AES256' }));
  if (!metadataUpload.VersionId) throw new Error('Backup metadata upload did not return a version ID');
  const metadataReadback = await s3.send(new GetObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: metadataKey, VersionId: metadataUpload.VersionId }));
  if (!metadataReadback.Body || await sha256Stream(metadataReadback.Body) !== await sha256Stream([metadataBody])) throw new Error('Uploaded backup metadata checksum mismatch');
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
