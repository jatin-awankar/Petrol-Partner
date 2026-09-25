import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { pool } from "../db/pool";
import { resetRateLimitsForTests } from "../middleware/rate-limit";
import { setAuthProviderForTests, setManagedAuthEnabledForTests, type AuthProvider, type ProviderIdentity } from "../modules/auth/auth-provider";
import { setBackupObjectProbeForTests } from "../modules/operator/backup-status";
import { setStudentReviewAfterCommitHookForTests } from "../modules/verification/student-review.service";

const verificationPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const migrations = ["0001_init.sql", "0002_profile_settings.sql", "0003_chat.sql", "0004_acknowledgement_prototype.sql", "0005_managed_auth_identities.sql", "0006_operator_allowlist.sql", "0007_operator_pause.sql", "0008_operator_intent_handoff.sql", "0009_durable_notifications.sql", "0010_email_retry_operations.sql", "0011_backup_attempts.sql", "0012_student_adult_review.sql", "0013_student_review_cycles.sql", "0014_student_review_operations.sql", "0015_student_evidence_access.sql", "0016_student_evidence_deletion_outcomes.sql", "0017_student_evidence_retry_schedule.sql"];

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
  resetRateLimitsForTests();
  await verificationPool.query("TRUNCATE TABLE auth_claim_reviews");
  await verificationPool.query("TRUNCATE TABLE users CASCADE");
  await verificationPool.query("TRUNCATE pilot_pause_audit, pilot_pause_followup, pilot_pause_operations, pilot_reopen_audit, pilot_reopen_operations CASCADE");
  await verificationPool.query("TRUNCATE pilot_backup_attempts");
  await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL");
  await verificationPool.query("INSERT INTO pilot_recovery_state (singleton, mode) VALUES (true, 'open') ON CONFLICT (singleton) DO UPDATE SET mode = 'open', cause = NULL, started_at = NULL, reconciled_at = NULL");
  setManagedAuthEnabledForTests(null);
  setAuthProviderForTests(null);
  setBackupObjectProbeForTests(null);
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

