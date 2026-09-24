import type { Pool, PoolClient } from "pg";

export type ProtectedOperationState = "intent" | "committed" | "acknowledged" | "recovered";

export interface IndependentEvidenceStore<T> {
  list(): Promise<T[]>;
  append(receipt: T): Promise<void>;
  probe(): Promise<void>;
}

// A service still owns authorization, policy, business SQL, audit, and the point
// at which independent evidence permits acknowledgement.
export async function inProtectedTransaction<T>(database: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
