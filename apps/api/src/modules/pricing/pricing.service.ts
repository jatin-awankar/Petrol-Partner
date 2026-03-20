import { AppError } from "../../shared/errors/app-error";
import type {
  CreateFareQuoteInput,
  CreateRateCardInput,
  ListRateCardsQuery,
  UpdateRateCardInput,
} from "./pricing.schema";
import * as pricingRepo from "./pricing.repo";

function paiseToRupees(value: number) {
  return value / 100;
}

function normalizeDateInput(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return new Date(value);
}

function computePricing(input: {
  rateCard: Awaited<ReturnType<typeof pricingRepo.findRateCardById>> extends infer T
    ? NonNullable<T>
    : never;
  distanceKm: number;
  seats: number;
}) {
  const rideFarePerSeatPaise = Math.max(
    input.rateCard.minimum_fare_paise,
    Math.round(
      input.rateCard.base_fare_paise + input.rateCard.per_km_paise * input.distanceKm,
    ),
  );
  const platformFeePerSeatPaise =
    input.rateCard.platform_fee_fixed_paise +
    Math.ceil((rideFarePerSeatPaise * input.rateCard.platform_fee_bps) / 10000);
  const totalPerSeatPaise = rideFarePerSeatPaise + platformFeePerSeatPaise;
  const totalRideFarePaise = rideFarePerSeatPaise * input.seats;
  const totalPlatformFeePaise = platformFeePerSeatPaise * input.seats;
  const totalPayablePaise = totalRideFarePaise + totalPlatformFeePaise;

  return {
    rideFarePerSeatPaise,
    platformFeePerSeatPaise,
    totalPerSeatPaise,
    totalRideFarePaise,
    totalPlatformFeePaise,
    totalPayablePaise,
    breakdown: {
      baseFarePaise: input.rateCard.base_fare_paise,
      perKmPaise: input.rateCard.per_km_paise,
      minimumFarePaise: input.rateCard.minimum_fare_paise,
      platformFeeFixedPaise: input.rateCard.platform_fee_fixed_paise,
      platformFeeBps: input.rateCard.platform_fee_bps,
      billableDistanceKm: Number(input.distanceKm.toFixed(2)),
    },
  };
}

export async function listRateCards(query: ListRateCardsQuery) {
  const rateCards = await pricingRepo.listRateCards({
    areaType: query.area_type,
    vehicleType: query.vehicle_type,
    activeOnly: query.active_only,
  });

  return { rate_cards: rateCards };
}