describe("synthetic student evidence HTTP/PostgreSQL", () => {
  let evidenceDirectory: string;
  beforeEach(async () => {
    evidenceDirectory = await mkdtemp(resolve(tmpdir(), "pilot-student-evidence-"));
    process.env.PILOT_SYNTHETIC_EVIDENCE_DIR = evidenceDirectory;
    await verificationPool.query("UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
  });
  afterEach(async () => { await rm(evidenceDirectory, { recursive: true, force: true }); });
  afterAll(async () => { delete process.env.PILOT_SYNTHETIC_EVIDENCE_DIR; });

  async function student(label: string) {
    const email = `${label}@example.test`;
    const subject = `${label}-subject`;
    const user = await verificationPool.query<{ id: string }>("INSERT INTO users (email, email_verified_at) VALUES ($1, now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Synthetic Student')", [user.rows[0].id]);
    await verificationPool.query("INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)", [subject, user.rows[0].id, email]);
    const identity = { subject, email, emailVerified: true, assuranceLevel: "aal1" as const, userMetadata: {} };
    setAuthProviderForTests(fakeProvider(identity));
    const agent = request.agent(createApp());
    const login = await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    expect(login.status).toBe(200);
    const csrf = login.headers["set-cookie"]?.find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    const cookie = login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; ");
    return { agent, userId: user.rows[0].id, csrf, cookie, identity };
  }

  it("keeps document bytes outside PostgreSQL and denies another student access", async () => {
    const owner = await student("evidence-owner");
    const details = { provider: "manual_review", enrolled_name: "Synthetic Student", evidence_category: "enrollment_letter", age_evidence_category: "institution_age_record", institution_name: "Synthetic College", admission_year: 2025, graduation_year: 2029 };
    const forbidden = await request(createApp()).put("/v1/verification/student").set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).send({ ...details, birth_date: "2005-01-01" });
    expect(forbidden.status).toBe(400);
    expect((await request(createApp()).put("/v1/verification/student").set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).send(details)).status).toBe(200);
    const bytes = Buffer.from("%PDF-1.4\nsynthetic sample\n");
    const upload = await request(createApp()).post("/v1/verification/student/evidence?purpose=enrollment").set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).set("X-Synthetic-Evidence", "true").set("Content-Type", "application/pdf").send(bytes);
    expect(upload.status, JSON.stringify(upload.body)).toBe(201);
    const row = await verificationPool.query<{ object_key: string; byte_count: number }>("SELECT object_key, byte_count FROM student_evidence WHERE user_id = $1 AND purpose = 'enrollment'", [owner.userId]);
    expect(row.rows[0].byte_count).toBe(bytes.length);
    expect(await readFile(resolve(evidenceDirectory, row.rows[0].object_key))).toEqual(bytes);
    const unrelated = await student("evidence-unrelated");
    setAuthProviderForTests(fakeProvider(unrelated.identity));
    const denied = await unrelated.agent.get(`/v1/verification/admin/student/${owner.userId}/evidence?purpose=enrollment`);
    expect(denied.status).toBe(403);
  });

  it("reviews both documents once, publishes the recipient event, and rejects a changed retry", async () => {
    const receiptDirectory = await mkdtemp(resolve(tmpdir(), "pilot-student-receipt-"));
    process.env.PILOT_RECEIPT_PATH = resolve(receiptDirectory, "receipts");
    process.env.PILOT_RECEIPT_SECRET = "integration-test-independent-receipt-secret";
    try {
      const owner = await student("review-owner");
      const details = { provider: "manual_review", enrolled_name: "Synthetic Student", evidence_category: "enrollment_letter", age_evidence_category: "institution_age_record", institution_name: "Synthetic College", admission_year: 2025, graduation_year: 2029 };
      expect((await request(createApp()).put("/v1/verification/student").set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).send(details)).status).toBe(200);
      for (const purpose of ["enrollment", "age"]) {
        const upload = await request(createApp()).post(`/v1/verification/student/evidence?purpose=${purpose}`).set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).set("X-Synthetic-Evidence", "true").set("Content-Type", "application/pdf").send(Buffer.from("%PDF-1.4\nsynthetic sample\n"));
        expect(upload.status, JSON.stringify(upload.body)).toBe(201);
      }
      const email = "student-review-operator@example.test";
      const subject = "student-review-operator-subject";
      const operator = await verificationPool.query<{ id: string }>("INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
      await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Review Operator')", [operator.rows[0].id]);
      await verificationPool.query("INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)", [subject, operator.rows[0].id, email]);
      await verificationPool.query("INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'test', now())", [operator.rows[0].id]);
      setAuthProviderForTests(fakeProvider({ subject, email, emailVerified: true, assuranceLevel: "aal2", userMetadata: {} }));
      const login = await request(createApp()).post("/v1/auth/login").send({ email, password: "synthetic-password" });
      expect(login.status).toBe(200);
      const cookie = login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; ");
      const csrf = login.headers["set-cookie"].find((item: string) => item.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
      const path = `/v1/verification/admin/student/${owner.userId}`;
      const post = (key: string, reason: string) => request(createApp()).post(`${path}/review`).set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", key).send({ outcome: "verified", adult_eligible: true, reason });
      const grant = await request(createApp()).post(`${path}/evidence-access?purpose=age`).set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf);
      expect(grant.status, JSON.stringify(grant.body)).toBe(201);
      expect((await request(createApp()).get(`${path}/evidence?purpose=enrollment`).set("Cookie", cookie).set("X-Evidence-Token", grant.body.token)).status).toBe(403);
      const access = await request(createApp()).get(`${path}/evidence?purpose=age`).set("Cookie", cookie).set("X-Evidence-Token", grant.body.token);
      expect(access.status).toBe(200);
      const accessAudit = await verificationPool.query<{ action: string }>("SELECT action FROM audit_logs WHERE actor_user_id = $1 AND entity_id = $2 ORDER BY created_at", [operator.rows[0].id, owner.userId]);
      expect(accessAudit.rows.map((row) => row.action).sort()).toEqual(["student_evidence_accessed", "student_evidence_access_granted"]);
      await verificationPool.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [operator.rows[0].id]);
      expect((await request(createApp()).post(`${path}/evidence-access?purpose=enrollment`).set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf)).status).toBe(403);
      await verificationPool.query("UPDATE operator_allowlist SET active = true WHERE user_id = $1", [operator.rows[0].id]);
      expect((await request(createApp()).get(`${path}/evidence?purpose=age`).set("Cookie", cookie).set("X-Evidence-Token", grant.body.token)).status).toBe(403);
      const expiring = await request(createApp()).post(`${path}/evidence-access?purpose=enrollment`).set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf);
      expect(expiring.status).toBe(201);
      await verificationPool.query("UPDATE student_evidence_access_grants SET expires_at = now() - interval '1 second' WHERE target_user_id = $1", [owner.userId]);
      expect((await request(createApp()).get(`${path}/evidence?purpose=enrollment`).set("Cookie", cookie).set("X-Evidence-Token", expiring.body.token)).status).toBe(403);
      setStudentReviewAfterCommitHookForTests(() => { throw new Error("synthetic process interruption after commit"); });
      const interrupted = await post("student-review-1", "Both documents checked");
      expect(interrupted.status).toBe(500);
      const pending = await verificationPool.query("SELECT id, state FROM student_review_operations WHERE idempotency_key = 'student-review-1'");
      expect(pending.rows[0].state).toBe("committed");
      expect((await verificationPool.query("SELECT ready_at FROM pilot_notification_events WHERE operation_id = $1", [pending.rows[0].id])).rows[0].ready_at).toBeNull();
      setStudentReviewAfterCommitHookForTests(null);
      const first = await post("student-review-1", "Both documents checked");
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.operation.state).toBe("acknowledged");
      expect((await post("student-review-1", "Both documents checked")).body.operation.id).toBe(first.body.operation.id);
      expect((await post("student-review-1", "Changed review reason")).status).toBe(409);
      const events = await verificationPool.query("SELECT recipient_id, ready_at FROM pilot_notification_events WHERE origin_type = 'student_review'");
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].recipient_id).toBe(owner.userId);
      expect(events.rows[0].ready_at).toBeTruthy();
      expect((await verificationPool.query("SELECT count(*)::int AS n FROM student_review_audit")).rows[0].n).toBe(1);
      const retention = await verificationPool.query("SELECT EXTRACT(EPOCH FROM (delete_after - decision_at))::int AS seconds FROM student_evidence WHERE user_id = $1", [owner.userId]);
      expect(retention.rows).toEqual([{ seconds: 6 * 24 * 60 * 60 }, { seconds: 6 * 24 * 60 * 60 }]);
      await verificationPool.query("UPDATE student_verifications SET review_cycle = 2, status = 'pending_review', reviewed_at = NULL, adult_eligible = NULL WHERE user_id = $1", [owner.userId]);
      await verificationPool.query("UPDATE user_profiles SET is_verified = false, college = NULL WHERE user_id = $1", [owner.userId]);
      const reconcile = await request(createApp()).post("/v1/operator/reconcile").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
      expect(reconcile.status, JSON.stringify(reconcile.body)).toBe(200);
      const later = await verificationPool.query("SELECT review_cycle, status FROM student_verifications WHERE user_id = $1", [owner.userId]);
      expect(later.rows).toEqual([{ review_cycle: 2, status: "pending_review" }]);
      setAuthProviderForTests(fakeProvider(owner.identity));
      for (const purpose of ["enrollment", "age"]) {
        const upload = await request(createApp()).post(`/v1/verification/student/evidence?purpose=${purpose}`).set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).set("X-Synthetic-Evidence", "true").set("Content-Type", "application/pdf").send(Buffer.from("%PDF-1.4\nsynthetic renewed sample\n"));
        expect(upload.status, JSON.stringify(upload.body)).toBe(201);
      }
      setAuthProviderForTests(fakeProvider({ subject, email, emailVerified: true, assuranceLevel: "aal2", userMetadata: {} }));
      await verificationPool.query("UPDATE student_verifications SET eligibility_ends_at = now() - interval '1 second' WHERE user_id = $1", [owner.userId]);
      const expired = await post("student-review-expired", "Enrollment has expired");
      expect(expired.status).toBe(409);
      await verificationPool.query("UPDATE student_verifications SET eligibility_ends_at = now() + interval '1 year' WHERE user_id = $1", [owner.userId]);
      const competing = await Promise.all([
        post("student-review-race-a", "Concurrent review attempt"),
        post("student-review-race-b", "Concurrent review attempt"),
      ]);
      expect(competing.map((response) => response.status).sort()).toEqual([200, 409]);
      expect((await verificationPool.query("SELECT count(*)::int AS n FROM student_review_audit WHERE target_user_id = $1", [owner.userId])).rows[0].n).toBe(2);
    } finally {
      setStudentReviewAfterCommitHookForTests(null);
      delete process.env.PILOT_RECEIPT_PATH;
      delete process.env.PILOT_RECEIPT_SECRET;
      await rm(receiptDirectory, { recursive: true, force: true });
    }
  });
});

