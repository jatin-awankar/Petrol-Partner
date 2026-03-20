import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

interface OwnedRideRow {
  id: string;
}

interface ActiveRideIds {
  offerIds: string[];
  requestIds: string[];
}

interface MatchingRefreshRequestRow {
  user_id: string;
  requested_at: Date | string;
}

interface ComputedMatchRow {
  rideOfferId: string;
  rideRequestId: string;
  offerOwnerUserId: string;
  requestOwnerUserId: string;
  offerOwnerName: string;
  requestOwnerName: string;
  offerOwnerCollege: string | null;
  requestOwnerCollege: string | null;
  offerOwnerAvgRating: string | number | null;
  requestOwnerAvgRating: string | number | null;
  offerCounterpartyGenderPreference: string;
  requestCounterpartyGenderPreference: string;
  offerAvailableSeats: number;
  requestSeatsRequired: number;
  offerPickupLocation: string;
  offerDropLocation: string;
  offerDate: string;
  offerTime: string;
  requestPickupLocation: string;
  requestDropLocation: string;
  requestDate: string;
  requestTime: string;
  offerPricePerSeatPaise: number;
  requestPricePerSeatPaise: number;
  pickupDistanceKm: string | number;
  dropDistanceKm: string | number;
  departureGapMinutes: string | number;
  score: string | number;
}

interface StoredMatchRow extends ComputedMatchRow {
  matchId: string;
  matchStatus: string;
  reasons: Record<string, unknown>;
  lastNotifiedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  userMatchRole: "offer_owner" | "request_owner";
  otherUserId: string;
  otherUserName: string;
  otherUserCollege: string | null;
}

function buildDistanceExpression(
  sourceLatColumn: string,
  sourceLngColumn: string,
  targetLatColumn: string,
  targetLngColumn: string,
) {
  return `
    (
      6371 * acos(
        cos(radians(${sourceLatColumn})) * cos(radians(${targetLatColumn})) *
        cos(radians(${targetLngColumn}) - radians(${sourceLngColumn})) +
        sin(radians(${sourceLatColumn})) * sin(radians(${targetLatColumn}))
      )
    )
  `;
}

function buildCounterpartyGenderCondition(preferenceColumn: string, genderColumn: string) {
  return `
    (
      ${preferenceColumn} = 'any'
      OR (${preferenceColumn} = 'female_only' AND ${genderColumn} = 'female')
      OR (${preferenceColumn} = 'male_only' AND ${genderColumn} = 'male')
    )
  `;
}

function buildVerifiedStudentExpression(verificationAlias: string, fallbackColumn: string) {
  return `COALESCE((${verificationAlias}.status IN ('verified', 'revalidation_due')), ${fallbackColumn}, false)`;
}

function mapComputedMatch(row: ComputedMatchRow) {
  return {
    ride_offer_id: row.rideOfferId,
    ride_request_id: row.rideRequestId,
    score: Number(row.score),
    pickup_distance_km: Number(row.pickupDistanceKm),
    drop_distance_km: Number(row.dropDistanceKm),
    departure_gap_minutes: Number(row.departureGapMinutes),
    ride_offer: {
      id: row.rideOfferId,
      owner_user_id: row.offerOwnerUserId,
      owner_name: row.offerOwnerName,
      owner_college: row.offerOwnerCollege,
      owner_avg_rating: Number(row.offerOwnerAvgRating ?? 0),
      pickup_location: row.offerPickupLocation,
      drop_location: row.offerDropLocation,
      date: row.offerDate,
      time: row.offerTime,
      available_seats: row.offerAvailableSeats,
      price_per_seat: Number(row.offerPricePerSeatPaise) / 100,
      counterparty_gender_preference: row.offerCounterpartyGenderPreference,
    },
    ride_request: {
      id: row.rideRequestId,
      owner_user_id: row.requestOwnerUserId,
      owner_name: row.requestOwnerName,
      owner_college: row.requestOwnerCollege,
      owner_avg_rating: Number(row.requestOwnerAvgRating ?? 0),
      pickup_location: row.requestPickupLocation,
      drop_location: row.requestDropLocation,
      date: row.requestDate,
      time: row.requestTime,
      seats_required: row.requestSeatsRequired,
      price_per_seat: Number(row.requestPricePerSeatPaise) / 100,
      counterparty_gender_preference: row.requestCounterpartyGenderPreference,
    },
  };
}

