import type { Pool } from "pg";
import { pool } from "../db/pool";

export type EmailMessage = { eventId: string; to: string; subject: string; body: string };
export type EmailAdapter = { send(message: EmailMessage): Promise<void> };
type Claimed = { id: string; event_id: string; attempts: number; email: string; capability: string; paused: boolean };

export function configuredEmailAdapter(): EmailAdapter {
  return { async send(message) {
    const endpoint = process.env.PILOT_EMAIL_ENDPOINT;
    const token = process.env.PILOT_EMAIL_TOKEN;
    if (!endpoint || !token) throw new Error("Email provider is not configured");
    if (new URL(endpoint).protocol !== "https:") throw new Error("Email provider endpoint must use HTTPS");
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": message.eventId },
      body: JSON.stringify(message), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  } };
}

export async function processDueEmail(database: Pool = pool, adapter: EmailAdapter = configuredEmailAdapter()): Promise<boolean> {
  await database.query(`INSERT INTO pilot_email_worker_state (singleton, last_seen_at) VALUES (true, now())
    ON CONFLICT (singleton) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`);
  await database.query(`UPDATE pilot_email_jobs SET status = 'exhausted', lease_until = NULL, updated_at = now()
    WHERE status = 'leased' AND lease_until <= now() AND attempts >= 5`);
  const client = await database.connect();
  let job: Claimed | undefined;
  try {
    await client.query("BEGIN");
    const result = await client.query<Claimed>(
      `SELECT j.id, j.event_id, j.attempts, u.email, o.capability, o.paused
         FROM pilot_email_jobs j
         JOIN pilot_notification_events e ON e.id = j.event_id
         JOIN pilot_pause_operations o ON o.id = e.operation_id
         JOIN users u ON u.id = j.recipient_id
        WHERE ((j.status = 'pending' AND j.due_at <= now()) OR (j.status = 'leased' AND j.lease_until <= now()))
          AND j.attempts < 5
          AND o.state IN ('acknowledged', 'recovered')
        ORDER BY j.due_at, j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,
    );
    job = result.rows[0];
    if (job) {
      await client.query(
        `UPDATE pilot_email_attempts SET finished_at = now(), outcome = 'failed'
         WHERE job_id = $1 AND attempt = $2 AND finished_at IS NULL`, [job.id, job.attempts],
      );
      await client.query(
        `UPDATE pilot_email_jobs SET status = 'leased', attempts = attempts + 1,
           lease_until = now() + interval '30 seconds', last_attempt_at = now(), updated_at = now()
         WHERE id = $1`, [job.id],
      );
      await client.query(
        `INSERT INTO pilot_email_attempts (job_id, attempt, started_at) VALUES ($1, $2, now())
         `, [job.id, job.attempts + 1],
      );
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  if (!job) return false;

  // Provider results can be ambiguous after a timeout. The stable event ID and
  // duplicate-safe copy allow a recipient to recognize a repeated email.
  const message: EmailMessage = {
    eventId: job.event_id, to: job.email,
    subject: "Petrol Partner pilot operator decision",
    body: `Operator decision for ${job.capability}: ${job.paused ? "paused" : "resumed"}. Reference ${job.event_id}. If this email repeats, it is the same decision.`,
  };
  let failure: string | null = null;
  try { await adapter.send(message); }
  catch (error) { failure = error instanceof Error ? error.message.slice(0, 500) : "Unknown provider failure"; }

  // A stale sender must not overwrite a newer lease after restart.
  await database.query(
    `UPDATE pilot_email_jobs SET
       status = CASE WHEN $3::text IS NULL THEN 'sent' WHEN attempts >= 5 THEN 'exhausted' ELSE 'pending' END,
       lease_until = NULL, due_at = CASE WHEN $3::text IS NULL THEN due_at ELSE now() + (power(2, attempts - 1) * interval '1 minute') END,
       last_error = $3, sent_at = CASE WHEN $3::text IS NULL THEN now() ELSE sent_at END, updated_at = now()
     WHERE id = $1 AND status = 'leased' AND attempts = $2`, [job.id, job.attempts + 1, failure],
  );
  await database.query(
    `UPDATE pilot_email_attempts SET finished_at = now(), outcome = CASE WHEN $3::text IS NULL THEN 'sent' ELSE 'failed' END
     WHERE id = (SELECT id FROM pilot_email_attempts WHERE job_id = $1 AND attempt = $2 AND finished_at IS NULL ORDER BY id DESC LIMIT 1)`, [job.id, job.attempts + 1, failure],
  );
  return true;
}
