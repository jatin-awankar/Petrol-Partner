import type { Pool } from "pg";

export type ClaimedEmail = { id: string; event_id: string; attempts: number; email: string; title: string; body: string };

export async function claimDueEmail(database: Pool): Promise<ClaimedEmail | undefined> {
  await database.query(`INSERT INTO pilot_email_worker_state (singleton, last_seen_at) VALUES (true, now())
    ON CONFLICT (singleton) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const exhausted = await client.query<{ id: string; attempts: number }>(`UPDATE pilot_email_jobs
      SET status = 'exhausted', lease_until = NULL, updated_at = now()
      WHERE status = 'leased' AND lease_until <= now() AND attempts >= 5
      RETURNING id, attempts`);
    for (const job of exhausted.rows) {
      await client.query(`UPDATE pilot_email_attempts SET finished_at = now(), outcome = 'failed'
        WHERE job_id = $1 AND attempt = $2 AND finished_at IS NULL`, [job.id, job.attempts]);
    }
    const result = await client.query<ClaimedEmail>(
      `SELECT j.id, j.event_id, j.attempts, u.email, e.title, e.body
         FROM pilot_email_jobs j
         JOIN pilot_notification_events e ON e.id = j.event_id
         JOIN users u ON u.id = j.recipient_id
        WHERE ((j.status = 'pending' AND j.due_at <= now()) OR (j.status = 'leased' AND j.lease_until <= now()))
          AND j.attempts < 5 AND e.ready_at IS NOT NULL
        ORDER BY j.due_at, j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,
    );
    const job = result.rows[0];
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
        `INSERT INTO pilot_email_attempts (job_id, attempt, started_at) VALUES ($1, $2, now())`,
        [job.id, job.attempts + 1],
      );
    }
    await client.query("COMMIT");
    return job;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function finishEmailAttempt(database: Pool, job: ClaimedEmail, failure: string | null) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE pilot_email_jobs SET
         status = CASE WHEN $3::text IS NULL THEN 'sent' WHEN attempts >= 5 THEN 'exhausted' ELSE 'pending' END,
         lease_until = NULL, due_at = CASE WHEN $3::text IS NULL THEN due_at ELSE now() + (power(2, attempts - 1) * interval '1 minute') END,
         last_error = $3, sent_at = CASE WHEN $3::text IS NULL THEN now() ELSE sent_at END, updated_at = now()
       WHERE id = $1 AND status = 'leased' AND attempts = $2`, [job.id, job.attempts + 1, failure],
    );
    if (updated.rowCount) {
      await client.query(
        `UPDATE pilot_email_attempts SET finished_at = now(), outcome = CASE WHEN $3::text IS NULL THEN 'sent' ELSE 'failed' END
         WHERE id = (SELECT id FROM pilot_email_attempts WHERE job_id = $1 AND attempt = $2 AND finished_at IS NULL ORDER BY id DESC LIMIT 1)`,
        [job.id, job.attempts + 1, failure],
      );
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
