import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { operatorQuery } from "../operator/operator.repo";
import { backupStatus } from "../operator/backup-status";
import { B2ReceiptStore } from "../operator/b2-receipt-store";
import { SignedReceiptStore } from "../operator/receipt-store";
import { inProtectedTransaction } from "../protected-mutation/protocol";
import { recordDurableNotification, markDurableNotificationReady } from "../notifications/contract.repo";
import { readEvidence } from "./student-evidence.storage";
import * as evidenceRepo from "./driver-car.repo";

type Type = evidenceRepo.SubjectType;
export type Decision = { outcome: "approved" | "rejected" | "revoked"; reason: string; review_after: string | null };
type EvidenceSnapshot = { purpose: evidenceRepo.EvidencePurpose; objectKey: string;
  contentType: string; byteCount: number; sha256: string; uploadedAt: string };
type Operation = { id: string; operator_id: string; idempotency_key: string; payload_digest: string;
  subject_type: Type; subject_id: string; applicant_user_id: string; outcome: Decision["outcome"];
  reason: string; review_after: string | null; decision_snapshot: Record<string, unknown>;
  evidence_snapshot: EvidenceSnapshot[];
  state: "committed" | "acknowledged" | "recovered"; committed_at: Date };
type Receipt = { operationId: string; operatorId: string; idempotencyKey: string;
  payloadDigest: string; subjectType: Type; subjectId: string; applicantId: string;
  outcome: Decision["outcome"]; reason: string; reviewAfter: string | null;
  decisionSnapshot: Record<string, unknown>; evidenceSnapshot: EvidenceSnapshot[]; committedAt: string };

let crashHook: ((point: "after_commit" | "after_receipt", operationId: string) => void) | null = null;
export function setDriverCarReviewCrashHookForTests(hook: typeof crashHook) {
  if (process.env.NODE_ENV !== "test") throw new Error("Driver-car review crash hooks are test-only");
  crashHook = hook;
}

function dateOnly(value: string | Date | null) {
  return value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
    : value;
}

