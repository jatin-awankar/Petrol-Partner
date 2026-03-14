import { Worker } from "bullmq";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { payoutQueueName, redisConnection } from "../queues";

export function createPayoutWorker() {
  return new Worker(
    payoutQueueName,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "TODO: create payout batches and update payout ledger rows");
    },
    {
      connection: redisConnection as any,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
}