function mapStoredMatch(row: StoredMatchRow) {
  return {
    id: row.matchId,
    status: row.matchStatus,
    score: Number(row.score),
    pickup_distance_km: Number(row.pickupDistanceKm),
    drop_distance_km: Number(row.dropDistanceKm),
    departure_gap_minutes: Number(row.departureGapMinutes),
    reasons: row.reasons ?? {},
    last_notified_at: row.lastNotifiedAt ? new Date(row.lastNotifiedAt).toISOString() : null,
    created_at: new Date(row.createdAt).toISOString(),
    updated_at: new Date(row.updatedAt).toISOString(),
    user_match_role: row.userMatchRole,
    other_user: {
      id: row.otherUserId,
      name: row.otherUserName,
      college: row.otherUserCollege,
    },
    ride_offer: mapComputedMatch(row).ride_offer,
    ride_request: mapComputedMatch(row).ride_request,
  };
}

export async function findOwnedActiveOffer(userId: string, offerId: string) {
  const result = await dbQuery<OwnedRideRow>(
    `SELECT id
     FROM ride_offers
     WHERE id = $1
       AND driver_id = $2
       AND status = 'active'
     LIMIT 1`,
    [offerId, userId],
  );

  return result.rows[0] ?? null;
}

export async function findOwnedActiveRequest(userId: string, requestId: string) {
  const result = await dbQuery<OwnedRideRow>(
    `SELECT id
     FROM ride_requests
     WHERE id = $1
       AND passenger_id = $2
       AND status = 'active'
     LIMIT 1`,
    [requestId, userId],
  );

  return result.rows[0] ?? null;
}

export async function findActiveRideIdsByUser(userId: string): Promise<ActiveRideIds> {
  const [offers, requests] = await Promise.all([
    dbQuery<OwnedRideRow>(
      `SELECT id
       FROM ride_offers
       WHERE driver_id = $1
         AND status = 'active'
         AND available_seats > 0`,
      [userId],
    ),
    dbQuery<OwnedRideRow>(
      `SELECT id
       FROM ride_requests
       WHERE passenger_id = $1
         AND status = 'active'
         AND seats_required > 0`,
      [userId],
    ),
  ]);

  return {
    offerIds: offers.rows.map((row) => row.id),
    requestIds: requests.rows.map((row) => row.id),
  };
}

