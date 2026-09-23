import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

import pg from "pg";

const canUseDatabase = process.env.TEST_DATABASE_DISPOSABLE === "true" && Boolean(process.env.DATABASE_URL);

test("rehearsal refuses a localhost database whose name does not end in _test", () => {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "db-rehearsal.mjs")], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner",
      TEST_DATABASE_DISPOSABLE: "true",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /database name ending in _test/);
  assert.doesNotMatch(result.stderr, /password authentication failed|ECONNREFUSED/);
});

test("clean install and representative upgrade preserve migration invariants", { skip: !canUseDatabase }, () => {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "db-rehearsal.mjs")], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: process.env,
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.safety.refusedUntrackedNonEmptyDatabase, true);
  assert.deepEqual(report.representativeUpgrade.before, {
    users: 2,
    bookings: 1,
    active_requests: 1,
    payment_total: "12500",
    settlement_total: "12500",
  });
  assert.deepEqual(report.representativeUpgrade.after, {
    ...report.representativeUpgrade.before,
    migrated_chat_rooms: 1,
    stable_identities: 2,
    preserved_request_passengers: 1,
  });
});

test("inventory tolerates a legacy ledger and reports legacy provider mappings and composite keys", { skip: !canUseDatabase }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await pool.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      CREATE TABLE user_profiles (
        id uuid PRIMARY KEY,
        email text,
        clerk_id text,
        is_verified boolean
      );
      INSERT INTO user_profiles VALUES
        ('00000000-0000-4000-8000-000000000001', 'duplicate@example.test', 'clerk-1', true),
        ('00000000-0000-4000-8000-000000000002', 'DUPLICATE@example.test', 'clerk-2', false),
        ('00000000-0000-4000-8000-000000000003', NULL, NULL, NULL);
      CREATE TABLE user_details (id uuid PRIMARY KEY, is_verified boolean);
      INSERT INTO user_details VALUES
        ('00000000-0000-4000-8000-000000000001', true),
        ('00000000-0000-4000-8000-000000000002', false);
      CREATE TABLE vehicles (id uuid PRIMARY KEY, is_verified boolean);
      INSERT INTO vehicles VALUES
        ('10000000-0000-4000-8000-000000000001', true),
        ('10000000-0000-4000-8000-000000000002', NULL);
      CREATE TABLE bookings (
        id uuid PRIMARY KEY,
        payment_status text,
        razorpay_order_id text,
        razorpay_payment_id text
      );
      INSERT INTO bookings VALUES
        ('20000000-0000-4000-8000-000000000001', 'completed', 'order-1', 'payment-1'),
        ('20000000-0000-4000-8000-000000000002', 'pending', 'order-2', NULL),
        ('20000000-0000-4000-8000-000000000003', NULL, NULL, NULL);
      CREATE TABLE schema_migrations (version integer PRIMARY KEY);
      INSERT INTO schema_migrations VALUES (1);
      CREATE TABLE composite_parent (left_id integer, right_id integer, PRIMARY KEY (left_id, right_id));
      CREATE TABLE composite_child (
        id integer PRIMARY KEY,
        left_id integer,
        right_id integer,
        FOREIGN KEY (left_id, right_id) REFERENCES composite_parent(left_id, right_id)
      );
      INSERT INTO composite_parent VALUES (1, 2);
      INSERT INTO composite_child VALUES (1, 1, 2);
    `);
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "db-inventory.mjs")], {
      cwd: resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.emailQuality.user_profiles, { missing: 1, duplicate_excess: 1 });
    assert.deepEqual(report.identityMapping.clerk_id, { present: 2, missing: 1, duplicate_excess: 0 });
    assert.deepEqual(report.eligibilityDecisions, {
      "user_profiles.is_verified": { approved: 1, notApproved: 1, unknown: 1 },
      "user_details.is_verified": { approved: 1, notApproved: 1, unknown: 0 },
      "vehicles.is_verified": { approved: 1, notApproved: 0, unknown: 1 },
    });
    assert.deepEqual(report.legacyPaymentHistory.bookings, {
      paymentStatusCounts: [
        { status: "completed", count: 1 },
        { status: "pending", count: 1 },
        { status: null, count: 1 },
      ],
      razorpayOrderIdsPresent: 2,
      razorpayPaymentIdsPresent: 1,
    });
    assert.deepEqual(report.migrationHistory, {
      compatible: false,
      columns: ["version"],
      rowCount: 1,
    });
    const compositeKey = report.foreignKeys.find(({ constraint_name }) =>
      constraint_name === "composite_child_left_id_right_id_fkey");
    assert.deepEqual(compositeKey.columns, ["left_id", "right_id"]);
    assert.deepEqual(compositeKey.referenced_columns, ["left_id", "right_id"]);
    assert.equal(compositeKey.orphanCount, 0);
  } finally {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await pool.end();
  }
});
