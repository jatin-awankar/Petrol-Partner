import type {Pool,PoolClient} from "pg";
type Database=Pool|PoolClient;
export type CaseType="hold"|"incident";
export type Operation={id:string;operator_id:string;idempotency_key:string;payload_digest:string;
  case_type:CaseType;case_id:string;action:"outreach"|"resolve";outcome:string|null;
  reason:string;recipient_ids:string[];committed_at:Date;
  state:"committed"|"acknowledged"|"recovered"};
export type Case={id:string;offer_id:string;allocation_id:string|null;subject_type:string;
  subject_id:string;resolved_at:Date|null;reason:string};
export async function byKey(db:Database,operatorId:string,key:string) {
  return (await db.query<Operation>(`SELECT * FROM pilot_revocation_case_operations
    WHERE operator_id=$1 AND idempotency_key=$2`,[operatorId,key])).rows[0]??null;
}
export async function byId(db:Database,id:string,lock=false) {
  return (await db.query<Operation>(`SELECT * FROM pilot_revocation_case_operations WHERE id=$1
    ${lock?"FOR UPDATE":""}`,[id])).rows[0]??null;
}
export async function all(db:Database) {
  return (await db.query<Operation>("SELECT * FROM pilot_revocation_case_operations ORDER BY committed_at,id")).rows;
}
export async function caseForUpdate(db:PoolClient,type:CaseType,id:string) {
  const table=type==="hold"?"pilot_revocation_holds":"pilot_revocation_incidents";
  return (await db.query<Case>(`SELECT id,offer_id,
    ${type==="hold"?"allocation_id":"NULL::uuid AS allocation_id"},
    subject_type,subject_id,resolved_at,reason FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0]??null;
}
export async function participants(db:PoolClient,offerId:string) {
  return (await db.query<{id:string}>(`SELECT id FROM users WHERE id IN (
    SELECT driver_id FROM ride_offers WHERE id=$1 UNION
    SELECT passenger_id FROM pilot_seat_allocations WHERE offer_id=$1
      AND status IN ('confirmed','held','cancelled','completed')) ORDER BY id`,[offerId])).rows.map(row=>row.id);
}
export async function hasOutreach(db:PoolClient,type:CaseType,id:string) {
  return Boolean((await db.query(`SELECT 1 FROM pilot_revocation_case_operations
    WHERE case_type=$1 AND case_id=$2 AND action='outreach'
      AND state IN ('committed','acknowledged','recovered') LIMIT 1`,[type,id])).rowCount);
}
export async function reachedParticipants(db:PoolClient,type:CaseType,id:string,participants:string[]) {
  const reached=(await db.query<{recipient_id:string}>(`SELECT DISTINCT unnest(recipient_ids) AS recipient_id
    FROM pilot_revocation_case_operations WHERE case_type=$1 AND case_id=$2
      AND action='outreach' AND state IN ('committed','acknowledged','recovered')`,[type,id]))
    .rows.map(row=>row.recipient_id);
  return participants.every(id=>reached.includes(id));
}
export async function incidentOutcomeRecorded(db:PoolClient,offerId:string,outcome:string) {
  if(outcome==='safe_completion') return Boolean((await db.query(
    "SELECT 1 FROM ride_offers WHERE id=$1 AND status='completed'",[offerId])).rowCount);
  if(outcome==='interrupted') return Boolean((await db.query(`SELECT 1 FROM pilot_cancellation_operations
    WHERE target_type='offer' AND target_id=$1 AND reason LIKE 'Interruption:%'
      AND result->>'kind'='review_required' AND state IN ('acknowledged','recovered')
    LIMIT 1`,[offerId])).rowCount);
  return false;
}
export async function readyNotifications(db:PoolClient,id:string) {
  await db.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='revocation_case' AND operation_id=$1",[id]);
}
export async function suppressRestoredEmail(db:PoolClient,id:string) {
  await db.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
    last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
    WHERE event_id IN(SELECT id FROM pilot_notification_events
      WHERE origin_type='revocation_case' AND operation_id=$1) AND status<>'sent'`,[id]);
}
export async function cancelled(db:PoolClient,item:Case) {
  if(item.allocation_id) return Boolean((await db.query(`SELECT 1 FROM pilot_seat_allocations a
    JOIN pilot_cancellation_audit c ON c.request_id=a.request_id
    WHERE a.id=$1 AND a.status='cancelled' LIMIT 1`,[item.allocation_id])).rowCount);
  return Boolean((await db.query(`SELECT 1 FROM ride_offers o
    JOIN pilot_cancellation_operations c ON c.target_type='offer' AND c.target_id=o.id
    WHERE o.id=$1 AND o.status='cancelled' AND c.state IN ('acknowledged','recovered')
    LIMIT 1`,[item.offer_id])).rowCount);
}
export async function insert(db:PoolClient,input:{operatorId:string;key:string;digest:string;
  type:CaseType;caseId:string;action:Operation["action"];outcome:string|null;
  reason:string;recipientIds:string[]}) {
  return (await db.query<Operation>(`INSERT INTO pilot_revocation_case_operations
    (operator_id,idempotency_key,payload_digest,case_type,case_id,action,outcome,
      reason,recipient_ids,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'committed') RETURNING *`,
    [input.operatorId,input.key,input.digest,input.type,input.caseId,input.action,
      input.outcome,input.reason,input.recipientIds])).rows[0];
}
export async function applyResolution(db:PoolClient,row:Operation) {
  if(row.action!=="resolve") return;
  const table=row.case_type==="hold"?"pilot_revocation_holds":"pilot_revocation_incidents";
  await db.query(`UPDATE ${table} SET resolved_at=$2,resolved_by=$3,resolution=$4,
    resolution_reason=$5 WHERE id=$1 AND (resolved_at IS NULL OR resolved_at=$2)`,
    [row.case_id,row.committed_at,row.operator_id,row.outcome,row.reason]);
}
export async function audit(db:PoolClient,row:Operation) {
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,created_at)
    SELECT $1,$2,$3,$4,jsonb_build_object('operationId',$5::text,'reason',$6::text,
      'outcome',$7::text,'recipientIds',$8::uuid[]),$9
    WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$5
      AND action=$2)`,[row.operator_id,`revocation_case_${row.action}`,
      `pilot_revocation_${row.case_type}`,row.case_id,row.id,row.reason,row.outcome,
      row.recipient_ids,row.committed_at]);
}
export async function acknowledge(db:PoolClient,id:string) {
  return (await db.query<Operation>(`UPDATE pilot_revocation_case_operations
    SET state='acknowledged',acknowledged_at=now() WHERE id=$1 RETURNING *`,[id])).rows[0];
}
export async function recover(db:PoolClient,item:{operationId:string;operatorId:string;key:string;
  digest:string;caseType:CaseType;caseId:string;action:Operation["action"];outcome:string|null;
  reason:string;recipientIds:string[];committedAt:string}) {
  await db.query(`INSERT INTO pilot_revocation_case_operations
    (id,operator_id,idempotency_key,payload_digest,case_type,case_id,action,outcome,
      reason,recipient_ids,committed_at,state,acknowledged_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'recovered',now())
    ON CONFLICT(id) DO NOTHING`,[item.operationId,item.operatorId,item.key,item.digest,
      item.caseType,item.caseId,item.action,item.outcome,item.reason,item.recipientIds,item.committedAt]);
}