export async function listOfferCandidates(input: {
  offerId: string;
  limit: number;
  maxPickupDistanceKm: number;
  maxDropDistanceKm: number;
  maxTimeGapMinutes: number;
  minScore: number;
}) {
  const pickupDistanceExpression = buildDistanceExpression(
    "source_offer.pickup_lat",
    "source_offer.pickup_lng",
    "rr.pickup_lat",
    "rr.pickup_lng",
  );
  const dropDistanceExpression = buildDistanceExpression(
    "source_offer.drop_lat",
    "source_offer.drop_lng",
    "rr.drop_lat",
    "rr.drop_lng",
  );
  const departureGapExpression = `ABS(EXTRACT(EPOCH FROM (source_offer.time - rr.time)) / 60.0)`;
  const requestOwnerVerifiedExpression = buildVerifiedStudentExpression(
    "request_verification",
    "request_profile.is_verified",
  );

  const result = await dbQuery<ComputedMatchRow>(
    `WITH source_offer AS (
       SELECT
         o.id,
         o.driver_id,
         o.pickup_location,
         o.pickup_lat,
         o.pickup_lng,
         o.drop_location,
         o.drop_lat,
         o.drop_lng,
         to_char(o.date, 'YYYY-MM-DD') AS date,
         o.time,
         to_char(o.time, 'HH24:MI:SS') AS time_text,
         o.available_seats,
         o.price_per_seat_paise,
         o.counterparty_gender_preference,
         owner_profile.full_name AS owner_name,
         owner_profile.college AS owner_college,
         owner_profile.avg_rating AS owner_avg_rating,
         owner_profile.gender_for_matching AS owner_gender_for_matching,
         ${buildVerifiedStudentExpression(
           "owner_verification",
           "owner_profile.is_verified",
         )} AS owner_verified
       FROM ride_offers o
       JOIN user_profiles owner_profile ON owner_profile.user_id = o.driver_id
       LEFT JOIN student_verifications owner_verification ON owner_verification.user_id = o.driver_id
       WHERE o.id = $1
         AND o.status = 'active'
         AND o.available_seats > 0
     )
     SELECT *
     FROM (
       SELECT
         source_offer.id AS "rideOfferId",
         rr.id AS "rideRequestId",
         source_offer.driver_id AS "offerOwnerUserId",
         rr.passenger_id AS "requestOwnerUserId",
         source_offer.owner_name AS "offerOwnerName",
         request_profile.full_name AS "requestOwnerName",
         source_offer.owner_college AS "offerOwnerCollege",
         request_profile.college AS "requestOwnerCollege",
         source_offer.owner_avg_rating AS "offerOwnerAvgRating",
         request_profile.avg_rating AS "requestOwnerAvgRating",
         source_offer.counterparty_gender_preference AS "offerCounterpartyGenderPreference",
         rr.counterparty_gender_preference AS "requestCounterpartyGenderPreference",
         source_offer.available_seats AS "offerAvailableSeats",
         rr.seats_required AS "requestSeatsRequired",
         source_offer.pickup_location AS "offerPickupLocation",
         source_offer.drop_location AS "offerDropLocation",
         source_offer.date AS "offerDate",
         source_offer.time_text AS "offerTime",
         rr.pickup_location AS "requestPickupLocation",
         rr.drop_location AS "requestDropLocation",
         to_char(rr.date, 'YYYY-MM-DD') AS "requestDate",
         to_char(rr.time, 'HH24:MI:SS') AS "requestTime",
         source_offer.price_per_seat_paise AS "offerPricePerSeatPaise",
         rr.price_per_seat_paise AS "requestPricePerSeatPaise",
         ROUND((${pickupDistanceExpression})::numeric, 3) AS "pickupDistanceKm",
         ROUND((${dropDistanceExpression})::numeric, 3) AS "dropDistanceKm",
         ROUND((${departureGapExpression})::numeric, 2) AS "departureGapMinutes",
         ROUND((
           GREATEST(0, 40 - (${pickupDistanceExpression} * 5)) +
           GREATEST(0, 35 - (${dropDistanceExpression} * 4)) +
           GREATEST(0, 15 - ((${departureGapExpression}) / 6)) +
           CASE WHEN source_offer.available_seats = rr.seats_required THEN 5 ELSE 0 END +
           LEAST(COALESCE(source_offer.owner_avg_rating, 0), 5) +
           LEAST(COALESCE(request_profile.avg_rating, 0), 5)
         )::numeric, 2) AS score
       FROM source_offer
       JOIN ride_requests rr
         ON rr.status = 'active'
        AND rr.seats_required > 0
        AND rr.passenger_id <> source_offer.driver_id
        AND to_char(rr.date, 'YYYY-MM-DD') = source_offer.date
        AND rr.seats_required <= source_offer.available_seats
       JOIN user_profiles request_profile ON request_profile.user_id = rr.passenger_id
       LEFT JOIN student_verifications request_verification ON request_verification.user_id = rr.passenger_id
       WHERE source_offer.owner_verified = true
         AND ${requestOwnerVerifiedExpression}
         AND ${pickupDistanceExpression} <= $2
         AND ${dropDistanceExpression} <= $3
         AND ${departureGapExpression} <= $4
         AND ${buildCounterpartyGenderCondition(
           "source_offer.counterparty_gender_preference",
           "request_profile.gender_for_matching",
         )}
         AND ${buildCounterpartyGenderCondition(
           "rr.counterparty_gender_preference",
           "source_offer.owner_gender_for_matching",
         )}
     ) candidate
     WHERE candidate.score >= $5
     ORDER BY candidate.score DESC, candidate."pickupDistanceKm" ASC, candidate."departureGapMinutes" ASC
     LIMIT $6`,
    [
      input.offerId,
      input.maxPickupDistanceKm,
      input.maxDropDistanceKm,
      input.maxTimeGapMinutes,
      input.minScore,
      input.limit,
    ],
  );

  return result.rows.map(mapComputedMatch);
}

