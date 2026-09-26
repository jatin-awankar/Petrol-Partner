import type { Pool, PoolClient } from "pg";

export type SubjectType = "driver" | "vehicle" | "association";
export type EvidencePurpose = "licence" | "registration" | "insurance" | "applicable" | "permission";

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
