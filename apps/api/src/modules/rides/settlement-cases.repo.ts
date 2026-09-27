import type {Pool,PoolClient} from 'pg';
type Db=Pool|PoolClient;
export type Command={kind:'report'|'decision';contribution_owed:boolean|null;
  receipt_established:boolean|null;case_resolution:'resolved'|'unresolved'|null;
  reason:string;evidence_refs:string[];participant_confirmation_id:string|null};
export type Operation=Command&{id:string;obligation_id:string;actor_id:string;idempotency_key:string;
  payload_digest:string;recorded_at:Date;state:'committed'|'acknowledged'|'recovered'};
export const byKey=async(db:Db,actor:string,key:string)=>(await db.query<Operation>(
  'SELECT * FROM pilot_settlement_case_operations WHERE actor_id=$1 AND idempotency_key=$2',[actor,key])).rows[0]??null;
export const byId=async(db:Db,id:string,lock=false)=>(await db.query<Operation>(
  `SELECT * FROM pilot_settlement_case_operations WHERE id=$1 ${lock?'FOR UPDATE':''}`,[id])).rows[0]??null;
export const all=async(db:Db)=>(await db.query<Operation>(
  'SELECT * FROM pilot_settlement_case_operations ORDER BY recorded_at,id')).rows;
export const history=async(db:Db,id:string)=>(await db.query<Operation>(
  'SELECT * FROM pilot_settlement_case_operations WHERE obligation_id=$1 ORDER BY recorded_at,id',[id])).rows;
export const source=async(db:Db,id:string,lock=false)=>(await db.query<{
  id:string;driver_id:string;passenger_id:string;amount_paise:number;currency:string;due_at:Date;
  claim_id:string|null;claim_method:string|null;claimed_at:Date|null;
  response_id:string|null;response_kind:string|null;responded_at:Date|null;
  review_id:string|null;review_status:string|null;final_decision_id:string|null;
  participant_report_id:string|null;
  review_reason:string|null}>(`SELECT o.id,o.amount_paise,o.currency,o.due_at,a.driver_id,a.passenger_id,
  c.id AS claim_id,c.method AS claim_method,c.recorded_at AS claimed_at,
  r.id AS response_id,r.kind AS response_kind,r.recorded_at AS responded_at,
  v.id AS review_id,v.status AS review_status,v.final_decision_id,v.reason AS review_reason,
  v.participant_report_id
  FROM pilot_contribution_obligations o JOIN pilot_seat_allocations a ON a.id=o.allocation_id
  LEFT JOIN pilot_settlement_operations c ON c.obligation_id=o.id AND c.kind='claim'
  LEFT JOIN pilot_settlement_operations r ON r.obligation_id=o.id AND r.kind IN ('confirm','dispute')
  LEFT JOIN pilot_settlement_reviews v ON v.obligation_id=o.id
  WHERE o.id=$1 ${lock?'FOR UPDATE OF o':''}`,[id])).rows[0]??null;
export const queue=async(db:Db,now:Date)=>(await db.query(`SELECT o.id AS obligation_id,
  v.id AS review_id,v.status,v.reason,v.opened_at,c.recorded_at AS claimed_at,
  c.method AS claim_method,r.kind AS response_kind,o.amount_paise,o.currency,
  a.driver_id,a.passenger_id FROM pilot_contribution_obligations o
  JOIN pilot_seat_allocations a ON a.id=o.allocation_id
  JOIN pilot_settlement_operations c ON c.obligation_id=o.id AND c.kind='claim'
  LEFT JOIN pilot_settlement_operations r ON r.obligation_id=o.id AND r.kind IN ('confirm','dispute')
  LEFT JOIN pilot_settlement_reviews v ON v.obligation_id=o.id
  WHERE (v.status='open' OR (v.id IS NULL AND r.id IS NULL AND c.recorded_at+interval '24 hours'<=$1))
  ORDER BY c.recorded_at,o.id LIMIT 100`,[now])).rows;
