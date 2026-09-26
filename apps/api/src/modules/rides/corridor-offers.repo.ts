import type { Pool, PoolClient } from "pg";
import { currentPilotEligibilityWhere } from "../verification/pilot-eligibility.sql";

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
export async function pairs(db: Pool | PoolClient, policyId: string) {
  return (await db.query<Pair>("SELECT origin_code,destination_code,amount_paise FROM pilot_corridor_contributions WHERE policy_id=$1",[policyId])).rows;
}
export async function byKey(db: Pool | PoolClient, actorId: string, key: string) {
  return (await db.query<Operation>("SELECT * FROM pilot_offer_operations WHERE actor_id=$1 AND idempotency_key=$2", [actorId,key])).rows[0] ?? null;
}
export async function operationForActor(db: Pool | PoolClient, id: string, actorId: string) {
  return (await db.query<Operation>("SELECT * FROM pilot_offer_operations WHERE id=$1 AND actor_id=$2",[id,actorId])).rows[0] ?? null;
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
export type OfferTerms = { actorId:string; vehicleId:string; origin:Stop; destination:Stop;
  departure:Date; contributionPaise:number; capacity:number; policyId:string;
  snapshot:Record<string,unknown>; requestCutoff:Date; acceptanceCutoff:Date;
  commitmentUntil:Date };
export async function saveOffer(db:PoolClient,terms:OfferTerms,offerId?:string) {
  const args=[terms.actorId,terms.vehicleId,terms.origin.label,terms.origin.latitude,terms.origin.longitude,
    terms.destination.label,terms.destination.latitude,terms.destination.longitude,terms.departure,
    terms.contributionPaise,terms.capacity,terms.policyId,JSON.stringify(terms.snapshot),
    terms.origin.code,terms.destination.code,terms.requestCutoff,terms.acceptanceCutoff,terms.commitmentUntil];
  const sql=offerId?`UPDATE ride_offers SET driver_id=$1,vehicle_id=$2,pickup_location=$3,pickup_lat=$4,pickup_lng=$5,
    drop_location=$6,drop_lat=$7,drop_lng=$8,date=($9::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,
    time=($9::timestamptz AT TIME ZONE 'Asia/Kolkata')::time,price_per_seat_paise=$10,available_seats=$11,
    pilot_policy_id=$12,pilot_policy_snapshot=$13::jsonb,pilot_origin_code=$14,pilot_destination_code=$15,
    pilot_request_cutoff_at=$16,pilot_acceptance_cutoff_at=$17,pilot_commitment_until=$18,
    pilot_capacity=$11,pilot_currency='INR',pilot_version=pilot_version+1,updated_at=now()
    WHERE id=$19 RETURNING id,pilot_version`:`INSERT INTO ride_offers(driver_id,vehicle_id,pickup_location,pickup_lat,pickup_lng,
    drop_location,drop_lat,drop_lng,date,time,price_per_seat_paise,available_seats,pilot_policy_id,
    pilot_policy_snapshot,pilot_origin_code,pilot_destination_code,pilot_request_cutoff_at,
    pilot_acceptance_cutoff_at,pilot_commitment_until,pilot_capacity,pilot_currency)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,($9::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,
    ($9::timestamptz AT TIME ZONE 'Asia/Kolkata')::time,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$11,'INR')
    RETURNING id,pilot_version`;
  return (await db.query<{id:string;pilot_version:number}>(sql,offerId?[...args,offerId]:args)).rows[0];
}
export async function offerSnapshot(db:PoolClient,id:string) {
  return (await db.query<{snapshot:Record<string,unknown>}>("SELECT to_jsonb(r) AS snapshot FROM ride_offers r WHERE id=$1",[id])).rows[0].snapshot;
}
export async function createOperation(db:PoolClient, input:{actorId:string;key:string;digest:string;offerId:string;
  action:string;result:Record<string,unknown>;snapshot:Record<string,unknown>}) {
  return (await db.query<Operation>(`INSERT INTO pilot_offer_operations
    (actor_id,idempotency_key,payload_digest,offer_id,action,result,offer_snapshot,state)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'committed') RETURNING *`,
    [input.actorId,input.key,input.digest,input.offerId,input.action,JSON.stringify(input.result),JSON.stringify(input.snapshot)])).rows[0];
}
export async function auditOperation(db:PoolClient,id:string,offerId:string,actorId:string,action:string) {
  await db.query(`INSERT INTO pilot_offer_audit(operation_id,offer_id,actor_id,action)
    VALUES($1,$2,$3,$4) ON CONFLICT (operation_id) DO NOTHING`,[id,offerId,actorId,action]);
}
export async function acknowledgeOperation(db:PoolClient,id:string) {
  return (await db.query<Operation>("UPDATE pilot_offer_operations SET state='acknowledged',acknowledged_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];
}
export async function readyNotification(db:PoolClient,id:string) {
  await db.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='corridor_offer' AND operation_id=$1",[id]);
}
export async function suppressRestoredEmail(db:PoolClient,id:string) {
  await db.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
    last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
    WHERE event_id IN (SELECT id FROM pilot_notification_events WHERE origin_type='corridor_offer' AND operation_id=$1)`,[id]);
}
export async function restoreOperation(db:PoolClient,item:{operationId:string;actorId:string;key:string;digest:string;
  offerId:string;action:string;result:Record<string,unknown>;offerSnapshot:Record<string,unknown>;createdAt:string}) {
  await db.query(`INSERT INTO pilot_offer_operations
    (id,actor_id,idempotency_key,payload_digest,offer_id,action,result,offer_snapshot,state,created_at,acknowledged_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'recovered',$9,now()) ON CONFLICT (id) DO NOTHING`,
    [item.operationId,item.actorId,item.key,item.digest,item.offerId,item.action,
      JSON.stringify(item.result),JSON.stringify(item.offerSnapshot),item.createdAt]);
}
export async function insertOfferSnapshot(db:PoolClient,snapshot:Record<string,unknown>) {
  await db.query("INSERT INTO ride_offers SELECT (jsonb_populate_record(NULL::ride_offers,$1::jsonb)).*",[JSON.stringify(snapshot)]);
}
export async function updateOfferSnapshot(db:PoolClient,id:string,snapshot:Record<string,unknown>) {
  await db.query(`UPDATE ride_offers SET
    vehicle_id=s.vehicle_id,pickup_location=s.pickup_location,pickup_lat=s.pickup_lat,pickup_lng=s.pickup_lng,
    drop_location=s.drop_location,drop_lat=s.drop_lat,drop_lng=s.drop_lng,date=s.date,time=s.time,
    available_seats=s.available_seats,price_per_seat_paise=s.price_per_seat_paise,
    pilot_policy_id=s.pilot_policy_id,pilot_policy_snapshot=s.pilot_policy_snapshot,
    pilot_origin_code=s.pilot_origin_code,pilot_destination_code=s.pilot_destination_code,
    pilot_capacity=s.pilot_capacity,pilot_currency=s.pilot_currency,
    pilot_request_cutoff_at=s.pilot_request_cutoff_at,pilot_acceptance_cutoff_at=s.pilot_acceptance_cutoff_at,
    pilot_commitment_until=s.pilot_commitment_until,pilot_version=s.pilot_version,updated_at=s.updated_at
    FROM jsonb_populate_record(NULL::ride_offers,$2::jsonb) s WHERE ride_offers.id=$1`,[id,JSON.stringify(snapshot)]);
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
        JOIN users u ON u.id=s.user_id
        JOIN driver_eligibility d ON d.user_id=s.user_id
        JOIN driver_vehicle_approvals a ON a.driver_user_id=s.user_id AND a.vehicle_id=r.vehicle_id
        JOIN vehicles v ON v.id=a.vehicle_id
        WHERE s.user_id=r.driver_id AND ${currentPilotEligibilityWhere})
      AND EXISTS (SELECT 1 FROM pilot_corridor_contributions c WHERE c.policy_id=p.id
       AND c.origin_code=$1 AND c.destination_code=$2)
    ORDER BY r.date,r.time LIMIT 50`,[origin,destination,date ?? null])).rows;
}
