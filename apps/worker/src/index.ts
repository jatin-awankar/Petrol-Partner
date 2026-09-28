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
    const sweeps: Array<[string, () => Promise<boolean>]> = [
      ["email", () => processDueEmail()],
      ["student evidence", () => deleteDueStudentEvidence()],
      ["driver/car evidence", () => deleteDueDriverCarEvidence()],
      ["replaced driver/car evidence", () => deleteReplacedDriverCarEvidence()],
      ["driver/car expiry notice", () => recordDueDriverCarExpiryNotice()],
      ["journey silence", async () => (await reviewSilentJourneys(pool)).processed > 0],
      ["seat expiry", async () => (await expirePilotSeatRequests(pool)).expired > 0],
      ["delayed ride notice", async () => (await notifyDelayedPilotRides(pool)).delayed > 0],
    ];
    for (const [name, sweep] of sweeps) {
      try { while (await sweep()) { /* Drain due PostgreSQL work. */ } }
      catch (error) { logger.error({ error, name }, "Pilot work sweep failed"); }
    }
  }
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
