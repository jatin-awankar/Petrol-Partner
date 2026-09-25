import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { processDueEmail, type EmailMessage } from "./durable-email.job";
import { recordDurableNotification, markDurableNotificationReady } from "../../../api/src/modules/notifications/contract.repo";

const database = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const migrations = ["0001_init.sql", "0002_profile_settings.sql", "0003_chat.sql", "0004_acknowledgement_prototype.sql", "0005_managed_auth_identities.sql", "0006_operator_allowlist.sql", "0007_operator_pause.sql", "0008_operator_intent_handoff.sql", "0009_durable_notifications.sql", "0010_email_retry_operations.sql"];

beforeAll(async () => {
  for (const migration of migrations) await database.query(await readFile(resolve(import.meta.dirname, "../../../api/src/db/migrations", migration), "utf8"));
});
beforeEach(async () => {
  await database.query("TRUNCATE users CASCADE");
  await database.query("TRUNCATE pilot_email_attempts, pilot_email_jobs, pilot_notification_events, pilot_pause_operations CASCADE");
});
afterAll(async () => { await database.end(); });

async function seed(state: "committed" | "acknowledged" = "acknowledged") {
  const user = await database.query<{ id: string }>("INSERT INTO users (email, role) VALUES ('worker@example.test', 'admin') RETURNING id");
  const operation = await database.query<{ id: string }>(
    `INSERT INTO pilot_pause_operations (operator_id, idempotency_key, payload_digest, capability, paused, reason, state, committed_at)
     VALUES ($1, 'worker-test', 'digest', 'offers', true, 'Operator decision', $2, now()) RETURNING id`, [user.rows[0].id, state],
  );
  const event = await database.query<{ id: string }>(
    `INSERT INTO pilot_notification_events
       (id, origin_type, operation_id, recipient_id, event_type, related_entity_type, related_entity_id, title, body, ready_at)
     VALUES ($1, 'operator_pause', $1, $2, 'operator_pause_changed', 'pilot_pause_operation', $1,
             'Pilot operator decision', 'An operator changed pilot availability.', $3) RETURNING id`,
    [operation.rows[0].id, user.rows[0].id, state === "acknowledged" ? new Date() : null],
  );
  const job = await database.query<{ id: string }>("INSERT INTO pilot_email_jobs (event_id, recipient_id) VALUES ($1, $2) RETURNING id", [event.rows[0].id, user.rows[0].id]);
  return { operationId: operation.rows[0].id, jobId: job.rows[0].id, eventId: event.rows[0].id };
}

describe("durable email PostgreSQL worker", () => {
  it("delivers a ready event from another lifecycle origin without a pause operation", async () => {
    const user = await database.query<{ id: string }>("INSERT INTO users (email) VALUES ('future@example.test') RETURNING id");
    const eventId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await recordDurableNotification(client, {
        originType: "ride_acceptance", operationId, recipientId: user.rows[0].id,
        eventType: "seat_accepted", relatedEntityType: "ride_offer", relatedEntityId: crypto.randomUUID(),
        title: "Seat accepted", body: "Your request was accepted.", eventId,
      });
      await client.query("COMMIT");
    } finally { client.release(); }
    const sent: EmailMessage[] = [];
    expect(await processDueEmail(database, { async send(message) { sent.push(message); } })).toBe(false);
    await markDurableNotificationReady(database, eventId);
    expect(await processDueEmail(database, { async send(message) { sent.push(message); } })).toBe(true);
    expect(sent[0]).toMatchObject({ eventId, to: "future@example.test", subject: "Seat accepted" });
  });
  it("waits for recovery evidence and retries a failed send without repeating the business action", async () => {
    const seeded = await seed("committed");
    const delivered: EmailMessage[] = [];
    const adapter = { async send(message: EmailMessage) { delivered.push(message); if (delivered.length === 1) throw new Error("provider timeout with sensitive detail"); } };
    expect(await processDueEmail(database, adapter)).toBe(false);
    await database.query("UPDATE pilot_pause_operations SET state = 'acknowledged', acknowledged_at = now() WHERE id = $1", [seeded.operationId]);
    await database.query("UPDATE pilot_notification_events SET ready_at = now() WHERE operation_id = $1", [seeded.operationId]);
    expect(await processDueEmail(database, adapter)).toBe(true);
    const afterFailure = await database.query("SELECT status, attempts, last_error, due_at > now() AS backed_off FROM pilot_email_jobs WHERE id = $1", [seeded.jobId]);
    expect(afterFailure.rows).toEqual([{ status: "pending", attempts: 1, last_error: "provider timeout with sensitive detail", backed_off: true }]);
    await database.query("UPDATE pilot_email_jobs SET due_at = now() WHERE id = $1", [seeded.jobId]);
    expect(await processDueEmail(database, adapter)).toBe(true);
    expect(delivered.map((message) => message.eventId)).toEqual([seeded.eventId, seeded.eventId]);
    expect((await database.query("SELECT status, attempts FROM pilot_email_jobs WHERE id = $1", [seeded.jobId])).rows).toEqual([{ status: "sent", attempts: 2 }]);
    expect((await database.query("SELECT min(a.started_at) <= min(j.created_at) + interval '1 minute' AS timely FROM pilot_email_attempts a JOIN pilot_email_jobs j ON j.id = a.job_id WHERE j.id = $1", [seeded.jobId])).rows[0].timely).toBe(true);
    expect((await database.query("SELECT count(*)::int AS count FROM pilot_pause_operations WHERE id = $1", [seeded.operationId])).rows[0].count).toBe(1);
  });

  it("recovers an expired lease and leaves exhausted work visible", async () => {
    const seeded = await seed();
    await database.query("UPDATE pilot_email_jobs SET status = 'leased', attempts = 4, lease_until = now() - interval '1 second' WHERE id = $1", [seeded.jobId]);
    let calls = 0;
    expect(await processDueEmail(database, { async send() { calls++; throw new Error("timeout"); } })).toBe(true);
    expect(calls).toBe(1);
    expect((await database.query("SELECT status, attempts, lease_until FROM pilot_email_jobs WHERE id = $1", [seeded.jobId])).rows).toEqual([{ status: "exhausted", attempts: 5, lease_until: null }]);
    expect(await processDueEmail(database, { async send() { calls++; } })).toBe(false);
  });

  it("closes the final attempt when its lease expires", async () => {
    const seeded = await seed();
    await database.query("UPDATE pilot_email_jobs SET status = 'leased', attempts = 5, lease_until = now() - interval '1 second' WHERE id = $1", [seeded.jobId]);
    await database.query("INSERT INTO pilot_email_attempts (job_id, attempt, started_at) VALUES ($1, 5, now() - interval '1 minute')", [seeded.jobId]);
    expect(await processDueEmail(database, { async send() { throw new Error("unexpected send"); } })).toBe(false);
    const result = await database.query("SELECT j.status, a.outcome, a.finished_at IS NOT NULL AS finished FROM pilot_email_jobs j JOIN pilot_email_attempts a ON a.job_id = j.id WHERE j.id = $1", [seeded.jobId]);
    expect(result.rows).toEqual([{ status: "exhausted", outcome: "failed", finished: true }]);
  });
});