export async function createRateCard(input: CreateRateCardInput) {
  return pricingRepo.createRateCard({
    slug: input.slug,
    name: input.name,
    areaType: input.area_type,
    vehicleType: input.vehicle_type ?? null,
    baseFarePaise: input.base_fare_paise,
    perKmPaise: input.per_km_paise,
    minimumFarePaise: input.minimum_fare_paise,
    platformFeeFixedPaise: input.platform_fee_fixed_paise,
    platformFeeBps: input.platform_fee_bps,
    isActive: input.is_active,
    effectiveFrom: normalizeDateInput(input.effective_from) ?? new Date(),
    effectiveUntil: normalizeDateInput(input.effective_until) ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function updateRateCard(id: string, input: UpdateRateCardInput) {
  const current = await pricingRepo.findRateCardById(id);

  if (!current) {
    throw new AppError(404, "Rate card not found", "RATE_CARD_NOT_FOUND");
  }

  const effectiveFrom = input.effective_from
    ? new Date(input.effective_from)
    : current.effective_from
      ? new Date(current.effective_from)
      : new Date();
  const effectiveUntil =
    input.effective_until === undefined
      ? current.effective_until
        ? new Date(current.effective_until)
        : null
      : input.effective_until === null
        ? null
        : new Date(input.effective_until);

  const updated = await pricingRepo.updateRateCard(id, {
    slug: input.slug ?? current.slug,
    name: input.name ?? current.name,
    areaType: input.area_type ?? current.area_type,
    vehicleType:
      input.vehicle_type === undefined ? (current.vehicle_type ?? null) : (input.vehicle_type ?? null),
    baseFarePaise: input.base_fare_paise ?? current.base_fare_paise,
    perKmPaise: input.per_km_paise ?? current.per_km_paise,
    minimumFarePaise: input.minimum_fare_paise ?? current.minimum_fare_paise,
    platformFeeFixedPaise:
      input.platform_fee_fixed_paise ?? current.platform_fee_fixed_paise,
    platformFeeBps: input.platform_fee_bps ?? current.platform_fee_bps,
    isActive: input.is_active ?? current.is_active,
    effectiveFrom,
    effectiveUntil,
    metadata: input.metadata ?? current.metadata,
  });

  if (!updated) {
    throw new AppError(404, "Rate card not found", "RATE_CARD_NOT_FOUND");
  }

  return updated;
}

export async function createFareQuote(userId: string, input: CreateFareQuoteInput) {
  const rateCard = await pricingRepo.findActiveRateCard({
    areaType: input.area_type,
    vehicleType: input.vehicle_type,
  });

  if (!rateCard) {
    throw new AppError(404, "No active rate card found for this route", "RATE_CARD_NOT_FOUND");
  }

  const computed = computePricing({
    rateCard,
    distanceKm: input.distance_km,
    seats: input.seats,
  });

  const quote = await pricingRepo.createFareQuote({
    rateCardId: rateCard.id,
    createdByUserId: userId,
    areaType: input.area_type,
    distanceKm: Number(input.distance_km.toFixed(2)),
    seats: input.seats,
    rideFarePerSeatPaise: computed.rideFarePerSeatPaise,
    platformFeePerSeatPaise: computed.platformFeePerSeatPaise,
    totalPerSeatPaise: computed.totalPerSeatPaise,
    totalRideFarePaise: computed.totalRideFarePaise,
    totalPlatformFeePaise: computed.totalPlatformFeePaise,
    totalPayablePaise: computed.totalPayablePaise,
    breakdown: computed.breakdown,
  });

  return {
    ...quote,
    rate_card: rateCard,
  };
}

export async function buildRidePricingSnapshot(input: {
  areaType?: string;
  distanceKm?: number;
  vehicleType?: string;
  fallbackPricePerSeatPaise?: number;
}) {
  if (!input.areaType || !input.distanceKm) {
    if (input.fallbackPricePerSeatPaise === undefined) {
      throw new AppError(
        400,
        "Either provide price_per_seat or provide pricing_area_type and distance_km",
        "RIDE_PRICE_INPUT_REQUIRED",
      );
    }

    return {
      rateCardId: null,
      pricingAreaType: null,
      quotedDistanceKm: null,
      pricePerSeatPaise: input.fallbackPricePerSeatPaise,
      platformFeePerSeatPaise: 0,
      pricingSnapshot: {},
    };
  }

  const rateCard = await pricingRepo.findActiveRateCard({
    areaType: input.areaType,
    vehicleType: input.vehicleType,
  });

  if (!rateCard) {
    throw new AppError(404, "No active rate card found for this route", "RATE_CARD_NOT_FOUND");
  }

  const computed = computePricing({
    rateCard,
    distanceKm: input.distanceKm,
    seats: 1,
  });

  return {
    rateCardId: rateCard.id,
    pricingAreaType: input.areaType,
    quotedDistanceKm: Number(input.distanceKm.toFixed(2)),
    pricePerSeatPaise: computed.rideFarePerSeatPaise,
    platformFeePerSeatPaise: computed.platformFeePerSeatPaise,
    pricingSnapshot: {
      rateCardId: rateCard.id,
      rateCardSlug: rateCard.slug,
      areaType: input.areaType,
      distanceKm: Number(input.distanceKm.toFixed(2)),
      rideFarePerSeatPaise: computed.rideFarePerSeatPaise,
      rideFarePerSeat: paiseToRupees(computed.rideFarePerSeatPaise),
      platformFeePerSeatPaise: computed.platformFeePerSeatPaise,
      platformFeePerSeat: paiseToRupees(computed.platformFeePerSeatPaise),
      totalPerSeatPaise: computed.totalPerSeatPaise,
      totalPerSeat: paiseToRupees(computed.totalPerSeatPaise),
      breakdown: computed.breakdown,
    },
  };
}
