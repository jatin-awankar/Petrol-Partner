import type { Pool, PoolClient } from "pg";

export type BackupAttempt = {
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

export async function readBackupAttempts(database: Pool | PoolClient) {
  const completed = await database.query<BackupAttempt>(
    `SELECT id, status, started_at, snapshot_at, uploaded_at, finished_at,
            object_key, ciphertext_sha256, error_code
       FROM pilot_backup_attempts WHERE status = 'complete'
      ORDER BY snapshot_at DESC LIMIT 1`,
  );
  const attempts = await database.query<BackupAttempt>(
    `SELECT id, status, started_at, snapshot_at, uploaded_at, finished_at,
            object_key, ciphertext_sha256, error_code
       FROM pilot_backup_attempts WHERE status <> 'complete'
      ORDER BY started_at DESC LIMIT 20`,
  );
  return { latest: completed.rows[0] ?? null, attempts: attempts.rows };
}
