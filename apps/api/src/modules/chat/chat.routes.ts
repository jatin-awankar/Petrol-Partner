import { Router } from "express";

import { env } from "../../config/env";

export const chatRouter = Router();

chatRouter.get("/_status", (_req, res) => {
  res.status(env.ENABLE_CHAT ? 200 : 503).json({
    module: "chat",
    status: env.ENABLE_CHAT ? "enabled" : "disabled",
    next_step: env.ENABLE_CHAT
      ? "Chat runtime must be backed by durable message persistence."
      : "Chat is disabled until the realtime service is implemented.",
  });
});
