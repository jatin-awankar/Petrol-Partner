import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { S3Client } from '@aws-sdk/client-s3';

export function backupStorageConfig(environment = process.env) {
  for (const name of ['PILOT_BACKUP_B2_ENDPOINT', 'PILOT_BACKUP_B2_BUCKET', 'PILOT_BACKUP_B2_KEY_ID', 'PILOT_BACKUP_B2_KEY', 'PILOT_BACKUP_B2_PREFIX', 'PILOT_BACKUP_ENCRYPTION_KEY']) {
    if (!environment[name]) throw new Error(`${name} is required`);
  }
  const endpoint = new URL(environment.PILOT_BACKUP_B2_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(endpoint.hostname)) throw new Error('Expected a Backblaze B2 HTTPS endpoint');
  const prefix = environment.PILOT_BACKUP_B2_PREFIX;
  if (!/^[a-z0-9][a-z0-9/-]*[a-z0-9]$/.test(prefix) || prefix.includes('//')) throw new Error('Invalid backup prefix');
  const key = Buffer.from(environment.PILOT_BACKUP_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('Backup encryption key must be 32 bytes encoded as base64');
  const client = new S3Client({ endpoint: endpoint.href, region: endpoint.hostname.split('.')[1], forcePathStyle: true, maxAttempts: 2,
    credentials: { accessKeyId: environment.PILOT_BACKUP_B2_KEY_ID, secretAccessKey: environment.PILOT_BACKUP_B2_KEY } });
  return { prefix, key, client };
}

export function runPgCommand(binary, args, connection, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(connection);
    const child = spawn(binary, args, { env: {
      ...process.env,
      PGHOST: target.hostname, PGPORT: target.port || '5432',
      PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password),
      PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
      PGSSLMODE: target.searchParams.get('sslmode') ?? process.env.PGSSLMODE ?? 'prefer',
      PGCONNECT_TIMEOUT: '10', ...extraEnvironment,
    }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (part) => { stderr = `${stderr}${part}`.slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${binary} failed (${code}): ${stderr}`)));
  });
}

export async function sha256Stream(stream) {
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

export function sha256File(path) {
  return sha256Stream(createReadStream(path));
}
