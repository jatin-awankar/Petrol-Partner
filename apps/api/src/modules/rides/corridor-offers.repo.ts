import type { Pool, PoolClient } from "pg";

export type Policy = { id: string; version: number; currency: string; expected_minutes: number;
  buffer_minutes: number; schedule_start: string; schedule_end: string; weekdays: number[];
  cancellation_notice: string; contact_notice: string; approved_for_real_trips: boolean };
export type Stop = { code: string; label: string; sequence: number; latitude: number; longitude: number };
export type Pair = { amount_paise: number; origin_code: string; destination_code: string };
export type Operation = { id: string; actor_id: string; idempotency_key: string; payload_digest: string;
  offer_id: string; action: string; result: Record<string, unknown>; offer_snapshot: Record<string, unknown>; state: "committed" | "acknowledged" | "recovered";
  created_at: Date };

export async function currentPolicy(db: Pool | PoolClient) {
  return (await db.query<Policy>("SELECT * FROM pilot_corridor_policies WHERE active = true")).rows[0] ?? null;
}
export async function stops(db: Pool | PoolClient, policyId: string) {
  return (await db.query<Stop>("SELECT code,label,sequence,latitude,longitude FROM pilot_corridor_stops WHERE policy_id=$1 ORDER BY sequence", [policyId])).rows;
}
export async function pair(db: Pool | PoolClient, policyId: string, origin: string, destination: string) {
  return (await db.query<Pair>(`SELECT c.amount_paise,c.origin_code,c.destination_code FROM pilot_corridor_contributions c
    JOIN pilot_corridor_stops a ON a.policy_id=c.policy_id AND a.code=c.origin_code
    JOIN pilot_corridor_stops b ON b.policy_id=c.policy_id AND b.code=c.destination_code
    WHERE c.policy_id=$1 AND c.origin_code=$2 AND c.destination_code=$3 AND a.sequence<>b.sequence`,
    [policyId,origin,destination])).rows[0] ?? null;
}
export async function byKey(db: Pool | PoolClient, actorId: string, key: string) {
  return (await db.query<Operation>("SELECT * FROM pilot_offer_operations WHERE actor_id=$1 AND idempotency_key=$2", [actorId,key])).rows[0] ?? null;
}
export async function byId(db: PoolClient, id: string) {
  return (await db.query<Operation>("SELECT * FROM pilot_offer_operations WHERE id=$1 FOR UPDATE", [id])).rows[0] ?? null;
}
export async function pending(db: Pool | PoolClient) {
  return (await db.query<Operation>("SELECT * FROM pilot_offer_operations WHERE state='committed'")).rows;
}
export async function acknowledged(db: Pool | PoolClient) {
  return (await db.query<Operation>("SELECT * FROM pilot_offer_operations WHERE state IN ('acknowledged','recovered')")).rows;
}
export async function allOperations(db: Pool | PoolClient) {
  return (await db.query<Operation>("SELECT * FROM pilot_offer_operations")).rows;
}
export async function vehicleCapacity(db: PoolClient, id: string) {
  return (await db.query<{ seat_capacity: number }>("SELECT seat_capacity FROM vehicles WHERE id=$1",[id])).rows[0]?.seat_capacity ?? null;
}
export async function offerForUpdate(db: PoolClient, id: string) {
  return (await db.query<{ id: string; driver_id: string; status: string; pilot_version: number }>(
    "SELECT id,driver_id,status,pilot_version FROM ride_offers WHERE id=$1 FOR UPDATE",[id])).rows[0] ?? null;
}
export async function requestCount(db: PoolClient, id: string) {
  return (await db.query<{ count: number }>("SELECT count(*)::int AS count FROM bookings WHERE ride_offer_id=$1",[id])).rows[0].count;
}
export async function discover(db: Pool, origin: string, destination: string, date?: string) {
  return (await db.query(`SELECT r.id,r.pilot_origin_code AS origin_code,r.pilot_destination_code AS destination_code,
    (r.date+r.time) AT TIME ZONE 'Asia/Kolkata' AS departure_at,
    r.pilot_request_cutoff_at AS request_cutoff_at,r.pilot_acceptance_cutoff_at AS acceptance_cutoff_at,
    r.pilot_capacity AS capacity,r.pilot_currency AS currency,r.price_per_seat_paise AS contribution_paise,
    r.pilot_policy_snapshot->>'cancellation_notice' AS cancellation_notice,
    r.pilot_policy_snapshot->>'contact_notice' AS contact_notice,
    r.pilot_policy_snapshot->>'version' AS policy_version,
    r.pilot_version AS version,
    r.pilot_capacity - (SELECT count(*)::int FROM bookings b WHERE b.ride_offer_id=r.id AND b.status='confirmed') AS available_seats
    FROM ride_offers r JOIN pilot_corridor_policies p ON p.id=r.pilot_policy_id
    WHERE r.status='active' AND r.pilot_origin_code=$1 AND r.pilot_destination_code=$2
      AND ($3::date IS NULL OR r.date=$3::date) AND r.pilot_request_cutoff_at > now()
      AND r.pilot_capacity > (SELECT count(*)::int FROM bookings b
        WHERE b.ride_offer_id=r.id AND b.status='confirmed')
      AND EXISTS (SELECT 1 FROM student_verifications s
        JOIN driver_eligibility d ON d.user_id=s.user_id
        JOIN driver_vehicle_approvals a ON a.driver_user_id=s.user_id AND a.vehicle_id=r.vehicle_id
        JOIN vehicles v ON v.id=a.vehicle_id
        WHERE s.user_id=r.driver_id AND s.status IN ('verified','revalidation_due')
          AND s.adult_eligible=true AND s.eligibility_ends_at>now()
          AND d.status='approved' AND d.license_expires_at>CURRENT_DATE
          AND d.review_after>CURRENT_DATE AND a.status='approved' AND a.review_after>CURRENT_DATE
          AND v.status='active' AND v.verification_status='approved'
          AND v.vehicle_type IN ('car','suv') AND v.use_category='private'
          AND v.applicable_document_required IS NOT NULL
          AND v.insurance_expires_at>CURRENT_DATE
          AND (v.registration_expires_at IS NULL OR v.registration_expires_at>CURRENT_DATE)
          AND v.review_after>CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM pilot_corridor_contributions c WHERE c.policy_id=p.id
       AND c.origin_code=$1 AND c.destination_code=$2)
    ORDER BY r.date,r.time LIMIT 50`,[origin,destination,date ?? null])).rows;
}
