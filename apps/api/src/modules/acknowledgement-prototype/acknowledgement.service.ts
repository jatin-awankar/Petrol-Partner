import { createHash } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import { AppError } from "../../shared/errors/app-error";
import { FileReceiptStore, type RecoveryReceipt } from "./receipt-store";

export type SyntheticPayload = { subject: string; delta: number };
export type CrashPoint =
  | "before_intent"
  | "after_intent"
  | "after_db_commit"
  | "after_receipt"
  | "after_publication";

function canonicalPayload(payload: SyntheticPayload) {
  return JSON.stringify({ delta: payload.delta, subject: payload.subject });
}

export function payloadDigest(payload: SyntheticPayload) {
  return createHash("sha256").update(canonicalPayload(payload)).digest("hex");
}

async function transaction<T>(pool: Pool, callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type OperationRow = {
  id: string;
  scope: string;
  idempotency_key: string;
  payload_digest: string;
  payload: SyntheticPayload;
  state: "intent" | "db_committed" | "acknowledged" | "recovered";
  result: { value: number } | null;
  committed_at: Date | null;
};

function publicOperation(row: OperationRow) {
  return { id: row.id, state: row.state, result: row.result };
}

export class AcknowledgementService {
  constructor(
    private readonly pool: Pool,
    private readonly receipts: FileReceiptStore,
    private readonly crash?: (point: CrashPoint, operationId?: string) => void,
  ) {}

  async perform(scope: string, idempotencyKey: string, payload: SyntheticPayload) {
    this.crash?.("before_intent");
    const digest = payloadDigest(payload);
    const intent = await transaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${scope}:${idempotencyKey}`]);
      const existing = await client.query<OperationRow>(
        "SELECT * FROM acknowledgement_operations WHERE scope = $1 AND idempotency_key = $2",
        [scope, idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].payload_digest !== digest) {
          throw new AppError(409, "Idempotency key was already used with a different payload", "IDEMPOTENCY_PAYLOAD_MISMATCH");
        }
        return { row: existing.rows[0], existing: true };
      }
      const system = await client.query("SELECT mode FROM acknowledgement_system_state WHERE singleton = true FOR UPDATE");
      if (system.rows[0]?.mode !== "open") {
        throw new AppError(503, "Protected writes are restricted", "ACKNOWLEDGEMENT_RESTRICTED");
      }
      const unresolved = await client.query(
        "SELECT id FROM acknowledgement_operations WHERE state IN ('intent', 'db_committed') LIMIT 1",
      );
      if (unresolved.rowCount) {
        throw new AppError(503, "An earlier operation has an unresolved outcome", "ACKNOWLEDGEMENT_PENDING");
      }
      const inserted = await client.query<OperationRow>(
        `INSERT INTO acknowledgement_operations (scope, idempotency_key, payload_digest, payload, state)
         VALUES ($1, $2, $3, $4, 'intent') RETURNING *`,
        [scope, idempotencyKey, digest, payload],
      );
      return { row: inserted.rows[0], existing: false };
    });
    if (!intent.existing) this.crash?.("after_intent", intent.row.id);

    if (intent.row.state === "acknowledged" || intent.row.state === "recovered") {
      return { status: 200, operation: publicOperation(intent.row) };
    }

    let committed = intent.row;
    if (committed.state === "intent") {
      committed = await transaction(this.pool, async (client) => {
        const locked = await client.query<OperationRow>(
          "SELECT * FROM acknowledgement_operations WHERE id = $1 FOR UPDATE",
          [committed.id],
        );
        if (locked.rows[0].state !== "intent") return locked.rows[0];
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [payload.subject]);
        const current = await client.query<{ value: number }>(
          "SELECT COALESCE(sum(delta), 0)::integer AS value FROM synthetic_actions WHERE subject = $1",
          [payload.subject],
        );
        const value = current.rows[0].value + payload.delta;
        await client.query(
          `INSERT INTO synthetic_actions (operation_id, subject, delta, resulting_value, external_effect_key)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (operation_id) DO NOTHING`,
          [committed.id, payload.subject, payload.delta, value, committed.id],
        );
        await client.query(
          "INSERT INTO acknowledgement_audit (operation_id, event) VALUES ($1, 'business_committed') ON CONFLICT DO NOTHING",
          [committed.id],
        );
        const updated = await client.query<OperationRow>(
          `UPDATE acknowledgement_operations SET state = 'db_committed', result = $2, committed_at = now()
           WHERE id = $1 RETURNING *`,
          [committed.id, { value }],
        );
        return updated.rows[0];
      });
      this.crash?.("after_db_commit", committed.id);
    }

    try {
      const existingReceipt = await this.receipts.find(committed.id);
      if (!existingReceipt) {
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
      await this.restrict(`receipt_store_failure:${error instanceof Error ? error.message : "unknown"}`);
      throw new AppError(503, "Database result committed; recovery evidence is pending", "ACKNOWLEDGEMENT_PENDING", { operationId: committed.id });
    }
    this.crash?.("after_receipt", committed.id);

    const acknowledged = await transaction(this.pool, async (client) => {
      await client.query(
        "INSERT INTO acknowledgement_notifications (operation_id, status) VALUES ($1, 'ready') ON CONFLICT DO NOTHING",
        [committed.id],
      );
      await client.query(
        "INSERT INTO acknowledgement_audit (operation_id, event) VALUES ($1, 'success_published') ON CONFLICT DO NOTHING",
        [committed.id],
      );
      const updated = await client.query<OperationRow>(
        `UPDATE acknowledgement_operations
         SET state = 'acknowledged', receipt_recorded_at = COALESCE(receipt_recorded_at, now()), acknowledged_at = COALESCE(acknowledged_at, now())
         WHERE id = $1 RETURNING *`,
        [committed.id],
      );
      return updated.rows[0];
    });
    this.crash?.("after_publication", acknowledged.id);
    return { status: intent.existing ? 200 : 201, operation: publicOperation(acknowledged) };
  }

  async operationStatus(operationId: string) {
    const result = await this.pool.query<OperationRow>("SELECT * FROM acknowledgement_operations WHERE id = $1", [operationId]);
    const row = result.rows[0];
    if (!row) throw new AppError(404, "Operation not found", "OPERATION_NOT_FOUND");
    return {
      id: row.id,
      state: row.state === "acknowledged" || row.state === "recovered" ? row.state : "pending_unknown",
      result: row.state === "acknowledged" || row.state === "recovered" ? row.result : null,
    };
  }

  async readSubject(subject: string) {
    const barrier = await this.pool.query(
      `SELECT s.mode, EXISTS (
         SELECT 1 FROM acknowledgement_operations WHERE state IN ('intent', 'db_committed')
       ) AS unresolved
       FROM acknowledgement_system_state s WHERE singleton = true`,
    );
    if (barrier.rows[0]?.mode !== "open" || barrier.rows[0]?.unresolved) {
      throw new AppError(503, "Result visibility is restricted while acknowledgement is unresolved", "ACKNOWLEDGEMENT_PENDING");
    }
    const result = await this.pool.query<{ value: number }>(
      `SELECT COALESCE(sum(a.delta), 0)::integer AS value
       FROM synthetic_actions a JOIN acknowledgement_operations o ON o.id = a.operation_id
       WHERE a.subject = $1 AND o.state IN ('acknowledged', 'recovered')`,
      [subject],
    );
    return { subject, value: result.rows[0].value };
  }

  async systemStatus() {
    const result = await this.pool.query("SELECT mode, reason, restricted_since, reopened_at FROM acknowledgement_system_state WHERE singleton = true");
    return result.rows[0];
  }

  async reconcile() {
    const receipts = await this.receipts.list();
    const recovered: string[] = [];
    await this.restrict("restore_reconciliation_required");
    for (const receipt of receipts) {
      await transaction(this.pool, async (client) => {
        const existing = await client.query("SELECT payload_digest FROM acknowledgement_operations WHERE id = $1", [receipt.operationId]);
        if (existing.rows[0]) {
          if (existing.rows[0].payload_digest !== receipt.payloadDigest) {
            throw new AppError(409, "Restored operation conflicts with independent evidence", "RECOVERY_CONFLICT");
          }
          return;
        }
        await client.query(
          `INSERT INTO acknowledgement_operations
           (id, scope, idempotency_key, payload_digest, payload, state, result, intent_at, committed_at, receipt_recorded_at, acknowledged_at)
           VALUES ($1, $2, $3, $4, $5, 'recovered', $6, $7, $7, now(), now())`,
          [receipt.operationId, receipt.scope, receipt.idempotencyKey, receipt.payloadDigest, receipt.payload, receipt.result, receipt.committedAt],
        );
        await client.query(
          `INSERT INTO synthetic_actions (operation_id, subject, delta, resulting_value, external_effect_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (operation_id) DO NOTHING`,
          [receipt.operationId, receipt.payload.subject, receipt.payload.delta, receipt.result.value, receipt.operationId, receipt.committedAt],
        );
        await client.query(
          "INSERT INTO acknowledgement_audit (operation_id, event, recorded_at) VALUES ($1, 'restored_from_receipt', $2) ON CONFLICT DO NOTHING",
          [receipt.operationId, receipt.committedAt],
        );
        recovered.push(receipt.operationId);
      });
    }
    return { recovered, mode: "restricted" as const };
  }

  async reopen(decision: string) {
    const unresolved = await this.pool.query("SELECT id FROM acknowledgement_operations WHERE state IN ('intent', 'db_committed') LIMIT 1");
    if (unresolved.rowCount) throw new AppError(409, "Unresolved operations prevent reopening", "RECOVERY_INCOMPLETE");
    await this.pool.query(
      `UPDATE acknowledgement_system_state SET mode = 'open', reason = $1,
       reopened_at = now(), updated_at = now() WHERE singleton = true`,
      [`operator_decision:${decision}`],
    );
    return this.systemStatus();
  }

  private async restrict(reason: string) {
    await this.pool.query(
      `UPDATE acknowledgement_system_state SET mode = 'restricted', reason = $1,
       restricted_since = COALESCE(restricted_since, now()), updated_at = now() WHERE singleton = true`,
      [reason],
    );
  }
}
