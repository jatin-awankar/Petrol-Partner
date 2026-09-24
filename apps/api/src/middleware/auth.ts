import type { RequestHandler } from "express";

import { AppError } from "../shared/errors/app-error";
import { verifyAccessToken } from "../shared/jwt/tokens";
import { ACCESS_TOKEN_COOKIE } from "../shared/utils/cookies";
import { env } from "../config/env";
import { authenticateProviderAccessToken } from "../modules/auth/auth.service";
import { isManagedAuthEnabled } from "../modules/auth/auth-provider";

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length)
    : undefined;

  const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE] ?? bearerToken;

  if (!accessToken) {
    return next();
  }

  try {
    const payload = isManagedAuthEnabled()
      ? await authenticateProviderAccessToken(accessToken)
      : verifyAccessToken(accessToken);
    req.user = {
      userId: "sub" in payload ? payload.sub : payload.userId,
      email: payload.email,
      role: payload.role,
    };
    req.log = req.log.child({
      userId: req.user.userId,
      role: payload.role,
    });
  } catch (error) {
    req.user = undefined;
    if (isManagedAuthEnabled() && error instanceof AppError && error.code === "AUTH_ASSURANCE_UNAVAILABLE") {
      return next(error);
    }
  }

  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    return next(new AppError(401, "Unauthorized", "UNAUTHORIZED"));
  }

  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    return next(new AppError(401, "Unauthorized", "UNAUTHORIZED"));
  }

  if (req.user.role !== "admin") {
    return next(new AppError(403, "Admin access required", "FORBIDDEN"));
  }

  next();
};
