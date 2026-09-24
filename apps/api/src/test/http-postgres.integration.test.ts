import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { pool } from "../db/pool";
import { setAuthProviderForTests, setManagedAuthEnabledForTests, type AuthProvider, type ProviderIdentity } from "../modules/auth/auth-provider";

const verificationPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const migrations = ["0001_init.sql", "0002_profile_settings.sql", "0003_chat.sql", "0004_acknowledgement_prototype.sql", "0005_managed_auth_identities.sql", "0006_operator_allowlist.sql"];

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
