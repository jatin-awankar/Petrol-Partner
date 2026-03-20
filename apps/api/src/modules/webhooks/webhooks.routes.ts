import { Router } from "express";

import { env } from "../../config/env";
import { createRateLimitMiddleware } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/http/async-handler";
import * as webhooksController from "./webhooks.controller";

export const webhooksRouter = Router();
const webhookRateLimit = createRateLimitMiddleware({
  name: "webhooks",
  windowMs: env.RATE_LIMIT_WEBHOOK_WINDOW_MS,
  max: env.RATE_LIMIT_WEBHOOK_MAX,
});

webhooksRouter.post(
  "/razorpay",
  webhookRateLimit,
  asyncHandler(webhooksController.handleRazorpayWebhook),
);
