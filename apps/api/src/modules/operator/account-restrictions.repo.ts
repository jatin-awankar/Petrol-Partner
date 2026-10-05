import type {Pool,PoolClient} from "pg";
import type {Effect,RestrictionScope} from "../verification/revocation-effects.repo";

type Db=Pool|PoolClient;
export function activeRestrictionSql(targetExpression:string,roleExpression:string){
  return `EXISTS (SELECT 1 FROM pilot_account_restriction_operations restriction
    WHERE restriction.target_user_id=${targetExpression} AND restriction.action='restrict'
      AND restriction.scope IN (${roleExpression},'all')
      AND NOT EXISTS(SELECT 1 FROM pilot_account_restriction_operations v
        WHERE v.reverses_id=restriction.id AND v.action='reverse'))`;
}
export async function hasActiveRestriction(db:PoolClient,userId:string,role:"driver"|"passenger"){
  return Boolean((await db.query(`SELECT 1 WHERE ${activeRestrictionSql('$1','$2')} LIMIT 1`,
    [userId,role])).rowCount);
}
export type Command={action:"restrict"|"reverse";targetUserId:string;scope:RestrictionScope;
  sourceType:"incident"|"settlement";sourceId:string;reason:string;
  reviewedEvidence:string;reversesId:string|null};
export type Operation={id:string;operator_id:string;target_user_id:string;
  idempotency_key:string;payload_digest:string;action:Command["action"];
  scope:RestrictionScope;source_type:Command["sourceType"];source_id:string;
  reason:string;reviewed_evidence:string;reverses_id:string|null;
  effect_snapshot:Effect[];committed_at:Date;state:"committed"|"acknowledged"|"recovered"};

export const byKey=async(db:Db,operatorId:string,key:string)=>(await db.query<Operation>(
  `SELECT * FROM pilot_account_restriction_operations WHERE operator_id=$1 AND idempotency_key=$2`,
  [operatorId,key])).rows[0]??null;
export const byId=async(db:Db,id:string,lock=false)=>(await db.query<Operation>(
  `SELECT * FROM pilot_account_restriction_operations WHERE id=$1 ${lock?"FOR UPDATE":""}`,[id])).rows[0]??null;
export const all=async(db:Db)=>(await db.query<Operation>(
  `SELECT * FROM pilot_account_restriction_operations ORDER BY committed_at,id`)).rows;
