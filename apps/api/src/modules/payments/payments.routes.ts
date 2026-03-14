import { Router } from "express";

export const paymentsRouter = Router();

paymentsRouter.get("/_status", (_req, res) => {
  res.json({
    module: "payments",
    status: "scaffolded",
    next_step: "Implement payment order creation, webhook persistence, reconciliation jobs, and payout orchestration.",
  });
});
