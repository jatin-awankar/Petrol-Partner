import { logger } from "./config/logger";
import { pool } from "./db/pool";
import { processDueEmail } from "./jobs/durable-email.job";
import { deleteDueStudentEvidence, deleteDueDriverCarEvidence, deleteReplacedDriverCarEvidence } from "./jobs/student-evidence-retention.job";
import { recordDueDriverCarExpiryNotice } from "./jobs/driver-car-expiry.job";
import { reviewSilentJourneys } from "./jobs/pilot-journey-silence";
import { expirePilotSeatRequests } from "./jobs/pilot-seat-expiry";
import { notifyDelayedPilotRides } from "./jobs/pilot-delayed-rides";

let shuttingDown = false;
let emailTimer: ReturnType<typeof setInterval> | undefined;
let emailBusy = false;

async function sweepEmail() {
  if (emailBusy) return;
  emailBusy = true;
  try {
    while (await processDueEmail()) { /* Drain work ready now. */ }
    while (await deleteDueStudentEvidence()) { /* Drain due evidence. */ }
    while (await deleteDueDriverCarEvidence()) { /* Drain due evidence. */ }
    while (await deleteReplacedDriverCarEvidence()) { /* Drain replaced evidence. */ }
    while (await recordDueDriverCarExpiryNotice()) { /* Drain due notices. */ }
    while ((await reviewSilentJourneys(pool)).processed) { /* Drain due journey reviews. */ }
    while ((await expirePilotSeatRequests(pool)).expired) { /* Drain due seat requests. */ }
    while ((await notifyDelayedPilotRides(pool)).delayed) { /* Drain due delayed notices. */ }
  }
  catch (error) { logger.error({ error }, "Durable email sweep failed"); }
  finally { emailBusy = false; }
}

async function start() {
  await pool.query("SELECT 1");
  emailTimer = setInterval(() => { void sweepEmail(); }, 10000);
  void sweepEmail();
  logger.info("PostgreSQL pilot worker is ready");
}

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  if (emailTimer) clearInterval(emailTimer);
  logger.info({ signal }, "Shutting down workers");
  await pool.end();
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