export async function history(db:Db,targetUserId:string){
  return (await db.query<Operation>(`SELECT * FROM pilot_account_restriction_operations
    WHERE target_user_id=$1 ORDER BY committed_at DESC,id DESC`,[targetUserId])).rows;
}
export async function operatorRecipients(db:PoolClient){
  return (await db.query<{user_id:string}>(`SELECT user_id FROM operator_allowlist
    WHERE active=true ORDER BY user_id`)).rows.map(row=>row.user_id);
}
export async function sourceParticipants(db:PoolClient,type:Command["sourceType"],id:string){
  const route=type==='incident'?(await db.query<{driver_id:string;passenger_ids:string[]}>(`
    SELECT o.driver_id,ARRAY(SELECT a.passenger_id FROM posted_route_seat_allocations a
      WHERE a.offer_id=o.id) AS passenger_ids FROM posted_route_incidents i
    JOIN posted_route_offers o ON o.id=i.offer_id WHERE i.id=$1 FOR SHARE OF i,o`,[id])).rows[0]:
    (await db.query<{driver_id:string;passenger_ids:string[]}>(`SELECT a.driver_id,ARRAY[a.passenger_id] AS passenger_ids
      FROM posted_route_settlement_reviews r JOIN posted_route_obligations b ON b.id=r.obligation_id
      JOIN posted_route_seat_allocations a ON a.id=b.allocation_id
      WHERE r.obligation_id=$1 AND r.status='resolved' FOR SHARE OF r,b,a`,[id])).rows[0];
  if(route)return route;

  if(type==="incident") return (await db.query<{driver_id:string;passenger_ids:string[]}>(
    `SELECT o.driver_id,ARRAY(SELECT a.passenger_id FROM pilot_seat_allocations a
      WHERE a.offer_id=o.id AND a.status IN ('confirmed','held','cancelled','completed')) ||
      CASE WHEN i.subject_type IN ('student','restriction') THEN ARRAY[i.subject_id]
        ELSE ARRAY[]::uuid[] END AS passenger_ids
      FROM pilot_revocation_incidents i JOIN ride_offers o ON o.id=i.offer_id
      WHERE i.id=$1 FOR SHARE OF i,o`,[id])).rows[0]??null;
  return (await db.query<{driver_id:string;passenger_ids:string[]}>(
    `SELECT a.driver_id,ARRAY[a.passenger_id] AS passenger_ids
      FROM pilot_settlement_reviews r
      JOIN pilot_contribution_obligations b ON b.id=r.obligation_id
      JOIN pilot_seat_allocations a ON a.id=b.allocation_id
      WHERE r.obligation_id=$1 AND r.final_decision_id IS NOT NULL FOR SHARE OF r,b,a`,[id])).rows[0]??null;
}
export async function activeForUpdate(db:PoolClient,id:string){
  return (await db.query<Operation>(`SELECT * FROM pilot_account_restriction_operations r
    WHERE r.id=$1 AND r.action='restrict' AND NOT EXISTS(
      SELECT 1 FROM pilot_account_restriction_operations v WHERE v.reverses_id=r.id)
    FOR UPDATE OF r`,[id])).rows[0]??null;
}
export async function insert(db:PoolClient,operatorId:string,key:string,digest:string,c:Command,
  id?:string,at?:Date,state:Operation["state"]="committed"){
  return (await db.query<Operation>(`INSERT INTO pilot_account_restriction_operations
    (id,operator_id,target_user_id,idempotency_key,payload_digest,action,scope,source_type,
      source_id,reason,reviewed_evidence,reverses_id,committed_at,state)
    VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
      COALESCE($13::timestamptz,now()),$14) RETURNING *`,
    [id??null,operatorId,c.targetUserId,key,digest,c.action,c.scope,c.sourceType,c.sourceId,
      c.reason,c.reviewedEvidence,c.reversesId,at??null,state])).rows[0];
}
export async function saveEffects(db:PoolClient,id:string,effects:Effect[]){
  return (await db.query<{effect_snapshot:Effect[]}>(`UPDATE pilot_account_restriction_operations
    SET effect_snapshot=$2::jsonb WHERE id=$1 RETURNING effect_snapshot`,
    [id,JSON.stringify(effects)])).rows[0].effect_snapshot;
}
export async function audit(db:PoolClient,row:Operation){
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,created_at)
    SELECT $1,$2,'pilot_account_restriction',$3,
      jsonb_build_object('operationId',$4::text,'targetUserId',$5::text,'scope',$6::text,
        'sourceType',$7::text,'sourceId',$8::text,'reason',$9::text,
        'reviewedEvidence',$10::text,'reversesId',$11::text),$12
    WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$4
      AND action=$2)`,[row.operator_id,`pilot_account_${row.action}`,
      row.action==="reverse"?row.reverses_id:row.id,row.id,row.target_user_id,row.scope,
      row.source_type,row.source_id,row.reason,row.reviewed_evidence,row.reverses_id,
      row.committed_at]);
}
export const acknowledge=async(db:PoolClient,id:string)=>(await db.query<Operation>(
  `UPDATE pilot_account_restriction_operations SET state='acknowledged',acknowledged_at=now()
    WHERE id=$1 AND state='committed' RETURNING *`,[id])).rows[0]??null;
export async function markRecovered(db:PoolClient,id:string){await db.query(`UPDATE pilot_account_restriction_operations
  SET state='recovered',acknowledged_at=COALESCE(acknowledged_at,now())
  WHERE id=$1 AND state='committed'`,[id]);}
export async function evidence(db:Db,row:Operation){
  const audit=await db.query(`SELECT 1 FROM audit_logs WHERE action=$1
    AND metadata->>'operationId'=$2`,[`pilot_account_${row.action}`,row.id]);
  const notification=await db.query(`SELECT 1 FROM pilot_notification_events
    WHERE origin_type='account_restriction' AND operation_id=$1 AND recipient_id=$2
      AND ready_at IS NOT NULL`,[row.id,row.target_user_id]);
  return Boolean(audit.rowCount&&notification.rowCount);
}
export async function ready(db:PoolClient,id:string){await db.query(`UPDATE pilot_notification_events
  SET ready_at=now() WHERE origin_type='account_restriction' AND operation_id=$1`,[id]);}
export async function suppressRestoredEmail(db:PoolClient,id:string){await db.query(`UPDATE pilot_email_jobs
  SET status='exhausted',lease_until=NULL,
    last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
  WHERE event_id IN(SELECT id FROM pilot_notification_events
    WHERE origin_type='account_restriction' AND operation_id=$1) AND status<>'sent'`,[id]);}
