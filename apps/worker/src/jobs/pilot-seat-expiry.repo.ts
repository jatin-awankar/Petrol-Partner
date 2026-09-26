import type { PoolClient } from "pg";

export type DueSeatRequest = {id:string;passenger_id:string;driver_id:string};

export async function dueRequests(db:PoolClient) {
  return (await db.query<DueSeatRequest>(`SELECT id,passenger_id,driver_id FROM pilot_seat_requests
    WHERE status='pending' AND decision_deadline_at <= now()
      AND NOT EXISTS (SELECT 1 FROM pilot_notification_events e
        WHERE e.origin_type='seat_request_expiry' AND e.operation_id=pilot_seat_requests.id)
    ORDER BY decision_deadline_at LIMIT 500 FOR UPDATE SKIP LOCKED`)).rows;
}
export async function recordExpiry(db:PoolClient,requestId:string) {
  await db.query(`INSERT INTO pilot_seat_request_audit(request_id,action)
    VALUES($1,'expired') ON CONFLICT DO NOTHING`,[requestId]);
}
export async function notifyExpiry(db:PoolClient,requestId:string,recipientId:string) {
  const event = await db.query<{id:string}>(`INSERT INTO pilot_notification_events
    (id,origin_type,operation_id,recipient_id,event_type,related_entity_type,related_entity_id,title,body,ready_at)
    VALUES(md5($1::text || ':' || $2::text)::uuid,'seat_request_expiry',$1::uuid,$2::uuid,'expired','seat_request',$1::uuid,
      'Seat request expired','The unanswered seat request expired at the driver decision cutoff.',now())
    ON CONFLICT (origin_type,operation_id,recipient_id,event_type)
    DO UPDATE SET operation_id=EXCLUDED.operation_id RETURNING id`,[requestId,recipientId]);
  await db.query(`INSERT INTO pilot_email_jobs(event_id,recipient_id)
    VALUES($1,$2) ON CONFLICT (event_id) DO NOTHING`,[event.rows[0].id,recipientId]);
}
