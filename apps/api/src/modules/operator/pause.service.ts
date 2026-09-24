import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { SignedReceiptStore } from "./receipt-store";
import { operatorQuery } from "./operator.repo";
import { assertCurrentOperator } from "./operator.authorization";

export const capabilities = ["offers", "requests", "acceptance", "booking"] as const;
export type Capability = typeof capabilities[number];
export type PauseDecision = { capability: Capability; paused: boolean; reason: string };
type Operation = { id: string; operator_id: string; idempotency_key: string; payload_digest: string; capability: Capability; paused: boolean; reason: string; state: "intent" | "committed" | "acknowledged" | "recovered"; committed_at: Date | null };
type ReopenOperation = { id: string; operator_id: string; idempotency_key: string; reason: string; reconciliation_digest: string; state: "committed" | "acknowledged" | "recovered"; committed_at: Date };
type ReopenReceipt = { operationId: string; operatorId: string; idempotencyKey: string; reason: string; reconciliationDigest: string; committedAt: string };
type Receipt = { operationId: string; operatorId: string; idempotencyKey: string; payloadDigest: string; capability: Capability; paused: boolean; reason: string; committedAt: string };

function digest(decision: PauseDecision) {
  return createHash("sha256").update(JSON.stringify(decision)).digest("hex");
}
function receiptConfig() {
  const path = process.env.PILOT_RECEIPT_PATH ?? env.PILOT_RECEIPT_PATH;
  const secret = process.env.PILOT_RECEIPT_SECRET ?? env.PILOT_RECEIPT_SECRET;
  if (!path || !secret || secret.length < 32) throw new AppError(503, "Recovery evidence is not configured", "RECOVERY_UNAVAILABLE");
  return { path, secret };
}
function pauseReceipts() { const config = receiptConfig(); return new SignedReceiptStore<Receipt>(config.path, config.secret); }
async function listReceipts() { return pauseReceipts().list(); }
async function appendReceipt(receipt: Receipt) { return pauseReceipts().append(receipt); }
function reopenReceipts() { const config = receiptConfig(); return new SignedReceiptStore<ReopenReceipt>(`${config.path}.reopen`, config.secret); }
async function transaction<T>(database: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  try { await operatorQuery(client, "begin"); const result = await work(client); await operatorQuery(client, "commit"); return result; }
  catch (error) { await operatorQuery(client, "rollback"); throw error; }
  finally { client.release(); }
}
async function restrict(database: Pool, cause: string) {
  await transaction(database, async (client) => {
    const status = await operatorQuery(client, "recoveryModeForUpdate");
    if (status.rows[0]?.mode === "restricted") {
      await operatorQuery(client, "preserveRestrictionCause", [cause]);
      return;
    }
    await operatorQuery(client, "enterRestrictedMode", [cause]);
    await operatorQuery(client, "recordRestriction", [cause]);
  });
}
function publicOperation(operation: Operation) { return { id: operation.id, state: operation.state, capability: operation.capability, paused: operation.paused }; }

export class PauseService {
  constructor(private readonly database: Pool = pool) {}

  private async verifyEvidence() {
    try {
      const receipts = await listReceipts();
      const acknowledged = await operatorQuery<Operation>(this.database, "acknowledgedPauseOperations");
      const byId = new Map<string, Receipt>();
      for (const receipt of receipts) {
        const prior = byId.get(receipt.operationId);
        if (prior && JSON.stringify(prior) !== JSON.stringify(receipt)) throw new AppError(503, "Recovery evidence contains conflicting receipts", "RECOVERY_CONFLICT");
        byId.set(receipt.operationId, receipt);
      }
      const reopenEvidence = await reopenReceipts().list();
      const reopenRows = await operatorQuery<ReopenOperation>(this.database, "acknowledgedReopenOperations");
      const reopenById = new Map(reopenEvidence.map((receipt) => [receipt.operationId, receipt]));
      if (reopenRows.rows.some((row) => {
        const receipt = reopenById.get(row.id);
        return !receipt || receipt.operatorId !== row.operator_id || receipt.idempotencyKey !== row.idempotency_key || receipt.reason !== row.reason || receipt.reconciliationDigest !== row.reconciliation_digest;
      })) throw new AppError(503, "Reopening recovery evidence is missing or inconsistent", "RECOVERY_MISSING");
      if (acknowledged.rows.some((row) => {
        const receipt = byId.get(row.id);
        return !receipt || receipt.operatorId !== row.operator_id || receipt.idempotencyKey !== row.idempotency_key ||
          receipt.payloadDigest !== row.payload_digest || receipt.capability !== row.capability ||
          receipt.paused !== row.paused || receipt.reason !== row.reason ||
          receipt.payloadDigest !== digest({ capability: receipt.capability, paused: receipt.paused, reason: receipt.reason });
      })) throw new AppError(503, "Acknowledged recovery evidence is missing or inconsistent", "RECOVERY_MISSING");
    } catch (error) {
      await restrict(this.database, `evidence_unavailable:${error instanceof Error ? error.message : "unknown"}`);
      throw error;
    }
  }

