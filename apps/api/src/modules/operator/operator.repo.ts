import type { Pool, PoolClient, QueryResultRow } from "pg";

// SQL for operator pause and recovery is kept in the repository module.
export const operatorSql = {
  recoveryModeForUpdate: "SELECT mode FROM pilot_recovery_state WHERE singleton = true FOR UPDATE",
  preserveRestrictionCause: "UPDATE pilot_recovery_state SET cause = COALESCE(cause, $1), started_at = COALESCE(started_at, now()) WHERE singleton = true",
  enterRestrictedMode: "UPDATE pilot_recovery_state SET mode = 'restricted', cause = $1, started_at = now(), reconciled_at = NULL WHERE singleton = true",
  recordRestriction: "INSERT INTO pilot_recovery_events (event, reason) VALUES ('restricted', $1)",
  acknowledgedPauseOperations: "SELECT * FROM pilot_pause_operations WHERE state IN ('acknowledged', 'recovered')",
  acknowledgedReopenOperations: "SELECT * FROM pilot_reopen_operations WHERE state IN ('acknowledged', 'recovered')",
  currentOperator: "SELECT 1 FROM users u JOIN operator_allowlist a ON a.user_id = u.id WHERE u.id = $1 AND u.role = 'admin' AND u.status = 'active' AND a.active = true FOR SHARE OF u, a",
  lockIdempotencyKey: "SELECT pg_advisory_xact_lock(hashtext($1))",
  pauseOperationByKey: "SELECT * FROM pilot_pause_operations WHERE operator_id = $1 AND idempotency_key = $2",
  recoveryMode: "SELECT mode FROM pilot_recovery_state WHERE singleton = true",
  pendingPauseOperation: "SELECT id FROM pilot_pause_operations WHERE state IN ('intent', 'committed') LIMIT 1",
  createPauseIntent: `INSERT INTO pilot_pause_operations (operator_id, idempotency_key, payload_digest, capability, paused, reason, state)
        VALUES ($1, $2, $3, $4, $5, $6, 'intent') RETURNING *`,
  pauseOperationForUpdate: "SELECT * FROM pilot_pause_operations WHERE id = $1 FOR UPDATE",
  setCapabilityPause: "UPDATE pilot_pause_state SET paused = $2, operation_id = $3, updated_at = now() WHERE capability = $1",
  commitPauseOperation: "UPDATE pilot_pause_operations SET state = 'committed', committed_at = now() WHERE id = $1 RETURNING *",
  resumePauseOperation: "UPDATE pilot_pause_operations SET state = 'committed', committed_at = now(), resumed_by = $2, resume_reason = $3, resumed_from = 'intent' WHERE id = $1 AND state = 'intent' RETURNING *",
  handoffCommittedPause: "UPDATE pilot_pause_operations SET resumed_by = $2, resume_reason = $3, resumed_from = 'committed' WHERE id = $1 AND state = 'committed' RETURNING *",
  insertPauseAudit: "INSERT INTO pilot_pause_audit (operation_id, operator_id, capability, paused, reason, recorded_at, executed_by) VALUES ($1, $2, $3, $4, $5, $6, $7)",
  recordDecisionResume: "INSERT INTO pilot_recovery_events (event, operation_id, operator_id, reason) VALUES ('decision_resumed', $1, $2, $3) ON CONFLICT DO NOTHING",
  insertPauseFollowup: "INSERT INTO pilot_pause_followup (operation_id, kind) VALUES ($1, 'operator_pause_changed')",
  acknowledgePauseOperation: "UPDATE pilot_pause_operations SET state = 'acknowledged', acknowledged_at = now() WHERE id = $1 RETURNING *",
  recoveryStatus: "SELECT mode, cause, started_at, reconciled_at, reopened_at FROM pilot_recovery_state WHERE singleton = true",
  effectiveCapabilities: `SELECT p.capability,
      CASE WHEN r.mode <> 'open' OR EXISTS (SELECT 1 FROM pilot_pause_operations WHERE state IN ('intent', 'committed')) THEN true ELSE p.paused END AS paused,
      EXISTS (SELECT 1 FROM pilot_pause_operations WHERE state IN ('intent', 'committed')) AS pending
      FROM pilot_pause_state p LEFT JOIN pilot_pause_operations o ON o.id = p.operation_id
      CROSS JOIN pilot_recovery_state r ORDER BY p.capability`,
  pauseOperationForOwner: "SELECT * FROM pilot_pause_operations WHERE id = $1 AND operator_id = $2",
  pauseOperationById: "SELECT * FROM pilot_pause_operations WHERE id = $1",
  pauseOperationIdByKey: "SELECT id FROM pilot_pause_operations WHERE operator_id = $1 AND idempotency_key = $2",
  pendingPauseOperations: "SELECT id, operator_id, capability, paused, reason, state, committed_at FROM pilot_pause_operations WHERE state IN ('intent', 'committed') ORDER BY id",
  restorePauseOperation: `INSERT INTO pilot_pause_operations (id, operator_id, idempotency_key, payload_digest, capability, paused, reason, state, committed_at, acknowledged_at, resumed_by, resume_reason, resumed_from)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'recovered', $8, now(), $9, $10, $11)`,
  markPauseRecovered: "UPDATE pilot_pause_operations SET state = 'recovered', committed_at = $2, acknowledged_at = now(), resumed_by = $3, resume_reason = $4, resumed_from = $5 WHERE id = $1",
  restorePauseAudit: "INSERT INTO pilot_pause_audit (operation_id, operator_id, capability, paused, reason, recorded_at, executed_by) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
  restorePauseFollowup: "INSERT INTO pilot_pause_followup (operation_id, kind) VALUES ($1, 'operator_pause_changed') ON CONFLICT DO NOTHING",
  capabilityStateForUpdate: "SELECT updated_at FROM pilot_pause_state WHERE capability = $1 FOR UPDATE",
  restoreCapabilityState: "INSERT INTO pilot_pause_state (capability, paused, operation_id, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (capability) DO UPDATE SET paused = EXCLUDED.paused, operation_id = EXCLUDED.operation_id, updated_at = EXCLUDED.updated_at",
  reopenOperationForUpdate: "SELECT * FROM pilot_reopen_operations WHERE id = $1 FOR UPDATE",
  restoreReopenOperation: "INSERT INTO pilot_reopen_operations (id, operator_id, idempotency_key, reason, reconciliation_digest, state, committed_at, acknowledged_at) VALUES ($1, $2, $3, $4, $5, 'recovered', $6, now())",
  markReopenRecovered: "UPDATE pilot_reopen_operations SET state = 'recovered', acknowledged_at = now() WHERE id = $1",
  restoreReopenAudit: "INSERT INTO pilot_reopen_audit (operation_id, operator_id, reason, recorded_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
  markRecoveryReconciled: "UPDATE pilot_recovery_state SET reconciled_at = now() WHERE singleton = true",
  recordReconciliation: "INSERT INTO pilot_recovery_events (event, operator_id, reason) VALUES ('reconciled', $1, 'signed receipts inspected')",
  recoveryStateForUpdate: "SELECT * FROM pilot_recovery_state WHERE singleton = true FOR UPDATE",
  reopenOperationByKey: "SELECT * FROM pilot_reopen_operations WHERE operator_id = $1 AND idempotency_key = $2",
  pendingReopenOperation: "SELECT id FROM pilot_reopen_operations WHERE state = 'committed' LIMIT 1",
  createReopenOperation: "INSERT INTO pilot_reopen_operations (operator_id, idempotency_key, reason, reconciliation_digest, state) VALUES ($1, $2, $3, $4, 'committed') RETURNING *",
  insertReopenAudit: "INSERT INTO pilot_reopen_audit (operation_id, operator_id, reason, recorded_at) VALUES ($1, $2, $3, $4)",
  openRecoveryMode: "UPDATE pilot_recovery_state SET mode = 'open', cause = NULL, reopened_at = now(), reopened_by = $1 WHERE singleton = true",
  acknowledgeReopenOperation: "UPDATE pilot_reopen_operations SET state = 'acknowledged', acknowledged_at = now() WHERE id = $1",
  recordReopening: "INSERT INTO pilot_recovery_events (event, operator_id, reason) VALUES ('reopened', $1, $2)",
} as const;

export function operatorQuery<T extends QueryResultRow = any>(database: Pool | PoolClient, name: keyof typeof operatorSql, params?: unknown[]) {
  return database.query<T>(operatorSql[name], params);
}
