import { Router } from "express";

import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth";
import { createRateLimitMiddleware } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/http/async-handler";
import * as paymentsController from "./payments.controller";

export const paymentsRouter = Router();
const paymentRateLimit = createRateLimitMiddleware({
  name: "payments",
  windowMs: env.RATE_LIMIT_PAYMENT_WINDOW_MS,
  max: env.RATE_LIMIT_PAYMENT_MAX,
});

paymentsRouter.get("/_status", (_req, res) => {
  res.json({
    module: "payments",
    status: "historical-read-only",
    capabilities: [
      "booking-scoped payment status reads",
    ],
  });
});

paymentsRouter.use(requireAuth);

paymentsRouter.post("/orders", paymentRateLimit, asyncHandler(paymentsController.createOrder));
paymentsRouter.post("/client-verify", paymentRateLimit, asyncHandler(paymentsController.clientVerify));
paymentsRouter.get(
  "/bookings/:bookingId/status",
  asyncHandler(paymentsController.getBookingPaymentStatus),
);
