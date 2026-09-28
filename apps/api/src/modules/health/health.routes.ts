import { Router } from "express";

import { dbQuery } from "../../db/pool";
import { backupStatus } from "../operator/backup-status";
import { asyncHandler } from "../../shared/http/async-handler";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "petrol-partner-api",
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    let database = "connected";
    let worker: { status: string; last_seen_at: Date | null } = { status: "unknown", last_seen_at: null };
    let recoveryMode = "unknown";
    let backup = { required: false, healthy: false, ageMinutes: null as number | null };

    try {
      await dbQuery("SELECT 1");
      const result = await dbQuery<{last_seen_at: Date | null}>(
        "SELECT last_seen_at FROM pilot_email_worker_state WHERE singleton = true");
      const lastSeen = result.rows[0]?.last_seen_at ?? null;
      worker = {status: lastSeen && Date.now() - lastSeen.getTime() <= 60_000 ? "fresh" : "stale",
        last_seen_at: lastSeen};
      recoveryMode = (await dbQuery<{mode:string}>(
        "SELECT mode FROM pilot_recovery_state WHERE singleton = true")).rows[0]?.mode ?? "unknown";
      const state = await backupStatus();
      backup = {required: state.required, healthy: state.healthy, ageMinutes: state.ageMinutes};
    } catch {
      database = "unavailable";
    }

    const protectedWrites = database === "connected" && recoveryMode === "open" &&
      (!backup.required || backup.healthy);
    const isReady = protectedWrites && worker.status === "fresh";

    res.status(isReady ? 200 : 503).json({
      status: isReady ? "ready" : "degraded",
      database,
      process: "ok",
      work: { executor: "postgresql", configured: database === "connected" },
      worker,
      backup,
      protected_mutations: { permitted: protectedWrites, recovery_mode: recoveryMode },
      timestamp: new Date().toISOString(),
    });
  }),
);