export async function listRequestCandidates(input: {
  requestId: string;
  limit: number;
  maxPickupDistanceKm: number;
  maxDropDistanceKm: number;
  maxTimeGapMinutes: number;
  minScore: number;
}) {
  const pickupDistanceExpression = buildDistanceExpression(
    "source_request.pickup_lat",
    "source_request.pickup_lng",
    "ro.pickup_lat",
    "ro.pickup_lng",
  );
  const dropDistanceExpression = buildDistanceExpression(
    "source_request.drop_lat",
    "source_request.drop_lng",
    "ro.drop_lat",
    "ro.drop_lng",
  );
  const departureGapExpression = `ABS(EXTRACT(EPOCH FROM (source_request.time - ro.time)) / 60.0)`;
  const offerOwnerVerifiedExpression = buildVerifiedStudentExpression(
    "offer_verification",
    "offer_profile.is_verified",
  );

  const result = await dbQuery<ComputedMatchRow>(
    `WITH source_request AS (
       SELECT
         r.id,
         r.passenger_id,
         r.pickup_location,
         r.pickup_lat,
         r.pickup_lng,
         r.drop_location,
         r.drop_lat,
         r.drop_lng,
         to_char(r.date, 'YYYY-MM-DD') AS date,
         r.time,
         to_char(r.time, 'HH24:MI:SS') AS time_text,
         r.seats_required,
         r.price_per_seat_paise,
         r.counterparty_gender_preference,
         request_profile.full_name AS owner_name,
         request_profile.college AS owner_college,
         request_profile.avg_rating AS owner_avg_rating,
         request_profile.gender_for_matching AS owner_gender_for_matching,
         ${buildVerifiedStudentExpression(
           "request_verification",
           "request_profile.is_verified",
         )} AS owner_verified
       FROM ride_requests r
       JOIN user_profiles request_profile ON request_profile.user_id = r.passenger_id
       LEFT JOIN student_verifications request_verification ON request_verification.user_id = r.passenger_id
       WHERE r.id = $1
         AND r.status = 'active'
         AND r.seats_required > 0
     )
     SELECT *
     FROM (
       SELECT
         ro.id AS "rideOfferId",
         source_request.id AS "rideRequestId",
         ro.driver_id AS "offerOwnerUserId",
         source_request.passenger_id AS "requestOwnerUserId",
         offer_profile.full_name AS "offerOwnerName",
         source_request.owner_name AS "requestOwnerName",
         offer_profile.college AS "offerOwnerCollege",
         source_request.owner_college AS "requestOwnerCollege",
         offer_profile.avg_rating AS "offerOwnerAvgRating",
         source_request.owner_avg_rating AS "requestOwnerAvgRating",
         ro.counterparty_gender_preference AS "offerCounterpartyGenderPreference",
         source_request.counterparty_gender_preference AS "requestCounterpartyGenderPreference",
         ro.available_seats AS "offerAvailableSeats",
         source_request.seats_required AS "requestSeatsRequired",
         ro.pickup_location AS "offerPickupLocation",
         ro.drop_location AS "offerDropLocation",
         to_char(ro.date, 'YYYY-MM-DD') AS "offerDate",
         to_char(ro.time, 'HH24:MI:SS') AS "offerTime",
         source_request.pickup_location AS "requestPickupLocation",
         source_request.drop_location AS "requestDropLocation",
         source_request.date AS "requestDate",
         source_request.time_text AS "requestTime",
         ro.price_per_seat_paise AS "offerPricePerSeatPaise",
         source_request.price_per_seat_paise AS "requestPricePerSeatPaise",
         ROUND((${pickupDistanceExpression})::numeric, 3) AS "pickupDistanceKm",
         ROUND((${dropDistanceExpression})::numeric, 3) AS "dropDistanceKm",
         ROUND((${departureGapExpression})::numeric, 2) AS "departureGapMinutes",
         ROUND((
           GREATEST(0, 40 - (${pickupDistanceExpression} * 5)) +
           GREATEST(0, 35 - (${dropDistanceExpression} * 4)) +
           GREATEST(0, 15 - ((${departureGapExpression}) / 6)) +
           CASE WHEN ro.available_seats = source_request.seats_required THEN 5 ELSE 0 END +
           LEAST(COALESCE(offer_profile.avg_rating, 0), 5) +
           LEAST(COALESCE(source_request.owner_avg_rating, 0), 5)
         )::numeric, 2) AS score
       FROM source_request
       JOIN ride_offers ro
         ON ro.status = 'active'
        AND ro.available_seats > 0
        AND ro.driver_id <> source_request.passenger_id
        AND to_char(ro.date, 'YYYY-MM-DD') = source_request.date
        AND ro.available_seats >= source_request.seats_required
       JOIN user_profiles offer_profile ON offer_profile.user_id = ro.driver_id
       LEFT JOIN student_verifications offer_verification ON offer_verification.user_id = ro.driver_id
       WHERE source_request.owner_verified = true
         AND ${offerOwnerVerifiedExpression}
         AND ${pickupDistanceExpression} <= $2
         AND ${dropDistanceExpression} <= $3
         AND ${departureGapExpression} <= $4
         AND ${buildCounterpartyGenderCondition(
           "ro.counterparty_gender_preference",
           "source_request.owner_gender_for_matching",
         )}
         AND ${buildCounterpartyGenderCondition(
           "source_request.counterparty_gender_preference",
           "offer_profile.gender_for_matching",
         )}
     ) candidate
     WHERE candidate.score >= $5
     ORDER BY candidate.score DESC, candidate."pickupDistanceKm" ASC, candidate."departureGapMinutes" ASC
     LIMIT $6`,
    [
      input.requestId,
      input.maxPickupDistanceKm,
      input.maxDropDistanceKm,
      input.maxTimeGapMinutes,
      input.minScore,
      input.limit,
    ],
  );

  return result.rows.map(mapComputedMatch);
}

