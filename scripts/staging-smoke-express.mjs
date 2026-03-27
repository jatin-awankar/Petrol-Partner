/* eslint-disable no-console */

const API_BASE_URL = process.env.SMOKE_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

const PASSENGER_EMAIL = process.env.SMOKE_PASSENGER_EMAIL;
const PASSENGER_PASSWORD = process.env.SMOKE_PASSENGER_PASSWORD;
const DRIVER_EMAIL = process.env.SMOKE_DRIVER_EMAIL;
const DRIVER_PASSWORD = process.env.SMOKE_DRIVER_PASSWORD;
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;

if (!API_BASE_URL) {
  throw new Error("Missing SMOKE_API_BASE_URL (or NEXT_PUBLIC_API_BASE_URL).");
}

if (!PASSENGER_EMAIL || !PASSENGER_PASSWORD || !DRIVER_EMAIL || !DRIVER_PASSWORD) {
  throw new Error(
    "Missing smoke credentials. Required: SMOKE_PASSENGER_EMAIL/SMOKE_PASSENGER_PASSWORD/SMOKE_DRIVER_EMAIL/SMOKE_DRIVER_PASSWORD",
  );
}

function nowIso() {
  return new Date().toISOString();
}

function toDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function toFutureDateTime(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function toTomorrowDateAndTime() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const date = toDateOnly(d.toISOString());
  return { date, time: "10:30:00" };
}

class SessionClient {
  constructor(name) {
    this.name = name;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  storeCookies(response) {
    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const cookieLine of setCookie) {
      const [firstPart] = cookieLine.split(";");
      const [name, value] = firstPart.split("=");
      if (name && value) {
        this.cookies.set(name.trim(), value.trim());
      }
    }
  }

  async request(method, path, body, options = {}) {
    const url = `${API_BASE_URL.replace(/\/+$/, "")}${path}`;
    const headers = {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    };
    const cookie = this.cookieHeader();
    if (cookie) {
      headers.cookie = cookie;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    this.storeCookies(res);

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(
        `[${this.name}] ${method} ${path} failed: ${res.status} ${JSON.stringify(json)}`,
      );
      err.status = res.status;
      err.body = json;
      throw err;
    }

    return json;
  }

  get(path, options) {
    return this.request("GET", path, undefined, options);
  }

  post(path, body, options) {
    return this.request("POST", path, body, options);
  }

  put(path, body, options) {
    return this.request("PUT", path, body, options);
  }
}

async function registerOrLogin(client, payload) {
  try {
    await client.post("/v1/auth/register", payload);
    return;
  } catch (error) {
    if (error.status !== 409) {
      throw error;
    }
  }

  await client.post("/v1/auth/login", {
    email: payload.email,
    password: payload.password,
  });
}

function assertState(label, condition, details) {
  if (!condition) {
    throw new Error(`[ASSERT FAILED] ${label}: ${details ?? "condition is false"}`);
  }
  console.log(`[OK] ${label}`);
}

async function ensureVerificationSubmitted(client, isDriver) {
  const overview = await client.get("/v1/verification/overview");

  if (!overview.student_verification) {
    await client.put("/v1/verification/student", {
      provider: "manual_review",
      student_identifier_last4: "1234",
      institution_name: "Smoke Test College",
      program_name: "B.Tech",
      admission_year: 2023,
      graduation_year: 2027,
      eligibility_starts_at: nowIso(),
      eligibility_ends_at: toFutureDateTime(365),
      revalidate_after: toFutureDateTime(180),
      consent_reference: "smoke-consent",
      metadata: {
        source: "staging-smoke-script",
      },
    });
    console.log("[INFO] Submitted student verification.");
  }

  if (isDriver) {
    const driverEligibility = overview.driver_eligibility;
    if (!driverEligibility) {
      await client.put("/v1/verification/driver-eligibility", {
        license_number_last4: "9876",
        license_expires_at: "2030-12-31",
        insurance_expires_at: "2030-12-31",
        puc_expires_at: "2030-12-31",
        metadata: {
          source: "staging-smoke-script",
        },
      });
      console.log("[INFO] Submitted driver eligibility.");
    }

    const vehiclesResp = await client.get("/v1/verification/vehicles");
    const vehicles = vehiclesResp.vehicles ?? [];
    if (vehicles.length === 0) {
      await client.post("/v1/verification/vehicles", {
        vehicle_type: "bike",
        make: "Honda",
        model: "Shine",
        color: "Black",
        registration_number_last4: "4321",
        seat_capacity: 2,
        metadata: {
          source: "staging-smoke-script",
        },
      });
      console.log("[INFO] Created vehicle.");
    }
  }
}

function getReviewOutcomeStatus(entityType, outcome) {
  if (entityType === "student") {
    return outcome === "verified" ? "verified" : "rejected";
  }
  return outcome === "approved" ? "approved" : "rejected";
}

