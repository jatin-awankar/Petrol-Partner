import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

interface LockedRideRow {
  id: string;
  owner_id: string;
  seat_count: number;
  price_per_seat_paise: number;
  pricing_snapshot: Record<string, unknown>;
  status: string;
  counterparty_gender_preference: string;
}

interface LockedBookingRow {
  id: string;
  ride_offer_id: string | null;
  ride_request_id: string | null;
  created_by_user_id: string;
  passenger_id: string;
  driver_id: string;
  seats_booked: number;
  total_amount_paise: number;
  platform_fee_paise: number;
  pricing_snapshot: Record<string, unknown>;
  status: string;
  payment_state: string;
  expires_at: Date | string | null;
  confirmed_at: Date | string | null;
  cancelled_at: Date | string | null;
  completed_at: Date | string | null;
  expired_at: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface BookingViewRow {
  booking_id: string;
  status: string;
  payment_state: string;
  ride_offer_id: string | null;
  ride_request_id: string | null;
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string | null;
  confirmed_at: Date | string | null;
  cancelled_at: Date | string | null;
  completed_at: Date | string | null;
  expired_at: Date | string | null;
  driver_id: string;
  passenger_id: string;
  seats_booked: number;
  total_amount_paise: number;
  platform_fee_paise: number;
  pricing_snapshot: Record<string, unknown>;
  version: number;
  booking_flow: "offer" | "request";
  ride_id: string | null;
  pickup_location: string | null;
  drop_location: string | null;
  date: string | null;
  time: string | null;
  price_per_seat_paise: number | null;
  user_role: "driver" | "passenger";
  role: "driver" | "passenger";
  other_user_id: string | null;
  other_user_email: string | null;
  other_user_name: string | null;
  other_user_avatar_url: string | null;
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function paiseToRupees(value: number | null) {
  return value === null ? null : value / 100;
}

function bookingSelectColumns(currentUserParam: string) {
  return `
    b.id AS booking_id,
    b.status,
    b.payment_state,
    b.ride_offer_id,
    b.ride_request_id,
    b.created_by_user_id,
    b.created_at,
    b.updated_at,
    b.expires_at,
    b.confirmed_at,
    b.cancelled_at,
    b.completed_at,
    b.expired_at,
    b.driver_id,
    b.passenger_id,
    b.seats_booked,
    b.total_amount_paise,
    b.platform_fee_paise,
    b.pricing_snapshot,
    b.version,
    CASE WHEN b.ride_offer_id IS NOT NULL THEN 'offer' ELSE 'request' END AS booking_flow,
    COALESCE(ro.id, rr.id) AS ride_id,
    COALESCE(ro.pickup_location, rr.pickup_location) AS pickup_location,
    COALESCE(ro.drop_location, rr.drop_location) AS drop_location,
    COALESCE(ro.date, rr.date) AS date,
    COALESCE(ro.time, rr.time) AS time,
    COALESCE(ro.price_per_seat_paise, rr.price_per_seat_paise) AS price_per_seat_paise,
    CASE WHEN b.driver_id = ${currentUserParam} THEN 'driver' ELSE 'passenger' END AS user_role,
    CASE WHEN b.created_by_user_id = b.driver_id THEN 'driver' ELSE 'passenger' END AS role,
    other_user.id AS other_user_id,
    other_user.email AS other_user_email,
    other_profile.full_name AS other_user_name,
    other_profile.avatar_url AS other_user_avatar_url
  `;
}

function bookingFromClause(currentUserParam: string) {
  return `
    FROM bookings b
    LEFT JOIN ride_offers ro ON b.ride_offer_id = ro.id
    LEFT JOIN ride_requests rr ON b.ride_request_id = rr.id
    LEFT JOIN users other_user
      ON other_user.id = CASE
        WHEN b.driver_id = ${currentUserParam} THEN b.passenger_id
        ELSE b.driver_id
      END
    LEFT JOIN user_profiles other_profile ON other_profile.user_id = other_user.id
  `;
}

function mapBooking(row: BookingViewRow) {
  return {
    booking_id: row.booking_id,
    status: row.status,
    payment_state: row.payment_state,
    ride_offer_id: row.ride_offer_id,
    ride_request_id: row.ride_request_id,
    created_by_user_id: row.created_by_user_id,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    expires_at: toIso(row.expires_at),
    confirmed_at: toIso(row.confirmed_at),
    cancelled_at: toIso(row.cancelled_at),
    completed_at: toIso(row.completed_at),
    expired_at: toIso(row.expired_at),
    driver_id: row.driver_id,
    passenger_id: row.passenger_id,
    seats_booked: row.seats_booked,
    total_amount_paise: row.total_amount_paise,
    total_price: paiseToRupees(row.total_amount_paise),
    platform_fee_paise: row.platform_fee_paise,
    platform_fee: paiseToRupees(row.platform_fee_paise),
    total_payable_paise: row.total_amount_paise + row.platform_fee_paise,
    total_payable: paiseToRupees(row.total_amount_paise + row.platform_fee_paise),
    pricing_snapshot: row.pricing_snapshot ?? {},
    version: row.version,
    booking_flow: row.booking_flow,
    ride_id: row.ride_id,
    pickup_location: row.pickup_location,
    drop_location: row.drop_location,
    date: row.date,
    time: row.time,
    price_per_seat_paise: row.price_per_seat_paise,
    price_per_seat: paiseToRupees(row.price_per_seat_paise),
    role: row.role,
    user_role: row.user_role,
    other_user_id: row.other_user_id,
    other_user_name: row.other_user_name,
    other_user_email: row.other_user_email,
    other_user_avatar_url: row.other_user_avatar_url,
  };
}

export function findRideOfferForUpdate(id: string, client: PoolClient) {
  return client.query<LockedRideRow>(
    `SELECT
       id,
       driver_id AS owner_id,
       available_seats AS seat_count,
       price_per_seat_paise,
       pricing_snapshot,
       status,
       counterparty_gender_preference
     FROM ride_offers
     WHERE id = $1
     FOR UPDATE`,
    [id],
  );
}

export function findRideRequestForUpdate(id: string, client: PoolClient) {
  return client.query<LockedRideRow>(
    `SELECT
       id,
       passenger_id AS owner_id,
       seats_required AS seat_count,
       price_per_seat_paise,
       pricing_snapshot,
       status,
       counterparty_gender_preference
     FROM ride_requests
     WHERE id = $1
     FOR UPDATE`,
    [id],
  );
}

export async function findUserGenderForMatching(userId: string, client: PoolClient) {
  const result = await client.query<{ gender_for_matching: string | null }>(
    `SELECT gender_for_matching
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0]?.gender_for_matching ?? null;
}

export async function insertBooking(
  input: {
    rideOfferId: string | null;
    rideRequestId: string | null;
    createdByUserId: string;
    passengerId: string;
    driverId: string;
    seatsBooked: number;
    totalAmountPaise: number;
    platformFeePaise: number;
    status: string;
    paymentState: string;
    expiresAt: Date | null;
    pricingSnapshot?: Record<string, unknown>;
  },
  client: PoolClient,
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO bookings (
       ride_offer_id,
       ride_request_id,
       created_by_user_id,
       passenger_id,
       driver_id,
       seats_booked,
       total_amount_paise,
       platform_fee_paise,
       pricing_snapshot,
       status,
       payment_state,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
     RETURNING id`,
    [
      input.rideOfferId,
      input.rideRequestId,
      input.createdByUserId,
      input.passengerId,
      input.driverId,
      input.seatsBooked,
      input.totalAmountPaise,
      input.platformFeePaise,
      JSON.stringify(input.pricingSnapshot ?? {}),
      input.status,
      input.paymentState,
      input.expiresAt,
    ],
  );

  return result.rows[0];
}

export async function decrementRideOfferSeats(
  rideOfferId: string,
  seatsBooked: number,
  client: PoolClient,
) {
  await client.query(
    `UPDATE ride_offers
     SET available_seats = available_seats - $1,
         updated_at = now()
     WHERE id = $2`,
    [seatsBooked, rideOfferId],
  );
}

export async function decrementRideRequestSeats(
  rideRequestId: string,
  seatsBooked: number,
  client: PoolClient,
) {
  await client.query(
    `UPDATE ride_requests
     SET seats_required = seats_required - $1,
         status = CASE
           WHEN seats_required - $1 <= 0 THEN 'matched'
           ELSE 'active'
         END,
         updated_at = now()
     WHERE id = $2`,
    [seatsBooked, rideRequestId],
  );
}

export async function restoreRideOfferSeats(
  rideOfferId: string,
  seatsBooked: number,
  client: PoolClient,
) {
  await client.query("SELECT id FROM ride_offers WHERE id = $1 FOR UPDATE", [rideOfferId]);
  await client.query(
    `UPDATE ride_offers
     SET available_seats = available_seats + $1,
         updated_at = now()
     WHERE id = $2`,
    [seatsBooked, rideOfferId],
  );
}

export async function restoreRideRequestSeats(
  rideRequestId: string,
  seatsBooked: number,
  client: PoolClient,
) {
  await client.query("SELECT id, status FROM ride_requests WHERE id = $1 FOR UPDATE", [rideRequestId]);
  await client.query(
    `UPDATE ride_requests
     SET seats_required = seats_required + $1,
         status = CASE
           WHEN status IN ('cancelled', 'completed') THEN status
           WHEN seats_required + $1 <= 0 THEN 'matched'
           ELSE 'active'
         END,
         updated_at = now()
     WHERE id = $2`,
    [seatsBooked, rideRequestId],
  );
}

export async function insertBookingStatusEvent(
  input: {
    bookingId: string;
    fromStatus: string | null;
    toStatus: string;
    actorUserId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
  client: PoolClient,
) {
  await client.query(
    `INSERT INTO booking_status_events (
       booking_id,
       from_status,
       to_status,
       actor_user_id,
       reason,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.bookingId,
      input.fromStatus,
      input.toStatus,
      input.actorUserId ?? null,
      input.reason ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function findBookingForUpdate(id: string, client: PoolClient) {
  const result = await client.query<LockedBookingRow>(
    `SELECT
       id,
       ride_offer_id,
       ride_request_id,
       created_by_user_id,
       passenger_id,
       driver_id,
       seats_booked,
       total_amount_paise,
       platform_fee_paise,
       pricing_snapshot,
       status,
       payment_state,
       expires_at,
       confirmed_at,
       cancelled_at,
       completed_at,
       expired_at,
       version,
       created_at,
       updated_at
     FROM bookings
     WHERE id = $1
     FOR UPDATE`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function updateBookingLifecycle(
  input: {
    bookingId: string;
    status: string;
    paymentState?: string;
    expiresAt?: Date | null;
    confirmedAt?: Date | null;
    cancelledAt?: Date | null;
    completedAt?: Date | null;
    expiredAt?: Date | null;
  },
  client: PoolClient,
) {
  const values: unknown[] = [input.bookingId, input.status];
  const updates = ["status = $2", "updated_at = now()", "version = version + 1"];
  let parameterIndex = 3;

  if (input.paymentState !== undefined) {
    updates.push(`payment_state = $${parameterIndex}`);
    values.push(input.paymentState);
    parameterIndex += 1;
  }

  if (input.expiresAt !== undefined) {
    updates.push(`expires_at = $${parameterIndex}`);
    values.push(input.expiresAt);
    parameterIndex += 1;
  }

  if (input.confirmedAt !== undefined) {
    updates.push(`confirmed_at = $${parameterIndex}`);
    values.push(input.confirmedAt);
    parameterIndex += 1;
  }

  if (input.cancelledAt !== undefined) {
    updates.push(`cancelled_at = $${parameterIndex}`);
    values.push(input.cancelledAt);
    parameterIndex += 1;
  }

  if (input.completedAt !== undefined) {
    updates.push(`completed_at = $${parameterIndex}`);
    values.push(input.completedAt);
    parameterIndex += 1;
  }

  if (input.expiredAt !== undefined) {
    updates.push(`expired_at = $${parameterIndex}`);
    values.push(input.expiredAt);
    parameterIndex += 1;
  }

  await client.query(
    `UPDATE bookings
     SET ${updates.join(", ")}
     WHERE id = $1`,
    values,
  );
}

export async function findBookingByIdForUser(bookingId: string, userId: string) {
  const result = await dbQuery<BookingViewRow>(
    `SELECT
       ${bookingSelectColumns("$1")}
     ${bookingFromClause("$1")}
     WHERE b.id = $2
       AND (b.driver_id = $1 OR b.passenger_id = $1)`,
    [userId, bookingId],
  );

  return result.rows[0] ? mapBooking(result.rows[0]) : null;
}

export async function listBookingsForUser(input: {
  userId: string;
  limit: number;
  offset: number;
  status?: string;
}) {
  const filters = ["(b.driver_id = $1 OR b.passenger_id = $1)"];
  const params: unknown[] = [input.userId];
  let parameterIndex = 2;

  if (input.status) {
    filters.push(`b.status = $${parameterIndex}`);
    params.push(input.status);
    parameterIndex += 1;
  }

  const countResult = await dbQuery<{ total_count: string }>(
    `SELECT COUNT(*)::text AS total_count
     FROM bookings b
     WHERE ${filters.join(" AND ")}`,
    params,
  );

  params.push(input.limit, input.offset);
  const limitParam = parameterIndex;
  const offsetParam = parameterIndex + 1;

  const rowsResult = await dbQuery<BookingViewRow>(
    `SELECT
       ${bookingSelectColumns("$1")}
     ${bookingFromClause("$1")}
     WHERE ${filters.join(" AND ")}
     ORDER BY b.created_at DESC
     LIMIT $${limitParam}
     OFFSET $${offsetParam}`,
    params,
  );

  return {
    bookings: rowsResult.rows.map(mapBooking),
    totalCount: Number(countResult.rows[0]?.total_count ?? 0),
  };
}
