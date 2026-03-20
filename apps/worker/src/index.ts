import { createBookingExpiryWorker } from "./jobs/booking-expiry.job";
import { createMaintenanceWorker } from "./jobs/maintenance.job";
import { createPaymentReconcileWorker } from "./jobs/payment-reconcile.job";
import { createPayoutWorker } from "./jobs/payout.job";
import { createSettlementOverdueWorker } from "./jobs/settlement-overdue.job";
import { logger } from "./config/logger";
import { pool } from "./db/pool";
import { redisConnection, scheduleMaintenanceSweepJobs } from "./queues";

const workers = [
  createBookingExpiryWorker(),
  createSettlementOverdueWorker(),
  createPaymentReconcileWorker(),
  createMaintenanceWorker(),
  createPayoutWorker(),
];
let shuttingDown = false;

async function start() {
  await pool.query("SELECT 1");
  await redisConnection.ping();
  await scheduleMaintenanceSweepJobs();
  await Promise.all(workers.map((worker) => worker.waitUntilReady()));
  logger.info(
    {
      workers: workers.length,
    },
    "Worker processes are ready",
  );
}

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, "Shutting down workers");
  await Promise.all(workers.map((worker) => worker.close()));
  await pool.end();
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
