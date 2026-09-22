import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const migrationsDirectory = resolve("apps/api/src/db/migrations");
const migrations = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  for (const migration of migrations) {
    const sql = await readFile(resolve(migrationsDirectory, migration), "utf8");
    await pool.query(sql);
    console.log(`Applied ${migration}`);
  }
} finally {
  await pool.end();
}
