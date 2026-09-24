import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import { ACCESS_TOKEN_COOKIE, clearAuthCookies, REFRESH_TOKEN_COOKIE, setAuthCookies } from "../../shared/utils/cookies";
import { loginSchema, passwordUpdateSchema, providerSessionSchema, recoveryRequestSchema, registerSchema } from "./auth.schema";
import * as authService from "./auth.service";

function getSessionMeta(req: Request) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0]?.trim()
      : req.ip;

  return {
    ip,
    userAgent: req.get("user-agent") ?? undefined,
  };
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input, getSessionMeta(req));

  if ("pendingVerification" in result) {
    return res.status(202).json({ pendingVerification: true });
  }

  setAuthCookies(res, result.tokens);

  res.status(201).json({
    user: result.user,
  });
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, getSessionMeta(req));

  setAuthCookies(res, result.tokens);

  res.status(200).json({
    user: result.user,
  });
}

export async function refreshSession(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];

  if (!refreshToken) {
    throw new AppError(401, "Refresh token cookie is missing", "MISSING_REFRESH_TOKEN");
  }

  const result = await authService.refreshSession(refreshToken, getSessionMeta(req));
  setAuthCookies(res, result.tokens);

  res.status(200).json({
    user: result.user,
  });
}

export async function logout(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];

  try {
    await authService.logout(refreshToken, req.cookies?.[ACCESS_TOKEN_COOKIE]);
  } finally {
    clearAuthCookies(res);
  }

  res.status(204).send();
}

export async function completeProviderSession(req: Request, res: Response) {
  const input = providerSessionSchema.parse(req.body);
  const result = await authService.completeProviderSession(input.accessToken, input.refreshToken);
  setAuthCookies(res, result.tokens);
  res.status(200).json({ user: result.user });
}

export async function requestRecovery(req: Request, res: Response) {
  const input = recoveryRequestSchema.parse(req.body);
  await authService.requestRecovery(input.email);
  res.status(202).json({ accepted: true });
}

export async function updatePassword(req: Request, res: Response) {
  const input = passwordUpdateSchema.parse(req.body);
  const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!accessToken) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  await authService.updatePassword(accessToken, input.password);
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  const user = await authService.me(req.user.userId);

  res.status(200).json({
    user,
  });
}
