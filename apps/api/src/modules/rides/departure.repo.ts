import type { Pool, PoolClient } from "pg";

export type DepartureOperation = {
  id: string; ride_offer_id: string; driver_user_id: string; idempotency_key: string;
  payload_digest: string; boarded_booking_ids: string[]; confirmed_booking_ids: string[];
  state: "committed" | "acknowledged" | "recovered"; started_at: Date;
};

export async function byKey(client: Pool | PoolClient, driverId: string, key: string) {
  return (await client.query<DepartureOperation>(
    "SELECT * FROM ride_departures WHERE driver_user_id = $1 AND idempotency_key = $2",
    [driverId, key])).rows[0] ?? null;
}

export async function byId(client: Pool | PoolClient, id: string, lock = false) {
  return (await client.query<DepartureOperation>(
    `SELECT * FROM ride_departures WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`, [id])).rows[0] ?? null;
}

export async function acknowledged(client: Pool | PoolClient) {
  return (await client.query<DepartureOperation>(
    "SELECT * FROM ride_departures WHERE state IN ('acknowledged', 'recovered')")).rows;
}

export async function pending(client: Pool | PoolClient) {
  return (await client.query<DepartureOperation>(
    "SELECT * FROM ride_departures WHERE state = 'committed'")).rows;
}

export async function offerForUpdate(client: PoolClient, rideId: string) {
  return (await client.query<{ id: string; driver_id: string; vehicle_id: string | null;
    status: string; date: string; time: string }>(
    `SELECT id, driver_id, vehicle_id, status, to_char(date, 'YYYY-MM-DD') AS date, time
       FROM ride_offers WHERE id = $1 FOR UPDATE`, [rideId])).rows[0] ?? null;
}

export async function confirmedBookingsForUpdate(client: PoolClient, rideId: string) {
  return (await client.query<{ id: string; passenger_id: string }>(
    `SELECT id, passenger_id FROM bookings
      WHERE ride_offer_id = $1 AND status = 'confirmed' ORDER BY id FOR UPDATE`, [rideId])).rows;
}

export async function record(client: PoolClient, input: {
  rideId: string; driverId: string; key: string; digest: string; boardedIds: string[];
  confirmedIds: string[]; now: Date;
}) {
  const operation = (await client.query<DepartureOperation>(
    `INSERT INTO ride_departures
      (ride_offer_id, driver_user_id, idempotency_key, payload_digest,
       boarded_booking_ids, confirmed_booking_ids, state, started_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'committed', $7) RETURNING *`,
    [input.rideId, input.driverId, input.key, input.digest,
      JSON.stringify(input.boardedIds), JSON.stringify(input.confirmedIds), input.now],
  )).rows[0];
  await client.query("UPDATE ride_offers SET status = 'departed', updated_at = now() WHERE id = $1", [input.rideId]);
  await client.query(`INSERT INTO ride_departure_boarding (ride_offer_id, booking_id, boarded)
    SELECT $1, id, id = ANY($2::uuid[]) FROM bookings
    WHERE ride_offer_id = $1 AND status = 'confirmed'`, [input.rideId, input.boardedIds]);
  await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1, 'ride_departed', 'ride_offer', $2,
      jsonb_build_object('operationId', $3::text, 'boardedCount', $4::int))`,
    [input.driverId, input.rideId, operation.id, input.boardedIds.length]);
  return operation;
}

export async function acknowledge(client: PoolClient, id: string) {
  return (await client.query<DepartureOperation>(`UPDATE ride_departures
    SET state = 'acknowledged', acknowledged_at = now()
    WHERE id = $1 AND state = 'committed' RETURNING *`, [id])).rows[0] ?? null;
}

export async function readyNotifications(client: PoolClient, operationId: string) {
  await client.query(`UPDATE pilot_notification_events SET ready_at = now()
    WHERE origin_type = 'ride_departure' AND operation_id = $1 AND ready_at IS NULL`, [operationId]);
}

export async function suppressRestoredEmail(client: PoolClient, operationId: string) {
  await client.query(`UPDATE pilot_email_jobs SET status = 'exhausted', lease_until = NULL,
    last_error = 'Suppressed after snapshot restore; delivery outcome requires review', updated_at = now()
    WHERE event_id IN (SELECT id FROM pilot_notification_events
      WHERE origin_type = 'ride_departure' AND operation_id = $1) AND status <> 'sent'`,
    [operationId]);
}

export async function restore(client: PoolClient, item: {
  operationId: string; rideId: string; driverId: string; key: string; digest: string;
  boardedIds: string[]; confirmedIds: string[]; startedAt: string;
}) {
  const current = await byId(client, item.operationId, true);
  if (current && (current.ride_offer_id !== item.rideId || current.driver_user_id !== item.driverId ||
      current.idempotency_key !== item.key || current.payload_digest !== item.digest ||
      JSON.stringify(current.boarded_booking_ids) !== JSON.stringify(item.boardedIds) ||
      JSON.stringify(current.confirmed_booking_ids) !== JSON.stringify(item.confirmedIds))) {
    throw new Error("Departure recovery conflict");
  }
  if (!current) {
    await client.query(`INSERT INTO ride_departures
      (id, ride_offer_id, driver_user_id, idempotency_key, payload_digest,
       boarded_booking_ids, confirmed_booking_ids, state, started_at, acknowledged_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'recovered', $8, now())`,
      [item.operationId, item.rideId, item.driverId, item.key, item.digest,
        JSON.stringify(item.boardedIds), JSON.stringify(item.confirmedIds), item.startedAt]);
  } else if (current.state === "committed") {
    await client.query("UPDATE ride_departures SET state = 'recovered', acknowledged_at = now() WHERE id = $1",
      [item.operationId]);
  }
  const offer = await offerForUpdate(client, item.rideId);
  if (!offer || offer.driver_id !== item.driverId || !["active", "departed"].includes(offer.status)) {
    throw new Error("Departure offer requires manual recovery");
  }
  const confirmed = (await confirmedBookingsForUpdate(client, item.rideId)).map((row) => row.id).sort();
  if (JSON.stringify(confirmed) !== JSON.stringify(item.confirmedIds)) {
    throw new Error("Departure bookings require manual recovery");
  }
  await client.query("UPDATE ride_offers SET status = 'departed', updated_at = now() WHERE id = $1", [item.rideId]);
  await client.query(`INSERT INTO ride_departure_boarding (ride_offer_id, booking_id, boarded)
    SELECT $1, id, id = ANY($2::uuid[]) FROM bookings WHERE id = ANY($3::uuid[])
    ON CONFLICT (ride_offer_id, booking_id) DO UPDATE SET boarded = EXCLUDED.boarded`,
    [item.rideId, item.boardedIds, item.confirmedIds]);
  await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    SELECT $1, 'ride_departed', 'ride_offer', $2,
      jsonb_build_object('operationId', $3::text, 'boardedCount', $4::int)
    WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'ride_departed'
      AND metadata->>'operationId' = $3)`,
    [item.driverId, item.rideId, item.operationId, item.boardedIds.length]);
}
