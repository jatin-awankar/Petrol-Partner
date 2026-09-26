import type { Pool, PoolClient } from "pg";

export type SubjectType = "driver" | "vehicle" | "association";
export type EvidencePurpose = "licence" | "registration" | "insurance" | "applicable" | "permission";

export async function driverForUpdate(client: PoolClient, userId: string) {
  return (await client.query<{ status: string }>(
    "SELECT status FROM driver_eligibility WHERE user_id = $1 FOR UPDATE", [userId])).rows[0] ?? null;
}

export async function associationSubmissionForUpdate(client: PoolClient, id: string, driverId: string) {
  return (await client.query<{ status: string }>(
    `SELECT status FROM driver_vehicle_approvals
      WHERE id = $1 AND driver_user_id = $2 FOR UPDATE`, [id, driverId])).rows[0] ?? null;
}

export async function grantEvidenceAccess(client: PoolClient, hash: string, operatorId: string, evidenceId: string) {
  await client.query(`INSERT INTO driver_car_evidence_access_grants
    (token_hash, operator_id, evidence_id, access_purpose, expires_at)
    VALUES ($1, $2, $3, 'eligibility_review', now() + interval '5 minutes')`,
    [hash, operatorId, evidenceId]);
  await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1, 'driver_car_evidence_access_granted', 'driver_car_evidence', $2,
      '{"purpose":"eligibility_review"}'::jsonb)`, [operatorId, evidenceId]);
}

export async function consumeEvidenceAccess(client: PoolClient, hash: string, operatorId: string, evidenceId: string) {
  const consumed = await client.query(`UPDATE driver_car_evidence_access_grants SET consumed_at = now()
    WHERE token_hash = $1 AND operator_id = $2 AND evidence_id = $3
    AND consumed_at IS NULL AND expires_at > now() RETURNING token_hash`,
    [hash, operatorId, evidenceId]);
  return Boolean(consumed.rowCount);
}

export async function recordEvidenceAccess(client: PoolClient, operatorId: string, evidenceId: string) {
  await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1, 'driver_car_evidence_accessed', 'driver_car_evidence', $2,
      '{"purpose":"eligibility_review"}'::jsonb)`, [operatorId, evidenceId]);
}

export async function evidenceRetentionHealth(client: PoolClient) {
  return (await client.query(`SELECT
    count(*) FILTER (WHERE status = 'retained' AND delete_after <= now()
      AND (hold_until IS NULL OR hold_until <= now()))::int AS overdue_count,
    count(*) FILTER (WHERE status = 'retained' AND deletion_outcome = 'failed')::int AS failed_count,
    min(delete_after) FILTER (WHERE status = 'retained' AND delete_after <= now()
      AND (hold_until IS NULL OR hold_until <= now())) AS oldest_due_at
    FROM (SELECT status, delete_after, hold_until, deletion_outcome FROM driver_car_evidence
      UNION ALL SELECT status, delete_after, hold_until, deletion_outcome
        FROM driver_car_evidence_replacements) evidence`)).rows[0];
}

// The row locks serialize approval changes with protected ride actions.
export async function currentPilotEligibility(client: PoolClient, driverId: string, vehicleId: string) {
  return (await client.query<{ id: string; owner_user_id: string; vehicle_type: string }>(
    `SELECT v.id, v.owner_user_id, v.vehicle_type
       FROM student_verifications s
       JOIN driver_eligibility d ON d.user_id = s.user_id
       JOIN driver_vehicle_approvals a ON a.driver_user_id = d.user_id
       JOIN vehicles v ON v.id = a.vehicle_id
      WHERE s.user_id = $1 AND v.id = $2
        AND s.status IN ('verified', 'revalidation_due')
        AND s.adult_eligible = true AND s.eligibility_ends_at > now()
        AND d.status = 'approved' AND d.license_expires_at > CURRENT_DATE
        AND d.review_after > CURRENT_DATE
        AND a.status = 'approved' AND a.review_after > CURRENT_DATE
        AND v.status = 'active' AND v.verification_status = 'approved'
        AND v.vehicle_type IN ('car', 'suv') AND v.use_category = 'private'
        AND v.applicable_document_required IS NOT NULL
        AND v.insurance_expires_at > CURRENT_DATE
        AND (v.registration_expires_at IS NULL OR v.registration_expires_at > CURRENT_DATE)
        AND v.review_after > CURRENT_DATE
      FOR SHARE OF s, d, a, v`, [driverId, vehicleId],
  )).rows[0] ?? null;
}

