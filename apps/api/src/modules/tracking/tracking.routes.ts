import { Router } from "express";

export const trackingRouter = Router();

trackingRouter.get("/_status", (_req, res) => {
  res.json({
    module: "tracking",
    status: "scaffolded",
    next_step: "Add trip sessions, Redis hot state, and periodic location persistence.",
  });
});
