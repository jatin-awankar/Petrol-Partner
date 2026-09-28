import { Router } from "express";

import { dbQuery } from "../../db/pool";
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

    try {
      await dbQuery("SELECT 1");
      const result = await dbQuery<{last_seen_at: Date | null}>(
        "SELECT last_seen_at FROM pilot_email_worker_state WHERE singleton = true");
      const lastSeen = result.rows[0]?.last_seen_at ?? null;
      worker = {status: lastSeen && Date.now() - lastSeen.getTime() <= 60_000 ? "fresh" : "stale",
        last_seen_at: lastSeen};
    } catch {
      database = "unavailable";
    }

    const isReady = database === "connected";

    res.status(isReady ? 200 : 503).json({
      status: isReady ? "ready" : "degraded",
      database,
      work: { executor: "postgresql", configured: isReady },
      worker,
      timestamp: new Date().toISOString(),
    });
  }),
);
