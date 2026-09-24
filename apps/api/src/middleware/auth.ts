import type { RequestHandler } from "express";

import { AppError } from "../shared/errors/app-error";
import { verifyAccessToken } from "../shared/jwt/tokens";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, setAuthCookies } from "../shared/utils/cookies";
import { env } from "../config/env";
import { assertLegacyAuthAuthorized, authenticateProviderAccessToken } from "../modules/auth/auth.service";
import { isManagedAuthEnabled } from "../modules/auth/auth-provider";
import { isOperatorAllowlisted } from "../modules/auth/auth.repo";

export const optionalAuth: RequestHandler = async (req, res, next) => {
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length)
    : undefined;

  const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE] ?? bearerToken;

  if (!accessToken) {
    return next();
  }

  try {
    const payload = isManagedAuthEnabled()
      ? await authenticateProviderAccessToken(accessToken, req.cookies?.[REFRESH_TOKEN_COOKIE])
      : (await assertLegacyAuthAuthorized(), verifyAccessToken(accessToken));
    if ("tokens" in payload) setAuthCookies(res, payload.tokens);
    req.user = {
      userId: "sub" in payload ? payload.sub : payload.userId,
      email: payload.email,
      role: payload.role,
      authProvider: isManagedAuthEnabled() ? "supabase" : "legacy",
      assuranceLevel: "assuranceLevel" in payload ? payload.assuranceLevel : undefined,
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

export const requireAdmin: RequestHandler = async (req, _res, next) => {
  if (!req.user) {
    return next(new AppError(401, "Unauthorized", "UNAUTHORIZED"));
  }

  if (req.user.role !== "admin") {
    return next(new AppError(403, "Admin access required", "FORBIDDEN"));
  }

  if (req.user.authProvider === "legacy" || req.user.assuranceLevel !== "aal2") {
    return next(new AppError(403, "Multi-factor authentication is required", "MFA_REQUIRED"));
  }

  if (!(await isOperatorAllowlisted(req.user.userId))) {
    return next(new AppError(403, "Operator access has been revoked", "OPERATOR_ACCESS_REVOKED"));
  }

  next();
};
