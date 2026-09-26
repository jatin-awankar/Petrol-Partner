import type {PoolClient} from "pg";

export type DueRide={id:string;driver_id:string};
export async function dueRides(db:PoolClient,now:Date) {
  return (await db.query<DueRide>(`
    SELECT id,driver_id FROM ride_offers
    WHERE pilot_policy_id IS NOT NULL AND status='active'
      AND (date+time) AT TIME ZONE 'Asia/Kolkata' < $1::timestamptz-interval '30 minutes'
      AND NOT EXISTS(SELECT 1 FROM pilot_delayed_ride_notices n WHERE n.offer_id=ride_offers.id)
    ORDER BY date,time,id LIMIT 500 FOR UPDATE SKIP LOCKED`,[now])).rows;
}
export async function recordNotice(db:PoolClient,offerId:string) {
  return Boolean((await db.query(`INSERT INTO pilot_delayed_ride_notices(offer_id)
    VALUES($1) ON CONFLICT DO NOTHING RETURNING offer_id`,[offerId])).rowCount);
}
export async function recipients(db:PoolClient,ride:DueRide) {
  return (await db.query<{id:string}>(`SELECT DISTINCT id FROM users WHERE id=$1
    UNION SELECT DISTINCT passenger_id AS id FROM pilot_seat_allocations
      WHERE offer_id=$2 AND status IN ('confirmed','held')`,[ride.driver_id,ride.id])).rows.map(row=>row.id);
}
export async function notify(db:PoolClient,offerId:string,recipientId:string) {
  const event=(await db.query<{id:string}>(`INSERT INTO pilot_notification_events
    (origin_type,operation_id,recipient_id,event_type,related_entity_type,related_entity_id,
     title,body,ready_at)
    VALUES('pilot_ride_delayed',$1,$2,'ride_delayed','ride_offer',$1,
      'Ride delayed','The scheduled departure window has passed. The ride remains unstarted and needs explicit resolution.',now())
    ON CONFLICT(origin_type,operation_id,recipient_id,event_type)
    DO UPDATE SET operation_id=EXCLUDED.operation_id RETURNING id`,[offerId,recipientId])).rows[0];
  await db.query(`INSERT INTO pilot_email_jobs(event_id,recipient_id) VALUES($1,$2)
    ON CONFLICT(event_id) DO NOTHING`,[event.id,recipientId]);
}
