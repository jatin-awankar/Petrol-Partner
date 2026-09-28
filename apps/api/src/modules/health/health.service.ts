import { env } from "../../config/env";
import { backupStatus } from "../operator/backup-status";
import * as repo from "./health.repo";

export async function readiness() {
  const databaseConnected = await repo.databaseConnected();
  const worker = {status: "unknown", last_seen_at: null as Date | null};
  const backup = {required: env.NODE_ENV === "production" || process.env.PILOT_BACKUP_REQUIRED === "true",
    healthy: false, ageMinutes: null as number | null, status: "unknown"};
  let recoveryMode = "unknown";

  if (databaseConnected) {
    const [workerResult, recoveryResult, backupResult] = await Promise.allSettled([
      repo.lastWorkerSeen(), repo.recoveryMode(), backupStatus(),
    ]);
    if (workerResult.status === "fulfilled") {
      worker.last_seen_at = workerResult.value;
      worker.status = workerResult.value && Date.now() - workerResult.value.getTime() <= 60_000
        ? "fresh" : "stale";
    }
    if (recoveryResult.status === "fulfilled") recoveryMode = recoveryResult.value;
    if (backupResult.status === "fulfilled") {
      backup.required = backupResult.value.required;
      backup.healthy = backupResult.value.healthy;
      backup.ageMinutes = backupResult.value.ageMinutes;
      backup.status = backup.healthy ? "fresh" : "stale";
    }
  }

  const protectedWrites = databaseConnected && recoveryMode === "open" &&
    backup.status !== "unknown" && (!backup.required || backup.healthy);
  const ready = protectedWrites && worker.status === "fresh";
  return {status: ready ? "ready" : "degraded", process: "ok", database: databaseConnected ? "connected" : "unavailable",
    work: {executor: "postgresql", configured: databaseConnected}, worker, backup,
    protected_mutations: {permitted: protectedWrites, recovery_mode: recoveryMode},
    timestamp: new Date().toISOString()};
}
