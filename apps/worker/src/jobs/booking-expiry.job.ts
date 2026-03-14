import { Worker } from "bullmq";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { bookingExpiryQueueName, redisConnection } from "../queues";

export function createBookingExpiryWorker() {
  return new Worker(
    bookingExpiryQueueName,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "TODO: expire unpaid bookings and restore seats");
    },
    {
      connection: redisConnection as any,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
}
