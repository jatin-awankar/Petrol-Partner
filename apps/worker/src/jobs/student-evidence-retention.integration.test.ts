import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../db/pool";
import { deleteDueStudentEvidence } from "./student-evidence-retention.job";

const database = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let directory: string;

beforeAll(async () => {
  for (const migration of ["0001_init.sql", "0012_student_adult_review.sql", "0013_student_review_cycles.sql", "0016_student_evidence_deletion_outcomes.sql", "0017_student_evidence_retry_schedule.sql"]) {
    await database.query(await readFile(resolve(import.meta.dirname, "../../../api/src/db/migrations", migration), "utf8"));
  }
});
beforeEach(async () => {
  await database.query("TRUNCATE users CASCADE");
  directory = await mkdtemp(join(tmpdir(), "pilot-retention-"));
  process.env.PILOT_SYNTHETIC_EVIDENCE_DIR = directory;
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
afterAll(async () => { delete process.env.PILOT_SYNTHETIC_EVIDENCE_DIR; await Promise.all([database.end(), pool.end()]); });

async function evidence(deleteAfter: string, holdUntil: string | null = null) {
  const user = await database.query<{ id: string }>("INSERT INTO users (email) VALUES ($1) RETURNING id", [`retention-${randomUUID()}@example.test`]);
  const key = randomUUID();
  const bytes = Buffer.from("%PDF-1.4\nsynthetic retention sample\n");
  await writeFile(join(directory, key), bytes);
  const row = await database.query<{ id: string }>(
    `INSERT INTO student_evidence
       (user_id, object_key, content_type, byte_count, sha256, status, decision_at, delete_after, hold_reason, hold_until)
     VALUES ($1, $2, 'application/pdf', $3, 'synthetic-digest', 'retained', now(), $4, $5, $6) RETURNING id`,
    [user.rows[0].id, key, bytes.length, deleteAfter, holdUntil ? "synthetic incident review" : null, holdUntil],
  );
  return { id: row.rows[0].id, key, bytes };
}

describe("student evidence retention PostgreSQL worker", () => {
  it("keeps evidence before the seven-day deadline and deletes it after the deadline", async () => {
    const item = await evidence("2099-01-01T00:00:00Z");
    expect(await deleteDueStudentEvidence()).toBe(false);
    expect(await readFile(join(directory, item.key))).toEqual(item.bytes);
    await database.query("UPDATE student_evidence SET delete_after = now() - interval '1 second' WHERE id = $1", [item.id]);
    expect(await deleteDueStudentEvidence()).toBe(true);
    await expect(readFile(join(directory, item.key))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await database.query("SELECT status, deleted_at IS NOT NULL AS removed FROM student_evidence WHERE id = $1", [item.id])).rows).toEqual([{ status: "deleted", removed: true }]);
  });

  it("defers deletion while a recorded incident hold is active", async () => {
    const item = await evidence("2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z");
    expect(await deleteDueStudentEvidence()).toBe(false);
    expect(await readFile(join(directory, item.key))).toEqual(item.bytes);
  });

  it("records a non-sensitive failure and retries deletion", async () => {
    const item = await evidence("2000-01-01T00:00:00Z");
    await rm(join(directory, item.key));
    await mkdir(join(directory, item.key));
    expect(await deleteDueStudentEvidence()).toBe(true);
    const failed = await database.query("SELECT status, deletion_outcome, delete_attempts, last_delete_error, delete_after <= now() AS overdue, next_delete_attempt_at > now() AS retry_scheduled FROM student_evidence WHERE id = $1", [item.id]);
    expect(failed.rows).toEqual([{ status: "retained", deletion_outcome: "failed", delete_attempts: 1, last_delete_error: "private storage deletion failed", overdue: true, retry_scheduled: true }]);
    await rm(join(directory, item.key), { recursive: true });
    await database.query("UPDATE student_evidence SET next_delete_attempt_at = now() - interval '1 second' WHERE id = $1", [item.id]);
    expect(await deleteDueStudentEvidence()).toBe(true);
    expect((await database.query("SELECT status, deletion_outcome, delete_attempts FROM student_evidence WHERE id = $1", [item.id])).rows)
      .toEqual([{ status: "deleted", deletion_outcome: "already_missing", delete_attempts: 2 }]);
  });
});
