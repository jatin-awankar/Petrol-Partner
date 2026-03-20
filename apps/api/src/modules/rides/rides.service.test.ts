import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../matching/matching.service", () => ({
  requestMatchRefresh: vi.fn(async () => undefined),
}));

vi.mock("../pricing/pricing.service", () => ({
  buildRidePricingSnapshot: vi.fn(async () => ({
    rateCardId: "rate-card-1",
    pricingAreaType: "urban",
    quotedDistanceKm: 12,
    pricePerSeatPaise: 8000,
    platformFeePerSeatPaise: 500,
    pricingSnapshot: {
      rateCardId: "rate-card-1",
    },
  })),
}));

vi.mock("../settlements/settlements.service", () => ({
  assertUserCanTransact: vi.fn(async () => undefined),
}));

vi.mock("../verification/verification.service", () => ({
  assertApprovedDriverCanOfferRide: vi.fn(async () => ({
    id: "vehicle-1",
  })),
}));

vi.mock("./rides.repo", () => ({
  createRideOffer: vi.fn(async () => ({
    id: "offer-1",
    driver_id: "user-1",
    vehicle_id: "vehicle-1",
  })),
}));

import * as settlementsService from "../settlements/settlements.service";
import * as verificationService from "../verification/verification.service";
import * as ridesRepo from "./rides.repo";
import * as ridesService from "./rides.service";

describe("rides.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires approved driver eligibility and vehicle before creating an offer", async () => {
    const result = await ridesService.createRideOffer("user-1", {
      pickup_location: "A",
      drop_location: "B",
      pickup_lat: 1,
      pickup_lng: 2,
      drop_lat: 3,
      drop_lng: 4,
      available_seats: 2,
      price_per_seat: 80,
      date: "2026-03-20",
      time: "10:00",
      vehicle_id: "vehicle-1",
      counterparty_gender_preference: "any",
      notification_enabled: true,
    });

    expect(result).toMatchObject({
      id: "offer-1",
      vehicle_id: "vehicle-1",
    });
    expect(settlementsService.assertUserCanTransact).toHaveBeenCalledWith("user-1");
    expect(verificationService.assertApprovedDriverCanOfferRide).toHaveBeenCalledWith(
      "user-1",
      "vehicle-1",
    );
    expect(ridesRepo.createRideOffer).toHaveBeenCalledOnce();
  });
});
