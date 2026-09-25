import type { Pool, PoolClient } from "pg";
import { createHash } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { readBackupAttempts, type BackupAttempt } from "./backup.repo";

const maximumSnapshotAgeMs = 50 * 60 * 1000;

type BackupObjectProbe = (attempt: BackupAttempt) => Promise<boolean>;
let testProbe: BackupObjectProbe | null = null;

export function setBackupObjectProbeForTests(probe: BackupObjectProbe | null) {
  if (env.NODE_ENV !== "test") throw new Error("Backup object probe override is test-only");
  testProbe = probe;
}

async function probeBackupObject(attempt: BackupAttempt): Promise<boolean> {
  if (testProbe) return testProbe(attempt);
  const { PILOT_BACKUP_B2_ENDPOINT: endpoint, PILOT_BACKUP_B2_BUCKET: bucket,
    PILOT_BACKUP_B2_KEY_ID: keyId, PILOT_BACKUP_B2_KEY: applicationKey } = process.env;
  if (!endpoint || !bucket || !keyId || !applicationKey || !attempt.object_key || !attempt.ciphertext_sha256) return false;
  let client: S3Client | undefined;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(url.hostname) ||
        !attempt.object_key.endsWith(".enc")) return false;
    client = new S3Client({ endpoint, region: url.hostname.split(".")[1], forcePathStyle: true, maxAttempts: 2,
      credentials: { accessKeyId: keyId, secretAccessKey: applicationKey } });
    const metadata = await client.send(new GetObjectCommand({ Bucket: bucket, Key: attempt.object_key.replace(/\.enc$/, ".json") }),
      { abortSignal: AbortSignal.timeout(10000) });
    if (!metadata.Body) return false;
    const metadataBytes = await metadata.Body.transformToByteArray();
    if (metadataBytes.length > 65536) return false;
    const manifest = JSON.parse(Buffer.from(metadataBytes).toString("utf8"));
    if (manifest.format !== 1 || manifest.objectKey !== attempt.object_key ||
        manifest.ciphertextSha256 !== attempt.ciphertext_sha256 || !manifest.versionId) return false;
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: attempt.object_key, VersionId: manifest.versionId }),
      { abortSignal: AbortSignal.timeout(10000) });
    if (!object.Body || !(Symbol.asyncIterator in object.Body)) return false;
    const hash = createHash("sha256");
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) hash.update(chunk);
    return hash.digest("hex") === attempt.ciphertext_sha256;
  } catch { return false; }
  finally { client?.destroy(); }
}

export async function backupStatus(database: Pool | PoolClient = pool, now = new Date()) {
  const { latest, attempts } = await readBackupAttempts(database);
  const ageMs = latest?.snapshot_at ? now.getTime() - latest.snapshot_at.getTime() : null;
  const fresh = ageMs !== null && ageMs >= 0 && ageMs <= maximumSnapshotAgeMs;
  const objectVerified = fresh && latest ? await probeBackupObject(latest) : false;
  return {
    required: env.NODE_ENV === "production" || process.env.PILOT_BACKUP_REQUIRED === "true",
    healthy: fresh && objectVerified,
    objectVerified,
    maximumAgeMinutes: 50,
    ageMinutes: ageMs === null ? null : Math.floor(ageMs / 60000),
    latest: latest ?? null,
    failedAttempts: attempts.filter((row) => row.status === "failed"),
    runningAttempts: attempts.filter((row) => row.status === "running"),
  };
}
