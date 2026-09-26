import type { Pool, PoolClient } from "pg";
import type {Effect} from "./revocation-effects.repo";

type Database=Pool|PoolClient;
export async function operatorRecipients(db:PoolClient) {
  return (await db.query<{user_id:string}>("SELECT user_id FROM operator_allowlist WHERE active=true ORDER BY user_id"))
    .rows.map(row=>row.user_id);
}
export async function readyNotifications(db:PoolClient,id:string) {
  await db.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='student_revocation' AND operation_id=$1",[id]);
}
export async function suppressRestoredEmail(db:PoolClient,id:string) {
  await db.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
    last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
    WHERE event_id IN(SELECT id FROM pilot_notification_events
      WHERE origin_type='student_revocation' AND operation_id=$1) AND status<>'sent'`,[id]);
}
export type Operation={id:string;operator_id:string;student_id:string;idempotency_key:string;
  payload_digest:string;reason:string;previous_status:string;committed_at:Date;
  effect_snapshot:Effect[];
  state:"committed"|"acknowledged"|"recovered"};
export async function byKey(db:Database,operatorId:string,key:string) {
  return (await db.query<Operation>(`SELECT * FROM pilot_student_revocations
    WHERE operator_id=$1 AND idempotency_key=$2`,[operatorId,key])).rows[0]??null;
}
export async function byId(db:Database,id:string,lock=false) {
  return (await db.query<Operation>(`SELECT * FROM pilot_student_revocations WHERE id=$1
    ${lock ? "FOR UPDATE" : ""}`,[id])).rows[0]??null;
}
export async function all(db:Database) {
  return (await db.query<Operation>("SELECT * FROM pilot_student_revocations ORDER BY committed_at,id")).rows;
}
export async function previousStatus(db:PoolClient,id:string) {
  return (await db.query<{status:string}>(`SELECT status FROM student_verifications
    WHERE user_id=$1 FOR UPDATE`,[id])).rows[0]?.status??null;
}
export async function insert(db:PoolClient,input:{operatorId:string;studentId:string;key:string;
  digest:string;reason:string;previousStatus:string}) {
  return (await db.query<Operation>(`INSERT INTO pilot_student_revocations
    (operator_id,student_id,idempotency_key,payload_digest,reason,previous_status,state)
    VALUES($1,$2,$3,$4,$5,$6,'committed') RETURNING *`,[input.operatorId,input.studentId,
      input.key,input.digest,input.reason,input.previousStatus])).rows[0];
}
export async function saveEffectSnapshot(db:PoolClient,id:string,items:Effect[]) {
  return (await db.query<{effect_snapshot:Effect[]}>(`UPDATE pilot_student_revocations
    SET effect_snapshot=$2::jsonb WHERE id=$1 RETURNING effect_snapshot`,
    [id,JSON.stringify(items)])).rows[0].effect_snapshot;
}
export async function apply(db:PoolClient,row:Operation,replaying=false) {
  const updated=await db.query(`UPDATE student_verifications SET status='suspended',
    reviewed_by_user_id=$2,reviewed_at=$3,updated_at=now(),
    metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{revocationReason}',to_jsonb($4::text))
    WHERE user_id=$1 AND ($5::boolean=false OR reviewed_at IS NULL OR reviewed_at<=$3)`,
    [row.student_id,row.operator_id,row.committed_at,row.reason,replaying]);
  if(updated.rowCount) await db.query("UPDATE user_profiles SET is_verified=false WHERE user_id=$1",[row.student_id]);
  return Boolean(updated.rowCount);
}
export async function audit(db:PoolClient,row:Operation) {
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,created_at)
    SELECT $1,'student_revoked','student_verification',$2,
      jsonb_build_object('operationId',$3::text,'reason',$4::text,'previousStatus',$5::text),$6
    WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE action='student_revoked'
      AND metadata->>'operationId'=$3)`,[row.operator_id,row.student_id,row.id,row.reason,
      row.previous_status,row.committed_at]);
}
export async function acknowledge(db:PoolClient,id:string) {
  return (await db.query<Operation>(`UPDATE pilot_student_revocations
    SET state='acknowledged',acknowledged_at=now() WHERE id=$1 RETURNING *`,[id])).rows[0];
}
export async function recover(db:PoolClient,item:{operationId:string;operatorId:string;studentId:string;
  key:string;digest:string;reason:string;previousStatus:string;effectSnapshot:Effect[];committedAt:string}) {
  await db.query(`INSERT INTO pilot_student_revocations
    (id,operator_id,student_id,idempotency_key,payload_digest,reason,previous_status,
      effect_snapshot,committed_at,state,acknowledged_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'recovered',now())
    ON CONFLICT(id) DO NOTHING`,[item.operationId,item.operatorId,item.studentId,item.key,
      item.digest,item.reason,item.previousStatus,JSON.stringify(item.effectSnapshot),item.committedAt]);
}
