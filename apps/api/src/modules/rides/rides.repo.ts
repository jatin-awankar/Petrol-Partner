import { dbQuery } from "../../db/pool";
import type {
  CreateRideOfferInput,
  CreateRideRequestInput,
  ListRideOffersQuery,
  ListRideRequestsQuery,
  UpdateRideOfferInput,
  UpdateRideRequestInput,
} from "./rides.schema";

const SEARCH_RADIUS_KM = 1;

interface RideOfferRow {
  id: string;
  driverId: string;
  vehicleId: string | null;
  pickupLocation: string;
  pickupLat: number;
  pickupLng: number;
  dropLocation: string;
  dropLat: number;
  dropLng: number;
  availableSeats: number;
  pricePerSeatPaise: number;
  pricingAreaType: string | null;
  quotedDistanceKm: string | number | null;
  rateCardId: string | null;
  pricingSnapshot: Record<string, unknown>;
  date: string;
  time: string;
  counterpartyGenderPreference: string;
  notificationEnabled: boolean;
  maxDetourKm: string | number | null;
  vehicleDetails: unknown;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  fullName: string;
  email: string;
  phone: string | null;
  isVerified: boolean;
  college: string | null;
  profileImage: string | null;
  avgRating: string | number | null;
  totalRides?: string | number;
  distanceKm?: string | number;
}

interface RideRequestRow {
  id: string;
  passengerId: string;
  pickupLocation: string;
  pickupLat: number;
  pickupLng: number;
  dropLocation: string;
  dropLat: number;
  dropLng: number;
  seatsRequired: number;
  pricePerSeatPaise: number;
  pricingAreaType: string | null;
  quotedDistanceKm: string | number | null;
  rateCardId: string | null;
  pricingSnapshot: Record<string, unknown>;
  date: string;
  time: string;
  counterpartyGenderPreference: string;
  notificationEnabled: boolean;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  fullName: string;
  email: string;
  phone: string | null;
  isVerified: boolean;
  college: string | null;
  profileImage: string | null;
  avgRating: string | number | null;
  totalRides?: string | number;
  distanceKm?: string | number;
}

function mapRideOffer(row: RideOfferRow) {
  return {
    id: row.id,
    driver_id: row.driverId,
    vehicle_id: row.vehicleId,
    pickup_location: row.pickupLocation,
    pickup_lat: row.pickupLat,
    pickup_lng: row.pickupLng,
    drop_location: row.dropLocation,
    drop_lat: row.dropLat,
    drop_lng: row.dropLng,
    available_seats: row.availableSeats,
    price_per_seat: Number(row.pricePerSeatPaise) / 100,
    pricing_area_type: row.pricingAreaType,
    quoted_distance_km:
      row.quotedDistanceKm !== null && row.quotedDistanceKm !== undefined
        ? Number(row.quotedDistanceKm)
        : null,
    rate_card_id: row.rateCardId,
    pricing_snapshot: row.pricingSnapshot ?? {},
    date: row.date,
    time: row.time,
    counterparty_gender_preference: row.counterpartyGenderPreference,
    notification_enabled: row.notificationEnabled,
    max_detour_km: row.maxDetourKm !== null && row.maxDetourKm !== undefined ? Number(row.maxDetourKm) : null,
    vehicle_details: row.vehicleDetails,
    notes: row.notes,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    full_name: row.fullName,
    email: row.email,
    phone: row.phone,
    is_verified: row.isVerified,
    college: row.college,
    profile_image: row.profileImage,
    avg_rating: Number(row.avgRating ?? 0),
    total_rides: row.totalRides !== undefined ? Number(row.totalRides) : undefined,
    distance_km: row.distanceKm !== undefined ? Number(row.distanceKm) : undefined,
  };
}

