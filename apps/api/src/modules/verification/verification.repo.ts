import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

interface StudentVerificationRow {
  id: string;
  user_id: string;
  provider: string;
  status: string;
  student_identifier_last4: string | null;
  institution_name: string;
  program_name: string | null;
  admission_year: number | null;
  graduation_year: number | null;
  verified_at: Date | string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | string | null;
  eligibility_starts_at: Date | string | null;
  eligibility_ends_at: Date | string;
  revalidate_after: Date | string | null;
  consent_reference: string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DriverEligibilityRow {
  user_id: string;
  status: string;
  license_number_last4: string | null;
  license_expires_at: string | null;
  insurance_expires_at: string | null;
  puc_expires_at: string | null;
  last_verified_at: Date | string | null;
  approved_at: Date | string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface VehicleRow {
  id: string;
  owner_user_id: string;
  vehicle_type: string;
  make: string | null;
  model: string | null;
  color: string | null;
  registration_number_last4: string;
  seat_capacity: number;
  status: string;
  verification_status: string;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TransactionEligibilityRow {
  student_verification_status: string | null;
  student_eligibility_ends_at: Date | string | null;
  driver_eligibility_status: string | null;
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function mapStudentVerification(row: StudentVerificationRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    status: row.status,
    student_identifier_last4: row.student_identifier_last4,
    institution_name: row.institution_name,
    program_name: row.program_name,
    admission_year: row.admission_year,
    graduation_year: row.graduation_year,
    verified_at: toIso(row.verified_at),
    reviewed_by_user_id: row.reviewed_by_user_id,
    reviewed_at: toIso(row.reviewed_at),
    eligibility_starts_at: toIso(row.eligibility_starts_at),
    eligibility_ends_at: toIso(row.eligibility_ends_at),
    revalidate_after: toIso(row.revalidate_after),
    consent_reference: row.consent_reference,
    metadata: row.metadata ?? {},
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapDriverEligibility(row: DriverEligibilityRow) {
  return {
    user_id: row.user_id,
    status: row.status,
    license_number_last4: row.license_number_last4,
    license_expires_at: row.license_expires_at,
    insurance_expires_at: row.insurance_expires_at,
    puc_expires_at: row.puc_expires_at,
    last_verified_at: toIso(row.last_verified_at),
    approved_at: toIso(row.approved_at),
    reviewed_by_user_id: row.reviewed_by_user_id,
    reviewed_at: toIso(row.reviewed_at),
    metadata: row.metadata ?? {},
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapVehicle(row: VehicleRow) {
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    vehicle_type: row.vehicle_type,
    make: row.make,
    model: row.model,
    color: row.color,
    registration_number_last4: row.registration_number_last4,
    seat_capacity: row.seat_capacity,
    status: row.status,
    verification_status: row.verification_status,
    reviewed_by_user_id: row.reviewed_by_user_id,
    reviewed_at: toIso(row.reviewed_at),
    metadata: row.metadata ?? {},
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function findStudentVerificationByUserId(userId: string) {
  const result = await dbQuery<StudentVerificationRow>(
    `SELECT
       id,
       user_id,
       provider,
       status,
       student_identifier_last4,
       institution_name,
       program_name,
       admission_year,
       graduation_year,
       verified_at,
       reviewed_by_user_id,
       reviewed_at,
       eligibility_starts_at,
       eligibility_ends_at,
       revalidate_after,
       consent_reference,
       metadata,
       created_at,
       updated_at
     FROM student_verifications
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ? mapStudentVerification(result.rows[0]) : null;
}

export async function upsertStudentVerification(
  input: {
    userId: string;
    provider: string;
    status: string;
    studentIdentifierLast4: string | null;
    institutionName: string;
    programName: string | null;
    admissionYear: number;
    graduationYear: number;
    verifiedAt: Date | null;
    reviewedByUserId: string | null;
    reviewedAt: Date | null;
    eligibilityStartsAt: Date | null;
    eligibilityEndsAt: Date;
    revalidateAfter: Date | null;
    consentReference: string | null;
    metadata: Record<string, unknown>;
  },
  client: PoolClient,
) {
  const result = await client.query<StudentVerificationRow>(
    `INSERT INTO student_verifications (
       user_id,
       provider,
       status,
       student_identifier_last4,
       institution_name,
       program_name,
       admission_year,
       graduation_year,
       verified_at,
       reviewed_by_user_id,
       reviewed_at,
       eligibility_starts_at,
       eligibility_ends_at,
       revalidate_after,
       consent_reference,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
     ON CONFLICT (user_id)
     DO UPDATE SET
       provider = EXCLUDED.provider,
       status = EXCLUDED.status,
       student_identifier_last4 = EXCLUDED.student_identifier_last4,
       institution_name = EXCLUDED.institution_name,
       program_name = EXCLUDED.program_name,
       admission_year = EXCLUDED.admission_year,
       graduation_year = EXCLUDED.graduation_year,
       verified_at = EXCLUDED.verified_at,
       reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
       reviewed_at = EXCLUDED.reviewed_at,
       eligibility_starts_at = EXCLUDED.eligibility_starts_at,
       eligibility_ends_at = EXCLUDED.eligibility_ends_at,
       revalidate_after = EXCLUDED.revalidate_after,
       consent_reference = EXCLUDED.consent_reference,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING
       id,
       user_id,
       provider,
       status,
       student_identifier_last4,
       institution_name,
       program_name,
       admission_year,
       graduation_year,
       verified_at,
       reviewed_by_user_id,
       reviewed_at,
       eligibility_starts_at,
       eligibility_ends_at,
       revalidate_after,
       consent_reference,
       metadata,
       created_at,
       updated_at`,
    [
      input.userId,
      input.provider,
      input.status,
      input.studentIdentifierLast4,
      input.institutionName,
      input.programName,
      input.admissionYear,
      input.graduationYear,
      input.verifiedAt,
      input.reviewedByUserId,
      input.reviewedAt,
      input.eligibilityStartsAt,
      input.eligibilityEndsAt,
      input.revalidateAfter,
      input.consentReference,
      JSON.stringify(input.metadata),
    ],
  );

  return mapStudentVerification(result.rows[0]);
}

export async function syncUserVerificationProfile(
  input: {
    userId: string;
    isVerified: boolean;
    college: string | null;
    genderForMatching?: string | null;
  },
  client: PoolClient,
) {
  await client.query(
    `UPDATE user_profiles
     SET
       is_verified = $2,
       college = CASE
         WHEN $3::text IS NULL OR college IS NOT NULL THEN college
         ELSE $3::text
       END,
       gender_for_matching = CASE
         WHEN $4::text IS NULL THEN gender_for_matching
         ELSE $4::text
       END,
       updated_at = now()
     WHERE user_id = $1`,
    [input.userId, input.isVerified, input.college, input.genderForMatching ?? null],
  );
}

export async function findDriverEligibilityByUserId(userId: string) {
  const result = await dbQuery<DriverEligibilityRow>(
    `SELECT
       user_id,
       status,
       license_number_last4,
       to_char(license_expires_at, 'YYYY-MM-DD') AS license_expires_at,
       to_char(insurance_expires_at, 'YYYY-MM-DD') AS insurance_expires_at,
       to_char(puc_expires_at, 'YYYY-MM-DD') AS puc_expires_at,
       last_verified_at,
       approved_at,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at
     FROM driver_eligibility
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ? mapDriverEligibility(result.rows[0]) : null;
}

export async function upsertDriverEligibility(
  input: {
    userId: string;
    status: string;
    licenseNumberLast4: string;
    licenseExpiresAt: string;
    insuranceExpiresAt: string | null;
    pucExpiresAt: string | null;
    lastVerifiedAt: Date | null;
    approvedAt: Date | null;
    reviewedByUserId: string | null;
    reviewedAt: Date | null;
    metadata: Record<string, unknown>;
  },
  client: PoolClient,
) {
  const result = await client.query<DriverEligibilityRow>(
    `INSERT INTO driver_eligibility (
       user_id,
       status,
       license_number_last4,
       license_expires_at,
       insurance_expires_at,
       puc_expires_at,
       last_verified_at,
       approved_at,
       reviewed_by_user_id,
       reviewed_at,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     ON CONFLICT (user_id)
     DO UPDATE SET
       status = EXCLUDED.status,
       license_number_last4 = EXCLUDED.license_number_last4,
       license_expires_at = EXCLUDED.license_expires_at,
       insurance_expires_at = EXCLUDED.insurance_expires_at,
       puc_expires_at = EXCLUDED.puc_expires_at,
       last_verified_at = EXCLUDED.last_verified_at,
       approved_at = EXCLUDED.approved_at,
       reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
       reviewed_at = EXCLUDED.reviewed_at,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING
       user_id,
       status,
       license_number_last4,
       to_char(license_expires_at, 'YYYY-MM-DD') AS license_expires_at,
       to_char(insurance_expires_at, 'YYYY-MM-DD') AS insurance_expires_at,
       to_char(puc_expires_at, 'YYYY-MM-DD') AS puc_expires_at,
       last_verified_at,
       approved_at,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at`,
    [
      input.userId,
      input.status,
      input.licenseNumberLast4,
      input.licenseExpiresAt,
      input.insuranceExpiresAt,
      input.pucExpiresAt,
      input.lastVerifiedAt,
      input.approvedAt,
      input.reviewedByUserId,
      input.reviewedAt,
      JSON.stringify(input.metadata),
    ],
  );

  return mapDriverEligibility(result.rows[0]);
}

export async function listVehiclesByOwner(userId: string) {
  const result = await dbQuery<VehicleRow>(
    `SELECT
       id,
       owner_user_id,
       vehicle_type,
       make,
       model,
       color,
       registration_number_last4,
       seat_capacity,
       status,
       verification_status,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at
     FROM vehicles
     WHERE owner_user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows.map(mapVehicle);
}

export async function createVehicle(
  input: {
    ownerUserId: string;
    vehicleType: string;
    make: string | null;
    model: string | null;
    color: string | null;
    registrationNumberLast4: string;
    seatCapacity: number;
    metadata: Record<string, unknown>;
  },
  client: PoolClient,
) {
  const result = await client.query<VehicleRow>(
    `INSERT INTO vehicles (
       owner_user_id,
       vehicle_type,
       make,
       model,
       color,
       registration_number_last4,
       seat_capacity,
       status,
       verification_status,
       reviewed_by_user_id,
       reviewed_at,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'pending_review', NULL, NULL, $8::jsonb)
     RETURNING
       id,
       owner_user_id,
       vehicle_type,
       make,
       model,
       color,
       registration_number_last4,
       seat_capacity,
       status,
       verification_status,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at`,
    [
      input.ownerUserId,
      input.vehicleType,
      input.make,
      input.model,
      input.color,
      input.registrationNumberLast4,
      input.seatCapacity,
      JSON.stringify(input.metadata),
    ],
  );

  return mapVehicle(result.rows[0]);
}

export async function findVehicleByIdForOwner(userId: string, vehicleId: string) {
  const result = await dbQuery<VehicleRow>(
    `SELECT
       id,
       owner_user_id,
       vehicle_type,
       make,
       model,
       color,
       registration_number_last4,
       seat_capacity,
       status,
       verification_status,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at
     FROM vehicles
     WHERE owner_user_id = $1
       AND id = $2
     LIMIT 1`,
    [userId, vehicleId],
  );

  return result.rows[0] ? mapVehicle(result.rows[0]) : null;
}

export async function findVehicleById(vehicleId: string) {
  const result = await dbQuery<VehicleRow>(
    `SELECT
       id,
       owner_user_id,
       vehicle_type,
       make,
       model,
       color,
       registration_number_last4,
       seat_capacity,
       status,
       verification_status,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at
     FROM vehicles
     WHERE id = $1
     LIMIT 1`,
    [vehicleId],
  );

  return result.rows[0] ? mapVehicle(result.rows[0]) : null;
}

export async function updateVehicle(
  input: {
    ownerUserId: string;
    vehicleId: string;
    vehicleType: string;
    make: string | null;
    model: string | null;
    color: string | null;
    registrationNumberLast4: string;
    seatCapacity: number;
    status: string;
    verificationStatus: string;
    reviewedByUserId: string | null;
    reviewedAt: Date | null;
    metadata: Record<string, unknown>;
  },
  client: PoolClient,
) {
  const result = await client.query<VehicleRow>(
    `UPDATE vehicles
     SET
       vehicle_type = $3,
       make = $4,
       model = $5,
       color = $6,
       registration_number_last4 = $7,
       seat_capacity = $8,
       status = $9,
       verification_status = $10,
       reviewed_by_user_id = $11,
       reviewed_at = $12,
       metadata = $13::jsonb,
       updated_at = now()
     WHERE owner_user_id = $1
       AND id = $2
     RETURNING
       id,
       owner_user_id,
       vehicle_type,
       make,
       model,
       color,
       registration_number_last4,
       seat_capacity,
       status,
       verification_status,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at`,
    [
      input.ownerUserId,
      input.vehicleId,
      input.vehicleType,
      input.make,
      input.model,
      input.color,
      input.registrationNumberLast4,
      input.seatCapacity,
      input.status,
      input.verificationStatus,
      input.reviewedByUserId,
      input.reviewedAt,
      JSON.stringify(input.metadata),
    ],
  );

  return result.rows[0] ? mapVehicle(result.rows[0]) : null;
}

export async function findTransactionEligibilityByUserId(userId: string) {
  const result = await dbQuery<TransactionEligibilityRow>(
    `SELECT
       sv.status AS student_verification_status,
       sv.eligibility_ends_at AS student_eligibility_ends_at,
       de.status AS driver_eligibility_status
     FROM users u
     LEFT JOIN student_verifications sv ON sv.user_id = u.id
     LEFT JOIN driver_eligibility de ON de.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function findApprovedVehicleForOwner(userId: string, vehicleId: string) {
  const result = await dbQuery<VehicleRow>(
    `SELECT
       id,
       owner_user_id,
       vehicle_type,
       make,
       model,
       color,
       registration_number_last4,
       seat_capacity,
       status,
       verification_status,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at
     FROM vehicles
     WHERE owner_user_id = $1
       AND id = $2
       AND status = 'active'
       AND verification_status = 'approved'
     LIMIT 1`,
    [userId, vehicleId],
  );

  return result.rows[0] ? mapVehicle(result.rows[0]) : null;
}

export async function listPendingStudentVerifications(limit: number) {
  const result = await dbQuery<StudentVerificationRow>(
    `SELECT
       id,
       user_id,
       provider,
       status,
       student_identifier_last4,
       institution_name,
       program_name,
       admission_year,
       graduation_year,
       verified_at,
       reviewed_by_user_id,
       reviewed_at,
       eligibility_starts_at,
       eligibility_ends_at,
       revalidate_after,
       consent_reference,
       metadata,
       created_at,
       updated_at
     FROM student_verifications
     WHERE status = 'pending_review'
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map(mapStudentVerification);
}

export async function listPendingDriverEligibilityReviews(limit: number) {
  const result = await dbQuery<DriverEligibilityRow>(
    `SELECT
       user_id,
       status,
       license_number_last4,
       to_char(license_expires_at, 'YYYY-MM-DD') AS license_expires_at,
       to_char(insurance_expires_at, 'YYYY-MM-DD') AS insurance_expires_at,
       to_char(puc_expires_at, 'YYYY-MM-DD') AS puc_expires_at,
       last_verified_at,
       approved_at,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at
     FROM driver_eligibility
     WHERE status = 'pending_review'
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map(mapDriverEligibility);
}

export async function listPendingVehicleReviews(limit: number) {
  const result = await dbQuery<VehicleRow>(
    `SELECT
       id,
       owner_user_id,
       vehicle_type,
       make,
       model,
       color,
       registration_number_last4,
       seat_capacity,
       status,
       verification_status,
       reviewed_by_user_id,
       reviewed_at,
       metadata,
       created_at,
       updated_at
     FROM vehicles
     WHERE verification_status = 'pending_review'
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map(mapVehicle);
}
