import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../../db/transaction";
import { AppError } from "../../shared/errors/app-error";
import { assertCurrentOperator } from "../operator/operator.authorization";
import * as verificationRepo from "./verification.repo";
import * as repo from "./driver-car.repo";
import { deleteEvidence, readEvidence, storeEvidence } from "./student-evidence.storage";

type Type = repo.SubjectType;
type Purpose = repo.EvidencePurpose;
const purposeFor: Record<Type, readonly Purpose[]> = {
  driver: ["licence"], vehicle: ["registration", "insurance", "applicable"],
  association: ["permission"],
};

async function assertApplicantOwnsSubject(client: PoolClient, userId: string, type: Type, id: string) {
  if (type === "driver") {
    if (id !== userId) throw new AppError(404, "Submission not found", "SUBMISSION_NOT_FOUND");
    const driver = await client.query<{ status: string }>(
      "SELECT status FROM driver_eligibility WHERE user_id = $1 FOR UPDATE", [id]);
    if (!driver.rows[0]) throw new AppError(404, "Submission not found", "SUBMISSION_NOT_FOUND");
    return driver.rows[0].status;
  }
  if (type === "vehicle") {
    const car = await repo.vehicleForUpdate(client, id);
    if (!car || car.owner_user_id !== userId) throw new AppError(404, "Submission not found", "SUBMISSION_NOT_FOUND");
    return car.verification_status;
  }
  const association = await client.query<{ status: string }>(
    "SELECT status FROM driver_vehicle_approvals WHERE id = $1 AND driver_user_id = $2 FOR UPDATE", [id, userId]);
  if (!association.rows[0]) throw new AppError(404, "Submission not found", "SUBMISSION_NOT_FOUND");
  return association.rows[0].status;
}

export async function classifyVehicle(userId: string, vehicleId: string, input: {
  use_category: string; insurance_expires_at: string; registration_expires_at: string | null;
}) {
  if (input.use_category !== "private") throw new AppError(400,
    "Only private cars are eligible for this pilot", "VEHICLE_INELIGIBLE");
  return withTransaction(async (client) => {
    const student = await verificationRepo.findStudentEligibilityForUpdate(client, userId);
    if (!student || !["verified", "revalidation_due"].includes(student.status) || !student.adult_eligible ||
        new Date(student.eligibility_ends_at) <= new Date()) {
      throw new AppError(403, "Current student approval is required", "STUDENT_VERIFICATION_INACTIVE");
    }
    const car = await repo.vehicleForUpdate(client, vehicleId);
    if (!car || car.owner_user_id !== userId) throw new AppError(404, "Vehicle not found", "VEHICLE_NOT_FOUND");
    if (car.vehicle_type !== "car" && car.vehicle_type !== "suv") {
      throw new AppError(409, "Vehicle category is outside this pilot", "VEHICLE_INELIGIBLE");
    }
    const updated = await repo.classifyVehicle(client, userId, vehicleId, {
      useCategory: input.use_category, insuranceExpiresAt: input.insurance_expires_at,
      registrationExpiresAt: input.registration_expires_at,
    });
    if (!updated) throw new AppError(409, "Approved vehicle details require operator review", "VEHICLE_REVIEW_CONFLICT");
    return updated;
  });
}

export async function submitAssociation(driverId: string, vehicleId: string, permissionCategory: string) {
  return withTransaction(async (client) => {
    const student = await verificationRepo.findStudentEligibilityForUpdate(client, driverId);
    if (!student || !["verified", "revalidation_due"].includes(student.status) || !student.adult_eligible ||
        new Date(student.eligibility_ends_at) <= new Date()) {
      throw new AppError(403, "Current student approval is required", "STUDENT_VERIFICATION_INACTIVE");
    }
    const car = await repo.vehicleForUpdate(client, vehicleId);
    if (!car || !["car", "suv"].includes(car.vehicle_type) || car.use_category !== "private") {
      throw new AppError(404, "Eligible private car not found", "VEHICLE_NOT_FOUND");
    }
    if (permissionCategory === "owner" && car.owner_user_id !== driverId) {
      throw new AppError(403, "Owner permission is unavailable for this car", "PERMISSION_INVALID");
    }
    const submitted = await repo.submitAssociation(client, driverId, vehicleId, permissionCategory);
    if (!submitted) throw new AppError(409, "Association is already under review or approved", "ASSOCIATION_REVIEW_CONFLICT");
    return submitted;
  });
}