function mapRideRequest(row: RideRequestRow) {
  return {
    id: row.id,
    passenger_id: row.passengerId,
    pickup_location: row.pickupLocation,
    pickup_lat: row.pickupLat,
    pickup_lng: row.pickupLng,
    drop_location: row.dropLocation,
    drop_lat: row.dropLat,
    drop_lng: row.dropLng,
    seats_required: row.seatsRequired,
    price_per_seat: Number(row.pricePerSeatPaise) / 100,
    pricing_area_type: row.pricingAreaType,
    quoted_distance_km:
      row.quotedDistanceKm !== null && row.quotedDistanceKm !== undefined
        ? Number(row.quotedDistanceKm)
        : null,
    rate_card_id: row.rateCardId,
    pricing_snapshot: row.pricingSnapshot ?? {},
    date: row.date,
    time: row.time,
    counterparty_gender_preference: row.counterpartyGenderPreference,
    notification_enabled: row.notificationEnabled,
    notes: row.notes,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    full_name: row.fullName,
    email: row.email,
    phone: row.phone,
    is_verified: row.isVerified,
    college: row.college,
    profile_image: row.profileImage,
    avg_rating: Number(row.avgRating ?? 0),
    total_rides: row.totalRides !== undefined ? Number(row.totalRides) : undefined,
    distance_km: row.distanceKm !== undefined ? Number(row.distanceKm) : undefined,
  };
}

function rideOfferSelectColumns() {
  return `
    r.id,
    r.driver_id AS "driverId",
    r.vehicle_id AS "vehicleId",
    r.pickup_location AS "pickupLocation",
    r.pickup_lat AS "pickupLat",
    r.pickup_lng AS "pickupLng",
    r.drop_location AS "dropLocation",
    r.drop_lat AS "dropLat",
    r.drop_lng AS "dropLng",
    r.available_seats AS "availableSeats",
    r.price_per_seat_paise AS "pricePerSeatPaise",
    r.pricing_area_type AS "pricingAreaType",
    r.quoted_distance_km AS "quotedDistanceKm",
    r.rate_card_id AS "rateCardId",
    r.pricing_snapshot AS "pricingSnapshot",
    to_char(r.date, 'YYYY-MM-DD') AS date,
    to_char(r.time, 'HH24:MI:SS') AS time,
    r.counterparty_gender_preference AS "counterpartyGenderPreference",
    r.notification_enabled AS "notificationEnabled",
    r.max_detour_km AS "maxDetourKm",
    r.vehicle_details AS "vehicleDetails",
    r.notes,
    r.status,
    r.created_at AS "createdAt",
    r.updated_at AS "updatedAt",
    p.full_name AS "fullName",
    u.email,
    p.phone,
    p.is_verified AS "isVerified",
    p.college,
    p.avatar_url AS "profileImage",
    p.avg_rating AS "avgRating"
  `;
}

function rideOfferFromClause() {
  return `
    FROM ride_offers r
    JOIN users u ON u.id = r.driver_id
    JOIN user_profiles p ON p.user_id = r.driver_id
  `;
}

function rideRequestSelectColumns() {
  return `
    r.id,
    r.passenger_id AS "passengerId",
    r.pickup_location AS "pickupLocation",
    r.pickup_lat AS "pickupLat",
    r.pickup_lng AS "pickupLng",
    r.drop_location AS "dropLocation",
    r.drop_lat AS "dropLat",
    r.drop_lng AS "dropLng",
    r.seats_required AS "seatsRequired",
    r.price_per_seat_paise AS "pricePerSeatPaise",
    r.pricing_area_type AS "pricingAreaType",
    r.quoted_distance_km AS "quotedDistanceKm",
    r.rate_card_id AS "rateCardId",
    r.pricing_snapshot AS "pricingSnapshot",
    to_char(r.date, 'YYYY-MM-DD') AS date,
    to_char(r.time, 'HH24:MI:SS') AS time,
    r.counterparty_gender_preference AS "counterpartyGenderPreference",
    r.notification_enabled AS "notificationEnabled",
    r.notes,
    r.status,
    r.created_at AS "createdAt",
    r.updated_at AS "updatedAt",
    p.full_name AS "fullName",
    u.email,
    p.phone,
    p.is_verified AS "isVerified",
    p.college,
    p.avatar_url AS "profileImage",
    p.avg_rating AS "avgRating"
  `;
}

