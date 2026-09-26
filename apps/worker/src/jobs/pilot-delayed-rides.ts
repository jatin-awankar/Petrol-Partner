import type {Pool} from "pg";

// This sweep records only the delayed fact and notification work. It never
// changes an offer, booking, journey, or contribution.
export async function notifyDelayedPilotRides(database:Pool,now=new Date()) {
  const client=await database.connect();
  try {
    await client.query("BEGIN");
    const due=(await client.query<{id:string;driver_id:string}>(`
      SELECT id,driver_id FROM ride_offers
      WHERE pilot_policy_id IS NOT NULL AND status='active'
        AND (date+time) AT TIME ZONE 'Asia/Kolkata' < $1::timestamptz-interval '30 minutes'
        AND NOT EXISTS(SELECT 1 FROM pilot_delayed_ride_notices n WHERE n.offer_id=ride_offers.id)
      ORDER BY date,time,id LIMIT 500 FOR UPDATE SKIP LOCKED`,[now])).rows;
    for(const ride of due) {
      const inserted=await client.query(`INSERT INTO pilot_delayed_ride_notices(offer_id)
        VALUES($1) ON CONFLICT DO NOTHING RETURNING offer_id`,[ride.id]);
      if(!inserted.rowCount) continue;
      const recipients=(await client.query<{id:string}>(`SELECT DISTINCT id FROM users WHERE id=$1
        UNION SELECT DISTINCT passenger_id AS id FROM pilot_seat_allocations
          WHERE offer_id=$2 AND status IN ('confirmed','held')`,[ride.driver_id,ride.id])).rows;
      for(const recipient of recipients) {
        const event=(await client.query<{id:string}>(`INSERT INTO pilot_notification_events
          (origin_type,operation_id,recipient_id,event_type,related_entity_type,related_entity_id,
           title,body,ready_at)
          VALUES('pilot_ride_delayed',$1,$2,'ride_delayed','ride_offer',$1,
            'Ride delayed','The scheduled departure window has passed. The ride remains unstarted and needs explicit resolution.',now())
          ON CONFLICT(origin_type,operation_id,recipient_id,event_type)
          DO UPDATE SET operation_id=EXCLUDED.operation_id RETURNING id`,[ride.id,recipient.id])).rows[0];
        await client.query(`INSERT INTO pilot_email_jobs(event_id,recipient_id) VALUES($1,$2)
          ON CONFLICT(event_id) DO NOTHING`,[event.id,recipient.id]);
      }
    }
    await client.query("COMMIT");
    return {delayed:due.length};
  } catch(error) {await client.query("ROLLBACK");throw error;}
  finally {client.release();}
}
