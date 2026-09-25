import type { Pool, PoolClient } from "pg";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";

type Database = Pool | PoolClient;

// Called inside the same transaction as the pause state and audit.
export async function recordPauseNotification(database: Database, operationId: string, recipientId: string) {
  const event = await database.query<{ id: string }>(
    `INSERT INTO pilot_notification_events (id, operation_id, recipient_id, event_type, related_entity_id)
     VALUES ($1, $1, $2, 'operator_pause_changed', $1)
     ON CONFLICT (operation_id) DO UPDATE SET operation_id = EXCLUDED.operation_id RETURNING id`,
    [operationId, recipientId],
  );
  await database.query(
    `INSERT INTO pilot_email_jobs (event_id, recipient_id) VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING`,
    [event.rows[0].id, recipientId],
  );
}

export async function listDurableNotifications(recipientId: string, database: Database = pool) {
  const result = await database.query(
    `SELECT e.id, e.event_type, e.related_entity_id, e.created_at,
            o.capability, o.paused, o.acknowledged_at
       FROM pilot_notification_events e
       JOIN pilot_pause_operations o ON o.id = e.operation_id
      WHERE e.recipient_id = $1 AND o.state IN ('acknowledged', 'recovered')
      ORDER BY e.created_at DESC LIMIT 100`, [recipientId],
  );
  return result.rows;
}

export async function operatorDeliveryStatus(database: Database = pool) {
  const [jobs, health, worker] = await Promise.all([
    database.query(
      `SELECT j.id, j.event_id, j.status, j.attempts, j.due_at, j.lease_until,
              j.last_attempt_at, j.sent_at, j.created_at, j.updated_at,
              CASE WHEN j.last_error IS NULL THEN NULL ELSE 'Email delivery failed; provider details redacted' END AS last_error,
              e.operation_id, e.recipient_id,
              (SELECT count(*)::int FROM pilot_email_attempts a WHERE a.job_id = j.id) AS attempt_count,
              COALESCE((SELECT json_agg(json_build_object('attempt', a.attempt, 'started_at', a.started_at,
                'finished_at', a.finished_at, 'outcome', a.outcome) ORDER BY a.id)
                FROM pilot_email_attempts a WHERE a.job_id = j.id), '[]'::json) AS attempt_history
         FROM pilot_email_jobs j JOIN pilot_notification_events e ON e.id = j.event_id
        ORDER BY j.created_at DESC LIMIT 100`,
    ),
    database.query(
      `SELECT count(*) FILTER (WHERE j.status = 'pending' AND j.due_at <= now())::int AS due,
              count(*) FILTER (WHERE j.status = 'exhausted')::int AS exhausted,
              count(*) FILTER (WHERE j.status = 'leased' AND j.lease_until < now())::int AS expired_leases,
              count(*) FILTER (WHERE j.status IN ('pending', 'leased') AND j.created_at < now() - interval '5 minutes')::int AS stalled,
              min(j.created_at) FILTER (WHERE j.status IN ('pending', 'leased')) AS oldest_open_at,
              max(j.last_attempt_at) AS last_attempt_at
         FROM pilot_email_jobs j`,
    ),
    database.query("SELECT last_seen_at FROM pilot_email_worker_state WHERE singleton = true"),
  ]);
  return { jobs: jobs.rows, health: { ...health.rows[0], last_worker_seen_at: worker.rows[0]?.last_seen_at ?? null } };
}

export async function retryEmailJob(database: Pool, jobId: string, operatorId: string) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const operator = await client.query(
      `SELECT 1 FROM users u JOIN operator_allowlist a ON a.user_id = u.id
       WHERE u.id = $1 AND u.role = 'admin' AND u.status = 'active' AND a.active FOR SHARE OF u, a`, [operatorId],
    );
    if (!operator.rowCount) throw new AppError(403, "Operator access has been revoked", "OPERATOR_ACCESS_REVOKED");
    const job = await client.query<{ status: string }>("SELECT status FROM pilot_email_jobs WHERE id = $1 FOR UPDATE", [jobId]);
    if (!job.rowCount) throw new AppError(404, "Email job not found", "EMAIL_JOB_NOT_FOUND");
    if (job.rows[0].status !== "exhausted") throw new AppError(409, "Only exhausted email can be retried", "EMAIL_RETRY_CONFLICT");
    await client.query("UPDATE pilot_email_jobs SET status = 'pending', attempts = 0, due_at = now(), last_error = NULL, updated_at = now() WHERE id = $1", [jobId]);
    await client.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'email_retry', 'pilot_email_job', $2)", [operatorId, jobId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
