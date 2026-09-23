import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

import pg from "pg";

const canUseDatabase = process.env.TEST_DATABASE_DISPOSABLE === "true" && Boolean(process.env.DATABASE_URL);

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
    payment_total: "12500",
    settlement_total: "12500",
  });
  assert.deepEqual(report.representativeUpgrade.after, {
    ...report.representativeUpgrade.before,
    migrated_chat_rooms: 1,
    stable_identities: 2,
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
        clerk_id text
      );
      INSERT INTO user_profiles VALUES
        ('00000000-0000-4000-8000-000000000001', 'legacy@example.test', 'clerk-1');
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
    assert.deepEqual(report.identityMapping.clerk_id, { present: 1, missing: 0, duplicate_excess: 0 });
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
