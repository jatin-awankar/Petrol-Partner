import { Pool, type PoolClient } from "pg";

import type { RecoveryReceipt } from "./receipt-store";

export type SyntheticPayload = { subject: string; delta: number };
export type OperationRow = {
  id: string;
  scope: string;
  idempotency_key: string;
  payload_digest: string;
  payload: SyntheticPayload;
  state: "intent" | "db_committed" | "acknowledged" | "recovered";
  result: { value: number } | null;
  committed_at: Date | null;
};

type Queryable = Pick<Pool | PoolClient, "query">;

export class AcknowledgementRepository {
  constructor(
    private readonly pool: Pool,
    private readonly db: Queryable = pool,
  ) {}

  async transaction<T>(callback: (repository: AcknowledgementRepository) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(new AcknowledgementRepository(this.pool, client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  lockIdempotency(scope: string, key: string) {
    return this.db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${scope}:${key}`]);
  }

  lockSubject(subject: string) {
    return this.db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [subject]);
  }

  async findByKey(scope: string, key: string) {
    return (await this.db.query<OperationRow>(
      "SELECT * FROM acknowledgement_operations WHERE scope = $1 AND idempotency_key = $2",
      [scope, key],
    )).rows[0];
  }

  async findById(id: string, forUpdate = false) {
    return (await this.db.query<OperationRow>(
      `SELECT * FROM acknowledgement_operations WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`,
      [id],
    )).rows[0];
  }

  async systemModeForUpdate() {
    return (await this.db.query<{ mode: string }>(
      "SELECT mode FROM acknowledgement_system_state WHERE singleton = true FOR UPDATE",
    )).rows[0]?.mode;
  }

  async hasUnresolvedOperation() {
    return Boolean((await this.db.query(
      "SELECT id FROM acknowledgement_operations WHERE state IN ('intent', 'db_committed') LIMIT 1",
    )).rowCount);
  }

  async insertIntent(scope: string, key: string, digest: string, payload: SyntheticPayload) {
    return (await this.db.query<OperationRow>(
      `INSERT INTO acknowledgement_operations (scope, idempotency_key, payload_digest, payload, state)
       VALUES ($1, $2, $3, $4, 'intent') RETURNING *`,
      [scope, key, digest, payload],
    )).rows[0];
  }

  async currentValue(subject: string) {
    return (await this.db.query<{ value: number }>(
      "SELECT COALESCE(sum(delta), 0)::integer AS value FROM synthetic_actions WHERE subject = $1",
      [subject],
    )).rows[0].value;
  }

  insertAction(operationId: string, payload: SyntheticPayload, value: number, createdAt?: string) {
    return this.db.query(
      `INSERT INTO synthetic_actions (operation_id, subject, delta, resulting_value, external_effect_key, created_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now())) ON CONFLICT (operation_id) DO NOTHING`,
      [operationId, payload.subject, payload.delta, value, operationId, createdAt ?? null],
    );
  }

  insertOperationAudit(operationId: string, event: string, recordedAt?: string) {
    return this.db.query(
      `INSERT INTO acknowledgement_audit (operation_id, event, recorded_at)
       VALUES ($1, $2, COALESCE($3::timestamptz, now())) ON CONFLICT DO NOTHING`,
      [operationId, event, recordedAt ?? null],
    );
  }

  async markDatabaseCommitted(operationId: string, value: number) {
    return (await this.db.query<OperationRow>(
      `UPDATE acknowledgement_operations SET state = 'db_committed', result = $2, committed_at = now()
       WHERE id = $1 RETURNING *`,
      [operationId, { value }],
    )).rows[0];
  }

  insertNotification(operationId: string) {
    return this.db.query(
      "INSERT INTO acknowledgement_notifications (operation_id, status) VALUES ($1, 'ready') ON CONFLICT DO NOTHING",
      [operationId],
    );
  }

  async markAcknowledged(operationId: string) {
    return (await this.db.query<OperationRow>(
      `UPDATE acknowledgement_operations SET state = 'acknowledged',
       receipt_recorded_at = COALESCE(receipt_recorded_at, now()), acknowledged_at = COALESCE(acknowledged_at, now())
       WHERE id = $1 RETURNING *`,
      [operationId],
    )).rows[0];
  }

  async visibleSubjectValue(subject: string) {
    return (await this.db.query<{ value: number }>(
      `SELECT COALESCE(sum(a.delta), 0)::integer AS value
       FROM synthetic_actions a JOIN acknowledgement_operations o ON o.id = a.operation_id
       WHERE a.subject = $1 AND o.state IN ('acknowledged', 'recovered')`,
      [subject],
    )).rows[0].value;
  }

  async systemStatus() {
    return (await this.db.query(
      "SELECT mode, reason, restricted_since, reconciled_at, reopened_at FROM acknowledgement_system_state WHERE singleton = true",
    )).rows[0];
  }

  async restrict(reason: string, operatorId?: string) {
    await this.transaction(async (repository) => {
      const state = (await repository.db.query<{ mode: string; reason: string | null }>(
        "SELECT mode, reason FROM acknowledgement_system_state WHERE singleton = true FOR UPDATE",
      )).rows[0];
      if (state.mode === "restricted" && state.reason === reason) return;
      await repository.db.query(
        `UPDATE acknowledgement_system_state SET mode = 'restricted', reason = $1,
         restricted_since = COALESCE(restricted_since, now()), reconciled_at = NULL, updated_at = now() WHERE singleton = true`,
        [reason],
      );
      await repository.db.query(
        "INSERT INTO acknowledgement_system_events (event, operator_id, reason) VALUES ('restricted', $1, $2)",
        [operatorId ?? null, reason],
      );
    });
  }

  markReconciled() {
    return this.db.query(
      "UPDATE acknowledgement_system_state SET reconciled_at = now(), updated_at = now() WHERE singleton = true",
    );
  }

  async recover(receipt: RecoveryReceipt) {
    return this.transaction(async (repository) => {
      const existing = await repository.findById(receipt.operationId, true);
      if (existing && (
        existing.payload_digest !== receipt.payloadDigest || existing.scope !== receipt.scope ||
        existing.idempotency_key !== receipt.idempotencyKey
      )) return "conflict" as const;
      const action = (await repository.db.query<{
        subject: string; delta: number; resulting_value: number; external_effect_key: string;
      }>("SELECT subject, delta, resulting_value, external_effect_key FROM synthetic_actions WHERE operation_id = $1", [receipt.operationId])).rows[0];
      if (action && (action.subject !== receipt.payload.subject || action.delta !== receipt.payload.delta ||
        action.resulting_value !== receipt.result.value || action.external_effect_key !== receipt.operationId)) {
        return "conflict" as const;
      }

      if (!existing) {
        await repository.db.query(
          `INSERT INTO acknowledgement_operations
           (id, scope, idempotency_key, payload_digest, payload, state, result, intent_at, committed_at, receipt_recorded_at, acknowledged_at)
           VALUES ($1, $2, $3, $4, $5, 'recovered', $6, $7, $7, now(), now())`,
          [receipt.operationId, receipt.scope, receipt.idempotencyKey, receipt.payloadDigest, receipt.payload, receipt.result, receipt.committedAt],
        );
      } else {
        await repository.db.query(
          `UPDATE acknowledgement_operations SET state = 'recovered', payload = $2, result = $3,
           committed_at = $4, receipt_recorded_at = now(), acknowledged_at = now() WHERE id = $1`,
          [receipt.operationId, receipt.payload, receipt.result, receipt.committedAt],
        );
      }
      await repository.insertAction(receipt.operationId, receipt.payload, receipt.result.value, receipt.committedAt);
      await repository.insertOperationAudit(receipt.operationId, "restored_from_receipt", receipt.committedAt);
      await repository.insertNotification(receipt.operationId);
      return existing?.state === "acknowledged" || existing?.state === "recovered" ? "existing" as const : "recovered" as const;
    });
  }

  async reopen(operatorId: string, decision: string) {
    return this.transaction(async (repository) => {
      const status = await repository.systemStatus();
      if (!status.reconciled_at) return false;
      await repository.db.query(
        `UPDATE acknowledgement_system_state SET mode = 'open', reason = $1,
         reopened_at = now(), updated_at = now() WHERE singleton = true`,
        [`operator_decision:${decision}`],
      );
      await repository.db.query(
        "INSERT INTO acknowledgement_system_events (event, operator_id, reason) VALUES ('reopened', $1, $2)",
        [operatorId, decision],
      );
      return true;
    });
  }
}
