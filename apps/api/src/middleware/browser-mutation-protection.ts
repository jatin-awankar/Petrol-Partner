import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

import { env } from "../config/env";
import { AppError } from "../shared/errors/app-error";
import { ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "../shared/utils/cookies";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const browserMutationProtection: RequestHandler = (req, _res, next) => {
  if (
    !unsafeMethods.has(req.method) ||
    (!req.cookies?.[ACCESS_TOKEN_COOKIE] && !req.cookies?.[REFRESH_TOKEN_COOKIE])
  ) return next();
  if (req.get("origin") !== env.APP_ORIGIN) {
    return next(new AppError(403, "Request origin is not allowed", "ORIGIN_REJECTED"));
  }
  const cookieToken = req.cookies?.[CSRF_TOKEN_COOKIE];
  const headerToken = req.get("x-csrf-token");
  if (!cookieToken || !headerToken) return next(new AppError(403, "CSRF token is required", "CSRF_REJECTED"));
  const left = Buffer.from(cookieToken);
  const right = Buffer.from(headerToken);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return next(new AppError(403, "CSRF token is invalid", "CSRF_REJECTED"));
  }
  next();
};
