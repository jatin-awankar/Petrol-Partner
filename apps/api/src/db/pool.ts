import { Pool, type PoolClient, type QueryResult } from "pg";

import { env } from "../config/env";

const connection = {
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
};

export const pool = new Pool({
  ...connection,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Waiting for an operator's MFA enrollment must not consume connections needed
// by the active enrollment to audit its provider operation.
export const mfaEnrollmentLockPool = new Pool({
  ...connection,
  max: 4,
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
});

export type DbClient = PoolClient;

export async function dbQuery<T = unknown>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<any>> {
  return pool.query(text, params);
}
