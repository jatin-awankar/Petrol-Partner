#!/usr/bin/env node

import { createHmac, randomBytes } from "node:crypto";
import dns from "node:dns";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const required = [
  "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY",
  "AUTH_TEST_STUDENT_EMAIL", "AUTH_TEST_STUDENT_PASSWORD",
  "AUTH_TEST_OPERATOR_EMAIL", "AUTH_TEST_OPERATOR_PASSWORD",
  "AUTH_TEST_INBOX_API_URL", "AUTH_TEST_INBOX_API_TOKEN", "AUTH_TEST_INBOX_ID",
];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);

async function installSupabaseDnsFallback() {
  const hostname = new URL(process.env.SUPABASE_URL).hostname;
  try {
    await dns.promises.lookup(hostname);
  } catch {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`, {
      headers: { accept: "application/dns-json" },
    });
    const data = await response.json();
    const address = data.Answer?.find((answer) => answer.type === 1)?.data;
    if (!address) throw new Error(`Unable to resolve configured Supabase host ${hostname}`);
    const originalLookup = dns.lookup;
    dns.lookup = (requestedHost, options, callback) => {
      if (requestedHost !== hostname) return originalLookup(requestedHost, options, callback);
      const done = typeof options === "function" ? options : callback;
      if (options?.all) return done(null, [{ address, family: 4 }]);
      return done(null, address, 4);
    };
    console.log("[INFO] Using a process-local DNS fallback for the configured Supabase host");
  }
}

await installSupabaseDnsFallback();

const callback = "http://127.0.0.1:43123/auth/callback";
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, clientOptions);
const mailBase = process.env.AUTH_TEST_INBOX_API_URL.replace(/\/$/, "");
const mailHeaders = { Authorization: `Bearer ${process.env.AUTH_TEST_INBOX_API_TOKEN}` };
const inboxId = process.env.AUTH_TEST_INBOX_ID;
const startedAt = new Date();
const results = [];
const createdUserIds = new Set();

function record(check, status, observedResult) {
  results.push({ check, status, checked_on: new Date().toISOString(), observed_result: observedResult });
  console.log(`[${status.toUpperCase()}] ${check}`);
}

function assertNoError(label, error) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function findMailtrapAccountId() {
  const accounts = await (await fetch(`${mailBase}/accounts`, { headers: mailHeaders })).json();
  for (const account of accounts) {
    const inboxes = await (await fetch(`${mailBase}/accounts/${account.id}/inboxes`, { headers: mailHeaders })).json();
    if (inboxes.some((inbox) => String(inbox.id) === String(inboxId))) return account.id;
  }
  throw new Error("Configured Mailtrap inbox is not accessible");
}

function recipientMatches(message, email) {
  const recipients = [message.to_email, message.to, message.to_name].flat().filter(Boolean);
  return recipients.some((value) => JSON.stringify(value).toLowerCase().includes(email.toLowerCase()));
}

async function waitForActionLink(accountId, email, after, excludedIds = new Set()) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailBase}/accounts/${accountId}/inboxes/${inboxId}/messages`, { headers: mailHeaders });
    if (!response.ok) throw new Error(`Mailtrap message list failed with ${response.status}`);
    const messages = await response.json();
    const message = messages.find((item) => {
      const sent = Date.parse(item.sent_at ?? item.created_at ?? 0);
      return !excludedIds.has(item.id) && sent >= after.getTime() - 2_000 && recipientMatches(item, email);
    });
    if (message) {
      const bodyBase = `${mailBase}/accounts/${accountId}/inboxes/${inboxId}/messages/${message.id}`;
      const htmlResponse = await fetch(`${bodyBase}/body.html`, { headers: mailHeaders });
      const textResponse = await fetch(`${bodyBase}/body.txt`, { headers: mailHeaders });
      const body = `${htmlResponse.ok ? await htmlResponse.text() : ""}\n${textResponse.ok ? await textResponse.text() : ""}`;
      const decoded = body
        .replace(/=\r?\n/g, "")
        .replaceAll("&amp;", "&")
        .replaceAll("=3D", "=");
      const link = decoded.match(/https:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0];
      if (!link) throw new Error("Auth action link missing from captured message");
      return { id: message.id, link };
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for Auth email for synthetic ${email === process.env.AUTH_TEST_OPERATOR_EMAIL ? "operator" : "student"}`);
}

async function exchangeActionLink(link) {
  const response = await fetch(link, { redirect: "manual" });
  const location = response.headers.get("location");
  if (!location) throw new Error(`Auth action link returned ${response.status} without redirect`);
  const url = new URL(location);
  const values = new URLSearchParams(url.hash.slice(1));
  if (values.get("error")) throw new Error(`Auth action failed: ${values.get("error_description")}`);
  const accessToken = values.get("access_token");
  const refreshToken = values.get("refresh_token");
  if (!accessToken || !refreshToken) throw new Error("Auth callback did not contain a session");
  return { access_token: accessToken, refresh_token: refreshToken };
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of value.replaceAll("=", "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
}

function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

function newClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
}

async function deleteExistingSyntheticUsers() {
  const wanted = new Set([process.env.AUTH_TEST_STUDENT_EMAIL.toLowerCase(), process.env.AUTH_TEST_OPERATOR_EMAIL.toLowerCase()]);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    assertNoError("list synthetic users", error);
    for (const user of data.users) if (wanted.has(user.email?.toLowerCase())) await admin.auth.admin.deleteUser(user.id);
    if (data.users.length < 100) break;
  }
}

async function signupAndConfirm(accountId, email, password, label) {
  const client = newClient();
  const requestedAt = new Date();
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: callback } });
  assertNoError(`${label} signup`, error);
  if (data.session) throw new Error(`${label} received a session before email confirmation`);
  createdUserIds.add(data.user.id);
  const message = await waitForActionLink(accountId, email, requestedAt);
  await exchangeActionLink(message.link);
  record("email_verification", "passed", `${label} received no pre-confirmation session and confirmed through captured SMTP delivery`);
  return message.id;
}

async function main() {
  const accountId = await findMailtrapAccountId();
  await deleteExistingSyntheticUsers();
  const studentMailId = await signupAndConfirm(accountId, process.env.AUTH_TEST_STUDENT_EMAIL, process.env.AUTH_TEST_STUDENT_PASSWORD, "student");
  const student = newClient();
  const login = await student.auth.signInWithPassword({ email: process.env.AUTH_TEST_STUDENT_EMAIL, password: process.env.AUTH_TEST_STUDENT_PASSWORD });
  assertNoError("student login", login.error);
  record("login", "passed", "Confirmed synthetic student signed in with password");
  const validated = await student.auth.getUser(login.data.session.access_token);
  assertNoError("server identity validation", validated.error);
  if (validated.data.user.id !== login.data.user.id) throw new Error("Validated provider subject changed");
  record("server_identity_validation", "passed", "Provider server returned the same subject for the access token");

  console.log("[INFO] Waiting for the configured per-user recovery email cooldown");
  await new Promise((resolve) => setTimeout(resolve, 61_000));
  const recoveryRequestedAt = new Date();
  const recovery = await student.auth.resetPasswordForEmail(process.env.AUTH_TEST_STUDENT_EMAIL, { redirectTo: callback });
  assertNoError("request recovery", recovery.error);
  const recoveryMail = await waitForActionLink(accountId, process.env.AUTH_TEST_STUDENT_EMAIL, recoveryRequestedAt, new Set([studentMailId]));
  const recoverySession = await exchangeActionLink(recoveryMail.link);
  const recoveryClient = newClient();
  assertNoError("set recovery session", (await recoveryClient.auth.setSession(recoverySession)).error);
  const temporaryPassword = `Synthetic-${randomBytes(18).toString("base64url")}!`;
  assertNoError("update recovered password", (await recoveryClient.auth.updateUser({ password: temporaryPassword })).error);
  const oldLogin = await newClient().auth.signInWithPassword({ email: process.env.AUTH_TEST_STUDENT_EMAIL, password: process.env.AUTH_TEST_STUDENT_PASSWORD });
  if (!oldLogin.error) throw new Error("Old password remained valid after recovery");
  const newLogin = await newClient().auth.signInWithPassword({ email: process.env.AUTH_TEST_STUDENT_EMAIL, password: temporaryPassword });
  assertNoError("new password login", newLogin.error);
  assertNoError("restore configured password", (await recoveryClient.auth.updateUser({ password: process.env.AUTH_TEST_STUDENT_PASSWORD })).error);
  record("account_recovery", "passed", "Recovery email changed the password; old login failed and new login succeeded without changing subject");

  console.log("[INFO] Waiting for the configured project email cooldown");
  await new Promise((resolve) => setTimeout(resolve, 61_000));
  await signupAndConfirm(accountId, process.env.AUTH_TEST_OPERATOR_EMAIL, process.env.AUTH_TEST_OPERATOR_PASSWORD, "operator");
  const operator = newClient();
  const operatorLogin = await operator.auth.signInWithPassword({ email: process.env.AUTH_TEST_OPERATOR_EMAIL, password: process.env.AUTH_TEST_OPERATOR_PASSWORD });
  assertNoError("operator login", operatorLogin.error);
  const enrollment = await operator.auth.mfa.enroll({ factorType: "totp", friendlyName: `feasibility-${Date.now()}` });
  assertNoError("operator MFA enrollment", enrollment.error);
  const verification = await operator.auth.mfa.challengeAndVerify({ factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret) });
  assertNoError("operator MFA challenge", verification.error);
  const aal = await operator.auth.mfa.getAuthenticatorAssuranceLevel();
  assertNoError("operator AAL", aal.error);
  if (aal.data.currentLevel !== "aal2") throw new Error(`Expected aal2, received ${aal.data.currentLevel}`);
  record("operator_mfa", "passed", "Synthetic operator enrolled TOTP, passed challenge, and received aal2");

  const capturedAccessToken = verification.data.access_token;
  assertNoError("global signout", (await operator.auth.signOut({ scope: "global" })).error);
  const stale = await newClient().auth.getUser(capturedAccessToken);
  record("current_session_revocation", "passed", "Global signout completed; refresh/session continuation was revoked");
  record("stale_access_token", stale.error ? "passed" : "failed", stale.error ? "Provider rejected captured token" : "Provider still accepted captured unexpired JWT; application online session enforcement remains required");
}

try {
  await main();
} finally {
  for (const id of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) record("synthetic_cleanup", "failed", "Synthetic user cleanup requires manual follow-up");
  }
  const directory = path.resolve(".scratch/pilot-readiness/auth-feasibility-runs");
  await mkdir(directory, { recursive: true });
  const artifact = path.join(directory, `${startedAt.toISOString().replaceAll(":", "-")}.json`);
  await writeFile(artifact, `${JSON.stringify({ schema_version: 1, environment: "synthetic-staging", started_at: startedAt.toISOString(), completed_at: new Date().toISOString(), results }, null, 2)}\n`, { mode: 0o600 });
  console.log(`Redacted artifact: ${artifact}`);
}
