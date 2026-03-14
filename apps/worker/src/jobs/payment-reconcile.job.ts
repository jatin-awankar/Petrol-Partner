import { Worker } from "bullmq";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { paymentReconcileQueueName, redisConnection } from "../queues";

export function createPaymentReconcileWorker() {
  return new Worker(
    paymentReconcileQueueName,
    async (job) => {
      logger.info(
        { jobId: job.id, data: job.data },
        "TODO: reconcile payment orders, verify final provider state, and advance booking/payment status",
      );
    },
    {
      connection: redisConnection as any,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
}
