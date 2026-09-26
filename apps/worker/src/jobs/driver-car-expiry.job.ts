import { pool } from "../db/pool";

// Eligibility is checked synchronously by the API. This job provides durable
// applicant notice when a document or approval reaches its review date.
export async function recordDueDriverCarExpiryNotice() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const due = (await client.query<{ id: string; subject_type: string; subject_id: string;
      recipient_id: string; expiry_date: string }>(`
      WITH candidates AS (
        SELECT 'driver'::text AS subject_type, d.user_id AS subject_id,
          d.user_id AS recipient_id,
          LEAST(d.license_expires_at, d.review_after) AS expiry_date
        FROM driver_eligibility d WHERE d.status = 'approved'
        UNION ALL
        SELECT 'vehicle', v.id, v.owner_user_id,
          LEAST(v.insurance_expires_at, v.registration_expires_at, v.review_after)
        FROM vehicles v WHERE v.verification_status = 'approved' AND v.status = 'active'
        UNION ALL
        SELECT 'association', a.id, a.driver_user_id, a.review_after
        FROM driver_vehicle_approvals a WHERE a.status = 'approved'
      ), next_due AS (
        SELECT c.* FROM candidates c
        WHERE c.expiry_date <= CURRENT_DATE
          AND NOT EXISTS (SELECT 1 FROM driver_car_expiry_notices n
            WHERE n.subject_type = c.subject_type AND n.subject_id = c.subject_id
              AND n.expiry_date = c.expiry_date)
        ORDER BY c.expiry_date, c.subject_type LIMIT 1
      )
      INSERT INTO driver_car_expiry_notices (subject_type, subject_id, recipient_id, expiry_date)
      SELECT subject_type, subject_id, recipient_id, expiry_date FROM next_due
      ON CONFLICT (subject_type, subject_id, expiry_date) DO NOTHING
      RETURNING id, subject_type, subject_id, recipient_id,
        to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date`)).rows[0];
    if (!due) { await client.query("COMMIT"); return false; }
    await client.query(`INSERT INTO pilot_notification_events
      (id, origin_type, operation_id, recipient_id, event_type, related_entity_type,
       related_entity_id, title, body, ready_at)
      VALUES ($1, 'driver_car_expiry', $1, $2, 'driver_car_eligibility_expired', $3,
        $4, 'Driving eligibility expired',
        'A driving approval or document has reached its review date. Check your account.', now())
      ON CONFLICT (origin_type, operation_id, recipient_id, event_type) DO NOTHING`,
      [due.id, due.recipient_id, due.subject_type, due.subject_id]);
    await client.query(`INSERT INTO pilot_email_jobs (event_id, recipient_id)
      VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`, [due.id, due.recipient_id]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
