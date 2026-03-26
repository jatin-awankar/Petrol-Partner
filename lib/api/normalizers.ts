export interface FrontendUserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  college?: string;
  profile_image?: string;
  is_verified: boolean;
  role: string;
  created_at: string;
  updated_at?: string;
  avg_rating?: number;
}

export interface FrontendVehicle {
  id: string;
  make: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
  seats: string;
  fuelType: string;
  photo?: string;
  isVerified?: boolean;
  status?: string;
  verificationStatus?: string;
}

export function normalizeUserProfile(user: any): FrontendUserProfile {
  return {
    id: user.id,
    full_name: user.fullName ?? user.full_name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? undefined,
    college: user.college ?? undefined,
    profile_image: user.avatarUrl ?? user.profile_image ?? undefined,
    is_verified: Boolean(user.isVerified ?? user.is_verified),
    role: user.role ?? "user",
    created_at: user.createdAt ?? user.created_at ?? new Date().toISOString(),
    updated_at: user.updatedAt ?? user.updated_at ?? undefined,
    avg_rating: Number(user.avgRating ?? user.avg_rating ?? 0),
  };
}

export function normalizeVerificationVehicle(vehicle: any): FrontendVehicle {
  const metadata = vehicle.metadata ?? {};
  const licensePlateSuffix =
    vehicle.registration_number_last4 ?? vehicle.registrationNumberLast4 ?? "";

  return {
    id: vehicle.id,
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    year:
      typeof metadata.year === "string" || typeof metadata.year === "number"
        ? String(metadata.year)
        : "",
    color: vehicle.color ?? "",
    licensePlate: licensePlateSuffix,
    seats: String(vehicle.seat_capacity ?? vehicle.seatCapacity ?? ""),
    fuelType:
      typeof metadata.fuelType === "string"
        ? metadata.fuelType
        : typeof metadata.fuel_type === "string"
          ? metadata.fuel_type
          : "petrol",
    photo:
      typeof metadata.photo === "string"
        ? metadata.photo
        : typeof metadata.photoUrl === "string"
          ? metadata.photoUrl
          : undefined,
    isVerified:
      (vehicle.verification_status ?? vehicle.verificationStatus) === "approved",
    status: vehicle.status,
    verificationStatus:
      vehicle.verification_status ?? vehicle.verificationStatus ?? undefined,
  };
}

export function normalizeRideSummary(ride: any, type: "offer" | "request") {
  return {
    ...ride,
    type,
    full_name:
      ride.full_name ??
      ride.driver_name ??
      ride.passenger_name ??
      ride.other_user_name ??
      "Unknown User",
    profile_image:
      ride.profile_image ??
      ride.driver_image ??
      ride.passenger_image ??
      ride.other_user_avatar_url ??
      undefined,
    price_per_seat: Number(ride.price_per_seat ?? 0),
    available_seats:
      ride.available_seats !== undefined && ride.available_seats !== null
        ? Number(ride.available_seats)
        : undefined,
    seats_required:
      ride.seats_required !== undefined && ride.seats_required !== null
        ? Number(ride.seats_required)
        : undefined,
    pickup_lat: Number(ride.pickup_lat ?? 0),
    pickup_lng: Number(ride.pickup_lng ?? 0),
    drop_lat: Number(ride.drop_lat ?? 0),
    drop_lng: Number(ride.drop_lng ?? 0),
    avg_rating: Number(ride.avg_rating ?? 0),
  };
}

export function normalizeRideListResponse(
  payload: any,
  type: "offer" | "request",
): FetchRides {
  const rides = Array.isArray(payload?.rides) ? payload.rides : [];

  return {
    page: Number(payload?.page ?? 1),
    limit: Number(payload?.limit ?? rides.length ?? 0),
    totalCount: Number(payload?.totalCount ?? rides.length ?? 0),
    totalPages: Number(payload?.totalPages ?? 1),
    rides: rides.map((ride: any) => normalizeRideSummary(ride, type)),
  };
}

export function normalizeBooking(booking: any) {
  return {
    ...booking,
    total_price:
      booking.total_price ??
      (booking.total_amount_paise !== undefined
        ? Number(booking.total_amount_paise) / 100
        : 0),
    other_user_avatar_url:
      booking.other_user_avatar_url ?? booking.profile_image ?? undefined,
  };
}
