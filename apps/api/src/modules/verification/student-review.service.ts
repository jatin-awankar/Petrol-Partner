import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { recordDurableNotification, markDurableNotificationReady } from "../notifications/contract.repo";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { backupStatus } from "../operator/backup-status";
import { B2ReceiptStore } from "../operator/b2-receipt-store";
import { operatorQuery } from "../operator/operator.repo";
import { SignedReceiptStore } from "../operator/receipt-store";
import { inProtectedTransaction } from "../protected-mutation/protocol";
import type { ReviewStudentVerificationInput } from "./verification.schema";
import * as verificationRepo from "./verification.repo";
import * as reviewRepo from "./student-review.repo";
import type { StudentReviewOperation, StudentSnapshot, EvidenceSnapshot } from "./student-review.repo";
import { readEvidence } from "./student-evidence.storage";

export type ReviewReceipt = {
  operationId: string; operatorId: string; targetUserId: string; idempotencyKey: string;
  payloadDigest: string; outcome: "verified" | "rejected"; adultEligible: boolean;
  reason: string; reviewCycle: number; verificationId: string;
  studentSnapshot: StudentSnapshot; evidenceSnapshot: EvidenceSnapshot[];
  committedAt: string;
};

let afterCommitHook: ((operationId: string) => void) | null = null;
export function setStudentReviewAfterCommitHookForTests(hook: typeof afterCommitHook) {
  if (process.env.NODE_ENV !== "test") throw new Error("Student review crash hooks are test-only");
  afterCommitHook = hook;
}

function digest(targetUserId: string, input: ReviewStudentVerificationInput) {
  return createHash("sha256").update(JSON.stringify({ targetUserId,
    outcome: input.outcome, adultEligible: input.adult_eligible, reason: input.reason })).digest("hex");
}

function store() {
  const secret = process.env.PILOT_RECEIPT_SECRET ?? env.PILOT_RECEIPT_SECRET;
  if (!secret || secret.length < 32) throw new AppError(503, "Recovery evidence is unavailable", "RECOVERY_UNAVAILABLE");
  if (env.PILOT_RECEIPT_BACKEND === "b2") {
    const { PILOT_B2_BUCKET: bucket, PILOT_B2_ENDPOINT: endpoint,
      PILOT_B2_WRITER_KEY_ID: keyId, PILOT_B2_WRITER_KEY: applicationKey,
      PILOT_B2_PREFIX: prefix, PILOT_B2_RETENTION_DAYS: retentionDays } = env;
    if (!bucket || !endpoint || !keyId || !applicationKey || !prefix || !retentionDays) {
      throw new AppError(503, "Recovery evidence is unavailable", "RECOVERY_UNAVAILABLE");
    }
    return new B2ReceiptStore<ReviewReceipt>(
      { bucket, endpoint, keyId, applicationKey, prefix, retentionDays, secret }, "student-review",
    );
  }
  const path = process.env.PILOT_RECEIPT_PATH ?? env.PILOT_RECEIPT_PATH;
  if (env.NODE_ENV === "production" || !path) throw new AppError(503, "Recovery evidence is unavailable", "RECOVERY_UNAVAILABLE");
  return new SignedReceiptStore<ReviewReceipt>(`${path}.student-review`, secret);
}

function receipt(row: StudentReviewOperation): ReviewReceipt {
  return {
    operationId: row.id, operatorId: row.operator_id, targetUserId: row.target_user_id,
    idempotencyKey: row.idempotency_key, payloadDigest: row.payload_digest,
    outcome: row.outcome, adultEligible: row.adult_eligible, reason: row.reason,
    reviewCycle: row.review_cycle, verificationId: row.verification_id,
    studentSnapshot: row.student_snapshot, evidenceSnapshot: row.evidence_snapshot,
    committedAt: row.committed_at.toISOString(),
  };
}

function result(row: StudentReviewOperation) {
  return { id: row.id, state: row.state, target_user_id: row.target_user_id,
    outcome: row.outcome, review_cycle: row.review_cycle };
}

async function restrict(database: Pool, cause: string) {
  await inProtectedTransaction(database, async (client) => {
    await operatorQuery(client, "recoveryModeForUpdate");
    await operatorQuery(client, "enterRestrictedMode", [cause]);
    await operatorQuery(client, "recordRestriction", [cause]);
  });
}

async function notify(client: PoolClient, row: StudentReviewOperation) {
  await recordDurableNotification(client, {
    eventId: row.id, originType: "student_review", operationId: row.id,
    recipientId: row.target_user_id, eventType: "student_eligibility_reviewed",
    relatedEntityType: "student_verification", relatedEntityId: row.verification_id,
    title: "Student eligibility review", body: row.outcome === "verified"
      ? "Your student and adult eligibility was approved. Other participation requirements still apply."
      : "Your student eligibility submission was not approved. Review the reason in your account.",
  });
}

export class StudentReviewService {
  constructor(private readonly database: Pool = pool) {}

  async receipts() { return store().list(); }