export async function associationForUpdate(client: PoolClient, driverId: string, vehicleId: string) {
  return (await client.query<{ id: string; driver_user_id: string; vehicle_id: string; status: string; permission_category: string }>(
    `SELECT * FROM driver_vehicle_approvals WHERE driver_user_id = $1 AND vehicle_id = $2 FOR UPDATE`,
    [driverId, vehicleId],
  )).rows[0] ?? null;
}

export async function listAssociationsForDriver(client: Pool | PoolClient, driverId: string) {
  return (await client.query(`SELECT id, vehicle_id, permission_category, status,
    review_after, reason, reviewed_at, created_at FROM driver_vehicle_approvals
    WHERE driver_user_id = $1 ORDER BY created_at DESC`, [driverId])).rows;
}

export async function listPendingAssociations(client: Pool | PoolClient, limit: number) {
  return (await client.query(`SELECT id, driver_user_id, vehicle_id, permission_category,
    created_at FROM driver_vehicle_approvals WHERE status = 'pending_review'
    ORDER BY updated_at DESC LIMIT $1`, [limit])).rows;
}

export async function submitAssociation(client: PoolClient, driverId: string, vehicleId: string, permissionCategory: string) {
  return (await client.query<{ id: string; status: string }>(
    `INSERT INTO driver_vehicle_approvals (driver_user_id, vehicle_id, permission_category)
     VALUES ($1, $2, $3)
     ON CONFLICT (driver_user_id, vehicle_id) DO UPDATE SET
       permission_category = EXCLUDED.permission_category, status = 'pending_review',
       review_after = NULL, reason = NULL, reviewed_by_user_id = NULL, reviewed_at = NULL, updated_at = now()
     WHERE driver_vehicle_approvals.status IN ('rejected', 'revoked')
     RETURNING id, status`, [driverId, vehicleId, permissionCategory],
  )).rows[0] ?? null;
}

export async function vehicleForUpdate(client: PoolClient, id: string) {
  return (await client.query<{ id: string; owner_user_id: string; vehicle_type: string; status: string; verification_status: string;
    registration_number_last4: string; seat_capacity: number; make: string | null; model: string | null;
    color: string | null; use_category: string | null; applicable_document_required: boolean | null; insurance_expires_at: string | null;
    registration_expires_at: string | null; review_after: string | null }>(
    `SELECT id, owner_user_id, vehicle_type, status, verification_status,
      registration_number_last4, seat_capacity, make, model, color, use_category, applicable_document_required,
      to_char(insurance_expires_at, 'YYYY-MM-DD') AS insurance_expires_at,
      to_char(registration_expires_at, 'YYYY-MM-DD') AS registration_expires_at,
      to_char(review_after, 'YYYY-MM-DD') AS review_after
      FROM vehicles WHERE id = $1 FOR UPDATE`, [id],
  )).rows[0] ?? null;
}

export async function classifyVehicle(client: PoolClient, ownerId: string, id: string, input: {
  useCategory: string; applicableDocumentRequired: boolean; insuranceExpiresAt: string; registrationExpiresAt: string | null;
}) {
  return (await client.query(
    `UPDATE vehicles SET use_category = $3, insurance_expires_at = $4,
      registration_expires_at = $5, applicable_document_required = $6, verification_status = 'pending_review',
      review_after = NULL, reviewed_by_user_id = NULL, reviewed_at = NULL,
      metadata = metadata - 'reviewReason', updated_at = now()
      WHERE id = $2 AND owner_user_id = $1 AND verification_status <> 'approved'
      RETURNING id, use_category, insurance_expires_at, registration_expires_at, applicable_document_required, verification_status`,
    [ownerId, id, input.useCategory, input.insuranceExpiresAt, input.registrationExpiresAt, input.applicableDocumentRequired],
  )).rows[0] ?? null;
}

