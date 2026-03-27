import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "../config/env";
import { logger } from "../config/logger";

interface BookingExpiryJobData {
  bookingId: string;
}

interface SettlementOverdueJobData {
  settlementId: string;
}

interface PaymentReconcileJobData {
  paymentOrderId?: string;
  webhookEventId?: string;
}

export const bookingExpiryQueueName = "booking-expiry";
export const settlementOverdueQueueName = "settlement-overdue";
export const paymentReconcileQueueName = "payment-reconcile";

let redisConnection: IORedis | null = null;
let bookingExpiryQueue: Queue<BookingExpiryJobData> | null = null;
let settlementOverdueQueue: Queue<SettlementOverdueJobData> | null = null;
let paymentReconcileQueue: Queue<PaymentReconcileJobData> | null = null;

if (env.REDIS_URL) {
  redisConnection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  redisConnection.on("error", (error: unknown) => {
    logger.error({ error }, "API Redis connection error");
  });

  bookingExpiryQueue = new Queue<BookingExpiryJobData>(bookingExpiryQueueName, {
    connection: redisConnection as any,
  });

  settlementOverdueQueue = new Queue<SettlementOverdueJobData>(settlementOverdueQueueName, {
    connection: redisConnection as any,
  });

  paymentReconcileQueue = new Queue<PaymentReconcileJobData>(paymentReconcileQueueName, {
    connection: redisConnection as any,
  });
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

export function getQueueHealth() {
  return {
    configured: Boolean(redisConnection && bookingExpiryQueue && settlementOverdueQueue && paymentReconcileQueue),
    redis_status: redisConnection?.status ?? "disabled",
    redis_connected: redisConnection?.status === "ready",
  };
}

export async function assertQueueRuntimeReady() {
  if (!redisConnection || !bookingExpiryQueue || !settlementOverdueQueue || !paymentReconcileQueue) {
    throw new Error("Redis queues are not configured");
  }

  await redisConnection.ping();
  await Promise.all([
    bookingExpiryQueue.waitUntilReady(),
    settlementOverdueQueue.waitUntilReady(),
    paymentReconcileQueue.waitUntilReady(),
  ]);
}

export async function scheduleBookingExpiry(input: {
  bookingId: string;
  expiresAt: Date;
}) {
  if (!bookingExpiryQueue) {
    return;
  }

  const delay = Math.max(input.expiresAt.getTime() - Date.now(), 0);

  await bookingExpiryQueue.add(
    "expire-booking",
    {
      bookingId: input.bookingId,
    },
    buildJobOptions(input.bookingId, delay),
  );
}

export async function cancelBookingExpiry(bookingId: string) {
  if (!bookingExpiryQueue) {
    return;
  }

  const job = await bookingExpiryQueue.getJob(bookingId);

  if (job) {
    await job.remove();
  }
}

export async function scheduleSettlementOverdue(input: {
  settlementId: string;
  dueAt: Date;
}) {
  if (!settlementOverdueQueue) {
    return;
  }

  const delay = Math.max(input.dueAt.getTime() - Date.now(), 0);

  await settlementOverdueQueue.add(
    "mark-settlement-overdue",
    {
      settlementId: input.settlementId,
    },
    buildJobOptions(input.settlementId, delay),
  );
}

export async function cancelSettlementOverdue(settlementId: string) {
  if (!settlementOverdueQueue) {
    return;
  }

  const job = await settlementOverdueQueue.getJob(settlementId);

  if (job) {
    await job.remove();
  }
}

export async function schedulePaymentReconcile(input: {
  paymentOrderId?: string;
  webhookEventId?: string;
}) {
  if (!paymentReconcileQueue) {
    return;
  }

  const jobId = input.paymentOrderId
    ? `payment-order:${input.paymentOrderId}`
    : input.webhookEventId
      ? `webhook-event:${input.webhookEventId}`
      : null;

  if (!jobId) {
    throw new Error("Payment reconcile job requires paymentOrderId or webhookEventId");
  }

  await paymentReconcileQueue.add(
    "reconcile-payment",
    {
      paymentOrderId: input.paymentOrderId,
      webhookEventId: input.webhookEventId,
    },
    buildJobOptions(jobId),
  );
}

export async function closeApiQueues() {
  await bookingExpiryQueue?.close();
  await settlementOverdueQueue?.close();
  await paymentReconcileQueue?.close();
  await redisConnection?.quit();
}