  async verifyEvidence(retry?: { operatorId: string; idempotencyKey: string }) {
    try {
      const backup = await backupStatus(this.database);
      if (backup.required && !backup.healthy) throw new AppError(503, "Database backup is stale", "BACKUP_STALE");
      const byId = new Map<string, ReviewReceipt>();
      for (const item of await this.receipts()) {
        const prior = byId.get(item.operationId);
        if (prior && JSON.stringify(prior) !== JSON.stringify(item)) {
          throw new AppError(503, "Student review receipts conflict", "RECOVERY_CONFLICT");
        }
        byId.set(item.operationId, item);
      }
      for (const row of await reviewRepo.acknowledged(this.database)) {
        const item = byId.get(row.id);
        if (!item || JSON.stringify(item) !== JSON.stringify(receipt(row)) ||
            item.payloadDigest !== digest(item.targetUserId, {
              outcome: item.outcome, adult_eligible: item.adultEligible, reason: item.reason,
            })) throw new AppError(503, "Student review recovery evidence is inconsistent", "RECOVERY_MISSING");
      }
      const pending = await reviewRepo.pending(this.database);
      if (pending.length) {
        await restrict(this.database, "student_review_evidence_pending");
        if (!retry || pending.some((row) => row.operator_id !== retry.operatorId ||
            row.idempotency_key !== retry.idempotencyKey)) {
          throw new AppError(503, "Student review decision is pending recovery evidence", "OPERATION_PENDING",
            { operationId: pending[0].id });
        }
      }
    } catch (error) {
      await restrict(this.database, "student_review_evidence_unavailable");
      throw error;
    }
  }