function rideRequestFromClause() {
  return `
    FROM ride_requests r
    JOIN users u ON u.id = r.passenger_id
    JOIN user_profiles p ON p.user_id = r.passenger_id
  `;
}

function buildDistanceExpression(
  latIndex: number,
  lngIndex: number,
  latColumn: string,
  lngColumn: string,
) {
  return `
    (
      6371 * acos(
        cos(radians($${latIndex})) * cos(radians(${latColumn})) *
        cos(radians(${lngColumn}) - radians($${lngIndex})) +
        sin(radians($${latIndex})) * sin(radians(${latColumn}))
      )
    )
  `;
}

export async function createRideOffer(
  driverId: string,
  input: CreateRideOfferInput & {
    rate_card_id?: string | null;
    pricing_snapshot?: Record<string, unknown>;
  },
) {
  const result = await dbQuery<{ id: string }>(
    `
      INSERT INTO ride_offers (
        driver_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        drop_location,
        drop_lat,
        drop_lng,
        date,
        time,
        available_seats,
        price_per_seat_paise,
        pricing_area_type,
        quoted_distance_km,
        rate_card_id,
        pricing_snapshot,
        vehicle_id,
        counterparty_gender_preference,
        notification_enabled,
        max_detour_km,
        vehicle_details,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, $20, $21)
      RETURNING id
    `,
    [
      driverId,
      input.pickup_location,
      input.pickup_lat,
      input.pickup_lng,
      input.drop_location,
      input.drop_lat,
      input.drop_lng,
      input.date,
      input.time,
      input.available_seats,
      Math.round(input.price_per_seat! * 100),
      input.pricing_area_type ?? null,
      input.distance_km ?? null,
      input.rate_card_id ?? null,
      JSON.stringify(input.pricing_snapshot ?? {}),
      input.vehicle_id ?? null,
      input.counterparty_gender_preference,
      input.notification_enabled ?? true,
      input.max_detour_km ?? null,
      input.vehicle_details ?? null,
      input.notes ?? null,
    ],
  );

  return findRideOfferById(result.rows[0].id);
}

