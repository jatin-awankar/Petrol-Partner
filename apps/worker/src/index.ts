import { createBookingExpiryWorker } from "./jobs/booking-expiry.job";
import { createPaymentReconcileWorker } from "./jobs/payment-reconcile.job";
import { createPayoutWorker } from "./jobs/payout.job";
import { logger } from "./config/logger";
import { redisConnection } from "./queues";

const workers = [
  createBookingExpiryWorker(),
  createPaymentReconcileWorker(),
  createPayoutWorker(),
];

async function start() {
  await Promise.all(workers.map((worker) => worker.waitUntilReady()));
  logger.info(
    {
      workers: workers.length,
    },
    "Worker processes are ready",
  );
}

async function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "Shutting down workers");
  await Promise.all(workers.map((worker) => worker.close()));
  await redisConnection.quit();
  process.exit(0);
}

void start().catch((error) => {
  logger.fatal({ error }, "Worker startup failed");
  process.exit(1);
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