  async decide(operatorId: string, idempotencyKey: string, decision: PauseDecision) {
    await this.verifyEvidence();
    // The state row serializes decisions across instances. Pending predecessors block later decisions.
    const operation = await transaction(this.database, async (client) => {
      await operatorQuery(client, "recoveryModeForUpdate");
      await assertCurrentOperator(client, operatorId);
      await operatorQuery(client, "lockIdempotencyKey", [`pause:${operatorId}:${idempotencyKey}`]);
      const existing = (await operatorQuery<Operation>(client, "pauseOperationByKey", [operatorId, idempotencyKey])).rows[0];
      if (existing) {
        if (existing.payload_digest !== digest(decision)) throw new AppError(409, "Idempotency key used with a different decision", "IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      const status = await operatorQuery(client, "recoveryMode");
      if (status.rows[0]?.mode !== "open") throw new AppError(503, "Protected writes are restricted", "RECOVERY_RESTRICTED");
      if ((await operatorQuery(client, "pendingPauseOperation")).rowCount) {
        throw new AppError(503, "An earlier decision is pending", "OPERATION_PENDING");
      }
      receiptConfig();
      return (await operatorQuery<Operation>(client, "createPauseIntent", [operatorId, idempotencyKey, digest(decision), decision.capability, decision.paused, decision.reason])).rows[0];
    });
    if (operation.state === "acknowledged" || operation.state === "recovered") return publicOperation(operation);
    let committed = operation;
    if (committed.state === "intent") {
      committed = await transaction(this.database, async (client) => {
        await operatorQuery(client, "recoveryModeForUpdate");
        await assertCurrentOperator(client, operatorId);
        const current = (await operatorQuery<Operation>(client, "pauseOperationForUpdate", [operation.id])).rows[0];
        if (current.state !== "intent") return current;
        await operatorQuery(client, "setCapabilityPause", [decision.capability, decision.paused, operation.id]);
        const row = (await operatorQuery<Operation>(client, "commitPauseOperation", [operation.id])).rows[0];
        await operatorQuery(client, "insertPauseAudit", [operation.id, operatorId, decision.capability, decision.paused, decision.reason, row.committed_at]);
        await operatorQuery(client, "insertPauseFollowup", [operation.id]);
        return row;
      });
    }
    const receipt: Receipt = { operationId: committed.id, operatorId: committed.operator_id, idempotencyKey: committed.idempotency_key, payloadDigest: committed.payload_digest, capability: committed.capability, paused: committed.paused, reason: committed.reason, committedAt: committed.committed_at!.toISOString() };
    try { await appendReceipt(receipt); }
    catch (error) {
      await restrict(this.database, `evidence_unavailable:${error instanceof Error ? error.message : "unknown"}`);
      throw new AppError(503, "Decision committed; recovery evidence is pending", "OPERATION_PENDING", { operationId: committed.id });
    }
    const published = await transaction(this.database, async (client) => {
      const row = (await operatorQuery<Operation>(client, "pauseOperationForUpdate", [committed.id])).rows[0];
      if (row.state === "acknowledged") return row;
      return (await operatorQuery<Operation>(client, "acknowledgePauseOperation", [committed.id])).rows[0];
    });
    return publicOperation(published);
  }

  async assertAvailable(capability: Capability) {
    const status = await this.status();
    if (status.recovery?.mode !== "open" || status.capabilities.length !== capabilities.length || status.capabilities.some((item: { capability: Capability; paused: boolean }) => item.capability === "booking" && item.paused) ||
        status.capabilities.some((item: { capability: Capability; paused: boolean }) => item.capability === capability && item.paused)) {
      throw new AppError(503, "Pilot activity is paused", "PILOT_PAUSED");
    }
  }

  async status() {
    try { await this.verifyEvidence(); } catch { /* Recovery mode below reports the restriction. */ }
    const state = await operatorQuery(this.database, "recoveryStatus");
    const capabilities = await operatorQuery(this.database, "effectiveCapabilities");
    return { recovery: state.rows[0] ?? { mode: "restricted", cause: "state_unavailable", started_at: null, reconciled_at: null }, capabilities: capabilities.rows.length === 4 ? capabilities.rows : ["offers", "requests", "acceptance", "booking"].map((capability) => ({ capability, paused: true, pending: true })) };
  }

  async publicStatus() {
    const status = await this.status();
    return { recovery: { mode: status.recovery.mode }, capabilities: status.capabilities };
  }

  async operation(operatorId: string, id: string) {
    try { await this.verifyEvidence(); } catch { /* An uncertain operation remains pending. */ }
    const row = (await operatorQuery<Operation>(this.database, "pauseOperationForOwner", [id, operatorId])).rows[0];
    if (!row) throw new AppError(404, "Operation not found", "OPERATION_NOT_FOUND");
    const recovery = await operatorQuery<{ mode: string }>(this.database, "recoveryMode");
    if (recovery.rows[0]?.mode === "restricted" && row.state === "acknowledged") return { ...publicOperation(row), state: "pending_unknown" };
    return publicOperation(row);
  }

  async operationByKey(operatorId: string, key: string) {
    const row = (await operatorQuery<Operation>(this.database, "pauseOperationIdByKey", [operatorId, key])).rows[0];
    if (!row) throw new AppError(404, "Operation not found", "OPERATION_NOT_FOUND");
    return this.operation(operatorId, row.id);
  }

  async pending() {
    return (await operatorQuery(this.database, "pendingPauseOperations")).rows;
  }

  async reconcile(operatorId: string) {
    await restrict(this.database, "manual_reconciliation");
    let receipts: Receipt[];
    try { receipts = await listReceipts(); }
    catch (error) { await restrict(this.database, "evidence_unavailable"); throw error; }
    for (const receipt of receipts) {
      if (receipt.payloadDigest !== digest({ capability: receipt.capability, paused: receipt.paused, reason: receipt.reason })) throw new AppError(409, "Recovery payload is inconsistent", "RECOVERY_CONFLICT");
      await transaction(this.database, async (client) => {
        const row = (await operatorQuery<Operation>(client, "pauseOperationForUpdate", [receipt.operationId])).rows[0];
        if (row && (row.payload_digest !== receipt.payloadDigest || row.operator_id !== receipt.operatorId || row.idempotency_key !== receipt.idempotencyKey || row.capability !== receipt.capability || row.paused !== receipt.paused || row.reason !== receipt.reason)) throw new AppError(409, "Recovery conflict", "RECOVERY_CONFLICT");
        if (!row) {
          await operatorQuery(client, "restorePauseOperation", [receipt.operationId, receipt.operatorId, receipt.idempotencyKey, receipt.payloadDigest, receipt.capability, receipt.paused, receipt.reason, receipt.committedAt]);
        } else if (row.state !== "acknowledged" && row.state !== "recovered") {
          await operatorQuery(client, "markPauseRecovered", [receipt.operationId, receipt.committedAt]);
        }
        await operatorQuery(client, "restorePauseAudit", [receipt.operationId, receipt.operatorId, receipt.capability, receipt.paused, receipt.reason, receipt.committedAt]);
        await operatorQuery(client, "restorePauseFollowup", [receipt.operationId]);
        const current = await operatorQuery<{ updated_at: Date }>(client, "capabilityStateForUpdate", [receipt.capability]);
        if (!current.rows[0] || current.rows[0].updated_at <= new Date(receipt.committedAt)) {
          await operatorQuery(client, "restoreCapabilityState", [receipt.capability, receipt.paused, receipt.operationId, receipt.committedAt]);
        }
      });
    }
    for (const receipt of await reopenReceipts().list()) {
      await transaction(this.database, async (client) => {
        const row = (await operatorQuery<ReopenOperation>(client, "reopenOperationForUpdate", [receipt.operationId])).rows[0];
        if (row && (row.operator_id !== receipt.operatorId || row.idempotency_key !== receipt.idempotencyKey || row.reason !== receipt.reason || row.reconciliation_digest !== receipt.reconciliationDigest)) throw new AppError(409, "Reopening recovery conflict", "RECOVERY_CONFLICT");
        if (!row) await operatorQuery(client, "restoreReopenOperation", [receipt.operationId, receipt.operatorId, receipt.idempotencyKey, receipt.reason, receipt.reconciliationDigest, receipt.committedAt]);
        else if (row.state === "committed") await operatorQuery(client, "markReopenRecovered", [receipt.operationId]);
        await operatorQuery(client, "restoreReopenAudit", [receipt.operationId, receipt.operatorId, receipt.reason, receipt.committedAt]);
      });
    }
    await operatorQuery(this.database, "markRecoveryReconciled");
    await operatorQuery(this.database, "recordReconciliation", [operatorId]);
    return { receipts: receipts.length, pending: await this.pending() };
  }

  async reopen(operatorId: string, idempotencyKey: string, reason: string) {
    await this.verifyEvidence();
    await pauseReceipts().probe();
    await reopenReceipts().probe();
    const reconciliationDigest = createHash("sha256").update(JSON.stringify({ pauses: await listReceipts(), reopens: await reopenReceipts().list() })).digest("hex");
    const operation = await transaction(this.database, async (client) => {
      const status = await operatorQuery(client, "recoveryStateForUpdate");
      await assertCurrentOperator(client, operatorId);
      const existing = (await operatorQuery<ReopenOperation>(client, "reopenOperationByKey", [operatorId, idempotencyKey])).rows[0];
      if (existing) {
        if (existing.reason !== reason) throw new AppError(409, "Idempotency key used with a different decision", "IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      if (!status.rows[0]?.reconciled_at || (await operatorQuery(client, "pendingPauseOperation")).rowCount || (await operatorQuery(client, "pendingReopenOperation")).rowCount) {
        throw new AppError(409, "Reconciliation is incomplete", "RECONCILIATION_REQUIRED");
      }
      const row = (await operatorQuery<ReopenOperation>(client, "createReopenOperation", [operatorId, idempotencyKey, reason, reconciliationDigest])).rows[0];
      await operatorQuery(client, "insertReopenAudit", [row.id, operatorId, reason, row.committed_at]);
      return row;
    });
    if (operation.state === "recovered") return { operationId: operation.id, status: await this.status() };
    const receipt: ReopenReceipt = { operationId: operation.id, operatorId: operation.operator_id, idempotencyKey: operation.idempotency_key, reason: operation.reason, reconciliationDigest: operation.reconciliation_digest, committedAt: operation.committed_at.toISOString() };
    try { await reopenReceipts().append(receipt); }
    catch (error) {
      await restrict(this.database, `reopen_evidence_unavailable:${error instanceof Error ? error.message : "unknown"}`);
      throw new AppError(503, "Reopening decision is pending evidence", "OPERATION_PENDING", { operationId: operation.id });
    }
    await transaction(this.database, async (client) => {
      await operatorQuery(client, "recoveryModeForUpdate");
      const row = (await operatorQuery<ReopenOperation>(client, "reopenOperationForUpdate", [operation.id])).rows[0];
      if (row.state === "acknowledged" || row.state === "recovered") return;
      await operatorQuery(client, "openRecoveryMode", [operatorId]);
      await operatorQuery(client, "acknowledgeReopenOperation", [operation.id]);
      await operatorQuery(client, "recordReopening", [operatorId, reason]);
    });
    return { operationId: operation.id, status: await this.status() };
  }
}

export const pauseService = new PauseService();
