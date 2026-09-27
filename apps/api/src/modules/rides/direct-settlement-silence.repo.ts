import type {Pool,PoolClient} from 'pg';
type Db=Pool|PoolClient;
export type Operation={id:string;obligation_id:string;recorded_at:Date;
  state:'committed'|'acknowledged'|'recovered'};
export const all=async(db:Db)=>(await db.query<Operation>(
  'SELECT * FROM pilot_settlement_silence_operations ORDER BY recorded_at,id')).rows;
export const byId=async(db:Db,id:string,lock=false)=>(await db.query<Operation>(
  `SELECT * FROM pilot_settlement_silence_operations WHERE id=$1 ${lock?'FOR UPDATE':''}`,[id])).rows[0]??null;
export const due=async(db:Db,now:Date)=>(await db.query<{id:string}>(`
  SELECT o.id FROM pilot_contribution_obligations o
  JOIN pilot_settlement_operations c ON c.obligation_id=o.id AND c.kind='claim'
  WHERE c.recorded_at+interval '24 hours'<=$1
  AND NOT EXISTS(SELECT 1 FROM pilot_settlement_operations r WHERE r.obligation_id=o.id
    AND r.kind IN ('confirm','dispute'))
  AND NOT EXISTS(SELECT 1 FROM pilot_settlement_reviews v WHERE v.obligation_id=o.id)
  ORDER BY c.recorded_at,o.id LIMIT 100`,[now])).rows;
export async function eligibleForUpdate(db:PoolClient,id:string,now:Date){
  return Boolean((await db.query(`SELECT 1 FROM pilot_contribution_obligations o
    JOIN pilot_settlement_operations c ON c.obligation_id=o.id AND c.kind='claim'
    WHERE o.id=$1 AND c.recorded_at+interval '24 hours'<=$2
    AND NOT EXISTS(SELECT 1 FROM pilot_settlement_operations r WHERE r.obligation_id=o.id
      AND r.kind IN ('confirm','dispute'))
    AND NOT EXISTS(SELECT 1 FROM pilot_settlement_reviews v WHERE v.obligation_id=o.id)
    FOR UPDATE OF o`,[id,now])).rowCount);
}
export async function insert(db:PoolClient,obligationId:string,at:Date,id?:string,state:Operation['state']='committed'){
  const row=(await db.query<Operation>(`INSERT INTO pilot_settlement_silence_operations
    (id,obligation_id,recorded_at,state) VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4)
    ON CONFLICT(obligation_id) DO NOTHING RETURNING *`,[id??null,obligationId,at,state])).rows[0];
  return row??(await db.query<Operation>(`SELECT * FROM pilot_settlement_silence_operations
    WHERE obligation_id=$1`,[obligationId])).rows[0];
}
export async function effects(db:PoolClient,row:Operation){
  const item=(await db.query<{driver_id:string;passenger_id:string;claim_id:string|null;
    response_id:string|null;claimed_at:Date|null}>(`SELECT a.driver_id,a.passenger_id,
    c.id AS claim_id,c.recorded_at AS claimed_at,r.id AS response_id
    FROM pilot_contribution_obligations o JOIN pilot_seat_allocations a ON a.id=o.allocation_id
    LEFT JOIN pilot_settlement_operations c ON c.obligation_id=o.id AND c.kind='claim'
    LEFT JOIN pilot_settlement_operations r ON r.obligation_id=o.id AND r.kind IN ('confirm','dispute')
    WHERE o.id=$1 FOR UPDATE OF o`,[row.obligation_id])).rows[0];
  if(!item||!item.claim_id||item.response_id||!item.claimed_at||
    row.recorded_at.getTime()<item.claimed_at.getTime()+86_400_000) return null;
  const review=(await db.query<{id:string}>(`INSERT INTO pilot_settlement_reviews
    (obligation_id,reason,opened_at,silence_operation_id) VALUES($1,'driver_silence',$2,$3)
    ON CONFLICT(obligation_id) DO NOTHING RETURNING id`,[row.obligation_id,row.recorded_at,row.id])).rows[0];
  const id=review?.id??(await db.query<{id:string}>(`SELECT id FROM pilot_settlement_reviews
    WHERE obligation_id=$1 AND silence_operation_id=$2`,[row.obligation_id,row.id])).rows[0]?.id;
  if(!id) return null;
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,created_at)
    SELECT NULL,'pilot_settlement_driver_silence','pilot_contribution_obligation',$1,
      jsonb_build_object('operationId',$2::text,'reviewId',$3::text),$4
    WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE action='pilot_settlement_driver_silence'
      AND metadata->>'operationId'=$2)`,[row.obligation_id,row.id,id,row.recorded_at]);
  return {...item,reviewId:id};
}
export const acknowledge=async(db:PoolClient,id:string)=>(await db.query<Operation>(`
  UPDATE pilot_settlement_silence_operations SET state='acknowledged',acknowledged_at=now()
  WHERE id=$1 AND state='committed' RETURNING *`,[id])).rows[0]??null;
export async function ready(db:PoolClient,id:string){await db.query(`UPDATE pilot_notification_events
  SET ready_at=now() WHERE origin_type='pilot_settlement_silence' AND operation_id=$1`,[id]);}
export async function suppressRestoredEmail(db:PoolClient,id:string){await db.query(`UPDATE pilot_email_jobs
 SET status='exhausted',lease_until=NULL,last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
 WHERE event_id IN(SELECT id FROM pilot_notification_events WHERE origin_type='pilot_settlement_silence'
 AND operation_id=$1) AND status<>'sent'`,[id]);}
export async function recoveryEvidence(db:Db,row:Operation){
  const review=(await db.query<{id:string}>(`SELECT id FROM pilot_settlement_reviews
    WHERE silence_operation_id=$1 AND obligation_id=$2 AND reason='driver_silence'`,
    [row.id,row.obligation_id])).rows[0];
  const audit=await db.query(`SELECT 1 FROM audit_logs WHERE action='pilot_settlement_driver_silence'
    AND metadata->>'operationId'=$1`,[row.id]);
  const notified=(await db.query<{recipient_id:string}>(`SELECT recipient_id FROM pilot_notification_events
    WHERE origin_type='pilot_settlement_silence' AND operation_id=$1 AND ready_at IS NOT NULL`,
    [row.id])).rows.map(x=>x.recipient_id);
  return {review:review?.id??null,audited:Boolean(audit.rowCount),notified};
}
export const actors=async(db:Db,id:string)=>(await db.query<{driver_id:string;passenger_id:string}>(
  `SELECT a.driver_id,a.passenger_id FROM pilot_contribution_obligations o
   JOIN pilot_seat_allocations a ON a.id=o.allocation_id WHERE o.id=$1`,[id])).rows[0]??null;
export async function markRecovered(db:PoolClient,id:string){await db.query(`UPDATE pilot_settlement_silence_operations
  SET state='recovered' WHERE id=$1 AND state='committed'`,[id]);}
