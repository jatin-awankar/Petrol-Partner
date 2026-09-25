import { unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pool } from "../db/pool";

// Real deletion remains gated on a verified private provider and bucket.
async function removeObject(key: string, directory: string | undefined) {
  const backend = process.env.PILOT_EVIDENCE_BACKEND ?? "synthetic";
  if (backend === "supabase") {
    const root = process.env.PILOT_EVIDENCE_SUPABASE_URL;
    const serviceKey = process.env.PILOT_EVIDENCE_SUPABASE_SERVICE_KEY;
    if (!root?.startsWith("https://") || !serviceKey ||
        process.env.PILOT_EVIDENCE_SUPABASE_BUCKET !== "pilot-student-evidence" ||
        process.env.PILOT_EVIDENCE_PROVIDER_VERIFIED !== "true") throw new Error("Provider unavailable");
    const url = new URL(`/storage/v1/object/pilot-student-evidence/${key}`, root);
    const response = await fetch(url, { method: "DELETE", headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
    } });
    if (response.status === 404) return "already_missing";
    if (!response.ok) throw new Error("Provider deletion failed");
    return "deleted";
  }
  if (backend !== "synthetic" || process.env.NODE_ENV === "production" || !directory) throw new Error("Provider unavailable");
  try { await unlink(join(directory, key)); return "deleted"; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return "already_missing"; throw error; }
}

export async function deleteDueStudentEvidence() {
  const directory = process.env.PILOT_SYNTHETIC_EVIDENCE_DIR;
  if ((process.env.PILOT_EVIDENCE_BACKEND ?? "synthetic") === "synthetic" &&
      (process.env.NODE_ENV === "production" || !directory || !isAbsolute(directory) ||
       resolve(directory).startsWith(`${process.cwd()}/`))) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string; object_key: string }>(
      `SELECT id, object_key FROM student_evidence
        WHERE status = 'retained' AND delete_after <= now()
          AND (next_delete_attempt_at IS NULL OR next_delete_attempt_at <= now())
          AND (hold_until IS NULL OR hold_until <= now())
        ORDER BY delete_after LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const evidence = result.rows[0];
    if (!evidence) { await client.query("COMMIT"); return false; }
    try {
      const outcome = await removeObject(evidence.object_key, directory);
      await client.query(
        `UPDATE student_evidence SET status = 'deleted', deleted_at = now(),
           delete_attempts = delete_attempts + 1, last_delete_error = NULL,
           deletion_outcome = $2, next_delete_attempt_at = NULL
         WHERE id = $1`, [evidence.id, outcome],
      );
    } catch (error) {
      await client.query(
          `UPDATE student_evidence SET delete_attempts = delete_attempts + 1,
             next_delete_attempt_at = now() + interval '5 minutes',
             deletion_outcome = 'failed', last_delete_error = 'private storage deletion failed' WHERE id = $1`,
          [evidence.id],
        );
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