export async function evidenceForUpdate(client: PoolClient, type: SubjectType, id: string, purpose: EvidencePurpose) {
  return (await client.query<{ id: string; applicant_user_id: string; object_key: string; content_type: string;
    byte_count: number; sha256: string; status: string }>(
    `SELECT * FROM driver_car_evidence WHERE subject_type = $1 AND subject_id = $2 AND purpose = $3 FOR UPDATE`,
    [type, id, purpose],
  )).rows[0] ?? null;
}

export async function recordEvidence(client: PoolClient, applicantId: string, type: SubjectType, id: string,
  purpose: EvidencePurpose, evidence: { key: string; contentType: string; byteCount: number; sha256: string }) {
  await client.query(`INSERT INTO driver_car_evidence
    (applicant_user_id, subject_type, subject_id, purpose, object_key, content_type, byte_count, sha256)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (subject_type, subject_id, purpose) DO UPDATE SET
      object_key = EXCLUDED.object_key, content_type = EXCLUDED.content_type,
      byte_count = EXCLUDED.byte_count, sha256 = EXCLUDED.sha256,
      status = 'pending_review', uploaded_at = now(), decision_at = NULL,
      delete_after = NULL, deleted_at = NULL, delete_attempts = 0,
      last_delete_error = NULL, deletion_outcome = NULL, next_delete_attempt_at = NULL
    WHERE driver_car_evidence.status IN ('retained', 'deleted')`,
    [applicantId, type, id, purpose, evidence.key, evidence.contentType, evidence.byteCount, evidence.sha256]);
}

export async function scheduleReplacedEvidenceDeletion(client: PoolClient, key: string) {
  await client.query(`INSERT INTO driver_car_evidence_replacements (object_key)
    VALUES ($1) ON CONFLICT (object_key) DO NOTHING`, [key]);
}

export async function scheduleDeletion(client: PoolClient, type: SubjectType, id: string) {
  await client.query(`UPDATE driver_car_evidence SET status = 'retained', decision_at = now(),
    delete_after = now() + interval '6 days' WHERE subject_type = $1 AND subject_id = $2 AND status = 'pending_review'`, [type, id]);
}

export async function applyRevocationToRides(client: PoolClient, type: SubjectType,
  subjectId: string, operationId: string, reason: string) {
  const affected = type === "driver"
    ? `ro.driver_id = $1`
    : type === "vehicle"
      ? `ro.vehicle_id = $1`
      : `EXISTS (SELECT 1 FROM driver_vehicle_approvals a
          WHERE a.id = $1 AND a.driver_user_id = ro.driver_id AND a.vehicle_id = ro.vehicle_id)`;
  const held = await client.query<{ id: string; driver_id: string }>(
    `UPDATE ride_offers ro SET status = 'held', updated_at = now()
      WHERE ${affected} AND ro.status = 'active'
      RETURNING ro.id, ro.driver_id`, [subjectId]);
  const incidents = await client.query<{ ride_offer_id: string }>(
    `INSERT INTO pilot_ride_incidents
      (ride_offer_id, review_operation_id, priority, reason)
      SELECT ro.id, $2, 'high', $3 FROM ride_offers ro
      WHERE ${affected} AND ro.status = 'departed'
      ON CONFLICT (ride_offer_id, review_operation_id) DO NOTHING
      RETURNING ride_offer_id`, [subjectId, operationId, reason]);
  const heldRides = await client.query<{ id: string; driver_id: string; passenger_ids: string[] }>(
    `SELECT ro.id, ro.driver_id,
      COALESCE(array_agg(DISTINCT b.passenger_id) FILTER (WHERE b.passenger_id IS NOT NULL), '{}') AS passenger_ids
      FROM ride_offers ro LEFT JOIN bookings b ON b.ride_offer_id = ro.id AND b.status = 'confirmed'
      WHERE ${affected} AND ro.status = 'held'
      GROUP BY ro.id, ro.driver_id`, [subjectId]);
  return { newlyHeld: held.rows, held: heldRides.rows, incidents: incidents.rows };
}
