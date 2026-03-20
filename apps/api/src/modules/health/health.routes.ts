import { Router } from "express";

import { dbQuery } from "../../db/pool";
import { getQueueHealth } from "../../queues";
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

    try {
      await dbQuery("SELECT 1");
    } catch {
      database = "unavailable";
    }

    const queueHealth = getQueueHealth();
    const isReady = database === "connected" && queueHealth.redis_connected;

    res.status(isReady ? 200 : 503).json({
      status: isReady ? "ready" : "degraded",
      database,
      queues: queueHealth,
      timestamp: new Date().toISOString(),
    });
  }),
);
