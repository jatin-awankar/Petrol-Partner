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
import * as reviewRepo from "./driver-car-review.repo";

type Type = evidenceRepo.SubjectType;
export type Decision = { outcome: "approved" | "rejected" | "revoked"; reason: string; review_after: string | null };
export type EvidenceSnapshot = { purpose: evidenceRepo.EvidencePurpose; objectKey: string;
  contentType: string; byteCount: number; sha256: string; uploadedAt: string };
export type Operation = { id: string; operator_id: string; idempotency_key: string; payload_digest: string;
  subject_type: Type; subject_id: string; applicant_user_id: string; outcome: Decision["outcome"];
  reason: string; review_after: string | null; decision_snapshot: Record<string, unknown>;
  evidence_snapshot: EvidenceSnapshot[];
  state: "committed" | "acknowledged" | "recovered"; committed_at: Date };
export type Receipt = { operationId: string; operatorId: string; idempotencyKey: string;
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
    const student = outcome === "approved" ? await reviewRepo.studentForShare(client, id) : null;
    const row = await reviewRepo.driverReviewForUpdate(client, id);
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
  const vehicleId = await reviewRepo.associationVehicleId(client, id);
  if (!vehicleId) throw new AppError(404, "Association submission not found", "SUBMISSION_NOT_FOUND");
  const car = await evidenceRepo.vehicleForUpdate(client, vehicleId);
  const row = await reviewRepo.associationReviewForUpdate(client, id);
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
async function auditAndNotify(client: PoolClient, row: Operation) {
  await reviewRepo.recordAudit(client, row);
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
      const rows = await reviewRepo.acknowledged(this.database);
      for (const row of rows) {
        if (JSON.stringify(receipts.get(row.id)) !== JSON.stringify(receipt(row))) {
          throw new AppError(503, "Driver-car recovery evidence is inconsistent", "RECOVERY_MISSING");
        }
      }
      const pending = await reviewRepo.pending(this.database);
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
      const existing = await reviewRepo.byKey(client, operatorId, key);
      if (existing) {
        if (existing.payload_digest !== payloadDigest) throw new AppError(409,
          "Idempotency key used with another decision", "IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      if (recovery.rows[0]?.mode !== "open") throw new AppError(503, "Protected writes are restricted", "RECOVERY_RESTRICTED");
      store();
      if (decision.outcome === "revoked") {
        await evidenceRepo.lockAffectedRidesForRevocation(client, type, id);
      }
      const current = await subject(client, type, id, decision.outcome);
      const evidenceSnapshot = (await reviewRepo.evidenceSnapshot(client, type, id))
        .map((item): EvidenceSnapshot => ({ purpose: item.purpose, objectKey: item.object_key,
          contentType: item.content_type, byteCount: item.byte_count, sha256: item.sha256,
          uploadedAt: item.uploaded_at.toISOString() }));
      if (decision.outcome === "approved" && (!decision.review_after ||
          decision.review_after <= new Date().toISOString().slice(0, 10))) {
        throw new AppError(409, "Review date must be in the future", "REVIEW_DATE_INVALID");
      }
      const row = await reviewRepo.createOperation(client, { operatorId, key, digest: payloadDigest,
        type, id, applicantId: current.applicantId, outcome: decision.outcome,
        reason: decision.reason, reviewAfter: decision.review_after,
        decisionSnapshot: current.snapshot, evidenceSnapshot });
      await reviewRepo.apply(client, row);
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
        const row = await reviewRepo.operationById(client, operation.id, true);
        if (!row) throw new AppError(503, "Decision operation is missing", "RECOVERY_MISSING");
        if (row.state !== "committed") return row;
        await store().append(receipt(row));
        crashHook?.("after_receipt", row.id);
        const backup = await backupStatus(client);
        if (backup.required && !backup.healthy) throw new AppError(503, "Database backup is stale", "BACKUP_STALE");
        const saved = await reviewRepo.acknowledge(client, row.id);
        await markDurableNotificationReady(client, row.id);
        await reviewRepo.readyRideHoldNotifications(client, row.id);
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
    const row = await reviewRepo.operationById(this.database, id);
    if (!row || row.operator_id !== operatorId) throw new AppError(404, "Decision not found", "OPERATION_NOT_FOUND");
    const recovery = await operatorQuery<{ mode: string }>(this.database, "recoveryMode");
    return recovery.rows[0]?.mode !== "open" && row.state === "acknowledged"
      ? { ...result(row), state: "pending_unknown" } : result(row);
  }
  async operationByKey(operatorId: string, key: string) {
    const row = await reviewRepo.byKey(this.database, operatorId, key);
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
        const existing = await reviewRepo.operationById(client, item.operationId, true);
        if (existing && JSON.stringify(receipt(existing)) !== JSON.stringify(item)) {
          throw new AppError(409, "Driver-car recovery conflict", "RECOVERY_CONFLICT");
        }
        if (!existing) await reviewRepo.insertRecoveredOperation(client, item);
        const row = existing ?? await reviewRepo.operationById(client, item.operationId, true);
        if (!row) throw new AppError(409, "Decision operation requires recovery review", "RECOVERY_INCOMPLETE");
        await reviewRepo.restoreMissingSubject(client, row);
        for (const evidence of row.evidence_snapshot) {
          const prior = await reviewRepo.priorEvidence(client, row.subject_type, row.subject_id, evidence.purpose);
          if (prior && prior.object_key !== evidence.objectKey && prior.status !== "deleted" &&
              (!prior.decision_at || prior.decision_at <= row.committed_at)) {
            await evidenceRepo.scheduleReplacedEvidenceDeletion(client, prior.object_key);
          }
          await reviewRepo.restoreEvidence(client, row, evidence);
        }
        if (row.state === "committed") await reviewRepo.markRecovered(client, row.id);
        const applied = await reviewRepo.apply(client, row, true);
        if (row.outcome === "revoked" && applied) {
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
        await reviewRepo.readyRideHoldNotifications(client, row.id);
        await reviewRepo.suppressRestoredEmail(client, row.id);
      });
    }
    return items.length;
  }
}

export const driverCarReviewService = new DriverCarReviewService();
