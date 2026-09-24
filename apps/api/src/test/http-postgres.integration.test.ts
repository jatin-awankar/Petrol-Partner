import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { pool } from "../db/pool";
import { setAuthProviderForTests, setManagedAuthEnabledForTests, type AuthProvider, type ProviderIdentity } from "../modules/auth/auth-provider";

const verificationPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const migrations = ["0001_init.sql", "0002_profile_settings.sql", "0003_chat.sql", "0004_acknowledgement_prototype.sql", "0005_managed_auth_identities.sql", "0006_operator_allowlist.sql", "0007_operator_pause.sql"];

function fakeProvider(identity: ProviderIdentity): AuthProvider {
  const session = { accessToken: "provider-access", refreshToken: "provider-refresh", expiresIn: 900, identity };
  return {
    register: async () => undefined,
    login: async () => session,
    validate: async () => identity,
    refresh: async () => session,
    requestRecovery: async () => undefined,
    updatePassword: async () => undefined,
    logout: async () => undefined,
    exchangeCode: async () => session,
  };
}

beforeAll(async () => {
  for (const migration of migrations) {
    const sql = await readFile(resolve(import.meta.dirname, "../db/migrations", migration), "utf8");
    await verificationPool.query(sql);
  }
});

beforeEach(async () => {
  await verificationPool.query("TRUNCATE TABLE auth_claim_reviews");
  await verificationPool.query("TRUNCATE TABLE users CASCADE");
  await verificationPool.query("TRUNCATE pilot_pause_audit, pilot_pause_followup, pilot_pause_operations CASCADE");
  await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL");
  await verificationPool.query("INSERT INTO pilot_recovery_state (singleton, mode) VALUES (true, 'open') ON CONFLICT (singleton) DO UPDATE SET mode = 'open', cause = NULL, started_at = NULL, reconciled_at = NULL");
  setManagedAuthEnabledForTests(null);
  setAuthProviderForTests(null);
  await verificationPool.query(
    `UPDATE auth_cutover_state
        SET active_provider = 'legacy', legacy_login_enabled = true,
            authorized_at = NULL, authorized_by = NULL`,
  );
});

afterAll(async () => {
  await Promise.all([pool.end(), verificationPool.end()]);
});

