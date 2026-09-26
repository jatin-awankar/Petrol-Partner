import type { Pool } from "pg";
import { dueRequests, notifyExpiry, recordExpiry } from "./pilot-seat-expiry.repo";

// Expiry is a time-based fact. The sweep records its audit and recipient work;
// it never reserves or releases offer capacity.
export async function expirePilotSeatRequests(database:Pool) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const due = await dueRequests(client);
    for (const row of due) {
      await recordExpiry(client,row.id);
      for (const recipientId of [row.passenger_id,row.driver_id])
        await notifyExpiry(client,row.id,recipientId);
    }
    await client.query("COMMIT");
    return {expired:due.length};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {client.release();}
}
