import type {PoolClient} from 'pg';

export type DueReview={allocation_id:string;driver_operation_id:string;offer_id:string};
export async function writesAllowed(db:PoolClient){
  return (await db.query<{mode:string}>(`SELECT mode FROM pilot_recovery_state
    WHERE singleton=true FOR SHARE`)).rows[0]?.mode==='open';
}
export async function due(db:PoolClient,now:Date){
  return (await db.query<DueReview>(`SELECT w.allocation_id,w.driver_operation_id,a.offer_id
    FROM pilot_journey_review_work w JOIN pilot_seat_allocations a ON a.id=w.allocation_id
    WHERE w.status='pending' AND w.due_at<=$1
    ORDER BY w.due_at,w.allocation_id LIMIT 100 FOR UPDATE OF w SKIP LOCKED`,[now])).rows;
}
export async function hasPassengerClaim(db:PoolClient,allocationId:string){
  return Boolean((await db.query(`SELECT 1 FROM pilot_journey_claims
    WHERE allocation_id=$1 AND actor_role='passenger'`,[allocationId])).rowCount);
}
export async function openReview(db:PoolClient,item:DueReview,now:Date){
  return (await db.query<{id:string}>(`INSERT INTO pilot_journey_reviews
    (allocation_id,reason,created_at,driver_claim_operation_id)
    VALUES($1,'silence',$2,$3) ON CONFLICT(allocation_id) DO NOTHING RETURNING id`,
    [item.allocation_id,now,item.driver_operation_id])).rows[0]?.id??null;
}
export async function recipients(db:PoolClient,allocationId:string){
  return (await db.query<{user_id:string}>(`SELECT a.user_id FROM operator_allowlist a
    JOIN users u ON u.id=a.user_id WHERE a.active=true AND u.status='active'
    UNION SELECT driver_id AS user_id FROM pilot_seat_allocations WHERE id=$1
    UNION SELECT passenger_id AS user_id FROM pilot_seat_allocations WHERE id=$1`,
    [allocationId])).rows.map(row=>row.user_id);
}
export async function notify(db:PoolClient,caseId:string,offerId:string,recipientId:string){
  const event=(await db.query<{id:string}>(`INSERT INTO pilot_notification_events
    (origin_type,operation_id,recipient_id,event_type,related_entity_type,related_entity_id,
     title,body,ready_at)
    VALUES('pilot_journey_silence',$1,$2,'journey_silence','ride_offer',$3,
     'Passenger journey needs review','The passenger has not confirmed within 24 hours. No contribution is due.',now())
    ON CONFLICT(origin_type,operation_id,recipient_id,event_type)
    DO UPDATE SET operation_id=EXCLUDED.operation_id RETURNING id`,
    [caseId,recipientId,offerId])).rows[0];
  await db.query(`INSERT INTO pilot_email_jobs(event_id,recipient_id) VALUES($1,$2)
    ON CONFLICT(event_id) DO NOTHING`,[event.id,recipientId]);
}
export async function finish(db:PoolClient,allocationId:string,now:Date){
  await db.query(`UPDATE pilot_journey_review_work SET status='done',attempts=attempts+1,
    lease_until=NULL,updated_at=$2 WHERE allocation_id=$1`,[allocationId,now]);
}
