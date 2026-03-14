import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import { AppError } from "../errors/app-error";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
  type: "refresh";
}

interface AccessTokenInput {
  userId: string;
  email: string;
  role: string;
}

interface RefreshTokenInput {
  userId: string;
  tokenId: string;
}

export function signAccessToken(input: AccessTokenInput) {
  return jwt.sign(
    {
      email: input.email,
      role: input.role,
      type: "access",
    },
    env.ACCESS_TOKEN_SECRET,
    {
      subject: input.userId,
      expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
    },
  );
}

export function signRefreshToken(input: RefreshTokenInput) {
  return jwt.sign(
    {
      tokenId: input.tokenId,
      type: "refresh",
    },
    env.REFRESH_TOKEN_SECRET,
    {
      subject: input.userId,
      expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
    },
  );
}

export function verifyAccessToken(token: string) {
  try {
    return jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessTokenPayload;
  } catch {
    throw new AppError(401, "Invalid access token", "INVALID_ACCESS_TOKEN");
  }
}

export function verifyRefreshToken(token: string) {
  try {
    return jwt.verify(token, env.REFRESH_TOKEN_SECRET) as RefreshTokenPayload;
  } catch {
    throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }
}