export async function insert(db:PoolClient,input:{id?:string;obligationId:string;actorId:string;key:string;
  digest:string;command:Command;at:Date;state?:Operation['state']}){
  const c=input.command;
  return (await db.query<Operation>(`INSERT INTO pilot_settlement_case_operations
    (id,obligation_id,actor_id,idempotency_key,payload_digest,kind,contribution_owed,
     receipt_established,case_resolution,reason,evidence_refs,participant_confirmation_id,recorded_at,state)
    VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [input.id??null,input.obligationId,input.actorId,input.key,input.digest,c.kind,c.contribution_owed,
      c.receipt_established,c.case_resolution,c.reason,c.evidence_refs,c.participant_confirmation_id,
      input.at,input.state??'committed'])).rows[0];
}
export async function apply(db:PoolClient,row:Operation){
  if(row.kind==='report') await db.query(`INSERT INTO pilot_settlement_reviews
    (obligation_id,reason,opened_at,participant_report_id) VALUES($1,'disputed',$2,$3)
    ON CONFLICT(obligation_id) DO UPDATE SET participant_report_id=COALESCE(
      pilot_settlement_reviews.participant_report_id,EXCLUDED.participant_report_id)`,
    [row.obligation_id,row.recorded_at,row.id]);
  else if(row.case_resolution==='resolved') {const updated=await db.query(`UPDATE pilot_settlement_reviews
    SET status='resolved',final_decision_id=$2 WHERE obligation_id=$1 AND status='open'`,
    [row.obligation_id,row.id]);
    if(!updated.rowCount){const current=await db.query(`SELECT 1 FROM pilot_settlement_reviews
      WHERE obligation_id=$1 AND final_decision_id=$2`,[row.obligation_id,row.id]);
      if(!current.rowCount) throw new Error('Settlement case resolution conflicts with existing state');}
  }
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,created_at)
    SELECT $1,$2,'pilot_contribution_obligation',$3,
      jsonb_build_object('operationId',$4::text,'caseResolution',$5::text,
        'contributionOwed',$6::boolean,'receiptEstablished',$7::boolean),$8
    WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE action=$2 AND metadata->>'operationId'=$4)`,
    [row.actor_id,`pilot_settlement_case_${row.kind}`,row.obligation_id,row.id,row.case_resolution,
      row.contribution_owed,row.receipt_established,row.recorded_at]);
}
export const acknowledge=async(db:PoolClient,id:string)=>(await db.query<Operation>(`
  UPDATE pilot_settlement_case_operations SET state='acknowledged',acknowledged_at=now()
  WHERE id=$1 AND state='committed' RETURNING *`,[id])).rows[0]??null;
export async function markRecovered(db:PoolClient,id:string){await db.query(`UPDATE pilot_settlement_case_operations
  SET state='recovered' WHERE id=$1 AND state='committed'`,[id]);}
export async function ready(db:PoolClient,id:string){await db.query(`UPDATE pilot_notification_events
  SET ready_at=now() WHERE origin_type='pilot_settlement_case' AND operation_id=$1`,[id]);}
export async function evidence(db:Db,row:Operation){
  const audit=await db.query(`SELECT 1 FROM audit_logs WHERE action=$1 AND metadata->>'operationId'=$2`,
    [`pilot_settlement_case_${row.kind}`,row.id]);
  const recipients=(await db.query<{recipient_id:string}>(`SELECT recipient_id FROM pilot_notification_events
    WHERE origin_type='pilot_settlement_case' AND operation_id=$1 AND ready_at IS NOT NULL`,
    [row.id])).rows.map(r=>r.recipient_id);
  return {audited:!!audit.rowCount,recipients};
}
export async function suppressRestoredEmail(db:PoolClient,id:string){await db.query(`UPDATE pilot_email_jobs
  SET status='exhausted',lease_until=NULL,last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
  WHERE event_id IN(SELECT id FROM pilot_notification_events WHERE origin_type='pilot_settlement_case'
  AND operation_id=$1) AND status<>'sent'`,[id]);}