async function ensureApprovals(adminClient, user, driverMode) {
  if (!adminClient) {
    console.log("[WARN] No admin credentials provided. Assuming verifications are already approved.");
    return;
  }

  const userOverview = await user.get("/v1/verification/overview");
  const userId = userOverview.user?.id;
  assertState("overview has user id", Boolean(userId), "Missing user id in /verification/overview");

  const studentStatus = userOverview.student_verification?.status;
  if (studentStatus !== "verified") {
    await adminClient.post(`/v1/verification/admin/student/${userId}/review`, {
      outcome: "verified",
      reason: "staging smoke approval",
    });
    console.log(`[INFO] Admin approved student verification for ${userId}.`);
  }

  if (!driverMode) {
    return;
  }

  const refreshed = await user.get("/v1/verification/overview");
  const driverStatus = refreshed.driver_eligibility?.status;
  if (driverStatus !== "approved") {
    await adminClient.post(`/v1/verification/admin/driver-eligibility/${userId}/review`, {
      outcome: "approved",
      reason: "staging smoke approval",
    });
    console.log(`[INFO] Admin approved driver eligibility for ${userId}.`);
  }

  const vehiclesResp = await user.get("/v1/verification/vehicles");
  const vehicles = vehiclesResp.vehicles ?? [];
  const firstVehicle = vehicles[0];
  assertState("driver has vehicle", Boolean(firstVehicle?.id), "Driver vehicle missing for approval.");

  if (firstVehicle.status !== "approved") {
    await adminClient.post(`/v1/verification/admin/vehicles/${firstVehicle.id}/review`, {
      outcome: "approved",
      reason: "staging smoke approval",
    });
    console.log(`[INFO] Admin approved vehicle ${firstVehicle.id}.`);
  }
}

async function main() {
  console.log(`[INFO] Running staging smoke against ${API_BASE_URL}`);

  const passenger = new SessionClient("passenger");
  const driver = new SessionClient("driver");
  const admin =
    ADMIN_EMAIL && ADMIN_PASSWORD ? new SessionClient("admin") : null;

  await registerOrLogin(passenger, {
    email: PASSENGER_EMAIL,
    password: PASSENGER_PASSWORD,
    fullName: "Smoke Passenger",
    phone: "9000000001",
    college: "Smoke College",
  });
  console.log("[OK] passenger auth ready");

  await registerOrLogin(driver, {
    email: DRIVER_EMAIL,
    password: DRIVER_PASSWORD,
    fullName: "Smoke Driver",
    phone: "9000000002",
    college: "Smoke College",
  });
  console.log("[OK] driver auth ready");

  if (admin) {
    await admin.post("/v1/auth/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    console.log("[OK] admin auth ready");
  }

  await ensureVerificationSubmitted(passenger, false);
  await ensureVerificationSubmitted(driver, true);

  await ensureApprovals(admin, passenger, false);
  await ensureApprovals(admin, driver, true);

  const driverOverview = await driver.get("/v1/verification/overview");
  assertState(
    "driver student verified",
    driverOverview.student_verification?.status === "verified",
    `status=${driverOverview.student_verification?.status}`,
  );
  assertState(
    "driver eligibility approved",
    driverOverview.driver_eligibility?.status === "approved",
    `status=${driverOverview.driver_eligibility?.status}`,
  );

  const driverVehicles = (await driver.get("/v1/verification/vehicles")).vehicles ?? [];
  const approvedVehicle = driverVehicles.find((v) => v.status === "approved");
  assertState("driver has approved vehicle", Boolean(approvedVehicle), "No approved vehicle found.");

  const passengerOverview = await passenger.get("/v1/verification/overview");
  assertState(
    "passenger student verified",
    passengerOverview.student_verification?.status === "verified",
    `status=${passengerOverview.student_verification?.status}`,
  );

  const { date, time } = toTomorrowDateAndTime();
  const offerResp = await driver.post("/v1/rides/offers", {
    pickup_location: "Pune Station",
    drop_location: "Viman Nagar",
    pickup_lat: 18.5285,
    pickup_lng: 73.8743,
    drop_lat: 18.5679,
    drop_lng: 73.9143,
    available_seats: 1,
    pricing_area_type: "urban",
    distance_km: 10,
    date,
    time,
    vehicle_id: approvedVehicle.id,
    counterparty_gender_preference: "any",
    notification_enabled: true,
    notes: "staging-smoke-offer",
  });

  const offerId = offerResp.ride_offer?.id;
  assertState("ride offer created", Boolean(offerId), "Missing ride_offer.id");

  const bookingResp = await passenger.post("/v1/bookings", {
    ride_offer_id: offerId,
    seats_booked: 1,
  });

  const bookingId = bookingResp.booking?.id;
  assertState("booking created", Boolean(bookingId), "Missing booking.id");

  await driver.post(`/v1/bookings/${bookingId}/confirm`, {
    reason: "staging smoke confirm",
  });
  console.log("[OK] booking confirmed");

  await driver.post(`/v1/bookings/${bookingId}/complete`, {
    reason: "staging smoke complete",
  });
  console.log("[OK] booking completed");

  const settlementResp = await passenger.get(`/v1/settlements/bookings/${bookingId}`);
  assertState(
    "settlement opened due",
    ["due", "overdue"].includes(settlementResp.settlement?.status),
    `status=${settlementResp.settlement?.status}`,
  );

  const orderResp = await passenger.post("/v1/payments/orders", {
    bookingId,
  });
  assertState("payment order created", Boolean(orderResp.order_id), "Missing provider order id");
  assertState(
    "booking projection order_created",
    orderResp.payment_order_id != null,
    "payment_order_id missing",
  );

  const paymentStatus = await passenger.get(`/v1/payments/bookings/${bookingId}/status`);
  assertState(
    "payment status fetch works",
    Boolean(paymentStatus?.booking_id),
    "Missing booking_id in payment status response",
  );

  console.log("[DONE] Staging smoke completed up to online order creation.");
  console.log(
    "[NEXT] Complete Razorpay checkout manually, then verify webhook/reconcile path in worker logs and /v1/payments/bookings/:bookingId/status.",
  );
}

main().catch((error) => {
  console.error("[FAILED] staging smoke failed");
  console.error(error?.message ?? error);
  process.exit(1);
});
