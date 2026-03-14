import { Router } from "express";

export const bookingsRouter = Router();

bookingsRouter.get("/_status", (_req, res) => {
  res.json({
    module: "bookings",
    status: "scaffolded",
    next_step: "Implement row-locked booking creation, expiry jobs, and append-only booking status events.",
  });
});
