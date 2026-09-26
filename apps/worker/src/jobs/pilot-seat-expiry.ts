import type { Pool } from "pg";

// Expiry is a time-based fact. The sweep records its audit and recipient work;
// it never reserves or releases offer capacity.
export async function expirePilotSeatRequests(database:Pool) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const due = await client.query<{id:string;passenger_id:string;driver_id:string}>(
      `SELECT id,passenger_id,driver_id FROM pilot_seat_requests
       WHERE status='pending' AND decision_deadline_at <= now()
         AND NOT EXISTS (SELECT 1 FROM pilot_notification_events e
           WHERE e.origin_type='seat_request_expiry' AND e.operation_id=pilot_seat_requests.id)
       ORDER BY decision_deadline_at LIMIT 500 FOR UPDATE SKIP LOCKED`,
    );
    for (const row of due.rows) {
      await client.query(`INSERT INTO pilot_seat_request_audit(request_id,action)
        VALUES($1,'expired') ON CONFLICT DO NOTHING`,[row.id]);
      for (const recipientId of [row.passenger_id,row.driver_id]) {
        const event = await client.query<{id:string}>(`INSERT INTO pilot_notification_events
          (origin_type,operation_id,recipient_id,event_type,related_entity_type,related_entity_id,title,body,ready_at)
          VALUES('seat_request_expiry',$1,$2,'expired','seat_request',$1,
            'Seat request expired','The unanswered seat request expired at the driver decision cutoff.',now())
          ON CONFLICT (origin_type,operation_id,recipient_id,event_type)
          DO UPDATE SET operation_id=EXCLUDED.operation_id RETURNING id`,[row.id,recipientId]);
        await client.query(`INSERT INTO pilot_email_jobs(event_id,recipient_id)
          VALUES($1,$2) ON CONFLICT (event_id) DO NOTHING`,[event.rows[0].id,recipientId]);
      }
    }
    await client.query("COMMIT");
    return {expired:due.rows.length};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {client.release();}
}