function digest(type: Type, id: string, decision: Decision) {
  return createHash("sha256").update(JSON.stringify({ type, id, decision })).digest("hex");
}
function receipt(row: Operation): Receipt {
  return { operationId: row.id, operatorId: row.operator_id, idempotencyKey: row.idempotency_key,
    payloadDigest: row.payload_digest, subjectType: row.subject_type, subjectId: row.subject_id,
    applicantId: row.applicant_user_id, outcome: row.outcome, reason: row.reason,
    reviewAfter: dateOnly(row.review_after), decisionSnapshot: row.decision_snapshot,
    evidenceSnapshot: row.evidence_snapshot,
    committedAt: row.committed_at.toISOString() };
}
function store() {
  if (env.NODE_ENV === "production" &&
      process.env.PILOT_DRIVER_CAR_REVIEW_RECEIPT_RETENTION_VERIFIED !== "true") {
    throw new AppError(503, "Driver-car receipt retention is unverified", "RECOVERY_UNAVAILABLE");
  }
  const secret = process.env.PILOT_RECEIPT_SECRET ?? env.PILOT_RECEIPT_SECRET;
  if (!secret || secret.length < 32) throw new AppError(503, "Recovery evidence unavailable", "RECOVERY_UNAVAILABLE");
  if (env.PILOT_RECEIPT_BACKEND === "b2") {
    const { PILOT_B2_BUCKET: bucket, PILOT_B2_ENDPOINT: endpoint, PILOT_B2_WRITER_KEY_ID: keyId,
      PILOT_B2_WRITER_KEY: applicationKey, PILOT_B2_PREFIX: prefix,
      PILOT_B2_RETENTION_DAYS: retentionDays } = env;
    if (!bucket || !endpoint || !keyId || !applicationKey || !prefix || !retentionDays) {
      throw new AppError(503, "Recovery evidence unavailable", "RECOVERY_UNAVAILABLE");
    }
    return new B2ReceiptStore<Receipt>({ bucket, endpoint, keyId, applicationKey,
      prefix, retentionDays, secret }, "driver-car-review");
  }
  const path = process.env.PILOT_RECEIPT_PATH ?? env.PILOT_RECEIPT_PATH;
  if (env.NODE_ENV === "production" || !path) throw new AppError(503, "Recovery evidence unavailable", "RECOVERY_UNAVAILABLE");
  return new SignedReceiptStore<Receipt>(`${path}.driver-car-review`, secret);
}
async function restrict(database: Pool, cause: string) {
  await inProtectedTransaction(database, async (client) => {
    await operatorQuery(client, "recoveryModeForUpdate");
    await operatorQuery(client, "enterRestrictedMode", [cause]);
    await operatorQuery(client, "recordRestriction", [cause]);
  });
}
async function byKey(client: Pool | PoolClient, operatorId: string, key: string) {
  return (await client.query<Operation>(
    `SELECT * FROM driver_car_review_operations WHERE operator_id = $1 AND idempotency_key = $2`,
    [operatorId, key])).rows[0] ?? null;
}
async function evidence(client: PoolClient, type: Type, id: string, purpose: evidenceRepo.EvidencePurpose) {
  const row = await evidenceRepo.evidenceForUpdate(client, type, id, purpose);
  if (!row || row.status !== "pending_review") throw new AppError(409, `${purpose} evidence is required`, "EVIDENCE_REQUIRED");
  try {
    const bytes = await readEvidence(row.object_key);
    if (bytes.length !== row.byte_count || createHash("sha256").update(bytes).digest("hex") !== row.sha256) {
      throw new Error("Evidence digest mismatch");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AppError(409, "Evidence is missing", "EVIDENCE_LOST");
    throw new AppError(503, "Evidence storage is unavailable", "EVIDENCE_STORAGE_UNAVAILABLE");
  }
  return { purpose, sha256: row.sha256, objectKey: row.object_key };
}
async function subject(client: PoolClient, type: Type, id: string, outcome: Decision["outcome"]) {
  if (type === "driver") {
    const student = outcome === "approved" ? (await client.query<{
      status: string; adult_eligible: boolean; eligibility_ends_at: Date }>(
      `SELECT status, adult_eligible, eligibility_ends_at FROM student_verifications
       WHERE user_id = $1 FOR SHARE`, [id])).rows[0] : null;
    const row = (await client.query<{ user_id: string; status: string; license_expires_at: string | null }>(
      `SELECT user_id, status, license_number_last4, to_char(license_expires_at, 'YYYY-MM-DD') AS license_expires_at,
       to_char(insurance_expires_at, 'YYYY-MM-DD') AS insurance_expires_at,
       to_char(puc_expires_at, 'YYYY-MM-DD') AS puc_expires_at
       FROM driver_eligibility WHERE user_id = $1 FOR UPDATE`, [id])).rows[0];
    if (!row) throw new AppError(404, "Driver submission not found", "SUBMISSION_NOT_FOUND");
    if (outcome === "revoked" ? row.status !== "approved" : row.status !== "pending_review") {
      throw new AppError(409, "Driver review transition is invalid", "DRIVER_REVIEW_CONFLICT");
    }
    if (outcome === "approved") {
      if (!student || !["verified", "revalidation_due"].includes(student.status) || !student.adult_eligible ||
          new Date(student.eligibility_ends_at) <= new Date()) throw new AppError(409,
        "Current approved student status is required", "STUDENT_VERIFICATION_INACTIVE");
      if (!row.license_expires_at || row.license_expires_at <= new Date().toISOString().slice(0, 10)) {
        throw new AppError(409, "Licence is expired", "DRIVER_LICENCE_EXPIRED");
      }
      await evidence(client, type, id, "licence");
    }
    return { applicantId: row.user_id, snapshot: row };
  }
  if (type === "vehicle") {
    const row = await evidenceRepo.vehicleForUpdate(client, id);
    if (!row) throw new AppError(404, "Car submission not found", "SUBMISSION_NOT_FOUND");
    if (outcome === "revoked" ? row.verification_status !== "approved" : row.verification_status !== "pending_review") {
      throw new AppError(409, "Car review transition is invalid", "VEHICLE_REVIEW_CONFLICT");
    }
    if (outcome === "approved") {
      if (!["car", "suv"].includes(row.vehicle_type) || row.use_category !== "private" ||
          row.applicable_document_required === null ||
          !row.insurance_expires_at || row.insurance_expires_at <= new Date().toISOString().slice(0, 10) ||
          (row.registration_expires_at && row.registration_expires_at <= new Date().toISOString().slice(0, 10))) {
        throw new AppError(409, "Car is outside pilot eligibility", "VEHICLE_INELIGIBLE");
      }
      await evidence(client, type, id, "registration");
      await evidence(client, type, id, "insurance");
      if (row.applicable_document_required) await evidence(client, type, id, "applicable");
    }
    return { applicantId: row.owner_user_id, snapshot: row };
  }
  const candidate = (await client.query<{ vehicle_id: string }>(
    `SELECT vehicle_id FROM driver_vehicle_approvals WHERE id = $1`, [id])).rows[0];
  if (!candidate) throw new AppError(404, "Association submission not found", "SUBMISSION_NOT_FOUND");
  const car = await evidenceRepo.vehicleForUpdate(client, candidate.vehicle_id);
  const row = (await client.query<{ id: string; driver_user_id: string; vehicle_id: string; status: string;
    permission_category: string }>(`SELECT * FROM driver_vehicle_approvals WHERE id = $1 FOR UPDATE`, [id])).rows[0];
  if (!row) throw new AppError(404, "Association submission not found", "SUBMISSION_NOT_FOUND");
  if (outcome === "revoked" ? row.status !== "approved" : row.status !== "pending_review") {
    throw new AppError(409, "Association review transition is invalid", "ASSOCIATION_REVIEW_CONFLICT");
  }
  if (outcome === "approved") {
    if (!car || (row.permission_category === "owner" && car.owner_user_id !== row.driver_user_id)) {
      throw new AppError(409, "Permission to use this car is invalid", "PERMISSION_INVALID");
    }
    await evidence(client, type, id, "permission");
  }
  return { applicantId: row.driver_user_id, snapshot: row };
}
async function apply(client: PoolClient, row: Operation, replaying = false) {
  if (replaying) {
    const table = row.subject_type === "driver" ? "driver_eligibility"
      : row.subject_type === "vehicle" ? "vehicles" : "driver_vehicle_approvals";
    const column = row.subject_type === "driver" ? "user_id" : "id";
    const current = (await client.query<{ reviewed_at: Date | null }>(
      `SELECT reviewed_at FROM ${table} WHERE ${column} = $1 FOR UPDATE`, [row.subject_id])).rows[0];
    if (current?.reviewed_at && current.reviewed_at > row.committed_at) return;
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
}

async function restoreMissingSubject(client: PoolClient, row: Operation) {
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
async function auditAndNotify(client: PoolClient, row: Operation) {
  await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
    SELECT $1, 'driver_car_reviewed', $2, $3, jsonb_build_object('operationId', $4::text,
      'outcome', $5::text, 'reason', $6::text, 'reviewAfter', $7::text), $8
    WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'driver_car_reviewed' AND metadata->>'operationId' = $4)`,
    [row.operator_id, row.subject_type, row.subject_id, row.id, row.outcome,
      row.reason, row.review_after, row.committed_at]);
  await recordDurableNotification(client, {
    eventId: row.id, originType: "driver_car_review", operationId: row.id,
    recipientId: row.applicant_user_id, eventType: "driver_car_eligibility_reviewed",
    relatedEntityType: row.subject_type, relatedEntityId: row.subject_id,
    title: "Driving eligibility review", body: `Your ${row.subject_type} review is ${row.outcome}. See your account for the reason.`,
  });
}
function result(row: Operation) { return { id: row.id, state: row.state, subject_type: row.subject_type,
  subject_id: row.subject_id, outcome: row.outcome, review_after: dateOnly(row.review_after) }; }

export class DriverCarReviewService {
  constructor(private readonly database: Pool = pool) {}
  async receipts() { return store().list(); }
  async verifyEvidence(retry?: { operatorId: string; key: string }) {
    try {
      const backup = await backupStatus(this.database);
      if (backup.required && !backup.healthy) throw new AppError(503, "Database backup is stale", "BACKUP_STALE");
      const receipts = new Map((await this.receipts()).map((item) => [item.operationId, item]));
      for (const item of receipts.values()) {
        if (item.payloadDigest !== digest(item.subjectType, item.subjectId,
          { outcome: item.outcome, reason: item.reason, review_after: item.reviewAfter })) {
          throw new AppError(503, "Driver-car recovery receipt is inconsistent", "RECOVERY_CONFLICT");
        }
      }
      const rows = (await this.database.query<Operation>(
        `SELECT * FROM driver_car_review_operations WHERE state IN ('acknowledged', 'recovered')`)).rows;
      for (const row of rows) {
        if (JSON.stringify(receipts.get(row.id)) !== JSON.stringify(receipt(row))) {
          throw new AppError(503, "Driver-car recovery evidence is inconsistent", "RECOVERY_MISSING");
        }
      }
      const pending = (await this.database.query<Operation>(
        `SELECT * FROM driver_car_review_operations WHERE state = 'committed'`)).rows;
      if (pending.length && (!retry || pending.some((row) => row.operator_id !== retry.operatorId ||
          row.idempotency_key !== retry.key))) {
        throw new AppError(503, "A driver-car decision awaits recovery evidence", "OPERATION_PENDING",
          { operationId: pending[0].id });
      }
    } catch (error) {
      await restrict(this.database, "driver_car_review_evidence_unavailable");
      throw error;
    }
  }
  async decide(operatorId: string, key: string, type: Type, id: string, decision: Decision) {
    await this.verifyEvidence({ operatorId, key });
    const payloadDigest = digest(type, id, decision);
    const operation = await inProtectedTransaction(this.database, async (client) => {
      const recovery = await operatorQuery<{ mode: string }>(client, "recoveryModeForUpdate");
      await assertCurrentOperator(client, operatorId);
      await operatorQuery(client, "lockIdempotencyKey", [`driver-car-review:${operatorId}:${key}`]);
      const existing = await byKey(client, operatorId, key);
      if (existing) {
        if (existing.payload_digest !== payloadDigest) throw new AppError(409,
          "Idempotency key used with another decision", "IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      if (recovery.rows[0]?.mode !== "open") throw new AppError(503, "Protected writes are restricted", "RECOVERY_RESTRICTED");
      store();
      const current = await subject(client, type, id, decision.outcome);
      const evidenceSnapshot = (await client.query<{
        purpose: evidenceRepo.EvidencePurpose; object_key: string; content_type: string;
        byte_count: number; sha256: string; uploaded_at: Date;
      }>(`SELECT purpose, object_key, content_type, byte_count, sha256, uploaded_at
          FROM driver_car_evidence WHERE subject_type = $1 AND subject_id = $2
            AND status IN ('pending_review', 'retained') ORDER BY purpose FOR SHARE`, [type, id]))
        .rows.map((item): EvidenceSnapshot => ({ purpose: item.purpose, objectKey: item.object_key,
          contentType: item.content_type, byteCount: item.byte_count, sha256: item.sha256,
          uploadedAt: item.uploaded_at.toISOString() }));
      if (decision.outcome === "approved" && (!decision.review_after ||
          decision.review_after <= new Date().toISOString().slice(0, 10))) {
        throw new AppError(409, "Review date must be in the future", "REVIEW_DATE_INVALID");
      }
      const row = (await client.query<Operation>(`INSERT INTO driver_car_review_operations
        (operator_id, idempotency_key, payload_digest, subject_type, subject_id,
         applicant_user_id, outcome, reason, review_after, decision_snapshot,
         evidence_snapshot, state)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, 'committed') RETURNING *`,
        [operatorId, key, payloadDigest, type, id, current.applicantId, decision.outcome,
          decision.reason, decision.review_after, JSON.stringify(current.snapshot),
          JSON.stringify(evidenceSnapshot)])).rows[0];
      await apply(client, row);
      if (row.outcome === "revoked") {
        const affected = await evidenceRepo.applyRevocationToRides(client, row.subject_type, row.subject_id, row.id, row.reason);
        for (const ride of affected.held) for (const recipientId of new Set([ride.driver_id, ...ride.passenger_ids])) {
          await recordDurableNotification(client, { originType: "driver_car_ride_hold", operationId: row.id,
            recipientId, eventType: `ride_held_${ride.id}`, relatedEntityType: "ride_offer",
            relatedEntityId: ride.id, title: "Ride on hold",
            body: "This ride is on hold because driving eligibility changed." });
        }
      }
      await evidenceRepo.scheduleDeletion(client, type, id);
      await auditAndNotify(client, row);
      return row;
    });
    if (operation.state !== "committed") return result(operation);
    crashHook?.("after_commit", operation.id);
    try {
      const published = await inProtectedTransaction(this.database, async (client) => {
        const row = (await client.query<Operation>(
          `SELECT * FROM driver_car_review_operations WHERE id = $1 FOR UPDATE`, [operation.id])).rows[0];
        if (row.state !== "committed") return row;
        await store().append(receipt(row));
        crashHook?.("after_receipt", row.id);
        const backup = await backupStatus(client);
        if (backup.required && !backup.healthy) throw new AppError(503, "Database backup is stale", "BACKUP_STALE");
        const saved = (await client.query<Operation>(`UPDATE driver_car_review_operations
          SET state = 'acknowledged', acknowledged_at = now() WHERE id = $1 RETURNING *`, [row.id])).rows[0];
        await markDurableNotificationReady(client, row.id);
        await client.query(`UPDATE pilot_notification_events SET ready_at = now()
          WHERE origin_type = 'driver_car_ride_hold' AND operation_id = $1 AND ready_at IS NULL`, [row.id]);
        return saved;
      });
      return result(published);
    } catch {
      await restrict(this.database, "driver_car_review_evidence_pending");
      throw new AppError(503, "Decision committed; recovery evidence is pending", "OPERATION_PENDING",
        { operationId: operation.id });
    }
  }
  async operation(operatorId: string, id: string) {
    const row = (await this.database.query<Operation>(`SELECT * FROM driver_car_review_operations WHERE id = $1`, [id])).rows[0];
    if (!row || row.operator_id !== operatorId) throw new AppError(404, "Decision not found", "OPERATION_NOT_FOUND");
    const recovery = await operatorQuery<{ mode: string }>(this.database, "recoveryMode");
    return recovery.rows[0]?.mode !== "open" && row.state === "acknowledged"
      ? { ...result(row), state: "pending_unknown" } : result(row);
  }
  async operationByKey(operatorId: string, key: string) {
    const row = await byKey(this.database, operatorId, key);
    if (!row) throw new AppError(404, "Decision not found", "OPERATION_NOT_FOUND");
    return this.operation(operatorId, row.id);
  }

  async reconcileReceipts(operatorId: string) {
    const items = await this.receipts();
    for (const item of items.sort((a, b) => a.committedAt.localeCompare(b.committedAt))) {
      if (item.payloadDigest !== digest(item.subjectType, item.subjectId,
        { outcome: item.outcome, reason: item.reason, review_after: item.reviewAfter })) {
        throw new AppError(409, "Driver-car receipt conflicts with its decision", "RECOVERY_CONFLICT");
      }
      await inProtectedTransaction(this.database, async (client) => {
        await assertCurrentOperator(client, operatorId);
        const existing = (await client.query<Operation>(
          `SELECT * FROM driver_car_review_operations WHERE id = $1 FOR UPDATE`, [item.operationId])).rows[0];
        if (existing && JSON.stringify(receipt(existing)) !== JSON.stringify(item)) {
          throw new AppError(409, "Driver-car recovery conflict", "RECOVERY_CONFLICT");
        }
        if (!existing) await client.query(`INSERT INTO driver_car_review_operations
          (id, operator_id, idempotency_key, payload_digest, subject_type, subject_id,
           applicant_user_id, outcome, reason, review_after, decision_snapshot, evidence_snapshot,
           state, committed_at, acknowledged_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
            'recovered', $13, now())`,
          [item.operationId, item.operatorId, item.idempotencyKey, item.payloadDigest,
            item.subjectType, item.subjectId, item.applicantId, item.outcome, item.reason,
            item.reviewAfter, JSON.stringify(item.decisionSnapshot),
            JSON.stringify(item.evidenceSnapshot), item.committedAt]);
        const row = existing ?? (await client.query<Operation>(
          `SELECT * FROM driver_car_review_operations WHERE id = $1 FOR UPDATE`, [item.operationId])).rows[0];
        await restoreMissingSubject(client, row);
        for (const evidence of row.evidence_snapshot) {
          const prior = (await client.query<{ object_key: string; status: string; decision_at: Date | null }>(
            `SELECT object_key, status, decision_at FROM driver_car_evidence
              WHERE subject_type = $1 AND subject_id = $2 AND purpose = $3 FOR UPDATE`,
            [row.subject_type, row.subject_id, evidence.purpose])).rows[0];
          if (prior && prior.object_key !== evidence.objectKey && prior.status !== "deleted" &&
              (!prior.decision_at || prior.decision_at <= row.committed_at)) {
            await evidenceRepo.scheduleReplacedEvidenceDeletion(client, prior.object_key);
          }
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
        if (row.state === "committed") await client.query(`UPDATE driver_car_review_operations
          SET state = 'recovered', acknowledged_at = now() WHERE id = $1`, [row.id]);
        await apply(client, row, true);
        if (row.outcome === "revoked") {
          const affected = await evidenceRepo.applyRevocationToRides(client, row.subject_type, row.subject_id, row.id, row.reason);
          for (const ride of affected.held) for (const recipientId of new Set([ride.driver_id, ...ride.passenger_ids])) {
            await recordDurableNotification(client, { originType: "driver_car_ride_hold", operationId: row.id,
              recipientId, eventType: `ride_held_${ride.id}`, relatedEntityType: "ride_offer",
              relatedEntityId: ride.id, title: "Ride on hold",
              body: "This ride is on hold because driving eligibility changed." });
          }
        }
        await evidenceRepo.scheduleDeletion(client, row.subject_type, row.subject_id);
        await auditAndNotify(client, row);
        await markDurableNotificationReady(client, row.id);
        await client.query(`UPDATE pilot_notification_events SET ready_at = now()
          WHERE origin_type = 'driver_car_ride_hold' AND operation_id = $1 AND ready_at IS NULL`, [row.id]);
        await client.query(`UPDATE pilot_email_jobs SET status = 'exhausted', lease_until = NULL,
          last_error = 'Suppressed after snapshot restore; delivery outcome requires review', updated_at = now()
          WHERE event_id = $1 AND status <> 'sent'`, [row.id]);
      });
    }
    return items.length;
  }
}

export const driverCarReviewService = new DriverCarReviewService();