  async decide(operatorId: string, idempotencyKey: string, targetUserId: string,
    input: ReviewStudentVerificationInput) {
    await this.verifyEvidence({ operatorId, idempotencyKey });
    const payloadDigest = digest(targetUserId, input);
    let operation: StudentReviewOperation;
    try { operation = await inProtectedTransaction(this.database, async (client) => {
      const recovery = await operatorQuery<{ mode: string }>(client, "recoveryModeForUpdate");
      await assertCurrentOperator(client, operatorId);
      await operatorQuery(client, "lockIdempotencyKey", [`student-review:${operatorId}:${idempotencyKey}`]);
      const existing = await reviewRepo.byKey(client, operatorId, idempotencyKey);
      if (existing) {
        if (existing.payload_digest !== payloadDigest) throw new AppError(409,
          "Idempotency key used with another decision", "IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      if (recovery.rows[0]?.mode !== "open") throw new AppError(503,
        "Protected writes are restricted", "RECOVERY_RESTRICTED");
      store();
      const current = await verificationRepo.findStudentVerificationForUpdate(client, targetUserId);
      if (!current || current.status !== "pending_review" || !current.enrolled_name ||
          !current.evidence_category || !current.age_evidence_category ||
          !current.admission_year || !current.graduation_year || !current.eligibility_ends_at) throw new AppError(409,
        "Only complete pending submissions can be reviewed", "STUDENT_REVIEW_CONFLICT");
      if (input.outcome === "verified" && new Date(current.eligibility_ends_at).getTime() <= Date.now()) {
        throw new AppError(409, "Enrollment evidence has expired", "STUDENT_ENROLLMENT_EXPIRED");
      }
      if (!await reviewRepo.verifiedEmailForReview(client, targetUserId)) throw new AppError(409, "Email ownership must be verified", "EMAIL_NOT_VERIFIED");
      const evidenceSnapshot: EvidenceSnapshot[] = [];
      for (const purpose of ["enrollment", "age"] as const) {
        const evidence = await verificationRepo.studentEvidenceForUpdate(client, targetUserId, purpose, current.review_cycle);
        if (!evidence || evidence.status !== "pending_review") throw new AppError(409,
          `${purpose} evidence is required`, "EVIDENCE_REQUIRED");
        try {
          const bytes = await readEvidence(evidence.object_key);
          if (bytes.length !== evidence.byte_count ||
              createHash("sha256").update(bytes).digest("hex") !== evidence.sha256) throw new Error("Evidence digest mismatch");
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AppError(409, "Evidence was lost; request a new upload", "EVIDENCE_LOST");
          throw new AppError(503, "Evidence provider is unavailable", "EVIDENCE_STORAGE_UNAVAILABLE");
        }
        evidenceSnapshot.push({ purpose, key: evidence.object_key, contentType: evidence.content_type,
          byteCount: evidence.byte_count, sha256: evidence.sha256,
          uploadedAt: evidence.uploaded_at.toISOString() });
      }
      const studentSnapshot: StudentSnapshot = {
        provider: current.provider, enrolledName: current.enrolled_name,
        institutionName: current.institution_name, programName: current.program_name,
        admissionYear: current.admission_year, graduationYear: current.graduation_year,
        evidenceCategory: current.evidence_category, ageEvidenceCategory: current.age_evidence_category,
        eligibilityStartsAt: current.eligibility_starts_at,
        eligibilityEndsAt: current.eligibility_ends_at,
        revalidateAfter: current.revalidate_after,
      };
      const reviewedAt = new Date();
      const reviewed = await verificationRepo.upsertStudentVerification({
        userId: targetUserId, provider: current.provider, status: input.outcome,
        studentIdentifierLast4: null, enrolledName: current.enrolled_name,
        evidenceCategory: current.evidence_category,
        ageEvidenceCategory: current.age_evidence_category, reviewCycle: current.review_cycle,
        adultEligible: input.adult_eligible, institutionName: current.institution_name,
        programName: current.program_name, admissionYear: current.admission_year,
        graduationYear: current.graduation_year,
        verifiedAt: input.outcome === "verified" ? reviewedAt : null,
        reviewedByUserId: operatorId, reviewedAt,
        eligibilityStartsAt: current.eligibility_starts_at ? new Date(current.eligibility_starts_at) : null,
        eligibilityEndsAt: new Date(current.eligibility_ends_at),
        revalidateAfter: current.revalidate_after ? new Date(current.revalidate_after) : null,
        consentReference: null,
        metadata: { reviewReason: input.reason, submittedAt: current.metadata?.submittedAt },
      }, client);
      await verificationRepo.syncUserVerificationProfile({ userId: targetUserId,
        isVerified: input.outcome === "verified", college: input.outcome === "verified" ? current.institution_name : null }, client);
      await verificationRepo.scheduleStudentEvidenceDeletion(client, targetUserId, current.review_cycle, reviewedAt);
      const row = await reviewRepo.create(client, {
        operator_id: operatorId, target_user_id: targetUserId, idempotency_key: idempotencyKey,
        payload_digest: payloadDigest, outcome: input.outcome, adult_eligible: input.adult_eligible,
        reason: input.reason, review_cycle: current.review_cycle, verification_id: reviewed.id,
        student_snapshot: studentSnapshot, evidence_snapshot: evidenceSnapshot,
      });
      await reviewRepo.recordAudit(client, row);
      await notify(client, row);
      return row;
    }); } catch (error) {
      if (error instanceof AppError && error.code === "EVIDENCE_STORAGE_UNAVAILABLE") {
        await restrict(this.database, "student_evidence_provider_unavailable");
      }
      throw error;
    }
    if (operation.state === "acknowledged" || operation.state === "recovered") return result(operation);
    afterCommitHook?.(operation.id);
    return this.publish(operation);
  }

  private async publish(operation: StudentReviewOperation) {
    try {
      const acknowledged = await inProtectedTransaction(this.database, async (client) => {
        const row = await reviewRepo.byIdForUpdate(client, operation.id);
        if (!row) throw new AppError(404, "Decision not found", "OPERATION_NOT_FOUND");
        if (row.state !== "committed") return row;
        await store().append(receipt(row));
        const backup = await backupStatus(client);
        if (backup.required && !backup.healthy) throw new AppError(503, "Database backup is stale", "BACKUP_STALE");
        const saved = await reviewRepo.acknowledge(client, row.id);
        await markDurableNotificationReady(client, row.id);
        return saved;
      });
      return result(acknowledged);
    } catch {
      await restrict(this.database, "student_review_evidence_pending");
      throw new AppError(503, "Decision committed; recovery evidence is pending",
        "OPERATION_PENDING", { operationId: operation.id });
    }
  }

  async operation(operatorId: string, operationId: string) {
    const row = await reviewRepo.byId(this.database, operationId);
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

  async pending() { return reviewRepo.pending(this.database); }

  async reconcileReceipts(operatorId: string) {
    const receipts = await this.receipts();
    for (const item of receipts.sort((a, b) => a.committedAt.localeCompare(b.committedAt))) {
      if (item.payloadDigest !== digest(item.targetUserId, {
        outcome: item.outcome, adult_eligible: item.adultEligible, reason: item.reason,
      })) throw new AppError(409, "Student review receipt conflicts with its decision", "RECOVERY_CONFLICT");
      await inProtectedTransaction(this.database, async (client) => {
        await assertCurrentOperator(client, operatorId);
        const existing = await reviewRepo.byIdForUpdate(client, item.operationId);
        if (existing && JSON.stringify(receipt(existing)) !== JSON.stringify(item)) {
          throw new AppError(409, "Student review recovery conflict", "RECOVERY_CONFLICT");
        }
        await reviewRepo.restoreOperation(client, item);
        const row = await reviewRepo.byIdForUpdate(client, item.operationId);
        if (!row) throw new AppError(409, "Student review recovery failed", "RECOVERY_INCOMPLETE");
        await reviewRepo.restoreDecision(client, row);
        await reviewRepo.recordAudit(client, row);
        await notify(client, row);
        await markDurableNotificationReady(client, row.id);
        await reviewRepo.suppressRestoredEmail(client, row.id);
      });
    }
    return receipts.length;
  }
}

export const studentReviewService = new StudentReviewService();
