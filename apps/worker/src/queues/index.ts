import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "../config/env";

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const bookingExpiryQueueName = "booking-expiry";
export const paymentReconcileQueueName = "payment-reconcile";
export const payoutQueueName = "payout";

export const bookingExpiryQueue = new Queue(bookingExpiryQueueName, {
  connection: redisConnection as any,
});

export const paymentReconcileQueue = new Queue(paymentReconcileQueueName, {
  connection: redisConnection as any,
});

export const payoutQueue = new Queue(payoutQueueName, {
  connection: redisConnection as any,
});
