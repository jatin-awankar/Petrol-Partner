import { unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pool } from "../db/pool";

// Synthetic local adapter only. Production must select and validate a private
// provider with verifiable deletion before evidence intake can be enabled.
export async function deleteDueStudentEvidence() {
  const directory = process.env.PILOT_SYNTHETIC_EVIDENCE_DIR;
  if (process.env.NODE_ENV === "production" || !directory || !isAbsolute(directory) ||
      resolve(directory).startsWith(`${process.cwd()}/`)) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string; object_key: string }>(
      `SELECT id, object_key FROM student_evidence
        WHERE status = 'retained' AND delete_after <= now()
          AND (hold_until IS NULL OR hold_until <= now())
        ORDER BY delete_after LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const evidence = result.rows[0];
    if (!evidence) { await client.query("COMMIT"); return false; }
    try {
      await unlink(join(directory, evidence.object_key));
      await client.query(
        `UPDATE student_evidence SET status = 'deleted', deleted_at = now(),
           delete_attempts = delete_attempts + 1, last_delete_error = NULL
         WHERE id = $1`, [evidence.id],
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await client.query(
          `UPDATE student_evidence SET status = 'deleted', deleted_at = now(),
             delete_attempts = delete_attempts + 1, last_delete_error = NULL
           WHERE id = $1`, [evidence.id],
        );
      } else {
        await client.query(
          `UPDATE student_evidence SET delete_attempts = delete_attempts + 1,
             delete_after = now() + interval '5 minutes',
             last_delete_error = 'private storage deletion failed' WHERE id = $1`,
          [evidence.id],
        );
      }
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