export async function uploadEvidence(userId: string, type: Type, id: string, purpose: Purpose,
  bytes: Buffer, contentType: string) {
  if (!purposeFor[type].includes(purpose)) throw new AppError(400, "Evidence purpose is invalid", "EVIDENCE_INVALID");
  let key: string | null = null;
  try {
    return await withTransaction(async (client) => {
      const status = await assertApplicantOwnsSubject(client, userId, type, id);
      if (status !== "pending_review" && status !== "rejected") {
        throw new AppError(409, "Evidence cannot be changed after approval", "EVIDENCE_REVIEWED");
      }
      const existing = await repo.evidenceForUpdate(client, type, id, purpose);
      if (existing?.status === "pending_review") throw new AppError(409, "Evidence already exists", "EVIDENCE_EXISTS");
      const stored = await storeEvidence(bytes, contentType);
      key = stored.key;
      if (existing?.status === "retained") {
        await repo.scheduleReplacedEvidenceDeletion(client, existing.object_key);
      }
      await repo.recordEvidence(client, userId, type, id, purpose, stored);
      return { status: "pending_review", uploaded_at: new Date().toISOString() };
    });
  } catch (error) {
    if (key) await deleteEvidence(key).catch(() => undefined);
    throw error;
  }
}

export async function grantEvidenceAccess(operatorId: string, type: Type, id: string, purpose: Purpose) {
  const token = randomUUID();
  await withTransaction(async (client) => {
    await assertCurrentOperator(client, operatorId);
    const evidence = await repo.evidenceForUpdate(client, type, id, purpose);
    if (!evidence || evidence.status !== "pending_review") throw new AppError(404, "Evidence unavailable", "EVIDENCE_NOT_FOUND");
    await client.query(`INSERT INTO driver_car_evidence_access_grants
      (token_hash, operator_id, evidence_id, expires_at) VALUES ($1, $2, $3, now() + interval '5 minutes')`,
      [createHash("sha256").update(token).digest("hex"), operatorId, evidence.id]);
    await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, 'driver_car_evidence_access_granted', 'driver_car_evidence', $2, '{}'::jsonb)`,
      [operatorId, evidence.id]);
  });
  return { token, expires_in_seconds: 300 };
}

export async function readPrivateEvidence(operatorId: string, type: Type, id: string, purpose: Purpose, token: string) {
  return withTransaction(async (client) => {
    await assertCurrentOperator(client, operatorId);
    const evidence = await repo.evidenceForUpdate(client, type, id, purpose);
    if (!evidence || evidence.status !== "pending_review") throw new AppError(404, "Evidence unavailable", "EVIDENCE_NOT_FOUND");
    const consumed = await client.query(`UPDATE driver_car_evidence_access_grants SET consumed_at = now()
      WHERE token_hash = $1 AND operator_id = $2 AND evidence_id = $3
      AND consumed_at IS NULL AND expires_at > now() RETURNING token_hash`,
      [createHash("sha256").update(token).digest("hex"), operatorId, evidence.id]);
    if (!consumed.rowCount) throw new AppError(403, "Evidence link expired or used", "EVIDENCE_ACCESS_EXPIRED");
    const bytes = await readEvidence(evidence.object_key);
    if (bytes.length !== evidence.byte_count || createHash("sha256").update(bytes).digest("hex") !== evidence.sha256) {
      throw new AppError(409, "Evidence integrity check failed", "EVIDENCE_LOST");
    }
    await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, 'driver_car_evidence_accessed', 'driver_car_evidence', $2, '{}'::jsonb)`,
      [operatorId, evidence.id]);
    return { bytes, contentType: evidence.content_type };
  });
}

export async function evidenceRetentionHealth(operatorId: string) {
  return withTransaction(async (client) => {
    await assertCurrentOperator(client, operatorId);
    return (await client.query(`SELECT
      count(*) FILTER (WHERE status = 'retained' AND delete_after <= now()
        AND (hold_until IS NULL OR hold_until <= now()))::int AS overdue_count,
      count(*) FILTER (WHERE status = 'retained' AND deletion_outcome = 'failed')::int AS failed_count,
      min(delete_after) FILTER (WHERE status = 'retained' AND delete_after <= now()
        AND (hold_until IS NULL OR hold_until <= now())) AS oldest_due_at
      FROM (SELECT status, delete_after, hold_until, deletion_outcome FROM driver_car_evidence
        UNION ALL SELECT status, delete_after, hold_until, deletion_outcome
          FROM driver_car_evidence_replacements) evidence`)).rows[0];
  });
}
