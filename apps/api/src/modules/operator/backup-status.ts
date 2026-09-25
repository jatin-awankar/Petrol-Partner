import type { Pool, PoolClient } from "pg";
import { env } from "../../config/env";
import { pool } from "../../db/pool";

const maximumSnapshotAgeMs = 50 * 60 * 1000;

type Attempt = {
  id: string;
  status: "running" | "complete" | "failed";
  started_at: Date;
  snapshot_at: Date | null;
  uploaded_at: Date | null;
  finished_at: Date | null;
  object_key: string | null;
  ciphertext_sha256: string | null;
  error_code: string | null;
};

export async function backupStatus(database: Pool | PoolClient = pool, now = new Date()) {
  const [completed, attempts] = await Promise.all([
    database.query<Attempt>(
      `SELECT id, status, started_at, snapshot_at, uploaded_at, finished_at,
              object_key, ciphertext_sha256, error_code
         FROM pilot_backup_attempts WHERE status = 'complete'
        ORDER BY snapshot_at DESC LIMIT 1`,
    ),
    database.query<Attempt>(
      `SELECT id, status, started_at, snapshot_at, uploaded_at, finished_at,
              object_key, ciphertext_sha256, error_code
         FROM pilot_backup_attempts WHERE status <> 'complete'
        ORDER BY started_at DESC LIMIT 20`,
    ),
  ]);
  const latest = completed.rows[0];
  const ageMs = latest?.snapshot_at ? now.getTime() - latest.snapshot_at.getTime() : null;
  return {
    required: env.NODE_ENV === "production" || process.env.PILOT_BACKUP_REQUIRED === "true",
    healthy: ageMs !== null && ageMs >= 0 && ageMs <= maximumSnapshotAgeMs,
    maximumAgeMinutes: 50,
    ageMinutes: ageMs === null ? null : Math.floor(ageMs / 60000),
    latest: latest ?? null,
    failedAttempts: attempts.rows.filter((row) => row.status === "failed"),
    runningAttempts: attempts.rows.filter((row) => row.status === "running"),
  };
}
