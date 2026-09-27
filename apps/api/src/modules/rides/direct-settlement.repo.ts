import type {Pool,PoolClient} from 'pg';
type Db=Pool|PoolClient;
export type Operation={id:string;obligation_id:string;actor_id:string;idempotency_key:string;
  payload_digest:string;kind:'claim'|'confirm'|'dispute';method:'cash'|'upi'|null;
  recorded_at:Date;state:'committed'|'acknowledged'|'recovered'};
export type Obligation={id:string;allocation_id:string;amount_paise:number;currency:string;
  policy_version:number;confirmed_at:Date;due_at:Date;driver_id:string;passenger_id:string;
  claim_id:string|null;claim_method:string|null;claimed_at:Date|null;response_id:string|null;
  response_kind:string|null;responded_at:Date|null;review_id:string|null;review_reason:string|null};
export const byKey=async(db:Db,actor:string,key:string)=>(await db.query<Operation>(
  'SELECT * FROM pilot_settlement_operations WHERE actor_id=$1 AND idempotency_key=$2',[actor,key])).rows[0]??null;
export const byId=async(db:Db,id:string,lock=false)=>(await db.query<Operation>(
  `SELECT * FROM pilot_settlement_operations WHERE id=$1 ${lock?'FOR UPDATE':''}`,[id])).rows[0]??null;
export const all=async(db:Db)=>(await db.query<Operation>(
  'SELECT * FROM pilot_settlement_operations ORDER BY recorded_at,id')).rows;
const detailSql=`SELECT o.*,a.driver_id,a.passenger_id,c.id AS claim_id,c.method AS claim_method,
 c.recorded_at AS claimed_at,r.id AS response_id,r.kind AS response_kind,r.recorded_at AS responded_at,
 v.id AS review_id,v.reason AS review_reason
 FROM pilot_contribution_obligations o JOIN pilot_seat_allocations a ON a.id=o.allocation_id
 LEFT JOIN pilot_settlement_operations c ON c.obligation_id=o.id AND c.kind='claim'
 LEFT JOIN pilot_settlement_operations r ON r.obligation_id=o.id AND r.kind IN ('confirm','dispute')
 LEFT JOIN pilot_settlement_reviews v ON v.obligation_id=o.id`;
export const detail=async(db:Db,id:string,lock=false)=>(await db.query<Obligation>(
  `${detailSql} WHERE o.id=$1 ${lock?'FOR UPDATE OF o':''}`,[id])).rows[0]??null;
export const list=async(db:Db,actor:string)=>(await db.query<Obligation>(
  `${detailSql} WHERE a.driver_id=$1 OR a.passenger_id=$1 ORDER BY o.confirmed_at DESC`,[actor])).rows;
export const openReviews=async(db:Db)=>(await db.query(`SELECT v.id,v.obligation_id,
  v.reason,v.opened_at,v.status,o.amount_paise,o.currency,a.driver_id,a.passenger_id
  FROM pilot_settlement_reviews v JOIN pilot_contribution_obligations o ON o.id=v.obligation_id
  JOIN pilot_seat_allocations a ON a.id=o.allocation_id
  WHERE v.status='open' ORDER BY v.opened_at,v.id LIMIT 100`)).rows;
export const overdue=async(db:Db)=>(await db.query(`SELECT o.id AS obligation_id,
  o.amount_paise,o.currency,o.due_at,a.driver_id,a.passenger_id
  FROM pilot_contribution_obligations o JOIN pilot_seat_allocations a ON a.id=o.allocation_id
  WHERE o.due_at<=now() AND NOT EXISTS(SELECT 1 FROM pilot_settlement_operations c
    WHERE c.obligation_id=o.id AND c.kind='claim') ORDER BY o.due_at,o.id LIMIT 100`)).rows;
export async function insert(db:PoolClient,input:{id?:string;obligationId:string;actorId:string;key:string;
  digest:string;kind:Operation['kind'];method:'cash'|'upi'|null;at:Date;state?:Operation['state']}){
  const row=(await db.query<Operation>(`INSERT INTO pilot_settlement_operations
    (id,obligation_id,actor_id,idempotency_key,payload_digest,kind,method,recorded_at,state)
    VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [input.id??null,input.obligationId,input.actorId,input.key,input.digest,input.kind,
      input.method,input.at,input.state??'committed'])).rows[0];
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,created_at)
    VALUES($1,$2,'pilot_contribution_obligation',$3,
      jsonb_build_object('operationId',$4::text,'method',$5::text),$6)`,
    [row.actor_id,`pilot_settlement_${row.kind}`,row.obligation_id,row.id,row.method,row.recorded_at]);
  if(row.kind==='dispute') await db.query(`INSERT INTO pilot_settlement_reviews(obligation_id,reason,opened_at)
    VALUES($1,'disputed',$2) ON CONFLICT(obligation_id) DO NOTHING`,[row.obligation_id,row.recorded_at]);
  return row;
}
export async function restoreEffects(db:PoolClient,row:Operation){
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,created_at)
    SELECT $1,$2,'pilot_contribution_obligation',$3,
      jsonb_build_object('operationId',$4::text,'method',$5::text),$6
    WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE action=$2 AND metadata->>'operationId'=$4)`,
    [row.actor_id,`pilot_settlement_${row.kind}`,row.obligation_id,row.id,row.method,row.recorded_at]);
  if(row.kind==='dispute') await db.query(`INSERT INTO pilot_settlement_reviews(obligation_id,reason,opened_at)
    VALUES($1,'disputed',$2) ON CONFLICT(obligation_id) DO NOTHING`,[row.obligation_id,row.recorded_at]);
  await db.query(`UPDATE pilot_settlement_operations SET state='recovered'
    WHERE id=$1 AND state='committed'`,[row.id]);
}
export const acknowledge=async(db:PoolClient,id:string)=>(await db.query<Operation>(
  `UPDATE pilot_settlement_operations SET state='acknowledged',acknowledged_at=now()
   WHERE id=$1 AND state='committed' RETURNING *`,[id])).rows[0]??null;
export async function ready(db:PoolClient,id:string){await db.query(
  `UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='pilot_direct_settlement' AND operation_id=$1`,[id]);}
export async function suppressRestoredEmail(db:PoolClient,id:string){await db.query(`UPDATE pilot_email_jobs
 SET status='exhausted',lease_until=NULL,last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
 WHERE event_id IN(SELECT id FROM pilot_notification_events WHERE origin_type='pilot_direct_settlement'
 AND operation_id=$1) AND status<>'sent'`,[id]);}
