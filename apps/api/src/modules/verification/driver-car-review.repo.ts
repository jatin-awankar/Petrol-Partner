import type { Pool, PoolClient } from "pg";
import { AppError } from "../../shared/errors/app-error";
import type { Operation, Receipt, EvidenceSnapshot } from "./driver-car-review.service";
import type { EvidencePurpose, SubjectType } from "./driver-car.repo";

export async function studentForShare(client: PoolClient, userId: string) {
  return (await client.query<{ status: string; adult_eligible: boolean; eligibility_ends_at: Date }>(
    `SELECT status, adult_eligible, eligibility_ends_at FROM student_verifications
      WHERE user_id = $1 FOR SHARE`, [userId])).rows[0] ?? null;
}

export async function driverReviewForUpdate(client: PoolClient, userId: string) {
  return (await client.query<{ user_id: string; status: string; license_expires_at: string | null }>(
    `SELECT user_id, status, license_number_last4,
      to_char(license_expires_at, 'YYYY-MM-DD') AS license_expires_at,
      to_char(insurance_expires_at, 'YYYY-MM-DD') AS insurance_expires_at,
      to_char(puc_expires_at, 'YYYY-MM-DD') AS puc_expires_at
      FROM driver_eligibility WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0] ?? null;
}

export async function associationVehicleId(client: PoolClient, id: string) {
  return (await client.query<{ vehicle_id: string }>(
    "SELECT vehicle_id FROM driver_vehicle_approvals WHERE id = $1", [id])).rows[0]?.vehicle_id ?? null;
}

export async function associationReviewForUpdate(client: PoolClient, id: string) {
  return (await client.query<{ id: string; driver_user_id: string; vehicle_id: string;
    status: string; permission_category: string }>(
    "SELECT * FROM driver_vehicle_approvals WHERE id = $1 FOR UPDATE", [id])).rows[0] ?? null;
}

export async function recordAudit(client: PoolClient, row: Operation) {
  await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
    SELECT $1, 'driver_car_reviewed', $2, $3, jsonb_build_object('operationId', $4::text,
      'outcome', $5::text, 'reason', $6::text, 'reviewAfter', $7::text), $8
    WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'driver_car_reviewed' AND metadata->>'operationId' = $4)`,
    [row.operator_id, row.subject_type, row.subject_id, row.id, row.outcome,
      row.reason, row.review_after, row.committed_at]);
}

export async function acknowledged(client: Pool | PoolClient) {
  return (await client.query<Operation>(
    "SELECT * FROM driver_car_review_operations WHERE state IN ('acknowledged', 'recovered')")).rows;
}

export async function pending(client: Pool | PoolClient) {
  return (await client.query<Operation>(
    "SELECT * FROM driver_car_review_operations WHERE state = 'committed'")).rows;
}

export async function evidenceSnapshot(client: PoolClient, type: SubjectType, id: string) {
  return (await client.query<{ purpose: EvidencePurpose; object_key: string; content_type: string;
    byte_count: number; sha256: string; uploaded_at: Date }>(
    `SELECT purpose, object_key, content_type, byte_count, sha256, uploaded_at
      FROM driver_car_evidence WHERE subject_type = $1 AND subject_id = $2
        AND status IN ('pending_review', 'retained') ORDER BY purpose FOR SHARE`, [type, id])).rows;
}

export async function createOperation(client: PoolClient, input: {
  operatorId: string; key: string; digest: string; type: SubjectType; id: string;
  applicantId: string; outcome: Operation["outcome"]; reason: string; reviewAfter: string | null;
  decisionSnapshot: Record<string, unknown>; evidenceSnapshot: unknown[];
}) {
  return (await client.query<Operation>(`INSERT INTO driver_car_review_operations
    (operator_id, idempotency_key, payload_digest, subject_type, subject_id,
     applicant_user_id, outcome, reason, review_after, decision_snapshot,
     evidence_snapshot, state)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, 'committed') RETURNING *`,
    [input.operatorId, input.key, input.digest, input.type, input.id, input.applicantId,
      input.outcome, input.reason, input.reviewAfter, JSON.stringify(input.decisionSnapshot),
      JSON.stringify(input.evidenceSnapshot)])).rows[0];
}

export async function operationById(client: Pool | PoolClient, id: string, lock = false) {
  return (await client.query<Operation>(
    `SELECT * FROM driver_car_review_operations WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [id])).rows[0] ?? null;
}

export async function acknowledge(client: PoolClient, id: string) {
  return (await client.query<Operation>(`UPDATE driver_car_review_operations
    SET state = 'acknowledged', acknowledged_at = now() WHERE id = $1 RETURNING *`, [id])).rows[0];
}

export async function readyRideHoldNotifications(client: PoolClient, id: string) {
  await client.query(`UPDATE pilot_notification_events SET ready_at = now()
    WHERE origin_type = 'driver_car_ride_hold' AND operation_id = $1 AND ready_at IS NULL`, [id]);
}

export async function insertRecoveredOperation(client: PoolClient, item: Receipt) {
  await client.query(`INSERT INTO driver_car_review_operations
    (id, operator_id, idempotency_key, payload_digest, subject_type, subject_id,
     applicant_user_id, outcome, reason, review_after, decision_snapshot, evidence_snapshot,
     state, committed_at, acknowledged_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
      'recovered', $13, now())`,
    [item.operationId, item.operatorId, item.idempotencyKey, item.payloadDigest,
      item.subjectType, item.subjectId, item.applicantId, item.outcome, item.reason,
      item.reviewAfter, JSON.stringify(item.decisionSnapshot),
      JSON.stringify(item.evidenceSnapshot), item.committedAt]);
}

export async function priorEvidence(client: PoolClient, type: SubjectType, id: string, purpose: EvidencePurpose) {
  return (await client.query<{ object_key: string; status: string; decision_at: Date | null }>(
    `SELECT object_key, status, decision_at FROM driver_car_evidence
      WHERE subject_type = $1 AND subject_id = $2 AND purpose = $3 FOR UPDATE`,
    [type, id, purpose])).rows[0] ?? null;
}

export async function restoreEvidence(client: PoolClient, row: Operation, evidence: EvidenceSnapshot) {
  await client.query(`INSERT INTO driver_car_evidence
    (applicant_user_id, subject_type, subject_id, purpose, object_key, content_type,
     byte_count, sha256, status, uploaded_at, decision_at, delete_after)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'retained', $9,
      $10::timestamptz, $10::timestamptz + interval '6 days')
    ON CONFLICT (subject_type, subject_id, purpose) DO UPDATE SET
      object_key = EXCLUDED.object_key, content_type = EXCLUDED.content_type,
      byte_count = EXCLUDED.byte_count, sha256 = EXCLUDED.sha256,
      status = CASE WHEN driver_car_evidence.object_key = EXCLUDED.object_key
        AND driver_car_evidence.status = 'deleted' THEN 'deleted' ELSE 'retained' END,
      uploaded_at = EXCLUDED.uploaded_at, decision_at = EXCLUDED.decision_at,
      delete_after = EXCLUDED.delete_after
    WHERE driver_car_evidence.decision_at IS NULL OR
      driver_car_evidence.decision_at <= EXCLUDED.decision_at`,
    [row.applicant_user_id, row.subject_type, row.subject_id, evidence.purpose,
      evidence.objectKey, evidence.contentType, evidence.byteCount, evidence.sha256,
      evidence.uploadedAt, row.committed_at]);
}

export async function markRecovered(client: PoolClient, id: string) {
  await client.query(`UPDATE driver_car_review_operations
    SET state = 'recovered', acknowledged_at = now() WHERE id = $1`, [id]);
}

export async function suppressRestoredEmail(client: PoolClient, id: string) {
  await client.query(`UPDATE pilot_email_jobs SET status = 'exhausted', lease_until = NULL,
    last_error = 'Suppressed after snapshot restore; delivery outcome requires review', updated_at = now()
    WHERE event_id IN (SELECT id FROM pilot_notification_events
      WHERE operation_id = $1 AND origin_type IN ('driver_car_review', 'driver_car_ride_hold'))
      AND status <> 'sent'`, [id]);
}

export async function byKey(client: Pool | PoolClient, operatorId: string, key: string) {
  return (await client.query<Operation>(
    `SELECT * FROM driver_car_review_operations WHERE operator_id = $1 AND idempotency_key = $2`,
    [operatorId, key])).rows[0] ?? null;
}
export async function apply(client: PoolClient, row: Operation, replaying = false) {
  if (replaying) {
    const table = row.subject_type === "driver" ? "driver_eligibility"
      : row.subject_type === "vehicle" ? "vehicles" : "driver_vehicle_approvals";
    const column = row.subject_type === "driver" ? "user_id" : "id";
    const current = (await client.query<{ reviewed_at: Date | null }>(
      `SELECT reviewed_at FROM ${table} WHERE ${column} = $1 FOR UPDATE`, [row.subject_id])).rows[0];
    if (current?.reviewed_at && current.reviewed_at > row.committed_at) return false;
  }
  let updated;
  if (row.subject_type === "driver") {
    updated = await client.query(`UPDATE driver_eligibility SET status = $2, reviewed_by_user_id = $3,
      reviewed_at = $4::timestamptz, review_after = $6, approved_at = CASE WHEN $2 = 'approved' THEN $4::timestamptz ELSE NULL END,
      metadata = jsonb_set(metadata, '{reviewReason}', to_jsonb($5::text)), updated_at = now()
      WHERE user_id = $1 AND (reviewed_at IS NULL OR reviewed_at <= $4::timestamptz)`,
      [row.subject_id, row.outcome === "revoked" ? "suspended" : row.outcome,
      row.operator_id, row.committed_at, row.reason, row.review_after]);
  } else if (row.subject_type === "vehicle") {
    updated = await client.query(`UPDATE vehicles SET verification_status = $2,
      status = CASE WHEN $2 = 'approved' THEN 'active' ELSE 'suspended' END,
      review_after = $3, reviewed_by_user_id = $4, reviewed_at = $5,
      metadata = jsonb_set(metadata, '{reviewReason}', to_jsonb($6::text)), updated_at = now()
      WHERE id = $1 AND (reviewed_at IS NULL OR reviewed_at <= $5::timestamptz)`,
      [row.subject_id, row.outcome === "approved" ? "approved" : "rejected",
      row.review_after, row.operator_id, row.committed_at, row.reason]);
  } else {
    updated = await client.query(`UPDATE driver_vehicle_approvals SET status = $2, review_after = $3,
      reason = $4, reviewed_by_user_id = $5, reviewed_at = $6, updated_at = now()
      WHERE id = $1 AND (reviewed_at IS NULL OR reviewed_at <= $6::timestamptz)`,
      [row.subject_id, row.outcome, row.review_after, row.reason,
      row.operator_id, row.committed_at]);
  }
  if (!updated.rowCount) throw new AppError(409, "Decision subject requires recovery review", "RECOVERY_INCOMPLETE");
  return true;
}

export async function restoreMissingSubject(client: PoolClient, row: Operation) {
  const snapshot = row.decision_snapshot;
  if (row.subject_type === "driver") {
    if (snapshot.user_id !== row.subject_id || typeof snapshot.license_number_last4 !== "string" ||
        typeof snapshot.license_expires_at !== "string") {
      throw new AppError(409, "Driver recovery snapshot is incomplete", "RECOVERY_INCOMPLETE");
    }
    await client.query(`INSERT INTO driver_eligibility
      (user_id, status, license_number_last4, license_expires_at, insurance_expires_at, puc_expires_at)
      VALUES ($1, 'pending_review', $2, $3, $4, $5) ON CONFLICT (user_id) DO NOTHING`,
      [row.subject_id, snapshot.license_number_last4, snapshot.license_expires_at,
        snapshot.insurance_expires_at ?? null, snapshot.puc_expires_at ?? null]);
  } else if (row.subject_type === "vehicle") {
    if (snapshot.id !== row.subject_id || typeof snapshot.owner_user_id !== "string" ||
        typeof snapshot.vehicle_type !== "string" ||
        typeof snapshot.registration_number_last4 !== "string" ||
        typeof snapshot.seat_capacity !== "number") {
      throw new AppError(409, "Car recovery snapshot is incomplete", "RECOVERY_INCOMPLETE");
    }
    await client.query(`INSERT INTO vehicles
      (id, owner_user_id, vehicle_type, make, model, color, registration_number_last4,
       seat_capacity, status, verification_status, use_category, insurance_expires_at,
       registration_expires_at, applicable_document_required)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', 'pending_review', $9, $10, $11, $12)
      ON CONFLICT (id) DO NOTHING`,
      [row.subject_id, snapshot.owner_user_id, snapshot.vehicle_type, snapshot.make ?? null,
        snapshot.model ?? null, snapshot.color ?? null, snapshot.registration_number_last4,
        snapshot.seat_capacity, snapshot.use_category ?? null,
        snapshot.insurance_expires_at ?? null, snapshot.registration_expires_at ?? null,
        snapshot.applicable_document_required ?? null]);
  } else {
    if (snapshot.id !== row.subject_id || typeof snapshot.driver_user_id !== "string" ||
        typeof snapshot.vehicle_id !== "string" ||
        typeof snapshot.permission_category !== "string") {
      throw new AppError(409, "Association recovery snapshot is incomplete", "RECOVERY_INCOMPLETE");
    }
    await client.query(`INSERT INTO driver_vehicle_approvals
      (id, driver_user_id, vehicle_id, permission_category, status)
      VALUES ($1, $2, $3, $4, 'pending_review') ON CONFLICT (id) DO NOTHING`,
      [row.subject_id, snapshot.driver_user_id, snapshot.vehicle_id,
        snapshot.permission_category]);
  }
}
