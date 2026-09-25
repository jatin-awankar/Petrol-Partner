import type { Pool } from "pg";
import { pool } from "../db/pool";
import { claimDueEmail, finishEmailAttempt } from "./durable-email.repo";

export type EmailMessage = { eventId: string; to: string; subject: string; body: string };
export type EmailAdapter = { send(message: EmailMessage): Promise<void> };

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
  const job = await claimDueEmail(database);
  if (!job) return false;
  // A timeout can be ambiguous. The event ID and copy identify a duplicate.
  const message: EmailMessage = {
    eventId: job.event_id, to: job.email, subject: job.title,
    body: `${job.body} Reference ${job.event_id}. If this email repeats, it is the same event.`,
  };
  let failure: string | null = null;
  try { await adapter.send(message); }
  catch (error) { failure = error instanceof Error ? error.message.slice(0, 500) : "Unknown provider failure"; }
  await finishEmailAttempt(database, job, failure);
  return true;
}
