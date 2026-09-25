import type { Pool, PoolClient } from "pg";

export type StudentSnapshot = {
  provider: string; enrolledName: string; institutionName: string; programName: string | null;
  admissionYear: number; graduationYear: number; evidenceCategory: string; ageEvidenceCategory: string;
  eligibilityStartsAt: string | null; eligibilityEndsAt: string; revalidateAfter: string | null;
};
export type EvidenceSnapshot = {
  purpose: "enrollment" | "age"; key: string; contentType: string;
  byteCount: number; sha256: string; uploadedAt: string;
};
export type StudentReviewOperation = {
  id: string; operator_id: string; target_user_id: string; idempotency_key: string;
  payload_digest: string; outcome: "verified" | "rejected"; adult_eligible: boolean;
  reason: string; review_cycle: number; verification_id: string;
  student_snapshot: StudentSnapshot; evidence_snapshot: EvidenceSnapshot[];
  state: "committed" | "acknowledged" | "recovered";
  committed_at: Date; acknowledged_at: Date | null;
};
type Database = Pool | PoolClient;

export async function byKey(database: Database, operatorId: string, key: string) {
  const result = await database.query<StudentReviewOperation>(
    "SELECT * FROM student_review_operations WHERE operator_id = $1 AND idempotency_key = $2",
    [operatorId, key],
  );
  return result.rows[0] ?? null;
}

export async function byIdForUpdate(client: PoolClient, id: string) {
  const result = await client.query<StudentReviewOperation>(
    "SELECT * FROM student_review_operations WHERE id = $1 FOR UPDATE", [id],
  );
  return result.rows[0] ?? null;
}

export async function byId(database: Database, id: string) {
  const result = await database.query<StudentReviewOperation>(
    "SELECT * FROM student_review_operations WHERE id = $1", [id],
  );
  return result.rows[0] ?? null;
}

export async function acknowledged(database: Database) {
  return (await database.query<StudentReviewOperation>(
    "SELECT * FROM student_review_operations WHERE state IN ('acknowledged', 'recovered')",
  )).rows;
}

export async function pending(database: Database) {
  return (await database.query<StudentReviewOperation>(
    "SELECT * FROM student_review_operations WHERE state = 'committed' ORDER BY committed_at",
  )).rows;
}

export async function verifiedEmailForReview(client: PoolClient, userId: string) {
  const result = await client.query(
    "SELECT 1 FROM users WHERE id = $1 AND email_verified_at IS NOT NULL AND status = 'active' FOR SHARE", [userId],
  );
  return Boolean(result.rowCount);
}

export async function create(client: PoolClient, input: Omit<StudentReviewOperation, "id" | "state" | "committed_at" | "acknowledged_at">) {
  const result = await client.query<StudentReviewOperation>(
    `INSERT INTO student_review_operations
       (operator_id, target_user_id, idempotency_key, payload_digest, outcome,
        adult_eligible, reason, review_cycle, verification_id, student_snapshot,
        evidence_snapshot, state, committed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, 'committed', now())
     RETURNING *`,
    [input.operator_id, input.target_user_id, input.idempotency_key, input.payload_digest,
      input.outcome, input.adult_eligible, input.reason, input.review_cycle,
      input.verification_id, JSON.stringify(input.student_snapshot), JSON.stringify(input.evidence_snapshot)],
  );
  return result.rows[0];
}

