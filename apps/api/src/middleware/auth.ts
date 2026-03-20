import type { RequestHandler } from "express";

import { AppError } from "../shared/errors/app-error";
import { verifyAccessToken } from "../shared/jwt/tokens";
import { ACCESS_TOKEN_COOKIE } from "../shared/utils/cookies";

export const optionalAuth: RequestHandler = (req, _res, next) => {
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length)
    : undefined;

  const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE] ?? bearerToken;

  if (!accessToken) {
    return next();
  }

  try {
    const payload = verifyAccessToken(accessToken);
    req.user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    req.log = req.log.child({
      userId: payload.sub,
      role: payload.role,
    });
  } catch {
    req.user = undefined;
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
