import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { readiness } from "./health.service";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({status: "ok", service: "petrol-partner-api", timestamp: new Date().toISOString()});
});

healthRouter.get("/ready", asyncHandler(async (_req, res) => {
  const state = await readiness();
  res.status(state.status === "ready" ? 200 : 503).json(state);
}));
