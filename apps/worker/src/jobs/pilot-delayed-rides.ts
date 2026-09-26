import type {Pool} from "pg";
import {dueRides,recordNotice,recipients,notify} from "./pilot-delayed-rides.repo";

// This sweep records only the delayed fact and notification work. It never
// changes an offer, booking, journey, or contribution.
export async function notifyDelayedPilotRides(database:Pool,now=new Date()) {
  const client=await database.connect();
  try {
    await client.query("BEGIN");
    const due=await dueRides(client,now);
    for(const ride of due) {
      if(!await recordNotice(client,ride.id)) continue;
      for(const recipientId of await recipients(client,ride)) await notify(client,ride.id,recipientId);
    }
    await client.query("COMMIT");
    return {delayed:due.length};
  } catch(error) {await client.query("ROLLBACK");throw error;}
  finally {client.release();}
}
