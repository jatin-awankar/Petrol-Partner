import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "../config/env";

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const bookingExpiryQueueName = "booking-expiry";
export const settlementOverdueQueueName = "settlement-overdue";
export const paymentReconcileQueueName = "payment-reconcile";
export const maintenanceQueueName = "maintenance";
export const payoutQueueName = "payout";

export const bookingExpiryQueue = new Queue(bookingExpiryQueueName, {
  connection: redisConnection as any,
});

export const settlementOverdueQueue = new Queue(settlementOverdueQueueName, {
  connection: redisConnection as any,
});

export const paymentReconcileQueue = new Queue(paymentReconcileQueueName, {
  connection: redisConnection as any,
});

export const maintenanceQueue = new Queue(maintenanceQueueName, {
  connection: redisConnection as any,
});

export const payoutQueue = new Queue(payoutQueueName, {
  connection: redisConnection as any,
});

export async function scheduleMaintenanceSweepJobs() {
  const sharedOptions = {
    repeat: {
      every: env.MAINTENANCE_SWEEP_INTERVAL_MS,
    },
    removeOnComplete: true,
    removeOnFail: 1000,
    attempts: 5,
    backoff: {
      type: "exponential" as const,
      delay: 1000,
    },
  };

  await Promise.all([
    maintenanceQueue.add("recover-booking-expiry", {}, { ...sharedOptions, jobId: "recover-booking-expiry" }),
    maintenanceQueue.add("recover-settlement-overdue", {}, { ...sharedOptions, jobId: "recover-settlement-overdue" }),
    maintenanceQueue.add("recover-payment-webhooks", {}, { ...sharedOptions, jobId: "recover-payment-webhooks" }),
    maintenanceQueue.add("recover-payment-orders", {}, { ...sharedOptions, jobId: "recover-payment-orders" }),
    maintenanceQueue.add("delete-locked-chat-rooms", {}, { ...sharedOptions, jobId: "delete-locked-chat-rooms" }),
  ]);
}