export async function findRideOfferById(id: string) {
  const result = await dbQuery<RideOfferRow>(
    `
      SELECT
        ${rideOfferSelectColumns()},
        (
          SELECT COUNT(*)
          FROM bookings b
          WHERE b.driver_id = r.driver_id
            AND b.status = 'completed'
        ) AS "totalRides"
      ${rideOfferFromClause()}
      WHERE r.id = $1
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ? mapRideOffer(result.rows[0]) : null;
}

export async function updateRideOffer(
  id: string,
  input: UpdateRideOfferInput & {
    current: ReturnType<typeof mapRideOffer>;
    rate_card_id?: string | null;
    pricing_snapshot?: Record<string, unknown>;
  },
) {
  await dbQuery(
    `
      UPDATE ride_offers
      SET
        pickup_location = $1,
        pickup_lat = $2,
        pickup_lng = $3,
        drop_location = $4,
        drop_lat = $5,
        drop_lng = $6,
        date = $7,
        time = $8,
        available_seats = $9,
        price_per_seat_paise = $10,
        pricing_area_type = $11,
        quoted_distance_km = $12,
        rate_card_id = $13,
        pricing_snapshot = $14::jsonb,
        vehicle_id = $15,
        counterparty_gender_preference = $16,
        notification_enabled = $17,
        max_detour_km = $18,
        vehicle_details = $19,
        notes = $20,
        status = $21,
        updated_at = now()
      WHERE id = $22
    `,
    [
      input.current.pickup_location,
      input.current.pickup_lat,
      input.current.pickup_lng,
      input.current.drop_location,
      input.current.drop_lat,
      input.current.drop_lng,
      input.current.date,
      input.current.time,
      input.current.available_seats,
      Math.round(input.current.price_per_seat * 100),
      input.current.pricing_area_type ?? null,
      input.current.quoted_distance_km ?? null,
      input.current.rate_card_id ?? null,
      JSON.stringify(input.current.pricing_snapshot ?? {}),
      input.current.vehicle_id ?? null,
      input.current.counterparty_gender_preference ?? "any",
      input.current.notification_enabled ?? true,
      input.current.max_detour_km ?? null,
      input.current.vehicle_details ?? null,
      input.current.notes ?? null,
      input.current.status,
      id,
    ],
  );

  return findRideOfferById(id);
}

export async function listRideOffers(filters: ListRideOffersQuery) {
  const values: Array<string | number> = [];
  const where: string[] = [
    "r.status = 'active'",
    "r.available_seats > 0",
    "r.date >= current_date",
  ];
  let distanceSelect = "";
  let orderBy = "r.created_at DESC";
  let locationFilter = "";

  if (filters.date) {
    values.push(filters.date);
    where.push(`r.date = $${values.length}`);
  }

  if (filters.pickup_lat !== undefined && filters.pickup_lng !== undefined) {
    values.push(filters.pickup_lat, filters.pickup_lng);
    const latIndex = values.length - 1;
    const lngIndex = values.length;
    const distanceExpression = buildDistanceExpression(latIndex, lngIndex, "r.pickup_lat", "r.pickup_lng");

    values.push(SEARCH_RADIUS_KM);
    const radiusIndex = values.length;

    distanceSelect = `, ${distanceExpression} AS "distanceKm"`;
    locationFilter = ` AND ${distanceExpression} <= $${radiusIndex}`;
    orderBy = `"distanceKm" ASC`;
  }

  const limit = filters.limit;
  const offset = (filters.page - 1) * filters.limit;

  const countQuery = `
    SELECT COUNT(*) AS count
    FROM ride_offers r
    WHERE ${where.join(" AND ")}${locationFilter}
  `;

  const countResult = await dbQuery<{ count: string }>(countQuery, values);
  const totalCount = Number(countResult.rows[0]?.count ?? 0);

  values.push(limit, offset);
  const limitIndex = values.length - 1;
  const offsetIndex = values.length;

  const listQuery = `
    SELECT
      ${rideOfferSelectColumns()}
      ${distanceSelect}
    ${rideOfferFromClause()}
    WHERE ${where.join(" AND ")}${locationFilter}
    ORDER BY ${orderBy}
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const result = await dbQuery<RideOfferRow>(listQuery, values);

  return {
    success: true,
    page: filters.page,
    limit: filters.limit,
    totalCount,
    totalPages: Math.ceil(totalCount / filters.limit),
    rides: result.rows.map(mapRideOffer),
  };
}

export async function createRideRequest(
  passengerId: string,
  input: CreateRideRequestInput & {
    rate_card_id?: string | null;
    pricing_snapshot?: Record<string, unknown>;
  },
) {
  const result = await dbQuery<{ id: string }>(
    `
      INSERT INTO ride_requests (
        passenger_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        drop_location,
        drop_lat,
        drop_lng,
        date,
        time,
        seats_required,
        price_per_seat_paise,
        pricing_area_type,
        quoted_distance_km,
        rate_card_id,
        pricing_snapshot,
        counterparty_gender_preference,
        notification_enabled,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18)
      RETURNING id
    `,
    [
      passengerId,
      input.pickup_location,
      input.pickup_lat,
      input.pickup_lng,
      input.drop_location,
      input.drop_lat,
      input.drop_lng,
      input.date,
      input.time,
      input.seats_required,
      Math.round(input.price_per_seat! * 100),
      input.pricing_area_type ?? null,
      input.distance_km ?? null,
      input.rate_card_id ?? null,
      JSON.stringify(input.pricing_snapshot ?? {}),
      input.counterparty_gender_preference,
      input.notification_enabled ?? true,
      input.notes ?? null,
    ],
  );

  return findRideRequestById(result.rows[0].id);
}

export async function findRideRequestById(id: string) {
  const result = await dbQuery<RideRequestRow>(
    `
      SELECT
        ${rideRequestSelectColumns()},
        (
          SELECT COUNT(*)
          FROM bookings b
          WHERE b.passenger_id = r.passenger_id
            AND b.status = 'completed'
        ) AS "totalRides"
      ${rideRequestFromClause()}
      WHERE r.id = $1
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ? mapRideRequest(result.rows[0]) : null;
}

export async function updateRideRequest(
  id: string,
  input: UpdateRideRequestInput & {
    current: ReturnType<typeof mapRideRequest>;
    rate_card_id?: string | null;
    pricing_snapshot?: Record<string, unknown>;
  },
) {
  await dbQuery(
    `
      UPDATE ride_requests
      SET
        pickup_location = $1,
        pickup_lat = $2,
        pickup_lng = $3,
        drop_location = $4,
        drop_lat = $5,
        drop_lng = $6,
        date = $7,
        time = $8,
        seats_required = $9,
        price_per_seat_paise = $10,
        pricing_area_type = $11,
        quoted_distance_km = $12,
        rate_card_id = $13,
        pricing_snapshot = $14::jsonb,
        counterparty_gender_preference = $15,
        notification_enabled = $16,
        notes = $17,
        status = $18,
        updated_at = now()
      WHERE id = $19
    `,
    [
      input.current.pickup_location,
      input.current.pickup_lat,
      input.current.pickup_lng,
      input.current.drop_location,
      input.current.drop_lat,
      input.current.drop_lng,
      input.current.date,
      input.current.time,
      input.current.seats_required,
      Math.round(input.current.price_per_seat * 100),
      input.current.pricing_area_type ?? null,
      input.current.quoted_distance_km ?? null,
      input.current.rate_card_id ?? null,
      JSON.stringify(input.current.pricing_snapshot ?? {}),
      input.current.counterparty_gender_preference ?? "any",
      input.current.notification_enabled ?? true,
      input.current.notes ?? null,
      input.current.status,
      id,
    ],
  );

  return findRideRequestById(id);
}

export async function listRideRequests(filters: ListRideRequestsQuery) {
  const values: Array<string | number> = [];
  const where: string[] = [
    "r.status = 'active'",
    "r.seats_required > 0",
    "r.date >= current_date",
  ];
  let distanceSelect = "";
  let orderBy = "r.created_at DESC";
  let locationFilter = "";

  if (filters.date) {
    values.push(filters.date);
    where.push(`r.date = $${values.length}`);
  }

  if (filters.pickup_lat !== undefined && filters.pickup_lng !== undefined) {
    values.push(filters.pickup_lat, filters.pickup_lng);
    const latIndex = values.length - 1;
    const lngIndex = values.length;
    const distanceExpression = buildDistanceExpression(latIndex, lngIndex, "r.pickup_lat", "r.pickup_lng");

    values.push(SEARCH_RADIUS_KM);
    const radiusIndex = values.length;

    distanceSelect = `, ${distanceExpression} AS "distanceKm"`;
    locationFilter = ` AND ${distanceExpression} <= $${radiusIndex}`;
    orderBy = `"distanceKm" ASC`;
  }

  const limit = filters.limit;
  const offset = (filters.page - 1) * filters.limit;

  const countQuery = `
    SELECT COUNT(*) AS count
    FROM ride_requests r
    WHERE ${where.join(" AND ")}${locationFilter}
  `;

  const countResult = await dbQuery<{ count: string }>(countQuery, values);
  const totalCount = Number(countResult.rows[0]?.count ?? 0);

  values.push(limit, offset);
  const limitIndex = values.length - 1;
  const offsetIndex = values.length;

  const listQuery = `
    SELECT
      ${rideRequestSelectColumns()}
      ${distanceSelect}
    ${rideRequestFromClause()}
    WHERE ${where.join(" AND ")}${locationFilter}
    ORDER BY ${orderBy}
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const result = await dbQuery<RideRequestRow>(listQuery, values);

  return {
    success: true,
    page: filters.page,
    limit: filters.limit,
    totalCount,
    totalPages: Math.ceil(totalCount / filters.limit),
    rides: result.rows.map(mapRideRequest),
  };
}
