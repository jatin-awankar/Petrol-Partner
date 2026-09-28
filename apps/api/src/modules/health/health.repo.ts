import { dbQuery } from "../../db/pool";

export async function databaseConnected() {
  try { await dbQuery("SELECT 1"); return true; }
  catch { return false; }
}

export async function lastWorkerSeen() {
  const result = await dbQuery<{last_seen_at: Date | null}>(
    "SELECT last_seen_at FROM pilot_email_worker_state WHERE singleton = true");
  return result.rows[0]?.last_seen_at ?? null;
}

export async function recoveryMode() {
  const result = await dbQuery<{mode: string}>(
    "SELECT mode FROM pilot_recovery_state WHERE singleton = true");
  return result.rows[0]?.mode ?? "unknown";
}
