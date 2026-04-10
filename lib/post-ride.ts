export type PostMode = "offer" | "request";

export type PostRideFormData = {
  mode: PostMode;
  route: {
    pickup: string;
    dropoff: string;
    pickup_lat: number | null;
    pickup_lng: number | null;
    drop_lat: number | null;
    drop_lng: number | null;
  };
  schedule: {
    date: string;
    time: string;
    flexibility: number;
    recurring: {
      enabled: boolean;
      days: number[];
      endDate: string;
    };
  };
  availableSeats: number;
  seatsRequired: number;
  vehicle: {
    selectedId: string | null;
    make: string;
    model: string;
    year: string;
    type: string;
    fuel: string;
    color: string;
    features: string[];
  };
  pricing: {
    farePerSeat: number;
    paymentMethods: string[];
  };
  preferences: {
    gender: "any" | "male" | "female";
    notes: string;
  };
};

export type StepErrorMap = Record<string, string>;
export type StepMeta = {
  id: number;
  title: string;
  component: string;
  subtitle: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyText(value: string) {
  return value.trim().length > 0;
}

export function getStepErrors(
  step: number,
  state: PostRideFormData,
  currentMode: PostMode,
): StepErrorMap {
  const nextErrors: StepErrorMap = {};
  const seatsOffer = Number(state.availableSeats);
  const seatsRequest = Number(state.seatsRequired);
  const fareValue = Number(state.pricing.farePerSeat);
  const pickupLat = Number(state.route.pickup_lat);
  const pickupLng = Number(state.route.pickup_lng);
  const dropLat = Number(state.route.drop_lat);
  const dropLng = Number(state.route.drop_lng);

  if (step === 1) {
    if (!isNonEmptyText(state.route.pickup)) nextErrors.pickup = "Pickup required";
    if (!isNonEmptyText(state.route.dropoff)) nextErrors.dropoff = "Drop-off required";
    if (
      !Number.isFinite(pickupLat) ||
      !Number.isFinite(pickupLng) ||
      !Number.isFinite(dropLat) ||
      !Number.isFinite(dropLng)
    ) {
      nextErrors.routeCoordinates = "Select pickup and drop from search or map.";
    }
  }

  if (step === 2) {
    if (!state.schedule.date) nextErrors.date = "Date required";
    if (!state.schedule.time) nextErrors.time = "Time required";
  }

  if (step === 3) {
    if (currentMode === "offer" && (!Number.isFinite(seatsOffer) || seatsOffer < 1)) {
      nextErrors.availableSeats = "Select at least 1 seat";
    }
    if (currentMode === "request" && (!Number.isFinite(seatsRequest) || seatsRequest < 1)) {
      nextErrors.seatsRequired = "Select at least 1 seat";
    }
  }

  if (step === 4) {
    if (currentMode === "offer" && !state.vehicle.selectedId) {
      nextErrors.vehicle = "Select an approved vehicle from your profile";
    }
    if (currentMode === "request" && (!Number.isFinite(fareValue) || fareValue < 1)) {
      nextErrors.farePerSeat = "Set your max price per seat";
    }
  }

  if (step === 5 && currentMode === "offer" && (!Number.isFinite(fareValue) || fareValue < 1)) {
    nextErrors.farePerSeat = "Set a fare amount";
  }

  return nextErrors;
}

export function getAllStepErrors(
  steps: StepMeta[],
  state: PostRideFormData,
  currentMode: PostMode,
) {
  return steps.reduce<StepErrorMap>((acc, step) => {
    return {
      ...acc,
      ...getStepErrors(step.id, state, currentMode),
    };
  }, {});
}

type SharedRidePayload = {
  pickup_location: string;
  drop_location: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  date: string;
  time: string;
  price_per_seat: number;
  counterparty_gender_preference: "any" | "female_only" | "male_only";
  notification_enabled: true;
  notes?: string;
};

export type BuildOfferPayloadResult =
  | { ok: true; payload: SharedRidePayload & { available_seats: number; vehicle_id: string; vehicle_details?: Record<string, unknown> } }
  | { ok: false; error: string };

export type BuildRequestPayloadResult =
  | { ok: true; payload: SharedRidePayload & { seats_required: number } }
  | { ok: false; error: string };

function buildSharedPayload(formData: PostRideFormData): SharedRidePayload | null {
  const pickupLat = Number(formData.route.pickup_lat);
  const pickupLng = Number(formData.route.pickup_lng);
  const dropLat = Number(formData.route.drop_lat);
  const dropLng = Number(formData.route.drop_lng);
  const pricePerSeat = Number(formData.pricing.farePerSeat);

  if (
    !isNonEmptyText(formData.route.pickup) ||
    !isNonEmptyText(formData.route.dropoff) ||
    !isFiniteNumber(pickupLat) ||
    !isFiniteNumber(pickupLng) ||
    !isFiniteNumber(dropLat) ||
    !isFiniteNumber(dropLng) ||
    !isFiniteNumber(pricePerSeat) ||
    pricePerSeat < 1
  ) {
    return null;
  }

  return {
    pickup_location: formData.route.pickup.trim(),
    drop_location: formData.route.dropoff.trim(),
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    drop_lat: dropLat,
    drop_lng: dropLng,
    date: formData.schedule.date,
    time: formData.schedule.time,
    price_per_seat: pricePerSeat,
    counterparty_gender_preference:
      formData.preferences.gender === "female"
        ? "female_only"
        : formData.preferences.gender === "male"
          ? "male_only"
          : "any",
    notification_enabled: true,
    notes: formData.preferences.notes || undefined,
  };
}

export function buildRideOfferPayload(formData: PostRideFormData): BuildOfferPayloadResult {
  const sharedPayload = buildSharedPayload(formData);
  if (!sharedPayload) {
    return {
      ok: false,
      error: "Route and pricing fields are invalid. Please reselect values.",
    };
  }

  const availableSeats = Number(formData.availableSeats);
  if (!isFiniteNumber(availableSeats) || availableSeats < 1) {
    return { ok: false, error: "Invalid seat count. Please update seats." };
  }

  if (!formData.vehicle.selectedId) {
    return { ok: false, error: "Please select an approved active vehicle." };
  }

  return {
    ok: true,
    payload: {
      ...sharedPayload,
      available_seats: availableSeats,
      vehicle_id: formData.vehicle.selectedId,
      vehicle_details: formData.vehicle.make
        ? {
            make: formData.vehicle.make,
            model: formData.vehicle.model || "",
            year: formData.vehicle.year || "",
            color: formData.vehicle.color || "",
            fuelType: formData.vehicle.fuel || "",
            features: formData.vehicle.features || [],
          }
        : undefined,
    },
  };
}

export function buildRideRequestPayload(formData: PostRideFormData): BuildRequestPayloadResult {
  const sharedPayload = buildSharedPayload(formData);
  if (!sharedPayload) {
    return {
      ok: false,
      error: "Route and pricing fields are invalid. Please reselect values.",
    };
  }

  const seatsRequired = Number(formData.seatsRequired);
  if (!isFiniteNumber(seatsRequired) || seatsRequired < 1) {
    return { ok: false, error: "Invalid seat requirement. Please update seats." };
  }

  return {
    ok: true,
    payload: {
      ...sharedPayload,
      seats_required: seatsRequired,
    },
  };
}
