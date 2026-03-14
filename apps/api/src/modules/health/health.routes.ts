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
    await dbQuery("SELECT 1");
    res.json({
      status: "ready",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  }),
);
