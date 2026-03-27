import { logger } from "../../config/logger";
import { AppError } from "../../shared/errors/app-error";
import type {
  CreateRideOfferInput,
  CreateRideRequestInput,
  ListRideOffersQuery,
  ListRideRequestsQuery,
  UpdateRideOfferInput,
  UpdateRideRequestInput,
} from "./rides.schema";
import * as matchingService from "../matching/matching.service";
import * as pricingService from "../pricing/pricing.service";
import * as settlementsService from "../settlements/settlements.service";
import * as verificationService from "../verification/verification.service";
import * as ridesRepo from "./rides.repo";

function normalizeVehicleDetails(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }

  return value;
}

function triggerMatchRefresh(userId: string) {
  void matchingService.requestMatchRefresh(userId).catch((error) => {
    logger.warn({ error, userId }, "Best-effort match refresh failed after ride mutation");
  });
}

async function buildCreateRidePricing(
  input: CreateRideOfferInput | CreateRideRequestInput,
) {
  const manualPricePaise =
    input.price_per_seat !== undefined ? Math.round(input.price_per_seat * 100) : undefined;
  const pricing = await pricingService.buildRidePricingSnapshot({
    areaType: input.pricing_area_type,
    distanceKm: input.distance_km,
    fallbackPricePerSeatPaise: manualPricePaise,
  });

  return {
    ...input,
    price_per_seat: pricing.pricePerSeatPaise / 100,
    pricing_area_type: pricing.pricingAreaType ?? undefined,
    distance_km: pricing.quotedDistanceKm ?? undefined,
    rate_card_id: pricing.rateCardId ?? undefined,
    pricing_snapshot: pricing.pricingSnapshot,
  };
}

async function buildUpdatedRidePricing(
  current: {
    price_per_seat?: number;
    pricing_area_type?: string | null;
    quoted_distance_km?: number | null;
    rate_card_id?: string | null;
    pricing_snapshot?: Record<string, unknown>;
    [key: string]: unknown;
  },
  patch: {
    price_per_seat?: number;
    pricing_area_type?: string;
    distance_km?: number;
    [key: string]: unknown;
  },
) {
  const nextManualPrice =
    patch.price_per_seat !== undefined ? Math.round(patch.price_per_seat * 100) : undefined;
  const pricingInputsChanged =
    patch.pricing_area_type !== undefined || patch.distance_km !== undefined;

  if (patch.price_per_seat !== undefined && !pricingInputsChanged) {
    return {
      ...current,
      ...patch,
      rate_card_id: null,
      pricing_snapshot: {},
      pricing_area_type: undefined,
      quoted_distance_km: undefined,
    };
  }

  if (!pricingInputsChanged) {
    return {
      ...current,
      ...patch,
    };
  }

  const pricing = await pricingService.buildRidePricingSnapshot({
    areaType:
      patch.pricing_area_type ?? (current.pricing_area_type as string | undefined) ?? undefined,
    distanceKm:
      patch.distance_km ?? (current.quoted_distance_km as number | undefined) ?? undefined,
    fallbackPricePerSeatPaise: nextManualPrice,
  });

  return {
    ...current,
    ...patch,
    price_per_seat: pricing.pricePerSeatPaise / 100,
    pricing_area_type: pricing.pricingAreaType ?? undefined,
    quoted_distance_km: pricing.quotedDistanceKm ?? undefined,
    rate_card_id: pricing.rateCardId ?? undefined,
    pricing_snapshot: pricing.pricingSnapshot,
  };
}

export async function createRideOffer(driverId: string, input: CreateRideOfferInput) {
  await settlementsService.assertUserCanTransact(driverId);
  await verificationService.assertApprovedDriverCanOfferRide(driverId, input.vehicle_id);

  const pricingAwareInput = (await buildCreateRidePricing(input)) as CreateRideOfferInput & {
    rate_card_id?: string | null;
    pricing_snapshot?: Record<string, unknown>;
  };
  const rideOffer = await ridesRepo.createRideOffer(driverId, {
    ...pricingAwareInput,
    vehicle_details: normalizeVehicleDetails(input.vehicle_details),
  });

  triggerMatchRefresh(driverId);

  return rideOffer;
}

export function listRideOffers(filters: ListRideOffersQuery) {
  return ridesRepo.listRideOffers(filters);
}

export async function getRideOfferById(id: string) {
  const ride = await ridesRepo.findRideOfferById(id);

  if (!ride) {
    throw new AppError(404, "Ride not found", "RIDE_NOT_FOUND");
  }

  return ride;
}

export async function updateRideOffer(
  id: string,
  driverId: string,
  input: UpdateRideOfferInput,
) {
  const current = await getRideOfferById(id);

  if (current.driver_id !== driverId) {
    throw new AppError(403, "Unauthorized", "FORBIDDEN");
  }

  const pricingAwareCurrent = (await buildUpdatedRidePricing(current, {
    ...input,
  })) as typeof current;
  const nextStatus = input.status ?? current.status;
  const nextVehicleId = input.vehicle_id ?? current.vehicle_id;

  if (nextStatus === "active") {
    await settlementsService.assertUserCanTransact(driverId);
    await verificationService.assertApprovedDriverCanOfferRide(driverId, nextVehicleId);
  }

  const updatedRide = await ridesRepo.updateRideOffer(id, {
    ...input,
    current: {
      ...pricingAwareCurrent,
      vehicle_details:
        input.vehicle_details === undefined
          ? current.vehicle_details
          : normalizeVehicleDetails(input.vehicle_details),
      status: nextStatus,
    },
  });

  if (!updatedRide) {
    throw new AppError(404, "Ride not found", "RIDE_NOT_FOUND");
  }

  triggerMatchRefresh(driverId);

  return updatedRide;
}

export async function createRideRequest(passengerId: string, input: CreateRideRequestInput) {
  await settlementsService.assertUserCanTransact(passengerId);

  const pricingAwareInput = (await buildCreateRidePricing(input)) as CreateRideRequestInput & {
    rate_card_id?: string | null;
    pricing_snapshot?: Record<string, unknown>;
  };
  const rideRequest = await ridesRepo.createRideRequest(passengerId, pricingAwareInput);

  triggerMatchRefresh(passengerId);

  return rideRequest;
}

export function listRideRequests(filters: ListRideRequestsQuery) {
  return ridesRepo.listRideRequests(filters);
}

export async function getRideRequestById(id: string) {
  const ride = await ridesRepo.findRideRequestById(id);

  if (!ride) {
    throw new AppError(404, "Ride request not found", "RIDE_REQUEST_NOT_FOUND");
  }

  return ride;
}

export async function updateRideRequest(
  id: string,
  passengerId: string,
  input: UpdateRideRequestInput,
) {
  const current = await getRideRequestById(id);

  if (current.passenger_id !== passengerId) {
    throw new AppError(403, "Unauthorized", "FORBIDDEN");
  }

  const pricingAwareCurrent = (await buildUpdatedRidePricing(current, {
    ...input,
  })) as typeof current;
  const nextStatus = input.status ?? current.status;

  if (nextStatus === "active") {
    await settlementsService.assertUserCanTransact(passengerId);
  }

  const updatedRequest = await ridesRepo.updateRideRequest(id, {
    ...input,
    current: {
      ...pricingAwareCurrent,
      status: nextStatus,
    },
  });

  if (!updatedRequest) {
    throw new AppError(404, "Ride request not found", "RIDE_REQUEST_NOT_FOUND");
  }

  triggerMatchRefresh(passengerId);

  return updatedRequest;
}
