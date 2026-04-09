import { Worker } from "bullmq";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { pool } from "../db/pool";
import {
  bookingExpiryQueue,
  maintenanceQueueName,
  paymentReconcileQueue,
  redisConnection,
  settlementOverdueQueue,
} from "../queues";

interface RecoverBookingExpiryRow {
  id: string;
  expires_at: Date | string;
}

interface RecoverSettlementOverdueRow {
  id: string;
  due_at: Date | string;
}

interface RecoverWebhookRow {
  id: string;
}

interface RecoverPaymentOrderRow {
  payment_order_id: string;
}

function buildJobOptions(jobId: string, delay?: number) {
  return {
    jobId,
    delay,
    attempts: 5,
    backoff: {
      type: "exponential" as const,
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: 1000,
  };
}

async function recoverBookingExpiryJobs() {
  const result = await pool.query<RecoverBookingExpiryRow>(
    `SELECT id, expires_at
     FROM bookings
     WHERE status = 'pending'
       AND expires_at IS NOT NULL
     ORDER BY expires_at ASC
     LIMIT 500`,
  );

  await Promise.all(
    result.rows.map((row) =>
      bookingExpiryQueue.add(
        "expire-booking",
        { bookingId: row.id },
        buildJobOptions(row.id, Math.max(new Date(row.expires_at).getTime() - Date.now(), 0)),
      ),
    ),
  );

  return { recovered: result.rows.length };
}

interface DeletedChatRoomRow {
  id: string;
  booking_id: string;
}

async function deleteLockedChatRooms() {
  const result = await pool.query<DeletedChatRoomRow>(
    `WITH due_rooms AS (
       SELECT id, booking_id
       FROM chat_rooms
       WHERE status = 'locked'
         AND delete_after IS NOT NULL
         AND delete_after <= now()
       ORDER BY delete_after ASC
       LIMIT 500
     )
     DELETE FROM chat_rooms c
     USING due_rooms d
     WHERE c.id = d.id
     RETURNING d.id, d.booking_id`,
  );

  return {
    deleted: result.rows.length,
    roomIds: result.rows.map((row) => row.id),
    bookingIds: result.rows.map((row) => row.booking_id),
  };
}

async function recoverSettlementOverdueJobs() {
  const result = await pool.query<RecoverSettlementOverdueRow>(
    `SELECT id, due_at
     FROM booking_settlements
     WHERE status = 'due'
       AND due_at IS NOT NULL
     ORDER BY due_at ASC
     LIMIT 500`,
  );

  await Promise.all(
    result.rows.map((row) =>
      settlementOverdueQueue.add(
        "mark-settlement-overdue",
        { settlementId: row.id },
        buildJobOptions(row.id, Math.max(new Date(row.due_at).getTime() - Date.now(), 0)),
      ),
    ),
  );

  return { recovered: result.rows.length };
}

async function recoverPaymentWebhookJobs() {
  const result = await pool.query<RecoverWebhookRow>(
    `SELECT id
     FROM payment_webhook_events
     WHERE processing_status = 'received'
     ORDER BY created_at ASC
     LIMIT 500`,
  );

  await Promise.all(
    result.rows.map((row) =>
      paymentReconcileQueue.add(
        "reconcile-payment",
        { webhookEventId: row.id },
        buildJobOptions(`webhook-event:${row.id}`),
      ),
    ),
  );

  return { recovered: result.rows.length };
}

async function recoverPaymentOrderJobs() {
  const result = await pool.query<RecoverPaymentOrderRow>(
    `SELECT DISTINCT pa.payment_order_id
     FROM payment_attempts pa
     INNER JOIN payment_orders po ON po.id = pa.payment_order_id
     WHERE pa.status IN ('client_verified', 'webhook_verified')
       AND po.status IN ('created', 'attempted')
     ORDER BY pa.payment_order_id
     LIMIT 500`,
  );

  await Promise.all(
    result.rows.map((row) =>
      paymentReconcileQueue.add(
        "reconcile-payment",
        { paymentOrderId: row.payment_order_id },
        buildJobOptions(`payment-order:${row.payment_order_id}`),
      ),
    ),
  );

  return { recovered: result.rows.length };
}

export function createMaintenanceWorker() {
  return new Worker(
    maintenanceQueueName,
    async (job) => {
      let result: Record<string, unknown>;

      switch (job.name) {
        case "recover-booking-expiry":
          result = await recoverBookingExpiryJobs();
          break;
        case "recover-settlement-overdue":
          result = await recoverSettlementOverdueJobs();
          break;
        case "recover-payment-webhooks":
          result = await recoverPaymentWebhookJobs();
          break;
        case "recover-payment-orders":
          result = await recoverPaymentOrderJobs();
          break;
        case "delete-locked-chat-rooms":
          result = await deleteLockedChatRooms();
          break;
        default:
          result = { skipped: true };
      }

      logger.info(
        {
          jobId: job.id,
          jobName: job.name,
          result,
        },
        "Processed maintenance recovery job",
      );
    },
    {
      connection: redisConnection as any,
      concurrency: Math.max(1, Math.min(env.WORKER_CONCURRENCY, 2)),
    },
  );
}
