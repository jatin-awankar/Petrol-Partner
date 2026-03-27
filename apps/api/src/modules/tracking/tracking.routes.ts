import { Router } from "express";

import { env } from "../../config/env";

export const trackingRouter = Router();

trackingRouter.get("/_status", (_req, res) => {
  res.status(env.ENABLE_TRACKING ? 200 : 503).json({
    module: "tracking",
    status: env.ENABLE_TRACKING ? "enabled" : "disabled",
    next_step: env.ENABLE_TRACKING
      ? "Tracking runtime must be backed by trip sessions and durable location persistence."
      : "Tracking is disabled until the realtime transport and persistence layers are implemented.",
  });
});