export async function expireOfferMatches(offerId: string, client: PoolClient) {
  await client.query(
    `UPDATE match_candidates
     SET status = 'expired',
         updated_at = now()
     WHERE ride_offer_id = $1
       AND status IN ('open', 'notified')`,
    [offerId],
  );
}

export async function expireRequestMatches(requestId: string, client: PoolClient) {
  await client.query(
    `UPDATE match_candidates
     SET status = 'expired',
         updated_at = now()
     WHERE ride_request_id = $1
       AND status IN ('open', 'notified')`,
    [requestId],
  );
}

export async function upsertMatchCandidate(
  input: {
    rideOfferId: string;
    rideRequestId: string;
    status: string;
    score: number;
    pickupDistanceKm: number;
    dropDistanceKm: number;
    departureGapMinutes: number;
    reasons: Record<string, unknown>;
  },
  client: PoolClient,
) {
  await client.query(
    `INSERT INTO match_candidates (
       ride_offer_id,
       ride_request_id,
       status,
       score,
       pickup_distance_km,
       drop_distance_km,
       departure_gap_minutes,
       reasons
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (ride_offer_id, ride_request_id)
     DO UPDATE SET
       status = EXCLUDED.status,
       score = EXCLUDED.score,
       pickup_distance_km = EXCLUDED.pickup_distance_km,
       drop_distance_km = EXCLUDED.drop_distance_km,
       departure_gap_minutes = EXCLUDED.departure_gap_minutes,
       reasons = EXCLUDED.reasons,
       updated_at = now()`,
    [
      input.rideOfferId,
      input.rideRequestId,
      input.status,
      input.score,
      input.pickupDistanceKm,
      input.dropDistanceKm,
      input.departureGapMinutes,
      JSON.stringify(input.reasons),
    ],
  );
}

export async function markMatchCandidateNotified(
  rideOfferId: string,
  rideRequestId: string,
  client: PoolClient,
) {
  await client.query(
    `UPDATE match_candidates
     SET status = 'notified',
         last_notified_at = COALESCE(last_notified_at, now()),
         updated_at = now()
     WHERE ride_offer_id = $1
       AND ride_request_id = $2`,
    [rideOfferId, rideRequestId],
  );
}

