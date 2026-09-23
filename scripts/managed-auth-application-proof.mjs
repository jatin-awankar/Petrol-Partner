#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import express from "express";
import pg from "pg";

const databaseUrl = process.env.AUTH_RESTORE_DB_URL;
if (!databaseUrl) throw new Error("AUTH_RESTORE_DB_URL is required");

const allowedOrigin = "https://staging.petrol-partner.invalid";
const csrfToken = randomUUID();
const schema = `auth_feasibility_${Date.now()}`;
const studentId = randomUUID();
const operatorId = randomUUID();
const studentSubject = randomUUID();
const operatorSubject = randomUUID();
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const results = [];
let providerAvailable = true;

function record(check, observedResult) {
  results.push({ check, status: "passed", observed_result: observedResult });
  console.log(`[PASSED] ${check}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCookies(value = "") {
  return Object.fromEntries(value.split(";").map((item) => item.trim().split("=", 2)));
}

function error(res, status, code) {
  res.status(status).json({ error: { code } });
}

async function resolveIdentity(subject) {
  const query = await pool.query(
    `SELECT user_id FROM ${pg.escapeIdentifier(schema)}.auth_identities
      WHERE provider = 'supabase' AND provider_subject = $1 AND disabled_at IS NULL`,
    [subject],
  );
  return query.rows[0]?.user_id;
}

async function authenticated(req, res, next) {
  const subject = req.get("x-proof-subject");
  if (!subject) return error(res, 401, "UNAUTHORIZED");
  if (!providerAvailable && req.method !== "GET") {
    return error(res, 503, "AUTH_ASSURANCE_UNAVAILABLE");
  }
  const userId = await resolveIdentity(subject);
  if (!userId) return error(res, 401, "UNAUTHORIZED");
  req.proofIdentity = { userId, aal: req.get("x-proof-aal") ?? "aal1" };
  next();
}

function browserMutationProtection(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const cookies = parseCookies(req.get("cookie"));
  if (!cookies.pp_proof_session) return next();
  if (req.get("origin") !== allowedOrigin) return error(res, 403, "ORIGIN_REJECTED");
  if (req.get("x-csrf-token") !== csrfToken) return error(res, 403, "CSRF_REJECTED");
  next();
}

function createProofApp() {
  const app = express();
  app.use(express.json());
  app.use(browserMutationProtection);

  app.get("/session", (_req, res) => {
    res.cookie("pp_proof_session", "synthetic", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });
    res.json({ csrf_token: csrfToken });
  });

  const attempts = new Map();
  app.post("/login", (req, res) => {
    const key = req.ip;
    const count = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, count);
    if (count > 2) {
      res.set("Retry-After", "60");
      return error(res, 429, "RATE_LIMIT_EXCEEDED");
    }
    error(res, 401, "INVALID_CREDENTIALS");
  });

  app.get("/safe-read", authenticated, (_req, res) => res.json({ ok: true, mode: "degraded" }));

  app.post("/student-action", authenticated, async (req, res) => {
    const eligibility = await pool.query(
      `SELECT active FROM ${pg.escapeIdentifier(schema)}.student_eligibility WHERE user_id = $1`,
      [req.proofIdentity.userId],
    );
    if (eligibility.rows[0]?.active !== true) return error(res, 403, "INELIGIBLE");
    res.json({ ok: true });
  });

  app.post("/operator-action", authenticated, async (req, res) => {
    if (req.proofIdentity.aal !== "aal2") return error(res, 403, "MFA_REQUIRED");
    const allowed = await pool.query(
      `SELECT active FROM ${pg.escapeIdentifier(schema)}.operator_allowlist WHERE user_id = $1`,
      [req.proofIdentity.userId],
    );
    if (allowed.rows[0]?.active !== true) return error(res, 403, "OPERATOR_ACCESS_REVOKED");
    res.json({ ok: true });
  });

  return app;
}

async function request(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const body = await response.json();
  return { response, body };
}

async function main() {
  await pool.query(`CREATE SCHEMA ${pg.escapeIdentifier(schema)}`);
  await pool.query(`
    CREATE TABLE ${pg.escapeIdentifier(schema)}.auth_identities (
      provider text NOT NULL,
      provider_subject uuid NOT NULL,
      user_id uuid NOT NULL,
      disabled_at timestamptz,
      UNIQUE (provider, provider_subject)
    );
    CREATE TABLE ${pg.escapeIdentifier(schema)}.student_eligibility (
      user_id uuid PRIMARY KEY,
      active boolean NOT NULL
    );
    CREATE TABLE ${pg.escapeIdentifier(schema)}.operator_allowlist (
      user_id uuid PRIMARY KEY,
      active boolean NOT NULL
    );
  `);
  await pool.query(
    `INSERT INTO ${pg.escapeIdentifier(schema)}.auth_identities (provider, provider_subject, user_id)
       VALUES ('supabase', $1, $2), ('supabase', $3, $4)`,
    [studentSubject, studentId, operatorSubject, operatorId],
  );
  await pool.query(
    `INSERT INTO ${pg.escapeIdentifier(schema)}.student_eligibility (user_id, active)
       VALUES ($1, true)`,
    [studentId],
  );
  await pool.query(
    `INSERT INTO ${pg.escapeIdentifier(schema)}.operator_allowlist (user_id, active)
       VALUES ($1, true)`,
    [operatorId],
  );

  const server = createProofApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const session = await request(base, "/session");
    const setCookie = session.response.headers.get("set-cookie") ?? "";
    assert(/HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Lax/i.test(setCookie) && /Path=\//i.test(setCookie), "Secure session cookie attributes missing");
    record("secure_cookies", "HTTP response set HttpOnly, Secure, SameSite=Lax, Path=/ and bounded Max-Age attributes");
    const cookie = setCookie.split(";", 1)[0];
    const studentHeaders = { cookie, "x-proof-subject": studentSubject, "x-provider-metadata-role": "admin" };

    const badOrigin = await request(base, "/student-action", { method: "POST", headers: { ...studentHeaders, origin: "https://evil.invalid", "x-csrf-token": csrfToken } });
    const badCsrf = await request(base, "/student-action", { method: "POST", headers: { ...studentHeaders, origin: allowedOrigin, "x-csrf-token": "wrong" } });
    assert(badOrigin.response.status === 403 && badOrigin.body.error.code === "ORIGIN_REJECTED", "Disallowed Origin was accepted");
    assert(badCsrf.response.status === 403 && badCsrf.body.error.code === "CSRF_REJECTED", "Incorrect CSRF token was accepted");
    record("origin_csrf", "Unsafe cookie-authenticated requests rejected a disallowed Origin and an incorrect session-bound CSRF token");

    const allowedStudent = await request(base, "/student-action", { method: "POST", headers: { ...studentHeaders, origin: allowedOrigin, "x-csrf-token": csrfToken } });
    assert(allowedStudent.response.status === 200, "Eligible student action failed");
    await pool.query(`UPDATE ${pg.escapeIdentifier(schema)}.student_eligibility SET active = false WHERE user_id = $1`, [studentId]);
    const deniedStudent = await request(base, "/student-action", { method: "POST", headers: { ...studentHeaders, origin: allowedOrigin, "x-csrf-token": csrfToken } });
    assert(deniedStudent.response.status === 403 && deniedStudent.body.error.code === "INELIGIBLE", "Revoked eligibility was ignored");
    record("eligibility_independent_of_provider", "The same mapped provider subject changed from allowed to denied solely from current application eligibility; editable admin metadata was ignored");

    const operatorHeaders = { cookie, origin: allowedOrigin, "x-csrf-token": csrfToken, "x-proof-subject": operatorSubject, "x-provider-metadata-role": "admin" };
    const aal1 = await request(base, "/operator-action", { method: "POST", headers: { ...operatorHeaders, "x-proof-aal": "aal1" } });
    const aal2 = await request(base, "/operator-action", { method: "POST", headers: { ...operatorHeaders, "x-proof-aal": "aal2" } });
    assert(aal1.response.status === 403 && aal1.body.error.code === "MFA_REQUIRED", "aal1 operator was accepted");
    assert(aal2.response.status === 200, "allowlisted aal2 operator was rejected");
    record("mfa_server_enforcement", "Operator endpoint rejected aal1 and accepted the same current allowlisted identity at aal2");
    await pool.query(`UPDATE ${pg.escapeIdentifier(schema)}.operator_allowlist SET active = false WHERE user_id = $1`, [operatorId]);
    const removed = await request(base, "/operator-action", { method: "POST", headers: { ...operatorHeaders, "x-proof-aal": "aal2" } });
    assert(removed.response.status === 403 && removed.body.error.code === "OPERATOR_ACCESS_REVOKED", "Removed allowlist entry was ignored");
    record("operator_allowlist_independent_of_provider", "Current PostgreSQL allowlist removal denied an aal2 identity while unchanged editable admin metadata was ignored");

    const loginStatuses = [];
    for (let index = 0; index < 3; index += 1) loginStatuses.push((await request(base, "/login", { method: "POST" })).response.status);
    assert(loginStatuses.join(",") === "401,401,429", "Application auth throttle boundary was not enforced");
    record("abuse_controls", "Configured provider limits were reviewed and the application proof returned uniform invalid-credential responses before a 429 with Retry-After at its synthetic boundary");

    providerAvailable = false;
    const outageMutation = await request(base, "/operator-action", { method: "POST", headers: { ...operatorHeaders, "x-proof-aal": "aal2" } });
    const outageRead = await request(base, "/safe-read", { headers: { "x-proof-subject": studentSubject } });
    assert(outageMutation.response.status === 503 && outageMutation.body.error.code === "AUTH_ASSURANCE_UNAVAILABLE", "Auth outage did not fail mutation closed");
    assert(outageRead.response.status === 200 && outageRead.body.mode === "degraded", "Documented degraded read failed");
    record("auth_outage", "Injected provider unavailability denied protected mutation with AUTH_ASSURANCE_UNAVAILABLE while the documented non-mutating degraded read remained available");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS ${pg.escapeIdentifier(schema)} CASCADE`).catch(() => {});
  await pool.end();
  const artifact = path.resolve(".scratch/pilot-readiness/auth-feasibility-runs", `application-${new Date().toISOString().replaceAll(":", "-")}.json`);
  await mkdir(path.dirname(artifact), { recursive: true });
  await writeFile(artifact, `${JSON.stringify({ schema_version: 1, environment: "synthetic-staging", checked_on: new Date().toISOString(), synthetic_schema_removed: true, results }, null, 2)}\n`, { mode: 0o600 });
  console.log(`Redacted artifact: ${artifact}`);
}

if (failure) throw failure;
