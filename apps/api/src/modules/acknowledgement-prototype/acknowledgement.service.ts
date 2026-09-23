import { createHash } from "node:crypto";

import { Pool } from "pg";

import { AppError } from "../../shared/errors/app-error";
import { AcknowledgementRepository, type OperationRow, type SyntheticPayload } from "./acknowledgement.repo";
import { FileReceiptStore } from "./receipt-store";

export type { SyntheticPayload } from "./acknowledgement.repo";
export type CrashPoint = "before_intent" | "after_intent" | "after_db_commit" | "after_receipt" | "after_publication";

export function payloadDigest(payload: SyntheticPayload) {
  return createHash("sha256").update(JSON.stringify({ delta: payload.delta, subject: payload.subject })).digest("hex");
}

function publicOperation(row: OperationRow) {
  return { id: row.id, state: row.state, result: row.result };
}

export class AcknowledgementService {
  private readonly repository: AcknowledgementRepository;

  constructor(
    pool: Pool,
    private readonly receipts: FileReceiptStore,
    private readonly operatorToken: string,
    private readonly crash?: (point: CrashPoint, operationId?: string) => void,
  ) {
    this.repository = new AcknowledgementRepository(pool);
  }

  async perform(scope: string, idempotencyKey: string, payload: SyntheticPayload) {
    this.crash?.("before_intent");
    const digest = payloadDigest(payload);
    const intent = await this.repository.transaction(async (repository) => {
      await repository.lockIdempotency(scope, idempotencyKey);
      const existing = await repository.findByKey(scope, idempotencyKey);
      if (existing) {
        if (existing.payload_digest !== digest) {
          throw new AppError(409, "Idempotency key was already used with a different payload", "IDEMPOTENCY_PAYLOAD_MISMATCH");
        }
        return { row: existing, existing: true };
      }
      if (await repository.systemModeForUpdate() !== "open") {
        throw new AppError(503, "Protected writes are restricted", "ACKNOWLEDGEMENT_RESTRICTED");
      }
      if (await repository.hasUnresolvedOperation()) {
        throw new AppError(503, "An earlier operation has an unresolved outcome", "ACKNOWLEDGEMENT_PENDING");
      }
      return { row: await repository.insertIntent(scope, idempotencyKey, digest, payload), existing: false };
    });
    if (!intent.existing) this.crash?.("after_intent", intent.row.id);
    if (intent.row.state === "acknowledged" || intent.row.state === "recovered") {
      return { status: 200, operation: publicOperation(intent.row) };
    }

    let committed = intent.row;
    if (committed.state === "intent") {
      committed = await this.repository.transaction(async (repository) => {
        const locked = await repository.findById(committed.id, true);
        if (locked.state !== "intent") return locked;
        await repository.lockSubject(payload.subject);
        const value = await repository.currentValue(payload.subject) + payload.delta;
        await repository.insertAction(committed.id, payload, value);
        await repository.insertOperationAudit(committed.id, "business_committed");
        return repository.markDatabaseCommitted(committed.id, value);
      });
      this.crash?.("after_db_commit", committed.id);
    }

    try {
      if (!await this.receipts.find(committed.id)) {
        await this.receipts.append({
          operationId: committed.id,
          scope: committed.scope,
          idempotencyKey: committed.idempotency_key,
          payloadDigest: committed.payload_digest,
          payload: committed.payload,
          result: committed.result!,
          committedAt: committed.committed_at!.toISOString(),
        });
      }
    } catch (error) {
      await this.repository.restrict(`receipt_store_failure:${error instanceof Error ? error.message : "unknown"}`);
      throw new AppError(503, "Database result committed; recovery evidence is pending", "ACKNOWLEDGEMENT_PENDING", { operationId: committed.id });
    }
    this.crash?.("after_receipt", committed.id);

    const acknowledged = await this.repository.transaction(async (repository) => {
      await repository.insertNotification(committed.id);
      await repository.insertOperationAudit(committed.id, "success_published");
      return repository.markAcknowledged(committed.id);
    });
    const status = await this.repository.systemStatus();
    if (status.mode === "restricted") await this.repository.markReconciled();
    this.crash?.("after_publication", acknowledged.id);
    return { status: intent.existing ? 200 : 201, operation: publicOperation(acknowledged) };
  }

  async operationStatus(operationId: string) {
    const row = await this.repository.findById(operationId);
    if (!row) throw new AppError(404, "Operation not found", "OPERATION_NOT_FOUND");
    const published = row.state === "acknowledged" || row.state === "recovered";
    return { id: row.id, state: published ? row.state : "pending_unknown", result: published ? row.result : null };
  }

  async readSubject(subject: string) {
    return { subject, value: await this.repository.visibleSubjectValue(subject) };
  }

  systemStatus() {
    return this.repository.systemStatus();
  }

  authorizeOperator(token: string | undefined, operatorId: string | undefined) {
    if (token !== this.operatorToken || !operatorId) {
      throw new AppError(403, "Recovery operator authorization required", "RECOVERY_FORBIDDEN");
    }
    return operatorId;
  }

  async reconcile(operatorId: string) {
    await this.repository.restrict("restore_reconciliation_required", operatorId);
    const receipts = await this.receipts.list();
    const recovered: string[] = [];
    for (const receipt of receipts) {
      const outcome = await this.repository.recover(receipt);
      if (outcome === "conflict") {
        throw new AppError(409, "Restored operation conflicts with independent evidence", "RECOVERY_CONFLICT");
      }
      if (outcome === "recovered") recovered.push(receipt.operationId);
    }
    await this.repository.markReconciled();
    return { recovered, mode: "restricted" as const };
  }

  async reopen(operatorId: string, decision: string) {
    if (await this.repository.hasUnresolvedOperation()) {
      throw new AppError(409, "Unresolved operations prevent reopening", "RECOVERY_INCOMPLETE");
    }
    if (!await this.repository.reopen(operatorId, decision)) {
      throw new AppError(409, "Successful evidence reconciliation is required before reopening", "RECOVERY_INCOMPLETE");
    }
    return this.systemStatus();
  }
}
