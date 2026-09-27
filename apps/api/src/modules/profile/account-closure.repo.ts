import type { Pool, PoolClient } from "pg";

type Database = Pool | PoolClient;

export const closureSql = {
  lockUser: "SELECT id FROM users WHERE id=$1 FOR UPDATE",
  existing: "SELECT * FROM pilot_account_closures WHERE user_id=$1 FOR UPDATE",
  mine: `SELECT id,requested_at,due_at,status,attempts,last_error_code
    FROM pilot_account_closures WHERE user_id=$1`,
  create: `INSERT INTO pilot_account_closures(user_id,status) VALUES($1,$2) RETURNING *`,
  event: `INSERT INTO pilot_closure_events(closure_id,event,actor_id) VALUES($1,$2,$3)`,
  activeCommitments: `SELECT EXISTS(SELECT 1 FROM pilot_seat_allocations WHERE (driver_id=$1 OR passenger_id=$1)
    AND status IN ('confirmed','held')) OR EXISTS(SELECT 1 FROM ride_offers
    WHERE driver_id=$1 AND pilot_policy_id IS NOT NULL AND status IN ('active','held','departed')) AS blocked`,
  openCases: `SELECT EXISTS(SELECT 1 FROM pilot_journey_reviews r JOIN pilot_seat_allocations a ON a.id=r.allocation_id
      WHERE (a.driver_id=$1 OR a.passenger_id=$1) AND r.status='open')
    OR EXISTS(SELECT 1 FROM pilot_settlement_reviews r JOIN pilot_contribution_obligations o ON o.id=r.obligation_id
      JOIN pilot_seat_allocations a ON a.id=o.allocation_id
      WHERE (a.driver_id=$1 OR a.passenger_id=$1) AND r.status='open')
    OR EXISTS(SELECT 1 FROM pilot_revocation_incidents i JOIN ride_offers o ON o.id=i.offer_id
      LEFT JOIN pilot_seat_allocations a ON a.offer_id=o.id
      WHERE (o.driver_id=$1 OR a.passenger_id=$1) AND i.resolved_at IS NULL) AS blocked`,
  activeHolds: `SELECT id,scope,reason,operator_id,review_at,created_at FROM pilot_retention_holds
    WHERE closure_id=$1 AND released_at IS NULL ORDER BY created_at`,
  holdByKey: "SELECT * FROM pilot_retention_holds WHERE operator_id=$1 AND idempotency_key=$2",
  holdForUpdate: "SELECT * FROM pilot_retention_holds WHERE id=$1 FOR UPDATE",
  queue: `SELECT c.id,c.requested_at,c.due_at,c.status,c.attempts,c.last_error_code,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'scope',h.scope,'reason',h.reason,
      'operator_id',h.operator_id,'review_at',h.review_at) ORDER BY h.review_at)
      FROM pilot_retention_holds h WHERE h.closure_id=c.id AND h.released_at IS NULL),'[]'::jsonb) AS holds
    FROM pilot_account_closures c ORDER BY c.due_at,c.id LIMIT 100`,
  lockClosure: "SELECT * FROM pilot_account_closures WHERE id=$1 FOR UPDATE",
  addHold: `INSERT INTO pilot_retention_holds(closure_id,scope,reason,operator_id,review_at,idempotency_key)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
  releaseHold: `UPDATE pilot_retention_holds SET released_at=now(),released_by=$2,release_reason=$3,
    release_key=$4 WHERE id=$1 AND released_at IS NULL RETURNING closure_id`,
  lockKey: "SELECT pg_advisory_xact_lock(hashtext($1))",
  markHeld: "UPDATE pilot_account_closures SET status='held',updated_at=now() WHERE id=$1",
  markPending: "UPDATE pilot_account_closures SET status='pending',updated_at=now() WHERE id=$1",
  failed: `UPDATE pilot_account_closures SET status='provider_failed',attempts=attempts+1,
    last_error_code=$2,updated_at=now() WHERE id=$1`,
} as const;

export function closureQuery(db: Database, name: keyof typeof closureSql, params: unknown[] = []) {
  return db.query(closureSql[name], params);
}
