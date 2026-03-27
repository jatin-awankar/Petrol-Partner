import { Router } from "express";

import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth";
import { createRateLimitMiddleware } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/http/async-handler";
import * as authController from "./auth.controller";

export const authRouter = Router();
const authRateLimit = createRateLimitMiddleware({
  name: "auth",
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
});

authRouter.post("/register", authRateLimit, asyncHandler(authController.register));
authRouter.post("/login", authRateLimit, asyncHandler(authController.login));
authRouter.post("/refresh", authRateLimit, asyncHandler(authController.refreshSession));
authRouter.post("/logout", asyncHandler(authController.logout));
authRouter.get("/me", requireAuth, asyncHandler(authController.me));
