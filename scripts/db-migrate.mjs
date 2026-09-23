import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";

const migrationsDirectory = resolve("apps/api/src/db/migrations");
const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const migrations = await Promise.all(
  migrationNames.map(async (name) => {
    const sql = await readFile(resolve(migrationsDirectory, name), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }),
);
const toIndex = process.argv.indexOf("--to");
const targetName = toIndex === -1 ? undefined : process.argv[toIndex + 1];
if (toIndex !== -1 && !migrationNames.includes(targetName)) {
  console.error(`Unknown migration target: ${targetName ?? "(missing)"}`);
  process.exit(1);
}
const targetMigrations = targetName
  ? migrations.slice(0, migrationNames.indexOf(targetName) + 1)
  : migrations;

if (process.argv.includes("--plan")) {
  console.log(JSON.stringify(migrations.map(({ name, checksum }) => ({ name, checksum })), null, 2));
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

function verifyHistory(applied) {
  for (let index = 0; index < applied.length; index += 1) {
    const actual = applied[index];
    const expected = migrations[index];
    if (!expected || actual.name !== expected.name) {
      throw new Error(`Migration history diverges at ${actual.name}; expected ${expected?.name ?? "no migration"}`);
    }
    if (actual.checksum !== expected.checksum) {
      throw new Error(`Checksum mismatch for applied migration ${actual.name}`);
    }
  }
}

try {
  await client.query("SELECT pg_advisory_lock(hashtext('petrol-partner-schema-migrations'))");
  const ledgerExists = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
  );
  if (!ledgerExists.rows[0].exists) {
    const existingTables = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );
    if (existingTables.rowCount > 0) {
      throw new Error(
        "Refusing to infer a baseline for a non-empty database without schema_migrations; inventory it and record an explicit migration decision first",
      );
    }
    if (process.argv.includes("--check")) {
      throw new Error("No migration history exists; 3 migration(s) remain unapplied");
    }
    await client.query(`CREATE TABLE public.schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  }

  const applied = (await client.query(
    "SELECT name, checksum FROM public.schema_migrations ORDER BY name",
  )).rows;
  verifyHistory(applied);

  if (process.argv.includes("--check")) {
    if (applied.length !== targetMigrations.length) {
      throw new Error(`${targetMigrations.length - applied.length} migration(s) remain unapplied`);
    }
    console.log(`Verified ${applied.length} migration checksum(s)`);
  } else {
    for (const migration of targetMigrations.slice(applied.length)) {
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied ${migration.name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  }
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext('petrol-partner-schema-migrations'))");
  } finally {
    client.release();
    await pool.end();
  }
}
