import { Worker } from "bullmq";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { payoutQueueName, redisConnection } from "../queues";

export function createPayoutWorker() {
  return new Worker(
    payoutQueueName,
    async (job) => rejectPayoutJob(job.id),
    {
      connection: redisConnection as any,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
}

export function rejectPayoutJob(jobId: string | undefined): never {
  logger.error({ jobId }, "Payout job rejected: platform payouts are disabled");
  throw new Error("PLATFORM_PAYOUT_DISABLED");
}
