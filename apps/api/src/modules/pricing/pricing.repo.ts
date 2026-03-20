import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

interface PricingRateCardRow {
  id: string;
  slug: string;
  name: string;
  area_type: string;
  vehicle_type: string | null;
  base_fare_paise: number;
  per_km_paise: number;
  minimum_fare_paise: number;
  platform_fee_fixed_paise: number;
  platform_fee_bps: number;
  is_active: boolean;
  effective_from: Date | string;
  effective_until: Date | string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface FareQuoteRow {
  id: string;
  rate_card_id: string;
  created_by_user_id: string | null;
  area_type: string;
  distance_km: string | number;
  seats: number;
  ride_fare_per_seat_paise: number;
  platform_fee_per_seat_paise: number;
  total_per_seat_paise: number;
  total_ride_fare_paise: number;
  total_platform_fee_paise: number;
  total_payable_paise: number;
  breakdown: Record<string, unknown>;
  created_at: Date | string;
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function paiseToRupees(value: number) {
  return value / 100;
}

function mapRateCard(row: PricingRateCardRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    area_type: row.area_type,
    vehicle_type: row.vehicle_type,
    base_fare_paise: row.base_fare_paise,
    base_fare: paiseToRupees(row.base_fare_paise),
    per_km_paise: row.per_km_paise,
    per_km: paiseToRupees(row.per_km_paise),
    minimum_fare_paise: row.minimum_fare_paise,
    minimum_fare: paiseToRupees(row.minimum_fare_paise),
    platform_fee_fixed_paise: row.platform_fee_fixed_paise,
    platform_fee_fixed: paiseToRupees(row.platform_fee_fixed_paise),
    platform_fee_bps: row.platform_fee_bps,
    is_active: row.is_active,
    effective_from: toIso(row.effective_from),
    effective_until: toIso(row.effective_until),
    metadata: row.metadata ?? {},
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapFareQuote(row: FareQuoteRow) {
  const distanceKm = Number(row.distance_km);

  return {
    id: row.id,
    rate_card_id: row.rate_card_id,
    created_by_user_id: row.created_by_user_id,
    area_type: row.area_type,
    distance_km: distanceKm,
    seats: row.seats,
    ride_fare_per_seat_paise: row.ride_fare_per_seat_paise,
    ride_fare_per_seat: paiseToRupees(row.ride_fare_per_seat_paise),
    platform_fee_per_seat_paise: row.platform_fee_per_seat_paise,
    platform_fee_per_seat: paiseToRupees(row.platform_fee_per_seat_paise),
    total_per_seat_paise: row.total_per_seat_paise,
    total_per_seat: paiseToRupees(row.total_per_seat_paise),
    total_ride_fare_paise: row.total_ride_fare_paise,
    total_ride_fare: paiseToRupees(row.total_ride_fare_paise),
    total_platform_fee_paise: row.total_platform_fee_paise,
    total_platform_fee: paiseToRupees(row.total_platform_fee_paise),
    total_payable_paise: row.total_payable_paise,
    total_payable: paiseToRupees(row.total_payable_paise),
    breakdown: row.breakdown ?? {},
    created_at: toIso(row.created_at),
  };
}

export async function listRateCards(input: {
  areaType?: string;
  vehicleType?: string;
  activeOnly: boolean;
}) {
  const filters: string[] = [];
  const params: unknown[] = [];
  let parameterIndex = 1;

  if (input.activeOnly) {
    filters.push("is_active = true");
    filters.push("effective_from <= now()");
    filters.push("(effective_until IS NULL OR effective_until > now())");
  }

  if (input.areaType) {
    filters.push(`area_type = $${parameterIndex}`);
    params.push(input.areaType);
    parameterIndex += 1;
  }

  if (input.vehicleType) {
    filters.push(`(vehicle_type = $${parameterIndex} OR vehicle_type IS NULL)`);
    params.push(input.vehicleType);
    parameterIndex += 1;
  }

  const result = await dbQuery<PricingRateCardRow>(
    `SELECT
       id,
       slug,
       name,
       area_type,
       vehicle_type,
       base_fare_paise,
       per_km_paise,
       minimum_fare_paise,
       platform_fee_fixed_paise,
       platform_fee_bps,
       is_active,
       effective_from,
       effective_until,
       metadata,
       created_at,
       updated_at
     FROM pricing_rate_cards
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY
       area_type ASC,
       CASE WHEN vehicle_type IS NULL THEN 1 ELSE 0 END ASC,
       effective_from DESC,
       created_at DESC`,
    params,
  );

  return result.rows.map(mapRateCard);
}

export async function findRateCardById(id: string) {
  const result = await dbQuery<PricingRateCardRow>(
    `SELECT
       id,
       slug,
       name,
       area_type,
       vehicle_type,
       base_fare_paise,
       per_km_paise,
       minimum_fare_paise,
       platform_fee_fixed_paise,
       platform_fee_bps,
       is_active,
       effective_from,
       effective_until,
       metadata,
       created_at,
       updated_at
     FROM pricing_rate_cards
     WHERE id = $1
     LIMIT 1`,
    [id],
  );

  return result.rows[0] ? mapRateCard(result.rows[0]) : null;
}

export async function findActiveRateCard(input: {
  areaType: string;
  vehicleType?: string;
}) {
  const params: unknown[] = [input.areaType];
  let vehicleCondition = "vehicle_type IS NULL";

  if (input.vehicleType) {
    params.push(input.vehicleType);
    vehicleCondition = "(vehicle_type = $2 OR vehicle_type IS NULL)";
  }

  const result = await dbQuery<PricingRateCardRow>(
    `SELECT
       id,
       slug,
       name,
       area_type,
       vehicle_type,
       base_fare_paise,
       per_km_paise,
       minimum_fare_paise,
       platform_fee_fixed_paise,
       platform_fee_bps,
       is_active,
       effective_from,
       effective_until,
       metadata,
       created_at,
       updated_at
     FROM pricing_rate_cards
     WHERE area_type = $1
       AND is_active = true
       AND effective_from <= now()
       AND (effective_until IS NULL OR effective_until > now())
       AND ${vehicleCondition}
     ORDER BY
       CASE
         WHEN vehicle_type IS NOT NULL ${input.vehicleType ? "AND vehicle_type = $2" : ""} THEN 0
         ELSE 1
       END ASC,
       effective_from DESC,
       created_at DESC
     LIMIT 1`,
    params,
  );

  return result.rows[0] ? mapRateCard(result.rows[0]) : null;
}

export async function createRateCard(
  input: {
    slug: string;
    name: string;
    areaType: string;
    vehicleType: string | null;
    baseFarePaise: number;
    perKmPaise: number;
    minimumFarePaise: number;
    platformFeeFixedPaise: number;
    platformFeeBps: number;
    isActive: boolean;
    effectiveFrom: Date | string;
    effectiveUntil: Date | string | null;
    metadata: Record<string, unknown>;
  },
  client?: PoolClient,
) {
  const queryText = `INSERT INTO pricing_rate_cards (
       slug,
       name,
       area_type,
       vehicle_type,
       base_fare_paise,
       per_km_paise,
       minimum_fare_paise,
       platform_fee_fixed_paise,
       platform_fee_bps,
       is_active,
       effective_from,
       effective_until,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
     RETURNING
       id,
       slug,
       name,
       area_type,
       vehicle_type,
       base_fare_paise,
       per_km_paise,
       minimum_fare_paise,
       platform_fee_fixed_paise,
       platform_fee_bps,
       is_active,
       effective_from,
       effective_until,
       metadata,
       created_at,
       updated_at`;
  const params = [
    input.slug,
    input.name,
    input.areaType,
    input.vehicleType,
    input.baseFarePaise,
    input.perKmPaise,
    input.minimumFarePaise,
    input.platformFeeFixedPaise,
    input.platformFeeBps,
    input.isActive,
    input.effectiveFrom,
    input.effectiveUntil,
    JSON.stringify(input.metadata),
  ];
  const result = client
    ? await client.query<PricingRateCardRow>(queryText, params)
    : await dbQuery<PricingRateCardRow>(queryText, params);

  return mapRateCard(result.rows[0]);
}

export async function updateRateCard(
  id: string,
  input: {
    slug: string;
    name: string;
    areaType: string;
    vehicleType: string | null;
    baseFarePaise: number;
    perKmPaise: number;
    minimumFarePaise: number;
    platformFeeFixedPaise: number;
    platformFeeBps: number;
    isActive: boolean;
    effectiveFrom: Date | string;
    effectiveUntil: Date | string | null;
    metadata: Record<string, unknown>;
  },
  client?: PoolClient,
) {
  const queryText = `UPDATE pricing_rate_cards
     SET slug = $2,
         name = $3,
         area_type = $4,
         vehicle_type = $5,
         base_fare_paise = $6,
         per_km_paise = $7,
         minimum_fare_paise = $8,
         platform_fee_fixed_paise = $9,
         platform_fee_bps = $10,
         is_active = $11,
         effective_from = $12,
         effective_until = $13,
         metadata = $14::jsonb,
         updated_at = now()
     WHERE id = $1
     RETURNING
       id,
       slug,
       name,
       area_type,
       vehicle_type,
       base_fare_paise,
       per_km_paise,
       minimum_fare_paise,
       platform_fee_fixed_paise,
       platform_fee_bps,
       is_active,
       effective_from,
       effective_until,
       metadata,
       created_at,
       updated_at`;
  const params = [
    id,
    input.slug,
    input.name,
    input.areaType,
    input.vehicleType,
    input.baseFarePaise,
    input.perKmPaise,
    input.minimumFarePaise,
    input.platformFeeFixedPaise,
    input.platformFeeBps,
    input.isActive,
    input.effectiveFrom,
    input.effectiveUntil,
    JSON.stringify(input.metadata),
  ];
  const result = client
    ? await client.query<PricingRateCardRow>(queryText, params)
    : await dbQuery<PricingRateCardRow>(queryText, params);

  return result.rows[0] ? mapRateCard(result.rows[0]) : null;
}

export async function createFareQuote(
  input: {
    rateCardId: string;
    createdByUserId: string | null;
    areaType: string;
    distanceKm: number;
    seats: number;
    rideFarePerSeatPaise: number;
    platformFeePerSeatPaise: number;
    totalPerSeatPaise: number;
    totalRideFarePaise: number;
    totalPlatformFeePaise: number;
    totalPayablePaise: number;
    breakdown: Record<string, unknown>;
  },
  client?: PoolClient,
) {
  const queryText = `INSERT INTO fare_quotes (
       rate_card_id,
       created_by_user_id,
       area_type,
       distance_km,
       seats,
       ride_fare_per_seat_paise,
       platform_fee_per_seat_paise,
       total_per_seat_paise,
       total_ride_fare_paise,
       total_platform_fee_paise,
       total_payable_paise,
       breakdown
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     RETURNING
       id,
       rate_card_id,
       created_by_user_id,
       area_type,
       distance_km,
       seats,
       ride_fare_per_seat_paise,
       platform_fee_per_seat_paise,
       total_per_seat_paise,
       total_ride_fare_paise,
       total_platform_fee_paise,
       total_payable_paise,
       breakdown,
       created_at`;
  const params = [
    input.rateCardId,
    input.createdByUserId,
    input.areaType,
    input.distanceKm,
    input.seats,
    input.rideFarePerSeatPaise,
    input.platformFeePerSeatPaise,
    input.totalPerSeatPaise,
    input.totalRideFarePaise,
    input.totalPlatformFeePaise,
    input.totalPayablePaise,
    JSON.stringify(input.breakdown),
  ];
  const result = client
    ? await client.query<FareQuoteRow>(queryText, params)
    : await dbQuery<FareQuoteRow>(queryText, params);

  return mapFareQuote(result.rows[0]);
}