export async function listStoredMatchesForUser(input: {
  userId: string;
  limit: number;
  offset: number;
  status?: string;
}) {
  const filters = ["(ro.driver_id = $1 OR rr.passenger_id = $1)"];
  const params: unknown[] = [input.userId];
  let parameterIndex = 2;

  if (input.status) {
    filters.push(`mc.status = $${parameterIndex}`);
    params.push(input.status);
    parameterIndex += 1;
  }

  const countResult = await dbQuery<{ total_count: string }>(
    `SELECT COUNT(*)::text AS total_count
     FROM match_candidates mc
     JOIN ride_offers ro ON ro.id = mc.ride_offer_id
     JOIN ride_requests rr ON rr.id = mc.ride_request_id
     WHERE ${filters.join(" AND ")}`,
    params,
  );

  params.push(input.limit, input.offset);
  const limitParam = parameterIndex;
  const offsetParam = parameterIndex + 1;

  const result = await dbQuery<StoredMatchRow>(
    `SELECT
       mc.id AS "matchId",
       mc.status AS "matchStatus",
       mc.reasons,
       mc.last_notified_at AS "lastNotifiedAt",
       mc.created_at AS "createdAt",
       mc.updated_at AS "updatedAt",
       ro.id AS "rideOfferId",
       rr.id AS "rideRequestId",
       ro.driver_id AS "offerOwnerUserId",
       rr.passenger_id AS "requestOwnerUserId",
       offer_profile.full_name AS "offerOwnerName",
       request_profile.full_name AS "requestOwnerName",
       offer_profile.college AS "offerOwnerCollege",
       request_profile.college AS "requestOwnerCollege",
       offer_profile.avg_rating AS "offerOwnerAvgRating",
       request_profile.avg_rating AS "requestOwnerAvgRating",
       ro.counterparty_gender_preference AS "offerCounterpartyGenderPreference",
       rr.counterparty_gender_preference AS "requestCounterpartyGenderPreference",
       ro.available_seats AS "offerAvailableSeats",
       rr.seats_required AS "requestSeatsRequired",
       ro.pickup_location AS "offerPickupLocation",
       ro.drop_location AS "offerDropLocation",
       to_char(ro.date, 'YYYY-MM-DD') AS "offerDate",
       to_char(ro.time, 'HH24:MI:SS') AS "offerTime",
       rr.pickup_location AS "requestPickupLocation",
       rr.drop_location AS "requestDropLocation",
       to_char(rr.date, 'YYYY-MM-DD') AS "requestDate",
       to_char(rr.time, 'HH24:MI:SS') AS "requestTime",
       ro.price_per_seat_paise AS "offerPricePerSeatPaise",
       rr.price_per_seat_paise AS "requestPricePerSeatPaise",
       mc.pickup_distance_km AS "pickupDistanceKm",
       mc.drop_distance_km AS "dropDistanceKm",
       mc.departure_gap_minutes AS "departureGapMinutes",
       mc.score,
       CASE WHEN ro.driver_id = $1 THEN 'offer_owner' ELSE 'request_owner' END AS "userMatchRole",
       CASE WHEN ro.driver_id = $1 THEN rr.passenger_id ELSE ro.driver_id END AS "otherUserId",
       CASE WHEN ro.driver_id = $1 THEN request_profile.full_name ELSE offer_profile.full_name END AS "otherUserName",
       CASE WHEN ro.driver_id = $1 THEN request_profile.college ELSE offer_profile.college END AS "otherUserCollege"
     FROM match_candidates mc
     JOIN ride_offers ro ON ro.id = mc.ride_offer_id
     JOIN ride_requests rr ON rr.id = mc.ride_request_id
     JOIN user_profiles offer_profile ON offer_profile.user_id = ro.driver_id
     JOIN user_profiles request_profile ON request_profile.user_id = rr.passenger_id
     WHERE ${filters.join(" AND ")}
     ORDER BY mc.updated_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params,
  );

  return {
    matches: result.rows.map(mapStoredMatch),
    totalCount: Number(countResult.rows[0]?.total_count ?? 0),
  };
}

export async function requestMatchingRefresh(userId: string) {
  await dbQuery(
    `INSERT INTO matching_refresh_requests (
       user_id,
       requested_at,
       locked_at,
       last_error,
       updated_at
     )
     VALUES ($1, now(), NULL, NULL, now())
     ON CONFLICT (user_id)
     DO UPDATE SET
       requested_at = now(),
       locked_at = NULL,
       last_error = NULL,
       updated_at = now()`,
    [userId],
  );
}

export async function claimMatchingRefreshRequests(limit: number) {
  const result = await dbQuery<MatchingRefreshRequestRow>(
    `WITH claimed AS (
       SELECT user_id
       FROM matching_refresh_requests
       WHERE locked_at IS NULL OR locked_at < now() - interval '5 minutes'
       ORDER BY requested_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE matching_refresh_requests request
     SET locked_at = now(),
         attempt_count = attempt_count + 1,
         updated_at = now()
     FROM claimed
     WHERE request.user_id = claimed.user_id
     RETURNING request.user_id, request.requested_at`,
    [limit],
  );

  return result.rows.map((row) => ({
    user_id: row.user_id,
    requested_at: new Date(row.requested_at).toISOString(),
  }));
}

export async function completeMatchingRefreshRequest(userId: string) {
  await dbQuery(
    `UPDATE matching_refresh_requests
     SET locked_at = NULL,
         last_processed_at = now(),
         last_error = NULL,
         updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function failMatchingRefreshRequest(userId: string, errorMessage: string) {
  await dbQuery(
    `UPDATE matching_refresh_requests
     SET locked_at = NULL,
         last_error = $2,
         updated_at = now()
     WHERE user_id = $1`,
    [userId, errorMessage],
  );
}
