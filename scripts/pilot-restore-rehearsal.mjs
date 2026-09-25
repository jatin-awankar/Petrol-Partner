import { createDecipheriv, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const attemptId = process.argv[2];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId ?? '')) throw new Error('Pass a backup attempt UUID');
if (process.env.TEST_DATABASE_DISPOSABLE !== 'true') throw new Error('Restore rehearsal requires an explicitly disposable database');
const target = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.hostname) || !decodeURIComponent(target.pathname).endsWith('_test')) throw new Error('Restore target must be a localhost _test database');
for (const name of ['PILOT_BACKUP_B2_ENDPOINT', 'PILOT_BACKUP_B2_BUCKET', 'PILOT_BACKUP_B2_KEY_ID', 'PILOT_BACKUP_B2_KEY', 'PILOT_BACKUP_B2_PREFIX', 'PILOT_BACKUP_ENCRYPTION_KEY']) if (!process.env[name]) throw new Error(`${name} is required`);
const endpoint = new URL(process.env.PILOT_BACKUP_B2_ENDPOINT);
if (endpoint.protocol !== 'https:' || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(endpoint.hostname)) throw new Error('Expected a Backblaze B2 HTTPS endpoint');
const prefix = process.env.PILOT_BACKUP_B2_PREFIX;
if (!/^[a-z0-9][a-z0-9/-]*[a-z0-9]$/.test(prefix) || prefix.includes('//')) throw new Error('Invalid backup prefix');
const key = Buffer.from(process.env.PILOT_BACKUP_ENCRYPTION_KEY, 'base64');
if (key.length !== 32) throw new Error('Invalid backup decryption key');
const s3 = new S3Client({ endpoint: endpoint.href, region: endpoint.hostname.split('.')[1], forcePathStyle: true, maxAttempts: 2, credentials: { accessKeyId: process.env.PILOT_BACKUP_B2_KEY_ID, secretAccessKey: process.env.PILOT_BACKUP_B2_KEY } });
const directory = await mkdtemp(join(tmpdir(), 'pilot-restore-'));
const started = Date.now();
const hashFile = async (path) => { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); };
const run = (binary, args) => new Promise((resolve, reject) => {
  const child = spawn(binary, args, { env: { ...process.env, PGHOST: target.hostname, PGPORT: target.port || '5432', PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGDATABASE: decodeURIComponent(target.pathname.slice(1)), PGCONNECT_TIMEOUT: '10' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (part) => { stderr = `${stderr}${part}`.slice(-2000); });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${binary} failed (${code}): ${stderr}`)));
});
try {
  const metadataResponse = await s3.send(new GetObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: `${prefix}/backups/${attemptId}.json` }));
  if (!metadataResponse.Body) throw new Error('Backup metadata is missing');
  const metadata = JSON.parse(await metadataResponse.Body.transformToString());
  if (metadata.format !== 1 || metadata.objectKey !== `${prefix}/backups/${attemptId}.enc` || !metadata.versionId) throw new Error('Backup metadata is invalid');
  const encrypted = join(directory, 'backup.enc');
  const object = await s3.send(new GetObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: metadata.objectKey, VersionId: metadata.versionId }));
  if (!object.Body) throw new Error('Backup object is missing');
  await pipeline(object.Body, createWriteStream(encrypted, { mode: 0o600 }));
  if (await hashFile(encrypted) !== metadata.ciphertextSha256) throw new Error('Encrypted backup checksum mismatch');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(metadata.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(metadata.tag, 'base64'));
  const archive = join(directory, 'backup.tar');
  await pipeline(createReadStream(encrypted), decipher, createWriteStream(archive, { mode: 0o600 }));
  await run('tar', ['-xf', archive, '-C', directory, 'database.dump', 'roles.sql']);
  if (await hashFile(join(directory, 'database.dump')) !== metadata.dumpSha256 || await hashFile(join(directory, 'roles.sql')) !== metadata.rolesSha256) throw new Error('Backup contents failed verification');
  await run('pg_restore', ['--list', join(directory, 'database.dump')]);
  await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-acl', '--dbname', decodeURIComponent(target.pathname.slice(1)), join(directory, 'database.dump')]);
  console.log(JSON.stringify({ attemptId, snapshotAt: metadata.snapshotAt, restoreElapsedSeconds: Math.ceil((Date.now() - started) / 1000), rolesExported: true, rolesApplied: false, writesRemainRestricted: true }));
} finally {
  s3.destroy();
  await rm(directory, { recursive: true, force: true });
}
