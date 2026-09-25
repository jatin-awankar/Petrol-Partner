import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, expect, it } from "vitest";
import { createApp } from "../app";
import { pool } from "../db/pool";
import { setAuthProviderForTests, setManagedAuthEnabledForTests, type AuthProvider, type ProviderIdentity } from "../modules/auth/auth-provider";

const live = process.env.PILOT_B2_LIVE_TEST === "true";
const database = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const migrations = ["0001_init.sql", "0002_profile_settings.sql", "0003_chat.sql", "0004_acknowledgement_prototype.sql", "0005_managed_auth_identities.sql", "0006_operator_allowlist.sql", "0007_operator_pause.sql", "0008_operator_intent_handoff.sql", "0009_durable_notifications.sql", "0010_email_retry_operations.sql"];

it.skipIf(!live)("acknowledges and restores a protected HTTP decision through PostgreSQL and B2", async () => {
  const target = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/");
  if (process.env.TEST_DATABASE_DISPOSABLE !== "true" || target.hostname !== "127.0.0.1" || target.port !== "55432" ||
      target.pathname !== "/petrol_partner_b2_test" || process.env.PILOT_RECEIPT_BACKEND !== "b2" ||
      !/^synthetic\/ticket09\/http\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(process.env.PILOT_B2_PREFIX ?? "")) {
    throw new Error("B2 live rehearsal requires the dedicated disposable local database and a fresh synthetic B2 namespace");
  }
  for (const migration of migrations) {
    await database.query(await readFile(resolve(import.meta.dirname, "../db/migrations", migration), "utf8"));
  }
  await database.query("TRUNCATE users CASCADE");
  await database.query("TRUNCATE pilot_pause_audit, pilot_pause_followup, pilot_pause_operations, pilot_reopen_audit, pilot_reopen_operations CASCADE");
  await database.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL");
  await database.query("INSERT INTO pilot_recovery_state (singleton, mode) VALUES (true, 'open') ON CONFLICT (singleton) DO UPDATE SET mode = 'open', cause = NULL, started_at = NULL, reconciled_at = NULL");
  await database.query("UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'b2-live-test'");

  const identity: ProviderIdentity = {
    subject: `b2-live-${randomUUID()}`, email: "b2-live-operator@example.test", emailVerified: true,
    assuranceLevel: "aal2", userMetadata: {},
  };
  const user = await database.query<{ id: string }>("INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [identity.email]);
  await database.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Synthetic B2 Operator')", [user.rows[0].id]);
  await database.query("INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)", [identity.subject, user.rows[0].id, identity.email]);
  await database.query("INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic rehearsal', now())", [user.rows[0].id]);
  const session = { accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresIn: 900, identity };
  const provider: AuthProvider = {
    register: async () => undefined, login: async () => session, validate: async () => identity,
    refresh: async () => session, requestRecovery: async () => undefined, updatePassword: async () => undefined,
    logout: async () => undefined, exchangeCode: async () => session,
  };
  setManagedAuthEnabledForTests(true);
  setAuthProviderForTests(provider);
  const agent = request.agent(createApp());
  const login = await agent.post("/v1/auth/login").send({ email: identity.email, password: "synthetic-password" });
  expect(login.status).toBe(200);
  const csrf = login.headers["set-cookie"]?.find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
  const cookie = login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; ");
  const decision = { capability: "requests", paused: true, reason: "Synthetic B2 recovery rehearsal" };
  const key = randomUUID();
  const send = () => request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000")
    .set("X-CSRF-Token", csrf).set("Idempotency-Key", key).send(decision);
  const first = await send();
  expect(first.status, JSON.stringify(first.body)).toBe(200);
  expect(first.body.state).toBe("acknowledged");
  expect((await send()).body.id).toBe(first.body.id);
  expect((await database.query("SELECT count(*)::int AS count FROM pilot_pause_audit WHERE operation_id = $1", [first.body.id])).rows[0].count).toBe(1);
  expect((await database.query("SELECT count(*)::int AS count FROM pilot_pause_followup WHERE operation_id = $1", [first.body.id])).rows[0].count).toBe(1);

  await database.query("DELETE FROM pilot_pause_audit WHERE operation_id = $1", [first.body.id]);
  await database.query("DELETE FROM pilot_pause_followup WHERE operation_id = $1", [first.body.id]);
  await database.query("DELETE FROM pilot_pause_operations WHERE id = $1", [first.body.id]);
  await database.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL WHERE capability = 'requests'");
  await database.query("UPDATE pilot_recovery_state SET mode = 'restricted', cause = 'synthetic_restore', started_at = now() WHERE singleton");
  const restored = await request(createApp()).post("/v1/operator/reconcile").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
  expect(restored.status, JSON.stringify(restored.body)).toBe(200);
  const row = (await database.query("SELECT state, payload_digest FROM pilot_pause_operations WHERE id = $1", [first.body.id])).rows[0];
  expect(row.state).toBe("recovered");
  expect(row.payload_digest).toBe(createHash("sha256").update(JSON.stringify(decision)).digest("hex"));
  expect((await database.query("SELECT paused FROM pilot_pause_state WHERE capability = 'requests'")).rows[0].paused).toBe(true);
  expect((await database.query("SELECT count(*)::int AS count FROM pilot_pause_audit WHERE operation_id = $1", [first.body.id])).rows[0].count).toBe(1);
  expect((await database.query("SELECT count(*)::int AS count FROM pilot_pause_followup WHERE operation_id = $1", [first.body.id])).rows[0].count).toBe(1);
  expect((await database.query("SELECT mode FROM pilot_recovery_state WHERE singleton")).rows[0].mode).toBe("restricted");
  const reopen = await request(createApp()).post("/v1/operator/reopen").set("Cookie", cookie).set("Origin", "http://localhost:3000")
    .set("X-CSRF-Token", csrf).set("Idempotency-Key", randomUUID()).send({ reason: "Reviewed synthetic B2 recovery" });
  expect(reopen.status, JSON.stringify(reopen.body)).toBe(200);
  expect(reopen.body.status.recovery.mode).toBe("open");
  expect(reopen.body.status.capabilities.find((item: { capability: string }) => item.capability === "requests").paused).toBe(true);
}, 120000);

afterAll(async () => {
  setManagedAuthEnabledForTests(null);
  setAuthProviderForTests(null);
  await Promise.all([pool.end(), database.end()]);
});