describe("protected operator pause HTTP/PostgreSQL", () => {
  let receiptDirectory: string;
  beforeEach(async () => {
    receiptDirectory = await mkdtemp(resolve(tmpdir(), "pilot-pause-"));
    process.env.PILOT_RECEIPT_PATH = resolve(receiptDirectory, "receipts");
    process.env.PILOT_RECEIPT_SECRET = "integration-test-independent-receipt-secret";
  });
  afterAll(async () => {
    delete process.env.PILOT_RECEIPT_PATH;
    delete process.env.PILOT_RECEIPT_SECRET;
  });
  async function operator(assuranceLevel: "aal1" | "aal2" = "aal2", allowlisted = true, label = "pause") {
    const email = `${label}-operator@example.test`;
    const subject = `${label}-subject`;
    const admin = await verificationPool.query<{ id: string }>("INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    const userId = admin.rows[0].id;
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Pause Operator')", [userId]);
    await verificationPool.query("INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)", [subject, userId, email]);
    if (allowlisted) await verificationPool.query("INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'test', now())", [userId]);
    await verificationPool.query("UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({ subject, email, emailVerified: true, assuranceLevel, userMetadata: {} }));
    const agent = request.agent(createApp());
    const login = await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    const csrf = login.headers["set-cookie"]?.find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    expect(csrf).toBeTruthy();
    const cookie = login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; ");
    return { agent, userId, csrf, cookie };
  }
  async function startCrashServer(point: string | undefined, receipts: string) {
    const child = spawn(resolve(process.cwd(), "../../node_modules/.bin/tsx"), [resolve(import.meta.dirname, "operator-crash-server.ts")], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test", PILOT_RECEIPT_PATH: receipts, PILOT_RECEIPT_SECRET: "integration-test-independent-receipt-secret", PILOT_TEST_CRASH_POINT: point ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const port = await new Promise<number>((resolvePort, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error(`Crash server start timed out: ${stderr}`)); }, 10000);
      let stdout = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        const match = stdout.match(/READY:(\d+)/);
        if (match) { clearTimeout(timeout); resolvePort(Number(match[1])); }
      });
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Crash server exited ${code}: ${stderr}`)); });
    });
    return { child, url: `http://127.0.0.1:${port}` };
  }
  async function loginToCrashServer(url: string) {
    const login = await request(url).post("/v1/auth/login").send({ email: "pause-operator@example.test", password: "synthetic-password" });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    return {
      cookie: login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; "),
      csrf: login.headers["set-cookie"].find((item: string) => item.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1] as string,
    };
  }
  async function stopCrashServer(child: ChildProcess) {
    if (child.exitCode !== null) return;
    await new Promise<void>((resolveStop) => {
      child.once("exit", () => resolveStop());
      child.kill("SIGTERM");
    });
  }
  it("commits a recipient notification and email job once, visible after recovery evidence", async () => {
    const { agent, userId, csrf, cookie } = await operator();
    const body = { capability: "offers", paused: true, reason: "Corridor access temporarily blocked" };
    const send = () => request(createApp()).post("/v1/operator/pause")
      .set("Cookie", cookie).set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf).set("Idempotency-Key", "notification-1").send(body);
    const first = await send();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect((await send()).body.id).toBe(first.body.id);
    const other = await verificationPool.query<{ id: string }>("INSERT INTO users (email) VALUES ('other-notification@example.test') RETURNING id");
    const event = await verificationPool.query(
      `SELECT e.recipient_id, j.status, j.attempts, j.due_at <= now() + interval '1 minute' AS timely
       FROM pilot_notification_events e JOIN pilot_email_jobs j ON j.event_id = e.id
       WHERE e.operation_id = $1`, [first.body.id],
    );
    expect(event.rows).toEqual([{ recipient_id: userId, status: "pending", attempts: 0, timely: true }]);
    const visible = await agent.get("/v1/notifications/durable");
    expect(visible.status).toBe(200);
    expect(visible.body.notifications).toEqual([expect.objectContaining({ related_entity_id: first.body.id })]);
    expect(visible.body.notifications[0].body).toBe("Offers were paused by an operator.");
    expect((await agent.get("/v1/operator/notifications/delivery")).body.health.due).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS count FROM pilot_notification_events WHERE recipient_id = $1", [other.rows[0].id])).rows[0].count).toBe(0);
    const second = await operator("aal2", true, "second-notification");
    expect((await second.agent.get("/v1/notifications/durable")).body.notifications).toEqual([]);
    const jobId = (await verificationPool.query<{ id: string }>("SELECT id FROM pilot_email_jobs LIMIT 1")).rows[0].id;
    await verificationPool.query("UPDATE pilot_email_jobs SET status = 'exhausted', attempts = 5, last_error = 'secret provider response' WHERE id = $1", [jobId]);
    const delivery = await second.agent.get("/v1/operator/notifications/delivery");
    expect(JSON.stringify(delivery.body)).not.toContain("secret provider response");
    expect(delivery.body.jobs[0].last_error).toContain("redacted");
    const retry = await request(createApp()).post(`/v1/operator/notifications/email/${jobId}/retry`)
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf).set("Idempotency-Key", "email-retry-1").send({});
    expect(retry.status).toBe(200);
    expect((await verificationPool.query("SELECT status, attempts FROM pilot_email_jobs WHERE id = $1", [jobId])).rows).toEqual([{ status: "pending", attempts: 0 }]);
    await verificationPool.query("UPDATE pilot_email_jobs SET status = 'exhausted', attempts = 5 WHERE id = $1", [jobId]);
    const repeated = await request(createApp()).post(`/v1/operator/notifications/email/${jobId}/retry`)
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf).set("Idempotency-Key", "email-retry-1").send({});
    expect(repeated.status).toBe(200);
    expect((await verificationPool.query("SELECT status, attempts FROM pilot_email_jobs WHERE id = $1", [jobId])).rows).toEqual([{ status: "exhausted", attempts: 5 }]);
  });
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
  it("resumes a persisted intent through a fresh HTTP app", async () => {
    const { userId, csrf, cookie } = await operator();
    const body = { capability: "requests", paused: true, reason: "Restart boundary rehearsal" };
    const payloadDigest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const intent = await verificationPool.query<{ id: string }>(
      `INSERT INTO pilot_pause_operations (operator_id, idempotency_key, payload_digest, capability, paused, reason, state)
       VALUES ($1, 'restart-intent', $2, $3, $4, $5, 'intent') RETURNING id`,
      [userId, payloadDigest, body.capability, body.paused, body.reason],
    );
    expect((await request(createApp()).get("/v1/operator/pilot-status")).body.capabilities.every((item: { paused: boolean }) => item.paused)).toBe(true);
    const resumed = await request(createApp()).post("/v1/operator/pause")
      .set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf)
      .set("Idempotency-Key", "restart-intent").send(body);
    expect(resumed.status).toBe(200);
    expect(resumed.body).toMatchObject({ id: intent.rows[0].id, state: "acknowledged" });
    const records = await verificationPool.query(
      `SELECT (SELECT count(*)::int FROM pilot_pause_audit WHERE operation_id = $1) AS audit_count,
              (SELECT count(*)::int FROM pilot_pause_followup WHERE operation_id = $1) AS followup_count`,
      [intent.rows[0].id],
    );
    expect(records.rows[0]).toEqual({ audit_count: 1, followup_count: 1 });
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("recovers each acknowledgement boundary after a real process exit", async () => {
    await operator();
    const points = ["after_intent", "after_commit", "after_receipt", "after_acknowledgement"] as const;
    for (const point of points) {
      await verificationPool.query("TRUNCATE pilot_email_attempts, pilot_email_jobs, pilot_notification_events CASCADE");
      await verificationPool.query("TRUNCATE pilot_recovery_events, pilot_pause_audit, pilot_pause_followup, pilot_pause_operations CASCADE");
      await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL");
      await verificationPool.query("UPDATE pilot_recovery_state SET mode = 'open', cause = NULL, started_at = NULL, reconciled_at = NULL WHERE singleton = true");
      const receipts = resolve(receiptDirectory, point, "receipts");
      const crashing = await startCrashServer(point, receipts);
      const body = { capability: "offers", paused: true, reason: `Process crash at ${point}` };
      const key = `crash-${point}`;
      try {
        const auth = await loginToCrashServer(crashing.url);
        await request(crashing.url).post("/v1/operator/pause")
          .set("Cookie", auth.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", auth.csrf)
          .set("Idempotency-Key", key).send(body).catch(() => undefined);
        await new Promise<void>((resolveExit, reject) => {
          if (crashing.child.exitCode !== null) { resolveExit(); return; }
          const timeout = setTimeout(() => reject(new Error(`Process did not exit at ${point}`)), 10000);
          crashing.child.once("exit", () => { clearTimeout(timeout); resolveExit(); });
        });
        expect(crashing.child.exitCode).toBe(92);
        if (point === "after_commit") {
          const premature = await verificationPool.query(`SELECT count(*)::int AS count FROM pilot_notification_events e
            JOIN pilot_pause_operations o ON o.id = e.operation_id WHERE o.state IN ('acknowledged', 'recovered')`);
          expect(premature.rows[0].count).toBe(0);
        }
      } finally { await stopCrashServer(crashing.child); }
      const restarted = await startCrashServer(undefined, receipts);
      try {
        const auth = await loginToCrashServer(restarted.url);
        const retry = await request(restarted.url).post("/v1/operator/pause")
          .set("Cookie", auth.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", auth.csrf)
          .set("Idempotency-Key", key).send(body);
        expect(retry.status, `${point}: ${JSON.stringify(retry.body)}`).toBe(200);
        expect(retry.body.state).toBe("acknowledged");
        const counts = await verificationPool.query(`SELECT
          (SELECT count(*)::int FROM pilot_pause_operations WHERE idempotency_key = $1) AS operations,
          (SELECT count(*)::int FROM pilot_pause_audit) AS audits,
          (SELECT count(*)::int FROM pilot_pause_followup) AS followups,
          (SELECT count(*)::int FROM pilot_notification_events) AS events,
          (SELECT count(*)::int FROM pilot_email_jobs) AS email_jobs`, [key]);
        expect(counts.rows[0]).toEqual({ operations: 1, audits: 1, followups: 1, events: 1, email_jobs: 1 });
      } finally { await stopCrashServer(restarted.child); }
    }
    await rm(receiptDirectory, { recursive: true, force: true });
  }, 60000);
  it("lets a current MFA operator finish a stranded intent after the original operator is revoked", async () => {
    const first = await operator();
    const body = { capability: "offers", paused: true, reason: "Original operator recorded hazard" };
    const intent = await verificationPool.query<{ id: string }>(
      `INSERT INTO pilot_pause_operations (operator_id, idempotency_key, payload_digest, capability, paused, reason, state)
       VALUES ($1, 'stranded-intent', $2, $3, $4, $5, 'intent') RETURNING id`,
      [first.userId, createHash("sha256").update(JSON.stringify(body)).digest("hex"), body.capability, body.paused, body.reason],
    );
    await verificationPool.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [first.userId]);
    const revokedAttempt = await request(createApp()).post(`/v1/operator/operations/${intent.rows[0].id}/resume`)
      .set("Cookie", first.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", first.csrf)
      .send({ reason: "Attempt after operator access was revoked" });
    expect(revokedAttempt.status).toBe(403);
    const second = await operator("aal2", true, "replacement");
    const resumed = await request(createApp()).post(`/v1/operator/operations/${intent.rows[0].id}/resume`)
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf)
      .send({ reason: "Reviewed original hazard and assumed pending decision" });
    expect(resumed.status, JSON.stringify(resumed.body)).toBe(200);
    expect(resumed.body).toMatchObject({ id: intent.rows[0].id, state: "acknowledged" });
    expect((await second.agent.get(`/v1/operator/pending/${intent.rows[0].id}`)).body.state).toBe("acknowledged");
    const audit = await verificationPool.query("SELECT operator_id, executed_by FROM pilot_pause_audit WHERE operation_id = $1", [intent.rows[0].id]);
    expect(audit.rows[0]).toEqual({ operator_id: first.userId, executed_by: second.userId });
    const event = await verificationPool.query("SELECT operator_id, reason FROM pilot_recovery_events WHERE operation_id = $1 AND event = 'decision_resumed'", [intent.rows[0].id]);
    expect(event.rows[0].operator_id).toBe(second.userId);
    expect(event.rows[0].reason).toContain("Reviewed original hazard");
    await verificationPool.query("DELETE FROM pilot_recovery_events WHERE operation_id = $1", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_pause_audit WHERE operation_id = $1", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_pause_followup WHERE operation_id = $1", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_email_jobs WHERE event_id IN (SELECT id FROM pilot_notification_events WHERE operation_id = $1)", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE operation_id = $1", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_pause_operations WHERE id = $1", [intent.rows[0].id]);
    await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL, updated_at = now() - interval '1 day' WHERE capability = 'offers'");
    const restored = await request(createApp()).post("/v1/operator/reconcile")
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf).send({});
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect((await verificationPool.query("SELECT executed_by FROM pilot_pause_audit WHERE operation_id = $1", [intent.rows[0].id])).rows[0].executed_by).toBe(second.userId);
    expect((await verificationPool.query("SELECT operator_id FROM pilot_recovery_events WHERE operation_id = $1 AND event = 'decision_resumed'", [intent.rows[0].id])).rows[0].operator_id).toBe(second.userId);
    expect((await second.agent.get("/v1/operator/pilot-status")).body.recovery.mode).toBe("restricted");
    expect((await verificationPool.query("SELECT id FROM pilot_notification_events WHERE operation_id = $1", [intent.rows[0].id])).rows).toEqual([{ id: intent.rows[0].id }]);
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("hands off a committed decision awaiting evidence without rewriting its business audit", async () => {
    const first = await operator();
    const body = { capability: "requests", paused: true, reason: "Commit before evidence outage" };
    const committed = await verificationPool.query<{ id: string; committed_at: Date }>(
      `INSERT INTO pilot_pause_operations (operator_id, idempotency_key, payload_digest, capability, paused, reason, state, committed_at)
       VALUES ($1, 'stranded-commit', $2, $3, $4, $5, 'committed', now()) RETURNING id, committed_at`,
      [first.userId, createHash("sha256").update(JSON.stringify(body)).digest("hex"), body.capability, body.paused, body.reason],
    );
    const id = committed.rows[0].id;
    await verificationPool.query("UPDATE pilot_pause_state SET paused = true, operation_id = $1 WHERE capability = 'requests'", [id]);
    await verificationPool.query("INSERT INTO pilot_pause_audit (operation_id, operator_id, capability, paused, reason, recorded_at, executed_by) VALUES ($1, $2, $3, $4, $5, $6, $2)", [id, first.userId, body.capability, body.paused, body.reason, committed.rows[0].committed_at]);
    await verificationPool.query("INSERT INTO pilot_pause_followup (operation_id, kind) VALUES ($1, 'operator_pause_changed')", [id]);
    await verificationPool.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [first.userId]);
    const second = await operator("aal2", true, "replacement");
    const finished = await request(createApp()).post(`/v1/operator/operations/${id}/resume`)
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf)
      .send({ reason: "Inspected committed decision and restored recovery evidence" });
    expect(finished.status, JSON.stringify(finished.body)).toBe(200);
    expect(finished.body.state).toBe("acknowledged");
    expect((await verificationPool.query("SELECT executed_by FROM pilot_pause_audit WHERE operation_id = $1", [id])).rows[0].executed_by).toBe(first.userId);
    expect((await verificationPool.query("SELECT resumed_by, resumed_from FROM pilot_pause_operations WHERE id = $1", [id])).rows[0]).toEqual({ resumed_by: second.userId, resumed_from: "committed" });
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
    await verificationPool.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
    const staleProvider = fakeProvider({ subject: "pause-subject", email: "pause-operator@example.test", emailVerified: true, assuranceLevel: "aal2", userMetadata: {} });
    setAuthProviderForTests({ ...staleProvider, refresh: async () => { throw new Error("session revoked"); } });
    expect((await agent.get("/v1/operator/pending")).status).toBe(401);
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("recovers an acknowledged pause from a receipt after an older database state", async () => {
    const { agent, csrf, cookie } = await operator();
    const decision = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "restore-1").send({ capability: "offers", paused: true, reason: "Restore rehearsal decision" });
    expect(decision.status).toBe(200);
    await verificationPool.query("DELETE FROM pilot_pause_audit WHERE operation_id = $1", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_pause_followup WHERE operation_id = $1", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_email_jobs WHERE event_id IN (SELECT id FROM pilot_notification_events WHERE operation_id = $1)", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE operation_id = $1", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_pause_operations WHERE id = $1", [decision.body.id]);
    await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL, updated_at = now() - interval '1 day' WHERE capability = 'offers'");
    const recovered = await request(createApp()).post("/v1/operator/reconcile").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
    expect(recovered.status).toBe(200);
    expect(recovered.body.receipts).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS count FROM pilot_email_jobs WHERE event_id = $1 AND status IN ('pending', 'leased')", [decision.body.id])).rows[0].count).toBe(0);
    expect((await agent.get("/v1/operator/pilot-status")).body.recovery.mode).toBe("restricted");
    const reopened = await request(createApp()).post("/v1/operator/reopen").set("Idempotency-Key", "reopen-1").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ reason: "Reviewed restored receipt and state" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status.capabilities.find((item: { capability: string }) => item.capability === "offers").paused).toBe(true);
    expect((await agent.get(`/v1/operator/operations/${decision.body.id}`)).body.state).toBe("recovered");
    const repeatedReopen = await request(createApp()).post("/v1/operator/reopen").set("Idempotency-Key", "reopen-1").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ reason: "Reviewed restored receipt and state" });
    expect(repeatedReopen.body.operationId).toBe(reopened.body.operationId);
    await verificationPool.query("DELETE FROM pilot_reopen_audit WHERE operation_id = $1", [reopened.body.operationId]);
    await verificationPool.query("DELETE FROM pilot_reopen_operations WHERE id = $1", [reopened.body.operationId]);
    const reconciledReopen = await request(createApp()).post("/v1/operator/reconcile").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
    expect(reconciledReopen.status).toBe(200);
    expect((await agent.get("/v1/operator/pilot-status")).body.recovery.mode).toBe("restricted");
    expect((await verificationPool.query("SELECT state FROM pilot_reopen_operations WHERE id = $1", [reopened.body.operationId])).rows[0].state).toBe("recovered");
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("restricts acknowledgements when the latest independently uploaded snapshot is stale", async () => {
    const { agent, csrf, cookie } = await operator();
    const previous = process.env.PILOT_BACKUP_REQUIRED;
    process.env.PILOT_BACKUP_REQUIRED = "true";
    try {
      await verificationPool.query(`INSERT INTO pilot_backup_attempts (status, snapshot_at, uploaded_at, finished_at, object_key, ciphertext_sha256)
        VALUES ('complete', now() - interval '51 minutes', now() - interval '50 minutes', now() - interval '50 minutes', 'synthetic/backup', repeat('a', 64))`);
      const result = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "stale-backup-1").send({ capability: "offers", paused: true, reason: "Stale backup exercise" });
      expect(result.status).toBe(503);
      const status = await agent.get("/v1/operator/status");
      expect(status.body.backup).toMatchObject({ required: true, healthy: false, ageMinutes: 51 });
      expect(status.body.recovery.mode).toBe("restricted");
      expect((await verificationPool.query("SELECT count(*)::int AS count FROM pilot_pause_operations")).rows[0].count).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.PILOT_BACKUP_REQUIRED;
      else process.env.PILOT_BACKUP_REQUIRED = previous;
    }
  });
  it("restricts acknowledgements when a recent backup cannot be verified off site", async () => {
    const { agent, csrf, cookie } = await operator();
    setBackupObjectProbeForTests(async () => false);
    const previous = process.env.PILOT_BACKUP_REQUIRED;
    process.env.PILOT_BACKUP_REQUIRED = "true";
    try {
      await verificationPool.query(`INSERT INTO pilot_backup_attempts (status, snapshot_at, uploaded_at, finished_at, object_key, ciphertext_sha256)
        VALUES ('complete', now() - interval '10 minutes', now() - interval '9 minutes', now() - interval '9 minutes', 'synthetic/missing', repeat('a', 64))`);
      const result = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000")
        .set("X-CSRF-Token", csrf).set("Idempotency-Key", "missing-backup-1")
        .send({ capability: "offers", paused: true, reason: "Backup object missing" });
      expect(result.status).toBe(503);
      const status = await agent.get("/v1/operator/status");
      expect(status.body.backup).toMatchObject({ required: true, healthy: false, ageMinutes: 10 });
    } finally {
      if (previous === undefined) delete process.env.PILOT_BACKUP_REQUIRED;
      else process.env.PILOT_BACKUP_REQUIRED = previous;
    }
  });
  it("keeps a fresh completed snapshot visible despite many later failures", async () => {
    const { agent } = await operator();
    setBackupObjectProbeForTests(async () => true);
    const previous = process.env.PILOT_BACKUP_REQUIRED;
    process.env.PILOT_BACKUP_REQUIRED = "true";
    try {
      await verificationPool.query(`INSERT INTO pilot_backup_attempts (status, snapshot_at, uploaded_at, finished_at, object_key, ciphertext_sha256)
        VALUES ('complete', now() - interval '10 minutes', now() - interval '9 minutes', now() - interval '9 minutes', 'synthetic/backup', repeat('a', 64))`);
      await verificationPool.query(`INSERT INTO pilot_backup_attempts (status, started_at, finished_at, error_code)
        SELECT 'failed', now() - interval '8 minutes' + n * interval '1 second', now(), 'SYNTHETIC_FAILURE'
          FROM generate_series(1, 25) AS n`);
      const status = await agent.get("/v1/operator/status");
      expect(status.body.backup).toMatchObject({ required: true, healthy: true, objectVerified: true, ageMinutes: 10 });
      expect(status.body.backup.failedAttempts).toHaveLength(20);
      expect(status.body.recovery.mode).toBe("open");
    } finally {
      if (previous === undefined) delete process.env.PILOT_BACKUP_REQUIRED;
      else process.env.PILOT_BACKUP_REQUIRED = previous;
    }
  });
  it("restricts reads after acknowledged evidence disappears", async () => {
    const { agent, csrf, cookie } = await operator();
    const decision = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "lost-1").send({ capability: "offers", paused: false, reason: "Temporary clear decision" });
    expect(decision.status).toBe(200);
    await rm(process.env.PILOT_RECEIPT_PATH!, { recursive: true, force: true });
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
    expect(publicStatus.body.recovery.cause).toBeUndefined();
    expect(publicStatus.body.capabilities.every((item: { paused: boolean }) => item.paused)).toBe(true);
    await chmod(receiptDirectory, 0o700);
    await rm(receiptDirectory, { recursive: true, force: true });
  });
});
