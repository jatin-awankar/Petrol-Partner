import type {Pool,PoolClient} from 'pg';
type Db=Pool|PoolClient;
export type Outcome='travelled_completed'|'did_not_travel'|'interrupted'|'insufficient_evidence';
export type Decision={id:string;review_id:string;operator_id:string;idempotency_key:string;
  payload_digest:string;outcome:Outcome;contribution_owed:boolean|null;reason:string;
  evidence_refs:string[];decided_at:Date;state:'committed'|'acknowledged'|'recovered'};
export const byKey=async(db:Db,operator:string,key:string)=>(await db.query<Decision>(
  'SELECT * FROM pilot_journey_review_decisions WHERE operator_id=$1 AND idempotency_key=$2',[operator,key])).rows[0]??null;
export const byId=async(db:Db,id:string,lock=false)=>(await db.query<Decision>(
  `SELECT * FROM pilot_journey_review_decisions WHERE id=$1 ${lock?'FOR UPDATE':''}`,[id])).rows[0]??null;
export const all=async(db:Db)=>(await db.query<Decision>(
  'SELECT * FROM pilot_journey_review_decisions ORDER BY decided_at,id')).rows;
export async function detail(db:Db,id:string,lock=false){
  return (await db.query(`SELECT r.id,r.allocation_id,r.reason AS review_reason,r.status,r.created_at,
    a.offer_id,a.driver_id,a.passenger_id,a.contribution_paise AS frozen_paise,a.currency,a.policy_version,
    d.travelled AS driver_travelled,d.completed AS driver_completed,d.recorded_at AS driver_recorded_at,
    p.travelled AS passenger_travelled,p.completed AS passenger_completed,p.recorded_at AS passenger_recorded_at,
    o.id AS obligation_id,o.amount_paise AS obligation_paise,o.currency AS obligation_currency,
    o.policy_version AS obligation_policy_version,o.confirmed_at AS obligation_confirmed_at,
    o.review_decision_id AS obligation_review_decision_id,o.due_at AS obligation_due_at,
    x.id AS final_decision_id,x.outcome,x.contribution_owed,x.reason AS decision_reason,
    x.evidence_refs,x.operator_id,x.decided_at
    FROM pilot_journey_reviews r JOIN pilot_seat_allocations a ON a.id=r.allocation_id
    LEFT JOIN pilot_journey_claims d ON d.allocation_id=a.id AND d.actor_role='driver'
    LEFT JOIN pilot_journey_claims p ON p.allocation_id=a.id AND p.actor_role='passenger'
    LEFT JOIN pilot_contribution_obligations o ON o.allocation_id=a.id
    LEFT JOIN pilot_journey_review_decisions x ON x.review_id=r.id AND x.outcome<>'insufficient_evidence'
    WHERE r.id=$1 ${lock?'FOR UPDATE OF r':''}`,[id])).rows[0]??null;
}
export async function queue(db:Db){return (await db.query(`SELECT r.id,r.allocation_id,r.reason,r.status,r.created_at,
  a.offer_id,a.driver_id,a.passenger_id,d.outcome AS latest_outcome,d.decided_at AS latest_decided_at
  FROM pilot_journey_reviews r JOIN pilot_seat_allocations a ON a.id=r.allocation_id
  LEFT JOIN LATERAL (SELECT outcome,decided_at FROM pilot_journey_review_decisions
    WHERE review_id=r.id ORDER BY decided_at DESC,id DESC LIMIT 1) d ON true
  WHERE r.status='open' ORDER BY r.created_at,r.id LIMIT 100`)).rows;}
export async function history(db:Db,id:string){return (await db.query<Decision>(
  'SELECT * FROM pilot_journey_review_decisions WHERE review_id=$1 ORDER BY decided_at,id',[id])).rows;}
export async function insert(db:PoolClient,input:{reviewId:string;operatorId:string;key:string;digest:string;
  outcome:Outcome;owed:boolean|null;reason:string;evidenceRefs:string[];id?:string;at?:Date;
  state?:Decision['state']}){
  return (await db.query<Decision>(`INSERT INTO pilot_journey_review_decisions
    (id,review_id,operator_id,idempotency_key,payload_digest,outcome,contribution_owed,
      reason,evidence_refs,decided_at,state)
    VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,now()),$11)
    ON CONFLICT(id) DO NOTHING RETURNING *`,[input.id??null,input.reviewId,input.operatorId,
      input.key,input.digest,input.outcome,input.owed,input.reason,input.evidenceRefs,
      input.at??null,input.state??'committed'])).rows[0];
}
export async function apply(db:PoolClient,row:Decision){
  if(row.outcome!=='insufficient_evidence'){
    await db.query("UPDATE pilot_journey_reviews SET status='resolved' WHERE id=$1",[row.review_id]);
    if(row.contribution_owed) await db.query(`INSERT INTO pilot_contribution_obligations
      (allocation_id,review_decision_id,amount_paise,currency,policy_version,confirmed_at,due_at)
      SELECT r.allocation_id,$2,a.contribution_paise,a.currency,a.policy_version,$3,$3::timestamptz+interval '24 hours'
      FROM pilot_journey_reviews r JOIN pilot_seat_allocations a ON a.id=r.allocation_id WHERE r.id=$1
      ON CONFLICT(allocation_id) DO NOTHING`,[row.review_id,row.id,row.decided_at]);
  }
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,created_at)
    SELECT $1,'pilot_journey_review_decision','pilot_journey_review',$2,
      jsonb_build_object('operationId',$3::text,'outcome',$4::text,'contributionOwed',$5::boolean,
        'reason',$6::text,'evidenceRefs',$7::text[]),$8
    WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE action='pilot_journey_review_decision'
      AND metadata->>'operationId'=$3)`,[row.operator_id,row.review_id,row.id,row.outcome,
      row.contribution_owed,row.reason,row.evidence_refs,row.decided_at]);
}
export const acknowledge=async(db:PoolClient,id:string)=>(await db.query<Decision>(
  "UPDATE pilot_journey_review_decisions SET state='acknowledged',acknowledged_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];
export async function ready(db:PoolClient,id:string){await db.query(
  "UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='journey_review_decision' AND operation_id=$1",[id]);}
export async function suppressRestoredEmail(db:PoolClient,id:string){await db.query(`UPDATE pilot_email_jobs
  SET status='exhausted',lease_until=NULL,last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
  WHERE event_id IN(SELECT id FROM pilot_notification_events WHERE origin_type='journey_review_decision'
    AND operation_id=$1) AND status<>'sent'`,[id]);}

export async function recoveryEvidence(db:Db,id:string){
  const audit=Boolean((await db.query(`SELECT 1 FROM audit_logs
    WHERE action='pilot_journey_review_decision' AND metadata->>'operationId'=$1`,[id])).rowCount);
  const recipients=(await db.query<{recipient_id:string}>(`SELECT recipient_id FROM pilot_notification_events
    WHERE origin_type='journey_review_decision' AND operation_id=$1 AND ready_at IS NOT NULL`,[id]))
    .rows.map(row=>row.recipient_id);
  return {audit,recipients};
}