describe("managed authentication HTTP boundary with PostgreSQL", () => {
  it("claims a verified provider identity without changing the stable application owner", async () => {
    const legacy = await verificationPool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ('student@example.test', 'legacy-hash') RETURNING id`,
    );
    const passenger = await verificationPool.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('passenger@example.test') RETURNING id`,
    );
    await verificationPool.query(
      `INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Existing Student')`,
      [legacy.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ('10000000-0000-4000-8000-000000000008', $1, 'legacy-refresh', now() + interval '1 day')`,
      [legacy.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO vehicles (owner_user_id, vehicle_type, registration_number_last4, seat_capacity)
       VALUES ($1, 'car', '1234', 4)`,
      [legacy.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO student_verifications
        (user_id, provider, status, institution_name, eligibility_ends_at)
       VALUES ($1, 'manual_review', 'verified', 'Synthetic College', now() + interval '1 year')`,
      [legacy.rows[0].id],
    );
    const vehicle = await verificationPool.query<{ id: string }>(
      `SELECT id FROM vehicles WHERE owner_user_id = $1`,
      [legacy.rows[0].id],
    );
    const offer = await verificationPool.query<{ id: string }>(
      `INSERT INTO ride_offers
        (driver_id, vehicle_id, pickup_location, pickup_lat, pickup_lng,
         drop_location, drop_lat, drop_lng, date, time, available_seats,
         price_per_seat_paise, status)
       VALUES ($1, $2, 'Origin', 20, 77, 'Destination', 20.1, 77.1,
         current_date + 1, '09:00', 2, 12000, 'active') RETURNING id`,
      [legacy.rows[0].id, vehicle.rows[0].id],
    );
    const booking = await verificationPool.query<{ id: string }>(
      `INSERT INTO bookings
        (ride_offer_id, created_by_user_id, passenger_id, driver_id, seats_booked,
         total_amount_paise, platform_fee_paise, status, payment_state, confirmed_at)
       VALUES ($1, $2, $3, $2, 1, 12500, 500, 'confirmed', 'paid_escrow', now())
       RETURNING id`,
      [offer.rows[0].id, legacy.rows[0].id, passenger.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO payment_orders
        (booking_id, user_id, provider, provider_order_id, amount_paise,
         currency, status, idempotency_key)
       VALUES ($1, $2, 'historical-razorpay', 'synthetic-order', 12500,
         'INR', 'paid', 'synthetic-key')`,
      [booking.rows[0].id, legacy.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO booking_settlements
        (booking_id, payer_user_id, payee_user_id, ride_fare_paise,
         platform_fee_paise, total_due_paise, paid_amount_paise,
         preferred_payment_method, status)
       VALUES ($1, $2, $3, 12000, 500, 12500, 12500, 'online', 'settled')`,
      [booking.rows[0].id, passenger.rows[0].id, legacy.rows[0].id],
    );
    setManagedAuthEnabledForTests(true);
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setAuthProviderForTests(fakeProvider({
      subject: "supabase-subject-1",
      email: "STUDENT@example.test",
      emailVerified: true,
      assuranceLevel: "aal1",
      userMetadata: {},
    }));

    const response = await request(createApp()).post("/v1/auth/login").send({
      email: "student@example.test",
      password: "synthetic-password",
    });

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(legacy.rows[0].id);
    const ownership = await verificationPool.query(
      `SELECT v.owner_user_id, i.provider_subject, u.password_hash, u.email_verified_at IS NOT NULL AS verified
         FROM vehicles v JOIN users u ON u.id = v.owner_user_id
         JOIN auth_identities i ON i.user_id = u.id`,
    );
    expect(ownership.rows).toEqual([expect.objectContaining({
      owner_user_id: legacy.rows[0].id,
      provider_subject: "supabase-subject-1",
      password_hash: null,
      verified: true,
    })]);
    expect((await verificationPool.query(
      `SELECT event_type FROM auth_identity_events WHERE user_id = $1`,
      [legacy.rows[0].id],
    )).rows).toEqual([{ event_type: "claimed" }]);
    expect((await verificationPool.query(
      `SELECT revoked_at IS NOT NULL AS revoked FROM refresh_tokens WHERE user_id = $1`,
      [legacy.rows[0].id],
    )).rows).toEqual([{ revoked: true }]);
    const history = await verificationPool.query(
      `SELECT b.created_by_user_id, b.passenger_id, b.driver_id,
              s.payer_user_id, s.payee_user_id, s.total_due_paise,
              p.user_id AS payment_user_id, p.amount_paise,
              v.user_id AS approval_user_id
         FROM bookings b
         JOIN booking_settlements s ON s.booking_id = b.id
         JOIN payment_orders p ON p.booking_id = b.id
         JOIN student_verifications v ON v.user_id = b.driver_id`,
    );
    expect(history.rows).toEqual([{
      created_by_user_id: legacy.rows[0].id,
      passenger_id: passenger.rows[0].id,
      driver_id: legacy.rows[0].id,
      payer_user_id: passenger.rows[0].id,
      payee_user_id: legacy.rows[0].id,
      total_due_paise: 12500,
      payment_user_id: legacy.rows[0].id,
      amount_paise: 12500,
      approval_user_id: legacy.rows[0].id,
    }]);
  });

  it("does not map or authenticate an unverified provider address", async () => {
    setManagedAuthEnabledForTests(true);
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setAuthProviderForTests(fakeProvider({
      subject: "unverified-subject",
      email: "unverified@example.test",
      emailVerified: false,
      assuranceLevel: "aal1",
      userMetadata: { full_name: "Unverified Student" },
    }));

    const response = await request(createApp()).post("/v1/auth/login").send({
      email: "unverified@example.test",
      password: "synthetic-password",
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect((await verificationPool.query("SELECT count(*)::int AS count FROM users")).rows[0].count).toBe(0);
    expect((await verificationPool.query("SELECT reason FROM auth_claim_reviews")).rows).toEqual([
      { reason: "email_not_verified" },
    ]);
  });

  it("routes a competing verified identity claim to review without changing the stable owner", async () => {
    const legacy = await verificationPool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ('race@example.test', 'legacy-hash') RETURNING id`,
    );
    await verificationPool.query(
      `INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Race Student')`,
      [legacy.rows[0].id],
    );
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests({
      ...fakeProvider({ subject: "unused", email: "race@example.test", emailVerified: true, assuranceLevel: "aal1", userMetadata: {} }),
      login: async (email) => ({
        accessToken: `access-${email}`,
        refreshToken: `refresh-${email}`,
        expiresIn: 900,
        identity: {
          subject: email.startsWith("first") ? "subject-first" : "subject-second",
          email: "race@example.test",
          emailVerified: true,
          assuranceLevel: "aal1",
          userMetadata: {},
        },
      }),
    });

    const responses = await Promise.all([
      request(createApp()).post("/v1/auth/login").send({ email: "first@example.test", password: "synthetic-password" }),
      request(createApp()).post("/v1/auth/login").send({ email: "second@example.test", password: "synthetic-password" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code).toBe("IDENTITY_REVIEW_REQUIRED");
    expect((await verificationPool.query(
      `SELECT user_id FROM auth_identities WHERE disabled_at IS NULL`,
    )).rows).toEqual([{ user_id: legacy.rows[0].id }]);
  });

  it("starts browser registration with a server-held PKCE verifier", async () => {
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({
      subject: "pending-subject",
      email: "pkce@example.test",
      emailVerified: false,
      assuranceLevel: null,
      userMetadata: {},
    }));

    const response = await request(createApp()).post("/v1/auth/register").send({
      email: "pkce@example.test",
      password: "synthetic-password",
      fullName: "PKCE Student",
    });

    expect(response.status).toBe(202);
    expect(response.headers["set-cookie"]?.some((cookie: string) =>
      cookie.startsWith("pp_pkce_verifier=") && cookie.includes("HttpOnly"),
    )).toBe(true);
  });

  it("exchanges a browser authorization code without exposing provider tokens in the URL", async () => {
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    const pendingIdentity: ProviderIdentity = {
      subject: "pkce-subject",
      email: "callback@example.test",
      emailVerified: false,
      assuranceLevel: null,
      userMetadata: { full_name: "Callback Student" },
    };
    const verifiedIdentity = { ...pendingIdentity, emailVerified: true, assuranceLevel: "aal1" };
    setAuthProviderForTests({
      ...fakeProvider(pendingIdentity),
      exchangeCode: async (code, verifier) => {
        if (code !== "authorization-code" || !verifier) throw new Error("invalid PKCE exchange");
        return {
          accessToken: "callback-access",
          refreshToken: "callback-refresh",
          expiresIn: 900,
          identity: verifiedIdentity,
        };
      },
    });
    const registration = await request(createApp()).post("/v1/auth/register").send({
      email: "callback@example.test",
      password: "synthetic-password",
      fullName: "Callback Student",
    });
    const pkceCookie = registration.headers["set-cookie"]?.find((cookie: string) =>
      cookie.startsWith("pp_pkce_verifier="),
    );

    const response = await request(createApp())
      .post("/v1/auth/provider-session")
      .set("Cookie", pkceCookie)
      .send({ code: "authorization-code" });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: "callback@example.test", isVerified: false });
  });

  it("denies an aal2 admin who is not currently operator-allowlisted", async () => {
    const admin = await verificationPool.query<{ id: string }>(
      `INSERT INTO users (email, role) VALUES ('operator@example.test', 'admin') RETURNING id`,
    );
    await verificationPool.query(
      `INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Test Operator')`,
      [admin.rows[0].id],
    );
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({
      subject: "operator-subject",
      email: "operator@example.test",
      emailVerified: true,
      assuranceLevel: "aal2",
      userMetadata: { role: "admin" },
    }));
    const agent = request.agent(createApp());
    expect((await agent.post("/v1/auth/login").send({
      email: "operator@example.test",
      password: "synthetic-password",
    })).status).toBe(200);

    const response = await agent.get("/v1/verification/admin/pending");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("OPERATOR_ACCESS_REVOKED");
  });

  it("rejects a stale access token when its provider session is revoked", async () => {
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    const identity: ProviderIdentity = {
      subject: "revoked-subject",
      email: "revoked@example.test",
      emailVerified: true,
      assuranceLevel: "aal1",
      userMetadata: { full_name: "Revoked Student" },
    };
    let revoked = false;
    const provider = fakeProvider(identity);
    setAuthProviderForTests({
      ...provider,
      refresh: async (refreshToken) => {
        if (revoked) throw new Error("provider session revoked");
        return provider.refresh(refreshToken);
      },
    });
    const agent = request.agent(createApp());
    expect((await agent.post("/v1/auth/login").send({
      email: "revoked@example.test",
      password: "synthetic-password",
    })).status).toBe(200);
    expect((await agent.get("/v1/auth/me")).status).toBe(200);

    revoked = true;
    const response = await agent.get("/v1/auth/me");

    expect(response.status).toBe(401);
  });
});

describe("legacy registration HTTP characterization with PostgreSQL", () => {
  it("commits a registered user before returning the response", async () => {
    const response = await request(createApp()).post("/v1/auth/register").send({
      email: "synthetic.student@example.test",
      password: "synthetic-password",
      fullName: "Synthetic Student",
      college: "Synthetic College",
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      email: "synthetic.student@example.test",
      fullName: "Synthetic Student",
    });

    const persisted = await verificationPool.query(
      "SELECT email FROM users WHERE id = $1",
      [response.body.user.id],
    );
    expect(persisted.rows).toEqual([{ email: "synthetic.student@example.test" }]);
  });
});

describe("protected operator pause HTTP/PostgreSQL", () => {
  let receiptDirectory: string;
  beforeEach(async () => {
    receiptDirectory = await mkdtemp(resolve(tmpdir(), "pilot-pause-"));
    process.env.PILOT_RECEIPT_PATH = resolve(receiptDirectory, "receipts.jsonl");
    process.env.PILOT_RECEIPT_SECRET = "integration-test-independent-receipt-secret";
  });
  afterAll(async () => {
    delete process.env.PILOT_RECEIPT_PATH;
    delete process.env.PILOT_RECEIPT_SECRET;
  });
  async function operator(assuranceLevel: "aal1" | "aal2" = "aal2", allowlisted = true) {
    const admin = await verificationPool.query<{ id: string }>("INSERT INTO users (email, role, email_verified_at) VALUES ('pause-operator@example.test', 'admin', now()) RETURNING id");
    const userId = admin.rows[0].id;
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Pause Operator')", [userId]);
    await verificationPool.query("INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', 'pause-subject', $1, 'pause-operator@example.test')", [userId]);
    if (allowlisted) await verificationPool.query("INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'test', now())", [userId]);
    await verificationPool.query("UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({ subject: "pause-subject", email: "pause-operator@example.test", emailVerified: true, assuranceLevel, userMetadata: {} }));
    const agent = request.agent(createApp());
    const login = await agent.post("/v1/auth/login").send({ email: "pause-operator@example.test", password: "synthetic-password" });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    const csrf = login.headers["set-cookie"]?.find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    expect(csrf).toBeTruthy();
    const cookie = login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; ");
    return { agent, userId, csrf, cookie };
  }
  it("authorizes current allowlist and MFA, then keeps duplicate decisions stable", async () => {
    const { agent, userId, csrf, cookie } = await operator();
    const body = { capability: "offers", paused: true, reason: "Corridor hazard reported" };
    const first = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "pause-1").send(body);
    expect(first.status).toBe(200);
    expect(first.body.state).toBe("acknowledged");
    const repeated = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "pause-1").send(body);
    expect(repeated.body.id).toBe(first.body.id);
    const changed = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "pause-1").send({ ...body, paused: false });
    expect(changed.body.error.code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");
    const row = await verificationPool.query("SELECT count(*)::int AS total FROM pilot_pause_audit WHERE operator_id = $1", [userId]);
    expect(row.rows[0].total).toBe(1);
    const status = await agent.get(`/v1/operator/operations/${first.body.id}`);
    expect(status.body.state).toBe("acknowledged");
    const byKey = await agent.get("/v1/operator/operations/by-key/pause-1");
    expect(byKey.body.id).toBe(first.body.id);
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("rejects missing MFA and revoked allowlist", async () => {
    const { agent, userId } = await operator("aal1");
    const denied = await agent.get("/v1/operator/pending");
    expect(denied.body.error.code).toBe("MFA_REQUIRED");
    setAuthProviderForTests(fakeProvider({ subject: "pause-subject", email: "pause-operator@example.test", emailVerified: true, assuranceLevel: "aal2", userMetadata: {} }));
    await verificationPool.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [userId]);
    const revoked = await agent.get("/v1/operator/pending");
    expect(revoked.body.error.code).toBe("OPERATOR_ACCESS_REVOKED");
    await verificationPool.query("UPDATE operator_allowlist SET active = true WHERE user_id = $1", [userId]);
    await verificationPool.query("UPDATE users SET role = 'user' WHERE id = $1", [userId]);
    expect((await agent.get("/v1/operator/pending")).body.error.code).toBe("FORBIDDEN");
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("recovers an acknowledged pause from a receipt after an older database state", async () => {
    const { agent, csrf, cookie } = await operator();
    const decision = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "restore-1").send({ capability: "offers", paused: true, reason: "Restore rehearsal decision" });
    expect(decision.status).toBe(200);
    await verificationPool.query("DELETE FROM pilot_pause_audit WHERE operation_id = $1", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_pause_followup WHERE operation_id = $1", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_pause_operations WHERE id = $1", [decision.body.id]);
    await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL, updated_at = now() - interval '1 day' WHERE capability = 'offers'");
    const recovered = await request(createApp()).post("/v1/operator/reconcile").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
    expect(recovered.status).toBe(200);
    expect(recovered.body.receipts).toBe(1);
    expect((await agent.get("/v1/operator/pilot-status")).body.recovery.mode).toBe("restricted");
    const reopened = await request(createApp()).post("/v1/operator/reopen").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ reason: "Reviewed restored receipt and state" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.capabilities.find((item: { capability: string }) => item.capability === "offers").paused).toBe(true);
    expect((await agent.get(`/v1/operator/operations/${decision.body.id}`)).body.state).toBe("recovered");
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("restricts reads after acknowledged evidence disappears", async () => {
    const { agent, csrf, cookie } = await operator();
    const decision = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "lost-1").send({ capability: "offers", paused: false, reason: "Temporary clear decision" });
    expect(decision.status).toBe(200);
    await rm(process.env.PILOT_RECEIPT_PATH!, { force: true });
    const status = await agent.get("/v1/operator/pilot-status");
    expect(status.body.recovery.mode).toBe("restricted");
    expect(status.body.capabilities.every((item: { paused: boolean }) => item.paused)).toBe(true);
    expect((await agent.get(`/v1/operator/operations/${decision.body.id}`)).body.state).toBe("pending_unknown");
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("guards request inserts inside PostgreSQL and serializes pause against in-flight work", async () => {
    const student = await verificationPool.query<{ id: string }>("INSERT INTO users (email) VALUES ('pause-student@example.test') RETURNING id");
    const insertSql = `INSERT INTO ride_requests (passenger_id, pickup_location, pickup_lat, pickup_lng, drop_location, drop_lat, drop_lng, date, time, seats_required, price_per_seat_paise)
      VALUES ($1, 'A', 20, 77, 'B', 20.1, 77.1, current_date + 1, '09:00', 1, 10000)`;
    await verificationPool.query("UPDATE pilot_pause_state SET paused = true WHERE capability = 'requests'");
    await expect(verificationPool.query(insertSql, [student.rows[0].id])).rejects.toMatchObject({ code: "P0001" });
    await verificationPool.query("UPDATE pilot_pause_state SET paused = false WHERE capability = 'requests'");
    const first = await verificationPool.connect();
    const second = await verificationPool.connect();
    try {
      await first.query("BEGIN");
      await first.query(insertSql, [student.rows[0].id]);
      await second.query("BEGIN");
      await second.query("SET LOCAL lock_timeout = '100ms'");
      await expect(second.query("UPDATE pilot_pause_state SET paused = true WHERE capability = 'requests'")).rejects.toMatchObject({ code: "55P03" });
      await second.query("ROLLBACK");
      await first.query("COMMIT");
      await second.query("UPDATE pilot_pause_state SET paused = true WHERE capability = 'requests'");
      await expect(second.query(insertSql, [student.rows[0].id])).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      first.release(); second.release();
    }
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("enters restricted mode on evidence failure and exposes a stable pending reference", async () => {
    const { agent, csrf, cookie } = await operator();
    await chmod(receiptDirectory, 0o500);
    const result = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "outage-1").send({ capability: "requests", paused: true, reason: "Recovery store outage" });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("OPERATION_PENDING");
    const id = result.body.error.details.operationId;
    expect((await agent.get(`/v1/operator/operations/${id}`)).body.state).toBe("committed");
    const publicStatus = await request(createApp()).get("/v1/operator/pilot-status");
    expect(publicStatus.body.recovery.mode).toBe("restricted");
    expect(publicStatus.body.capabilities.every((item: { paused: boolean }) => item.paused)).toBe(true);
    await chmod(receiptDirectory, 0o700);
    await rm(receiptDirectory, { recursive: true, force: true });
  });
});
