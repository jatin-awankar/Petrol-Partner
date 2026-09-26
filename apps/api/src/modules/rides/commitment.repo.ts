import type { PoolClient } from "pg";

export async function lockCommitmentActors(client: PoolClient, driverId: string,
  vehicleId: string, passengerIds: string[]) {
  const keys = [`student:${driverId}`, `vehicle:${vehicleId}`,
    ...passengerIds.map((id) => `student:${id}`)].sort();
  for (const key of keys) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
  }
}

export async function currentPassengers(client: PoolClient, passengerIds: string[]) {
  if (!passengerIds.length) return [];
  return (await client.query<{ user_id: string }>(`SELECT s.user_id FROM student_verifications s
    JOIN users u ON u.id=s.user_id
    WHERE s.user_id = ANY($1::uuid[]) AND s.status IN ('verified', 'revalidation_due')
      AND s.adult_eligible = true AND s.eligibility_ends_at > now()
      AND u.status='active' AND u.email_verified_at IS NOT NULL
    ORDER BY s.user_id FOR SHARE OF s,u`, [passengerIds])).rows.map((row) => row.user_id);
}

export async function conflictingOffers(client: PoolClient, input: {
  driverId: string; vehicleId: string; passengerIds: string[]; rideId: string | null;
  departureAt: Date; durationMinutes: number;
}) {
  const result = await client.query<{ id: string }>(`SELECT DISTINCT ro.id
    FROM ride_offers ro
    LEFT JOIN bookings b ON b.ride_offer_id = ro.id AND b.status = 'confirmed'
    LEFT JOIN pilot_seat_allocations pa ON pa.offer_id = ro.id AND pa.status IN ('confirmed','held')
    WHERE ro.id IS DISTINCT FROM $4::uuid AND ro.status IN ('active', 'held', 'departed')
      AND ((ro.driver_id = $1) OR (ro.driver_id = ANY($3::uuid[])) OR (ro.vehicle_id = $2)
        OR (b.passenger_id = ANY($3::uuid[])) OR (pa.passenger_id = ANY($3::uuid[])))
      AND (ro.date + ro.time) AT TIME ZONE 'Asia/Kolkata' < $5::timestamptz + $6 * interval '1 minute'
      AND COALESCE(ro.pilot_commitment_until,
        ((ro.date + ro.time) AT TIME ZONE 'Asia/Kolkata') + $6 * interval '1 minute') > $5::timestamptz
    LIMIT 1`, [input.driverId, input.vehicleId, input.passengerIds, input.rideId,
      input.departureAt, input.durationMinutes]);
  return Boolean(result.rowCount);
}
