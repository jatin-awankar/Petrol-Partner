import type { Pool, PoolClient } from "pg";
import { pool } from "../../db/pool";
import { markDurableNotificationReady, recordDurableNotification } from "./contract.repo";

type Database = Pool | PoolClient;

// Called inside the same transaction as the pause state and audit.
export async function recordPauseNotification(database: Database, operationId: string, recipientId: string, capability: string, paused: boolean) {
  await recordDurableNotification(database, {
    eventId: operationId, originType: "operator_pause", operationId, recipientId,
    eventType: "operator_pause_changed", relatedEntityType: "pilot_pause_operation", relatedEntityId: operationId,
    title: "Pilot operator decision", body: `${capability[0].toUpperCase()}${capability.slice(1)} were ${paused ? "paused" : "resumed"} by an operator.`,
  });
}

export async function markPauseNotificationReady(database: Database, operationId: string) {
  await markDurableNotificationReady(database, operationId);
}

// A restored receipt proves the decision, not whether an external email was already sent.
// Leave any restored job visible for manual review and never queue a second send.
export async function restorePauseNotificationWithoutDelivery(database: Database, operationId: string, recipientId: string, capability: string, paused: boolean) {
  await database.query(
    `INSERT INTO pilot_notification_events
       (id, origin_type, operation_id, recipient_id, event_type, related_entity_type,
        related_entity_id, title, body, ready_at)
     VALUES ($1, 'operator_pause', $1, $2, 'operator_pause_changed',
             'pilot_pause_operation', $1, 'Pilot operator decision', $3, now())
     ON CONFLICT (id) DO UPDATE SET ready_at = COALESCE(pilot_notification_events.ready_at, now())`,
    [operationId, recipientId, `${capability[0].toUpperCase()}${capability.slice(1)} were ${paused ? "paused" : "resumed"} by an operator.`],
  );
  await database.query(
    `UPDATE pilot_email_jobs SET status = 'exhausted', lease_until = NULL,
            last_error = 'Suppressed after snapshot restore; external delivery outcome requires review', updated_at = now()
      WHERE event_id = $1 AND status <> 'sent'`,
    [operationId],
  );
}

export async function listDurableNotifications(recipientId: string, database: Database = pool) {
  const result = await database.query(
    `SELECT e.id, e.event_type, e.related_entity_type, e.related_entity_id,
            e.title, e.body, e.created_at, e.ready_at
       FROM pilot_notification_events e
      WHERE e.recipient_id = $1 AND e.ready_at IS NOT NULL
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

export async function emailJobForUpdate(client: PoolClient, jobId: string) {
  const result = await client.query<{ status: string }>("SELECT status FROM pilot_email_jobs WHERE id = $1 FOR UPDATE", [jobId]);
  return result.rows[0];
}

export async function emailRetryByKey(client: PoolClient, operatorId: string, key: string) {
  const result = await client.query<{ job_id: string }>(
    "SELECT job_id FROM pilot_email_retry_operations WHERE operator_id = $1 AND idempotency_key = $2", [operatorId, key],
  );
  return result.rows[0];
}

export async function recordEmailRetry(client: PoolClient, operatorId: string, key: string, jobId: string) {
  await client.query(
    "INSERT INTO pilot_email_retry_operations (operator_id, idempotency_key, job_id) VALUES ($1, $2, $3)",
    [operatorId, key, jobId],
  );
}

export async function resetEmailJob(client: PoolClient, jobId: string) {
  await client.query("UPDATE pilot_email_jobs SET status = 'pending', attempts = 0, due_at = now(), last_error = NULL, updated_at = now() WHERE id = $1", [jobId]);
}

export async function recordEmailRetryAudit(client: PoolClient, operatorId: string, jobId: string) {
  await client.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'email_retry', 'pilot_email_job', $2)", [operatorId, jobId]);
}
