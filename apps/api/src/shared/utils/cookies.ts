import type { CookieOptions, Response } from "express";

import { env, isProduction } from "../../config/env";

export const ACCESS_TOKEN_COOKIE = "pp_access_token";
export const REFRESH_TOKEN_COOKIE = "pp_refresh_token";

interface SessionCookiesInput {
  accessToken: string;
  refreshToken: string;
}

function buildCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
    maxAge: maxAgeMs,
  };
}

export function setAuthCookies(res: Response, input: SessionCookiesInput) {
  res.cookie(
    ACCESS_TOKEN_COOKIE,
    input.accessToken,
    buildCookieOptions(env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000),
  );

  res.cookie(
    REFRESH_TOKEN_COOKIE,
    input.refreshToken,
    buildCookieOptions(env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  );
}

export function clearAuthCookies(res: Response) {
  const options = buildCookieOptions(0);
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
}
