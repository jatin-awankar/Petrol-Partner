import type { CookieOptions, Response } from "express";

import { env, isProduction } from "../../config/env";
import { randomBytes } from "node:crypto";

export const ACCESS_TOKEN_COOKIE = "pp_access_token";
export const REFRESH_TOKEN_COOKIE = "pp_refresh_token";
export const CSRF_TOKEN_COOKIE = "pp_csrf_token";
export const PKCE_VERIFIER_COOKIE = "pp_pkce_verifier";

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
  res.cookie(CSRF_TOKEN_COOKIE, randomBytes(24).toString("base64url"), {
    ...buildCookieOptions(env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    httpOnly: false,
  });
}

export function clearAuthCookies(res: Response) {
  const options = buildCookieOptions(0);
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
  res.clearCookie(CSRF_TOKEN_COOKIE, { ...options, httpOnly: false });
}

export function setPkceVerifierCookie(res: Response, verifier: string) {
  res.cookie(PKCE_VERIFIER_COOKIE, verifier, buildCookieOptions(10 * 60 * 1000));
}

export function clearPkceVerifierCookie(res: Response) {
  res.clearCookie(PKCE_VERIFIER_COOKIE, buildCookieOptions(0));
}
