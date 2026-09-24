import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Pool, PoolClient } from "pg";

import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";

export const capabilities = ["offers", "requests", "acceptance", "booking"] as const;
export type Capability = typeof capabilities[number];
export type PauseDecision = { capability: Capability; paused: boolean; reason: string };
type Operation = { id: string; operator_id: string; idempotency_key: string; payload_digest: string; capability: Capability; paused: boolean; reason: string; state: "intent" | "committed" | "acknowledged" | "recovered"; committed_at: Date | null };
type Receipt = { operationId: string; operatorId: string; idempotencyKey: string; payloadDigest: string; capability: Capability; paused: boolean; reason: string; committedAt: string };
type SignedReceipt = Receipt & { signature: string };

function digest(decision: PauseDecision) {
  return createHash("sha256").update(JSON.stringify(decision)).digest("hex");
}
function receiptBody(receipt: Receipt) { return JSON.stringify(receipt); }
function receiptConfig() {
  const path = process.env.PILOT_RECEIPT_PATH ?? env.PILOT_RECEIPT_PATH;
  const secret = process.env.PILOT_RECEIPT_SECRET ?? env.PILOT_RECEIPT_SECRET;
  if (!path || !secret || secret.length < 32) throw new AppError(503, "Recovery evidence is not configured", "RECOVERY_UNAVAILABLE");
  return { path, secret };
}
async function listReceipts(): Promise<Receipt[]> {
  const { path, secret } = receiptConfig();
  let data: string;
  try { data = await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return data.split("\n").filter(Boolean).map((line) => {
    const { signature, ...receipt } = JSON.parse(line) as SignedReceipt;
    const expected = createHmac("sha256", secret).update(receiptBody(receipt)).digest("hex");
    if (typeof signature !== "string" || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new AppError(503, "Recovery evidence failed verification", "RECOVERY_INVALID");
    }
    return receipt;
  });
}
async function appendReceipt(receipt: Receipt) {
  const { path, secret } = receiptConfig();
  const existing = (await listReceipts()).find((item) => item.operationId === receipt.operationId);
  if (existing) {
    if (receiptBody(existing) !== receiptBody(receipt)) throw new AppError(503, "Recovery evidence conflicts with database", "RECOVERY_CONFLICT");
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "a", 0o600);
  try {
    await handle.write(`${JSON.stringify({ ...receipt, signature: createHmac("sha256", secret).update(receiptBody(receipt)).digest("hex") })}\n`);
    await handle.sync();
  } finally { await handle.close(); }
}
async function transaction<T>(database: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
async function restrict(database: Pool, cause: string) {
  await transaction(database, async (client) => {
    const status = await client.query("SELECT mode FROM pilot_recovery_state WHERE singleton = true FOR UPDATE");
    if (status.rows[0]?.mode === "restricted") {
      await client.query("UPDATE pilot_recovery_state SET cause = COALESCE(cause, $1), started_at = COALESCE(started_at, now()) WHERE singleton = true", [cause]);
      return;
    }
    await client.query("UPDATE pilot_recovery_state SET mode = 'restricted', cause = $1, started_at = now(), reconciled_at = NULL WHERE singleton = true", [cause]);
    await client.query("INSERT INTO pilot_recovery_events (event, reason) VALUES ('restricted', $1)", [cause]);
  });
}
function publicOperation(operation: Operation) { return { id: operation.id, state: operation.state, capability: operation.capability, paused: operation.paused }; }

export class PauseService {
  constructor(private readonly database: Pool = pool) {}

  private async verifyEvidence() {
    try {
      const receipts = await listReceipts();
      const acknowledged = await this.database.query<{ id: string }>("SELECT id FROM pilot_pause_operations WHERE state IN ('acknowledged', 'recovered')");
      const ids = new Set(receipts.map((receipt) => receipt.operationId));
      if (acknowledged.rows.some((row) => !ids.has(row.id))) throw new AppError(503, "Acknowledged recovery evidence is missing", "RECOVERY_MISSING");
    } catch (error) {
      await restrict(this.database, `evidence_unavailable:${error instanceof Error ? error.message : "unknown"}`);
      throw error;
    }
  }

  async decide(operatorId: string, idempotencyKey: string, decision: PauseDecision) {
    await this.verifyEvidence();
    // The state row serializes decisions across instances. Pending predecessors block later decisions.
    const operation = await transaction(this.database, async (client) => {
      await client.query("SELECT mode FROM pilot_recovery_state WHERE singleton = true FOR UPDATE");
      const authorized = await client.query("SELECT 1 FROM users u JOIN operator_allowlist a ON a.user_id = u.id WHERE u.id = $1 AND u.role = 'admin' AND u.status = 'active' AND a.active = true FOR SHARE OF u, a", [operatorId]);
      if (!authorized.rowCount) throw new AppError(403, "Operator access has been revoked", "OPERATOR_ACCESS_REVOKED");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pause:${operatorId}:${idempotencyKey}`]);
      const existing = (await client.query<Operation>("SELECT * FROM pilot_pause_operations WHERE operator_id = $1 AND idempotency_key = $2", [operatorId, idempotencyKey])).rows[0];
      if (existing) {
        if (existing.payload_digest !== digest(decision)) throw new AppError(409, "Idempotency key used with a different decision", "IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      const status = await client.query("SELECT mode FROM pilot_recovery_state WHERE singleton = true");
      if (status.rows[0]?.mode !== "open") throw new AppError(503, "Protected writes are restricted", "RECOVERY_RESTRICTED");
      if ((await client.query("SELECT id FROM pilot_pause_operations WHERE state IN ('intent', 'committed') LIMIT 1")).rowCount) {
        throw new AppError(503, "An earlier decision is pending", "OPERATION_PENDING");
      }
      receiptConfig();
      return (await client.query<Operation>(`INSERT INTO pilot_pause_operations (operator_id, idempotency_key, payload_digest, capability, paused, reason, state)
        VALUES ($1, $2, $3, $4, $5, $6, 'intent') RETURNING *`, [operatorId, idempotencyKey, digest(decision), decision.capability, decision.paused, decision.reason])).rows[0];
    });
    if (operation.state === "acknowledged" || operation.state === "recovered") return publicOperation(operation);
    let committed = operation;
    if (committed.state === "intent") {
      committed = await transaction(this.database, async (client) => {
        await client.query("SELECT mode FROM pilot_recovery_state WHERE singleton = true FOR UPDATE");
        const authorized = await client.query("SELECT 1 FROM users u JOIN operator_allowlist a ON a.user_id = u.id WHERE u.id = $1 AND u.role = 'admin' AND u.status = 'active' AND a.active = true FOR SHARE OF u, a", [operatorId]);
        if (!authorized.rowCount) throw new AppError(403, "Operator access has been revoked", "OPERATOR_ACCESS_REVOKED");
        const current = (await client.query<Operation>("SELECT * FROM pilot_pause_operations WHERE id = $1 FOR UPDATE", [operation.id])).rows[0];
        if (current.state !== "intent") return current;
        await client.query("UPDATE pilot_pause_state SET paused = $2, operation_id = $3, updated_at = now() WHERE capability = $1", [decision.capability, decision.paused, operation.id]);
        const row = (await client.query<Operation>("UPDATE pilot_pause_operations SET state = 'committed', committed_at = now() WHERE id = $1 RETURNING *", [operation.id])).rows[0];
        await client.query("INSERT INTO pilot_pause_audit (operation_id, operator_id, capability, paused, reason, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)", [operation.id, operatorId, decision.capability, decision.paused, decision.reason, row.committed_at]);
        await client.query("INSERT INTO pilot_pause_followup (operation_id, kind) VALUES ($1, 'operator_pause_changed')", [operation.id]);
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
      const row = (await client.query<Operation>("SELECT * FROM pilot_pause_operations WHERE id = $1 FOR UPDATE", [committed.id])).rows[0];
      if (row.state === "acknowledged") return row;
      return (await client.query<Operation>("UPDATE pilot_pause_operations SET state = 'acknowledged', acknowledged_at = now() WHERE id = $1 RETURNING *", [committed.id])).rows[0];
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
    const state = await this.database.query("SELECT mode, cause, started_at, reconciled_at, reopened_at FROM pilot_recovery_state WHERE singleton = true");
    const capabilities = await this.database.query(`SELECT p.capability,
      CASE WHEN r.mode <> 'open' OR EXISTS (SELECT 1 FROM pilot_pause_operations WHERE state IN ('intent', 'committed')) THEN true ELSE p.paused END AS paused,
      EXISTS (SELECT 1 FROM pilot_pause_operations WHERE state IN ('intent', 'committed')) AS pending
      FROM pilot_pause_state p LEFT JOIN pilot_pause_operations o ON o.id = p.operation_id
      CROSS JOIN pilot_recovery_state r ORDER BY p.capability`);
    return { recovery: state.rows[0] ?? { mode: "restricted", cause: "state_unavailable", started_at: null, reconciled_at: null }, capabilities: capabilities.rows.length === 4 ? capabilities.rows : ["offers", "requests", "acceptance", "booking"].map((capability) => ({ capability, paused: true, pending: true })) };
  }

  async operation(operatorId: string, id: string) {
    try { await this.verifyEvidence(); } catch { /* An uncertain operation remains pending. */ }
    const row = (await this.database.query<Operation>("SELECT * FROM pilot_pause_operations WHERE id = $1 AND operator_id = $2", [id, operatorId])).rows[0];
    if (!row) throw new AppError(404, "Operation not found", "OPERATION_NOT_FOUND");
    const recovery = await this.database.query<{ mode: string }>("SELECT mode FROM pilot_recovery_state WHERE singleton = true");
    if (recovery.rows[0]?.mode === "restricted" && row.state === "acknowledged") return { ...publicOperation(row), state: "pending_unknown" };
    return publicOperation(row);
  }

  async operationByKey(operatorId: string, key: string) {
    const row = (await this.database.query<Operation>("SELECT id FROM pilot_pause_operations WHERE operator_id = $1 AND idempotency_key = $2", [operatorId, key])).rows[0];
    if (!row) throw new AppError(404, "Operation not found", "OPERATION_NOT_FOUND");
    return this.operation(operatorId, row.id);
  }

  async pending() {
    return (await this.database.query("SELECT id, operator_id, capability, paused, state, committed_at FROM pilot_pause_operations WHERE state IN ('intent', 'committed') ORDER BY id")).rows;
  }

  async reconcile(operatorId: string) {
    await restrict(this.database, "manual_reconciliation");
    let receipts: Receipt[];
    try { receipts = await listReceipts(); }
    catch (error) { await restrict(this.database, "evidence_unavailable"); throw error; }
    for (const receipt of receipts) {
      await transaction(this.database, async (client) => {
        const row = (await client.query<Operation>("SELECT * FROM pilot_pause_operations WHERE id = $1 FOR UPDATE", [receipt.operationId])).rows[0];
        if (row && (row.payload_digest !== receipt.payloadDigest || row.operator_id !== receipt.operatorId)) throw new AppError(409, "Recovery conflict", "RECOVERY_CONFLICT");
        if (!row) {
          await client.query(`INSERT INTO pilot_pause_operations (id, operator_id, idempotency_key, payload_digest, capability, paused, reason, state, committed_at, acknowledged_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'recovered', $8, now())`, [receipt.operationId, receipt.operatorId, receipt.idempotencyKey, receipt.payloadDigest, receipt.capability, receipt.paused, receipt.reason, receipt.committedAt]);
        } else if (row.state !== "acknowledged" && row.state !== "recovered") {
          await client.query("UPDATE pilot_pause_operations SET state = 'recovered', committed_at = $2, acknowledged_at = now() WHERE id = $1", [receipt.operationId, receipt.committedAt]);
        }
        await client.query("INSERT INTO pilot_pause_audit (operation_id, operator_id, capability, paused, reason, recorded_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING", [receipt.operationId, receipt.operatorId, receipt.capability, receipt.paused, receipt.reason, receipt.committedAt]);
        await client.query("INSERT INTO pilot_pause_followup (operation_id, kind) VALUES ($1, 'operator_pause_changed') ON CONFLICT DO NOTHING", [receipt.operationId]);
        const current = await client.query<{ updated_at: Date }>("SELECT updated_at FROM pilot_pause_state WHERE capability = $1 FOR UPDATE", [receipt.capability]);
        if (!current.rows[0] || current.rows[0].updated_at <= new Date(receipt.committedAt)) {
          await client.query("INSERT INTO pilot_pause_state (capability, paused, operation_id, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (capability) DO UPDATE SET paused = EXCLUDED.paused, operation_id = EXCLUDED.operation_id, updated_at = EXCLUDED.updated_at", [receipt.capability, receipt.paused, receipt.operationId, receipt.committedAt]);
        }
      });
    }
    await this.database.query("UPDATE pilot_recovery_state SET reconciled_at = now() WHERE singleton = true");
    await this.database.query("INSERT INTO pilot_recovery_events (event, operator_id, reason) VALUES ('reconciled', $1, 'signed receipts inspected')", [operatorId]);
    return { receipts: receipts.length, pending: await this.pending() };
  }

  async reopen(operatorId: string, reason: string) {
    await this.verifyEvidence();
    const { path } = receiptConfig();
    await mkdir(dirname(path), { recursive: true });
    const probe = await open(path, "a", 0o600);
    try { await probe.sync(); } finally { await probe.close(); }
    await transaction(this.database, async (client) => {
      const status = await client.query("SELECT * FROM pilot_recovery_state WHERE singleton = true FOR UPDATE");
      if (!status.rows[0]?.reconciled_at || (await client.query("SELECT id FROM pilot_pause_operations WHERE state IN ('intent', 'committed') LIMIT 1")).rowCount) {
        throw new AppError(409, "Reconciliation is incomplete", "RECONCILIATION_REQUIRED");
      }
      await client.query("UPDATE pilot_recovery_state SET mode = 'open', cause = NULL, reopened_at = now(), reopened_by = $1 WHERE singleton = true", [operatorId]);
      await client.query("INSERT INTO pilot_recovery_events (event, operator_id, reason) VALUES ('reopened', $1, $2)", [operatorId, reason]);
    });
    return this.status();
  }
}

export const pauseService = new PauseService();
