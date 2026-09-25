import { createDecipheriv } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { backupStorageConfig, runPgCommand, sha256File } from './pilot-backup-common.mjs';

const attemptId = process.argv[2];
const fenceOnly = attemptId === '--fence-only';
if (!fenceOnly && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId ?? '')) throw new Error('Pass a backup attempt UUID');
if (process.env.TEST_DATABASE_DISPOSABLE !== 'true') throw new Error('Restore rehearsal requires an explicitly disposable database');
const target = new URL(process.env.DATABASE_URL ?? '');
const targetName = decodeURIComponent(target.pathname.slice(1));
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.hostname) || !/^[a-z][a-z0-9_]*_test$/.test(targetName)) throw new Error('Restore target must be a localhost _test database');
const storage = fenceOnly ? null : backupStorageConfig();
const { prefix, key, client: s3 } = storage ?? {};
const directory = await mkdtemp(join(tmpdir(), 'pilot-restore-'));
const started = Date.now();
const run = (binary, args) => runPgCommand(binary, args, target.href, { PGOPTIONS: '-c default_transaction_read_only=off' });
try {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const inventory = await database.query(`SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) AS relations,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public') AS routines`);
    if (inventory.rows[0].relations !== 0 || inventory.rows[0].routines !== 0) throw new Error('Restore target contains user objects; use a newly created empty disposable database');
  } finally { await database.end(); }
  const fence = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await fence.connect();
    await fence.query(`ALTER DATABASE ${targetName} SET default_transaction_read_only = on`);
  } finally { await fence.end(); }
  if (fenceOnly) {
    console.log(JSON.stringify({ target: targetName, newConnectionsReadOnly: true }));
  } else {
    const metadataResponse = await s3.send(new GetObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: `${prefix}/backups/${attemptId}.json` }));
    if (!metadataResponse.Body) throw new Error('Backup metadata is missing');
    const metadata = JSON.parse(await metadataResponse.Body.transformToString());
    if (metadata.format !== 1 || metadata.objectKey !== `${prefix}/backups/${attemptId}.enc` || !metadata.versionId) throw new Error('Backup metadata is invalid');
    const encrypted = join(directory, 'backup.enc');
    const object = await s3.send(new GetObjectCommand({ Bucket: process.env.PILOT_BACKUP_B2_BUCKET, Key: metadata.objectKey, VersionId: metadata.versionId }));
    if (!object.Body) throw new Error('Backup object is missing');
    await pipeline(object.Body, createWriteStream(encrypted, { mode: 0o600 }));
    if (await sha256File(encrypted) !== metadata.ciphertextSha256) throw new Error('Encrypted backup checksum mismatch');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(metadata.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(metadata.tag, 'base64'));
    const archive = join(directory, 'backup.tar');
    await pipeline(createReadStream(encrypted), decipher, createWriteStream(archive, { mode: 0o600 }));
    await run('tar', ['-xf', archive, '-C', directory, 'database.dump', 'roles.sql']);
    if (await sha256File(join(directory, 'database.dump')) !== metadata.dumpSha256 || await sha256File(join(directory, 'roles.sql')) !== metadata.rolesSha256) throw new Error('Backup contents failed verification');
    await run('pg_restore', ['--list', join(directory, 'database.dump')]);
    await run('pg_restore', ['--no-owner', '--no-acl', '--dbname', decodeURIComponent(target.pathname.slice(1)), join(directory, 'database.dump')]);
    const recovery = new pg.Client({ connectionString: process.env.DATABASE_URL, options: '-c default_transaction_read_only=off' });
    try {
      await recovery.connect();
      await recovery.query(`UPDATE pilot_recovery_state SET mode = 'restricted', cause = 'backup_restore', started_at = now(), reconciled_at = NULL WHERE singleton = true`);
    } finally { await recovery.end(); }
    console.log(JSON.stringify({ attemptId, snapshotAt: metadata.snapshotAt, restoreElapsedSeconds: Math.ceil((Date.now() - started) / 1000), rolesExported: true, rolesApplied: false, writesRemainRestricted: true }));
  }
} finally {
  s3?.destroy();
  await rm(directory, { recursive: true, force: true });
}
