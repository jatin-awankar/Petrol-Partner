import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { emailJobForUpdate, emailRetryByKey, listDurableNotifications, operatorDeliveryStatus, recordEmailRetry, recordEmailRetryAudit, resetEmailJob } from "./durable.repo";

export function recipientNotifications(userId: string) {
  return listDurableNotifications(userId);
}

export function deliveryStatus() {
  return operatorDeliveryStatus();
}

export async function retryDelivery(operatorId: string, jobId: string, idempotencyKey: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertCurrentOperator(client, operatorId);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`email-retry:${operatorId}:${idempotencyKey}`]);
    const previous = await emailRetryByKey(client, operatorId, idempotencyKey);
    if (previous) {
      if (previous.job_id !== jobId) throw new AppError(409, "Idempotency key used for another email job", "IDEMPOTENCY_PAYLOAD_MISMATCH");
      await client.query("COMMIT");
      return;
    }
    const job = await emailJobForUpdate(client, jobId);
    if (!job) throw new AppError(404, "Email job not found", "EMAIL_JOB_NOT_FOUND");
    if (job.status !== "exhausted") throw new AppError(409, "Only exhausted email can be retried", "EMAIL_RETRY_CONFLICT");
    await resetEmailJob(client, jobId);
    await recordEmailRetry(client, operatorId, idempotencyKey, jobId);
    await recordEmailRetryAudit(client, operatorId, jobId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
