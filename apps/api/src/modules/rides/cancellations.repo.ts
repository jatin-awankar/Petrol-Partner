import type { Pool, PoolClient } from "pg";

type Database = Pool | PoolClient;
export type AffectedRequest = {id:string;passenger_id:string;status:string;
  allocation_id:string|null;contribution_paise:number|null;currency:string|null};
export type CancellationResult = {kind:"cancelled";cancelled_at:string;offer_id:string;
  requests:AffectedRequest[]} | {kind:"review_required";case_id:string;offer_id:string;
  requested_at:string;operator_recipient_ids:string[]};
export type CancellationOperation = {id:string;actor_id:string;idempotency_key:string;
  payload_digest:string;target_type:"request"|"offer";target_id:string;reason:string|null;
  result:CancellationResult;
  state:"committed"|"acknowledged"|"recovered";created_at:Date};

export async function byKey(db:Database,actorId:string,key:string) {
  return (await db.query<CancellationOperation>(`SELECT * FROM pilot_cancellation_operations
    WHERE actor_id=$1 AND idempotency_key=$2`,[actorId,key])).rows[0] ?? null;
}
export async function byId(db:Database,id:string,actorId?:string) {
  return (await db.query<CancellationOperation>(`SELECT * FROM pilot_cancellation_operations
    WHERE id=$1 AND ($2::uuid IS NULL OR actor_id=$2)`,[id,actorId ?? null])).rows[0] ?? null;
}
export async function all(db:Database) {
  return (await db.query<CancellationOperation>("SELECT * FROM pilot_cancellation_operations")).rows;
}
export async function openReviews(db:Database) {
  return (await db.query<{id:string;actor_id:string;offer_id:string;target_type:string;
    target_id:string;reason:string|null;created_at:Date;status:string}>(`
    SELECT id,actor_id,offer_id,target_type,target_id,reason,created_at,status
    FROM pilot_cancellation_review_cases WHERE status='open' ORDER BY created_at,id LIMIT 100`)).rows;
}
export async function operatorRecipients(db:PoolClient) {
  return (await db.query<{user_id:string}>(`SELECT a.user_id FROM operator_allowlist a
    JOIN users u ON u.id=a.user_id WHERE a.active=true AND u.status='active'
    ORDER BY a.user_id`)).rows.map(row => row.user_id);
}
export async function stateMatches(db:Database,row:CancellationOperation) {
  if (row.result.kind === "review_required") {
    return Boolean((await db.query(`SELECT 1 FROM pilot_cancellation_review_cases
      WHERE id=$1 AND operation_id=$2 AND actor_id=$3 AND target_id=$4 AND created_at=$5`,
      [row.result.case_id,row.id,row.actor_id,row.target_id,row.result.requested_at])).rowCount);
  }
  if (row.target_type === "offer") {
    const offer=(await db.query<{status:string;updated_at:Date}>(
      "SELECT status,updated_at FROM ride_offers WHERE id=$1",[row.result.offer_id])).rows[0];
    if (offer?.status !== "cancelled" || offer.updated_at.toISOString() !== row.result.cancelled_at) return false;
  }
  for (const request of row.result.requests) {
    const state=(await db.query<{status:string;decided_at:Date|null;allocation_status:string|null;
      ended_at:Date|null;audit_at:Date|null;contribution_paise:number|null;currency:string|null}>(`
      SELECT r.status,r.decided_at,a.status AS allocation_status,a.ended_at,
        c.cancelled_at AS audit_at,a.contribution_paise,a.currency
      FROM pilot_seat_requests r
      LEFT JOIN pilot_seat_allocations a ON a.request_id=r.id
      LEFT JOIN pilot_cancellation_audit c ON c.request_id=r.id AND c.operation_id=$2
      WHERE r.id=$1`,[request.id,row.id])).rows[0];
    if (!state || state.status !== "cancelled" || state.decided_at?.toISOString() !== row.result.cancelled_at ||
        state.audit_at?.toISOString() !== row.result.cancelled_at) return false;
    if (request.allocation_id && (state.allocation_status !== "cancelled" ||
      state.ended_at?.toISOString() !== row.result.cancelled_at ||
      state.contribution_paise !== request.contribution_paise || state.currency !== request.currency)) return false;
    if (!request.allocation_id && state.allocation_status !== null) return false;
  }
  return true;
}
export async function requestOfferId(db:PoolClient,id:string) {
  return (await db.query<{offer_id:string}>("SELECT offer_id FROM pilot_seat_requests WHERE id=$1",[id])).rows[0]?.offer_id ?? null;
}
export async function activeAccount(db:PoolClient,id:string) {
  return (await db.query<{status:string}>("SELECT status FROM users WHERE id=$1 FOR SHARE",[id])).rows[0]?.status === "active";
}
export async function driverForOffer(db:PoolClient,id:string) {
  return (await db.query<{driver_id:string}>("SELECT driver_id FROM ride_offers WHERE id=$1",[id])).rows[0]?.driver_id ?? null;
}
export async function offerStatus(db:Database,id:string) {
  return (await db.query<{status:string}>("SELECT status FROM ride_offers WHERE id=$1",[id])).rows[0]?.status??null;
}
export async function offerForUpdate(db:PoolClient,id:string) {
  return (await db.query<{id:string;driver_id:string;status:string;departure_at:Date}>(`
    SELECT id,driver_id,status,(date+time) AT TIME ZONE 'Asia/Kolkata' AS departure_at
    FROM ride_offers WHERE id=$1 AND pilot_policy_id IS NOT NULL FOR UPDATE`,[id])).rows[0] ?? null;
}
export async function requestsForOffer(db:PoolClient,offerId:string) {
  return (await db.query<AffectedRequest & {offer_id:string}>(`SELECT r.id,r.offer_id,r.passenger_id,r.status,
    a.id AS allocation_id,a.contribution_paise,a.currency FROM pilot_seat_requests r
    LEFT JOIN pilot_seat_allocations a ON a.request_id=r.id
    WHERE r.offer_id=$1 ORDER BY r.id FOR UPDATE OF r`,[offerId])).rows;
}
export async function cancel(db:PoolClient,input:{actorId:string;key:string;digest:string;
  targetType:"request"|"offer";targetId:string;offerId:string;reason:string|null;
  requests:AffectedRequest[];at:Date}) {
  const {actorId,key,digest,targetType,targetId,offerId,reason,requests,at}=input;
  const result:CancellationResult={kind:"cancelled",cancelled_at:at.toISOString(),offer_id:offerId,requests};
  const row=(await db.query<CancellationOperation>(`INSERT INTO pilot_cancellation_operations
    (actor_id,idempotency_key,payload_digest,target_type,target_id,reason,result,state,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'committed',$8) RETURNING *`,
    [actorId,key,digest,targetType,targetId,reason,JSON.stringify(result),at])).rows[0];
  if (targetType === "offer") await db.query(`UPDATE ride_offers SET status='cancelled',updated_at=$2
    WHERE id=$1`,[offerId,at]);
  for (const item of requests) {
    await db.query("UPDATE pilot_seat_requests SET status='cancelled',decided_at=$2 WHERE id=$1",[item.id,at]);
    if (item.allocation_id) await db.query(`UPDATE pilot_seat_allocations
      SET status='cancelled',ended_at=$2 WHERE id=$1 AND status IN ('confirmed','held')`,[item.allocation_id,at]);
    await db.query(`INSERT INTO pilot_cancellation_audit
      (operation_id,request_id,actor_id,cancelled_at,reason) VALUES($1,$2,$3,$4,$5)`,
      [row.id,item.id,actorId,at,reason]);
  }
  return row;
}
export async function requestReview(db:PoolClient,input:{actorId:string;key:string;digest:string;
  targetType:"request"|"offer";targetId:string;offerId:string;reason:string|null;
  caseId:string;at:Date;operatorRecipientIds:string[]}) {
  const result:CancellationResult={kind:"review_required",case_id:input.caseId,
    offer_id:input.offerId,requested_at:input.at.toISOString(),
    operator_recipient_ids:input.operatorRecipientIds};
  const row=(await db.query<CancellationOperation>(`INSERT INTO pilot_cancellation_operations
    (actor_id,idempotency_key,payload_digest,target_type,target_id,reason,result,state,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'committed',$8) RETURNING *`,
    [input.actorId,input.key,input.digest,input.targetType,input.targetId,input.reason,
      JSON.stringify(result),input.at])).rows[0];
  await db.query(`INSERT INTO pilot_cancellation_review_cases
    (id,operation_id,actor_id,offer_id,target_type,target_id,reason,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[input.caseId,row.id,input.actorId,input.offerId,
      input.targetType,input.targetId,input.reason,input.at]);
  return row;
}
export async function acknowledge(db:PoolClient,id:string) {
  return (await db.query<CancellationOperation>(`UPDATE pilot_cancellation_operations
    SET state='acknowledged',acknowledged_at=now() WHERE id=$1 RETURNING *`,[id])).rows[0];
}
export async function readyNotifications(db:PoolClient,id:string) {
  await db.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='pilot_cancellation' AND operation_id=$1",[id]);
}
export async function suppressRestoredEmail(db:PoolClient,id:string) {
  await db.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
    last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
    WHERE event_id IN (SELECT id FROM pilot_notification_events
      WHERE origin_type='pilot_cancellation' AND operation_id=$1)`,[id]);
}
export async function restore(db:PoolClient,item:{operationId:string;actorId:string;key:string;digest:string;
  targetType:"request"|"offer";targetId:string;reason:string|null;
  result:CancellationOperation["result"];createdAt:string}) {
  const existing=await byId(db,item.operationId);
  if (existing) {
    if (existing.state === "committed") await db.query(`UPDATE pilot_cancellation_operations
      SET state='recovered',acknowledged_at=now() WHERE id=$1`,[item.operationId]);
    return;
  }
  await db.query(`INSERT INTO pilot_cancellation_operations
    (id,actor_id,idempotency_key,payload_digest,target_type,target_id,reason,result,state,created_at,acknowledged_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'recovered',$9,now()) ON CONFLICT(id) DO NOTHING`,
    [item.operationId,item.actorId,item.key,item.digest,item.targetType,item.targetId,item.reason,
      JSON.stringify(item.result),item.createdAt]);
  if (item.result.kind === "review_required") {
    await db.query(`INSERT INTO pilot_cancellation_review_cases
      (id,operation_id,actor_id,offer_id,target_type,target_id,reason,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,
      [item.result.case_id,item.operationId,item.actorId,item.result.offer_id,
        item.targetType,item.targetId,item.reason,item.result.requested_at]);
    await db.query(`UPDATE pilot_cancellation_operations SET state='recovered',acknowledged_at=now()
      WHERE id=$1 AND state='committed'`,[item.operationId]);
    return;
  }
  if (item.targetType === "offer") await db.query(`UPDATE ride_offers SET status='cancelled'
    ,updated_at=$2 WHERE id=$1 AND status IN ('active','held','cancelled')`,
    [item.result.offer_id,item.result.cancelled_at]);
  for (const request of item.result.requests) {
    await db.query(`UPDATE pilot_seat_requests SET status='cancelled',decided_at=$2
      WHERE id=$1 AND status IN ('pending','accepted','cancelled')`,[request.id,item.result.cancelled_at]);
    if (request.allocation_id) await db.query(`UPDATE pilot_seat_allocations
      SET status='cancelled',ended_at=$2 WHERE id=$1 AND status IN ('confirmed','held','cancelled')`,
      [request.allocation_id,item.result.cancelled_at]);
  }
  for (const request of item.result.requests) await db.query(`INSERT INTO pilot_cancellation_audit
    (operation_id,request_id,actor_id,cancelled_at,reason) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT DO NOTHING`,[item.operationId,request.id,item.actorId,item.result.cancelled_at,item.reason]);
  await db.query(`UPDATE pilot_cancellation_operations SET state='recovered',acknowledged_at=now()
    WHERE id=$1 AND state='committed'`,[item.operationId]);
}
