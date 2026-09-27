import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { closureQuery } from "./account-closure.repo";

async function transaction<T>(run: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export const accountClosureService = {
  async request(userId: string) {
    return transaction(async client => {
      if (!(await closureQuery(client,"lockUser",[userId])).rowCount)
        throw new AppError(404,"Account not found","ACCOUNT_NOT_FOUND");
      const existing = (await closureQuery(client,"existing",[userId])).rows[0];
      if (existing) return existing;
      const commitment = (await closureQuery(client,"activeCommitments",[userId])).rows[0].blocked;
      const cases = (await closureQuery(client,"openCases",[userId])).rows[0].blocked;
      const closure = (await closureQuery(client,"create",[userId,commitment||cases?"held":"pending"])).rows[0];
      await closureQuery(client,"event",[closure.id,"requested",userId]);
      return closure;
    });
  },
  async mine(userId: string) {
    const result = await closureQuery(pool,"mine",[userId]);
    return result.rows[0] ?? null;
  },
  async queue(operatorId: string) {
    return transaction(async client => {
      await assertCurrentOperator(client,operatorId);
      return (await closureQuery(client,"queue")).rows;
    });
  },
  async hold(operatorId: string, key: string, closureId: string, scope: string, reason: string, reviewAt: Date) {
    return transaction(async client => {
      await assertCurrentOperator(client,operatorId);
      await closureQuery(client,"lockKey",[`retention-hold:${operatorId}:${key}`]);
      const prior=(await closureQuery(client,"holdByKey",[operatorId,key])).rows[0];
      if (prior) {
        if (prior.closure_id!==closureId || prior.scope!==scope || prior.reason!==reason ||
          new Date(prior.review_at).getTime()!==reviewAt.getTime())
          throw new AppError(409,"Idempotency key reused with different hold","IDEMPOTENCY_CONFLICT");
        return prior;
      }
      const closure=(await closureQuery(client,"lockClosure",[closureId])).rows[0];
      if (!closure || closure.status==='completed') throw new AppError(404,"Closure not found","CLOSURE_NOT_FOUND");
      const hold=(await closureQuery(client,"addHold",[closureId,scope,reason,operatorId,reviewAt,key])).rows[0];
      await closureQuery(client,"markHeld",[closureId]);
      await closureQuery(client,"event",[closureId,"hold_added",operatorId]);
      return hold;
    });
  },
  async release(operatorId: string, key: string, holdId: string, reason: string) {
    return transaction(async client => {
      await assertCurrentOperator(client,operatorId);
      await closureQuery(client,"lockKey",[`retention-release:${operatorId}:${key}`]);
      const hold=(await closureQuery(client,"holdForUpdate",[holdId])).rows[0];
      if (!hold) throw new AppError(404,"Hold not found","HOLD_NOT_FOUND");
      if (hold.released_at) {
        if (hold.released_by!==operatorId || hold.release_key!==key || hold.release_reason!==reason)
          throw new AppError(409,"Hold already released","HOLD_ALREADY_RELEASED");
        return {released:true};
      }
      const result=await closureQuery(client,"releaseHold",[holdId,operatorId,reason,key]);
      const closureId=result.rows[0].closure_id;
      if (!(await closureQuery(client,"activeHolds",[closureId])).rowCount) {
        const closure=(await closureQuery(client,"lockClosure",[closureId])).rows[0];
        const commitment=(await closureQuery(client,"activeCommitments",[closure.user_id])).rows[0].blocked;
        const cases=(await closureQuery(client,"openCases",[closure.user_id])).rows[0].blocked;
        if (!commitment && !cases) await closureQuery(client,"markPending",[closureId]);
      }
      await closureQuery(client,"event",[closureId,"hold_released",operatorId]);
      return {released:true};
    });
  },
};
