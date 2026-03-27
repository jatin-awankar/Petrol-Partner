import { apiRequest, ApiError, serverApiRequest } from "./client";
import {
  normalizeBooking,
  normalizeRideListResponse,
  normalizeUserProfile,
  normalizeVerificationVehicle,
} from "./normalizers";

export interface BackendAuthUser {
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

export async function loginWithBackend(input: {
  email: string;
  password: string;
}) {
  const response = await apiRequest<{ user: any }>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return {
    user: normalizeUserProfile(response.user),
  };
}

export async function registerWithBackend(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  college?: string;
}) {
  const response = await apiRequest<{ user: any }>("/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return {
    user: normalizeUserProfile(response.user),
  };
}

export async function logoutFromBackend() {
  await apiRequest<void>("/v1/auth/logout", {
    method: "POST",
  });
}

export async function getCurrentUserFromBackend() {
  const response = await apiRequest<{ user: any }>("/v1/auth/me");
  return normalizeUserProfile(response.user);
}

export async function getCurrentUserFromBackendServer(cookieHeader: string) {
  try {
    const response = await serverApiRequest<{ user: any }>("/v1/auth/me", {
      cookieHeader,
    });

    return normalizeUserProfile(response.user);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 503)) {
      return null;
    }

    throw error;
  }
}

export async function getVerificationOverview() {
  const response = await apiRequest<{
    student_verification: any;
    driver_eligibility: any;
    vehicles: any[];
  }>("/v1/verification/overview");

  return {
    studentVerification: response.student_verification,
    driverEligibility: response.driver_eligibility,
    vehicles: Array.isArray(response.vehicles)
      ? response.vehicles.map(normalizeVerificationVehicle)
      : [],
  };
}

export async function createVehicleRecord(input: {
  vehicle_type: string;
  make?: string;
  model?: string;
  color?: string;
  registration_number_last4: string;
  seat_capacity: number;
  metadata?: Record<string, unknown>;
}) {
  const response = await apiRequest<{ vehicle: any }>("/v1/verification/vehicles", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeVerificationVehicle(response.vehicle);
}

export async function updateVehicleRecord(
  vehicleId: string,
  input: Record<string, unknown>,
) {
  const response = await apiRequest<{ vehicle: any }>(
    `/v1/verification/vehicles/${vehicleId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

  return normalizeVerificationVehicle(response.vehicle);
}

export async function listRideOffers(input: {
  page?: number;
  limit?: number;
  pickup_lat?: number;
  pickup_lng?: number;
  date?: string;
}) {
  const query = new URLSearchParams();
  const normalizedDate = input.date?.includes("T")
    ? input.date.split("T")[0]
    : input.date;

  if (input.page) {
    query.set("page", String(input.page));
  }

  if (input.limit) {
    query.set("limit", String(input.limit));
  }

  if (input.pickup_lat !== undefined) {
    query.set("pickup_lat", String(input.pickup_lat));
  }

  if (input.pickup_lng !== undefined) {
    query.set("pickup_lng", String(input.pickup_lng));
  }

  if (normalizedDate) {
    query.set("date", normalizedDate);
  }

  const payload = await apiRequest<any>(`/v1/rides/offers?${query.toString()}`);
  return normalizeRideListResponse(payload, "offer");
}

export async function listRideRequests(input: {
  page?: number;
  limit?: number;
  pickup_lat?: number;
  pickup_lng?: number;
  date?: string;
}) {
  const query = new URLSearchParams();
  const normalizedDate = input.date?.includes("T")
    ? input.date.split("T")[0]
    : input.date;

  if (input.page) {
    query.set("page", String(input.page));
  }

  if (input.limit) {
    query.set("limit", String(input.limit));
  }

  if (input.pickup_lat !== undefined) {
    query.set("pickup_lat", String(input.pickup_lat));
  }

  if (input.pickup_lng !== undefined) {
    query.set("pickup_lng", String(input.pickup_lng));
  }

  if (normalizedDate) {
    query.set("date", normalizedDate);
  }

  const payload = await apiRequest<any>(`/v1/rides/requests?${query.toString()}`);
  return normalizeRideListResponse(payload, "request");
}

export async function getRideOffer(rideId: string) {
  const payload = await apiRequest<{ ride: any }>(`/v1/rides/offers/${rideId}`);
  return payload.ride;
}

export async function getRideRequest(rideId: string) {
  const payload = await apiRequest<{ ride: any }>(`/v1/rides/requests/${rideId}`);
  return payload.ride;
}

export async function createRideOfferRecord(input: Record<string, unknown>) {
  const payload = await apiRequest<{ ride_offer: any }>("/v1/rides/offers", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload.ride_offer;
}

export async function createRideRequestRecord(input: Record<string, unknown>) {
  const payload = await apiRequest<{ ride_request: any }>("/v1/rides/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload.ride_request;
}

export async function listBookings(input: { limit?: number; offset?: number }) {
  const query = new URLSearchParams();

  if (input.limit !== undefined) {
    query.set("limit", String(input.limit));
  }

  if (input.offset !== undefined) {
    query.set("offset", String(input.offset));
  }

  const payload = await apiRequest<any>(`/v1/bookings?${query.toString()}`);

  return {
    bookings: Array.isArray(payload.bookings)
      ? payload.bookings.map(normalizeBooking)
      : [],
    pagination: payload.pagination,
  };
}

export async function createBookingRecord(input: {
  ride_offer_id?: string;
  ride_request_id?: string;
  seats_booked?: number;
}) {
  const payload = await apiRequest<{ booking: any }>("/v1/bookings", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeBooking(payload.booking);
}

export async function updateBookingStatusLegacy(input: {
  booking_id: string;
  new_status: "confirmed" | "cancelled" | "completed";
  reason?: string;
}) {
  const payload = await apiRequest<{ booking: any }>("/v1/bookings/status", {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return normalizeBooking(payload.booking);
}

export async function getSettlementByBooking(bookingId: string) {
  const payload = await apiRequest<{ settlement: any }>(
    `/v1/settlements/bookings/${bookingId}`,
  );

  return payload.settlement;
}

export async function markSettlementPassengerPaid(
  bookingId: string,
  input: {
    payment_method: "cash" | "upi" | "online";
    note?: string;
  },
) {
  const payload = await apiRequest<{ settlement: any }>(
    `/v1/settlements/bookings/${bookingId}/passenger-paid`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return payload.settlement;
}

export async function confirmOfflineSettlement(
  bookingId: string,
  input: {
    payment_method?: "cash" | "upi";
    note?: string;
  },
) {
  const payload = await apiRequest<{ settlement: any }>(
    `/v1/settlements/bookings/${bookingId}/confirm-offline-received`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return payload.settlement;
}

export async function getFinancialHoldStatus() {
  return apiRequest<any>("/v1/settlements/financial-hold");
}

export async function createPaymentOrder(input: { bookingId: string }) {
  return apiRequest<any>("/v1/payments/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitClientPaymentVerification(input: {
  bookingId: string;
  providerOrderId: string;
  providerPaymentId: string;
  providerSignature: string;
}) {
  return apiRequest<any>("/v1/payments/client-verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getBookingPaymentStatus(bookingId: string) {
  return apiRequest<any>(`/v1/payments/bookings/${bookingId}/status`);
}