export async function recordAudit(client: PoolClient, row: StudentReviewOperation) {
  await client.query(
    `INSERT INTO student_review_audit
       (operation_id, operator_id, target_user_id, outcome, adult_eligible, reason, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (operation_id) DO NOTHING`,
    [row.id, row.operator_id, row.target_user_id, row.outcome,
      row.adult_eligible, row.reason, row.committed_at],
  );
  await client.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
     SELECT $1, 'student_verification_reviewed', 'student_verification', $2,
       jsonb_build_object('operationId', $3::text, 'outcome', $4::text,
                          'adultEligible', $5::boolean, 'reason', $6::text), $7
     WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'student_verification_reviewed'
       AND metadata->>'operationId' = $3)`,
    [row.operator_id, row.verification_id, row.id, row.outcome,
      row.adult_eligible, row.reason, row.committed_at],
  );
}

export async function acknowledge(client: PoolClient, id: string) {
  return (await client.query<StudentReviewOperation>(
    "UPDATE student_review_operations SET state = 'acknowledged', acknowledged_at = now() WHERE id = $1 RETURNING *",
    [id],
  )).rows[0];
}

export async function restoreOperation(client: PoolClient, receipt: {
  operationId: string; operatorId: string; targetUserId: string; idempotencyKey: string;
  payloadDigest: string; outcome: string; adultEligible: boolean; reason: string;
  reviewCycle: number; verificationId: string; studentSnapshot: StudentSnapshot;
  evidenceSnapshot: EvidenceSnapshot[]; committedAt: string;
}) {
  await client.query(
    `INSERT INTO student_review_operations
       (id, operator_id, target_user_id, idempotency_key, payload_digest,
        outcome, adult_eligible, reason, review_cycle, verification_id,
        student_snapshot, evidence_snapshot, state, committed_at, acknowledged_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11::jsonb, $12::jsonb, 'recovered', $13, now())
     ON CONFLICT (id) DO UPDATE SET state = 'recovered', acknowledged_at = now()`,
    [receipt.operationId, receipt.operatorId, receipt.targetUserId, receipt.idempotencyKey,
      receipt.payloadDigest, receipt.outcome, receipt.adultEligible, receipt.reason,
      receipt.reviewCycle, receipt.verificationId, JSON.stringify(receipt.studentSnapshot),
      JSON.stringify(receipt.evidenceSnapshot), receipt.committedAt],
  );
}

export async function restoreDecision(client: PoolClient, row: StudentReviewOperation) {
  const s = row.student_snapshot;
  const applied = await client.query(
    `INSERT INTO student_verifications
       (id, user_id, provider, status, enrolled_name, evidence_category,
        age_evidence_category, review_cycle, adult_eligible, institution_name,
        program_name, admission_year, graduation_year, verified_at,
        reviewed_by_user_id, reviewed_at, eligibility_starts_at,
        eligibility_ends_at, revalidate_after, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19, jsonb_build_object('reviewReason', $20::text))
     ON CONFLICT (user_id) DO UPDATE SET
       provider = EXCLUDED.provider, status = EXCLUDED.status,
       enrolled_name = EXCLUDED.enrolled_name, evidence_category = EXCLUDED.evidence_category,
       age_evidence_category = EXCLUDED.age_evidence_category,
       institution_name = EXCLUDED.institution_name, program_name = EXCLUDED.program_name,
       admission_year = EXCLUDED.admission_year, graduation_year = EXCLUDED.graduation_year,
       eligibility_starts_at = EXCLUDED.eligibility_starts_at,
       eligibility_ends_at = EXCLUDED.eligibility_ends_at,
       revalidate_after = EXCLUDED.revalidate_after,
       metadata = EXCLUDED.metadata, adult_eligible = EXCLUDED.adult_eligible,
       reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
       reviewed_at = EXCLUDED.reviewed_at, verified_at = EXCLUDED.verified_at,
       review_cycle = EXCLUDED.review_cycle
     WHERE student_verifications.review_cycle < EXCLUDED.review_cycle
        OR (student_verifications.review_cycle = EXCLUDED.review_cycle AND
          (student_verifications.reviewed_at IS NULL OR
           student_verifications.reviewed_at <= EXCLUDED.reviewed_at))`,
    [row.verification_id, row.target_user_id, s.provider, row.outcome,
      s.enrolledName, s.evidenceCategory, s.ageEvidenceCategory, row.review_cycle,
      row.adult_eligible, s.institutionName, s.programName, s.admissionYear,
      s.graduationYear, row.outcome === "verified" ? row.committed_at : null,
      row.operator_id, row.committed_at, s.eligibilityStartsAt, s.eligibilityEndsAt,
      s.revalidateAfter, row.reason],
  );
  if (applied.rowCount) await client.query(
    `UPDATE user_profiles SET is_verified = $2, college = $3, updated_at = now() WHERE user_id = $1`,
    [row.target_user_id, row.outcome === "verified" && row.adult_eligible,
      row.outcome === "verified" && row.adult_eligible ? s.institutionName : null],
  );
  for (const evidence of row.evidence_snapshot) {
    await client.query(
      `INSERT INTO student_evidence
         (user_id, review_cycle, purpose, object_key, content_type, byte_count,
          sha256, status, uploaded_at, decision_at, delete_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'retained', $8, $9::timestamptz, $9::timestamptz + interval '7 days')
       ON CONFLICT (user_id, review_cycle, purpose) DO UPDATE SET
         status = CASE WHEN student_evidence.status = 'deleted' THEN 'deleted' ELSE 'retained' END,
         decision_at = COALESCE(student_evidence.decision_at, EXCLUDED.decision_at),
         delete_after = COALESCE(student_evidence.delete_after, EXCLUDED.delete_after)`,
      [row.target_user_id, row.review_cycle, evidence.purpose, evidence.key,
        evidence.contentType, evidence.byteCount, evidence.sha256,
        evidence.uploadedAt, row.committed_at],
    );
  }
}

export async function suppressRestoredEmail(client: PoolClient, operationId: string) {
  await client.query(
    `UPDATE pilot_email_jobs SET status = 'exhausted', lease_until = NULL,
       last_error = 'Suppressed after snapshot restore; delivery outcome requires review', updated_at = now()
     WHERE event_id = $1 AND status <> 'sent'`, [operationId],
  );
}
