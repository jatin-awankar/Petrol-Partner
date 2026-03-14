import { createHash, randomUUID } from "crypto";
import type { PoolClient } from "pg";

import { env } from "../../config/env";
import { withTransaction } from "../../db/transaction";
import { hashPassword, verifyPassword } from "../../shared/crypto/passwords";
import { AppError } from "../../shared/errors/app-error";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../shared/jwt/tokens";
import type { LoginInput, RegisterInput } from "./auth.schema";
import {
  createUser,
  findRefreshTokenById,
  findUserByEmail,
  findUserById,
  insertRefreshToken,
  revokeRefreshToken,
  type UserRecord,
} from "./auth.repo";

interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

interface PublicUser {
  id: string;
  email: string;
  role: string;
  status: string;
  fullName: string;
  phone: string | null;
  college: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  avgRating: number;
  createdAt: string;
  updatedAt: string;
}

interface AuthResult {
  user: PublicUser;
  tokens: SessionTokens;
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    fullName: user.fullName,
    phone: user.phone,
    college: user.college,
    avatarUrl: user.avatarUrl,
    isVerified: user.isVerified,
    avgRating: Number(user.avgRating ?? 0),
    createdAt: new Date(user.createdAt).toISOString(),
    updatedAt: new Date(user.updatedAt).toISOString(),
  };
}

async function issueSession(
  user: UserRecord,
  meta: SessionMeta,
  client?: PoolClient,
): Promise<AuthResult> {
  const createSession = async (dbClient: PoolClient) => {
    const tokenId = randomUUID();
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = signRefreshToken({
      userId: user.id,
      tokenId,
    });

    await insertRefreshToken(
      {
        id: tokenId,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: addDays(env.REFRESH_TOKEN_TTL_DAYS),
      },
      dbClient,
    );

    return {
      user: toPublicUser(user),
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  };

  if (client) {
    return createSession(client);
  }

  return withTransaction(createSession);
}

export async function register(input: RegisterInput, meta: SessionMeta) {
  const existingUser = await findUserByEmail(input.email);

  if (existingUser) {
    throw new AppError(409, "User already exists", "USER_ALREADY_EXISTS");
  }

  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (client) => {
    const user = await createUser(
      {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        college: input.college,
      },
      client,
    );

    if (!user) {
      throw new AppError(500, "Failed to create user", "USER_CREATE_FAILED");
    }

    return issueSession(user, meta, client);
  });
}

export async function login(input: LoginInput, meta: SessionMeta) {
  const user = await findUserByEmail(input.email);

  if (!user || !user.passwordHash) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (user.status !== "active") {
    throw new AppError(403, "Account is not active", "ACCOUNT_DISABLED");
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  return issueSession(user, meta);
}

export async function refreshSession(refreshToken: string, meta: SessionMeta) {
  const payload = verifyRefreshToken(refreshToken);
  const refreshTokenRecord = await findRefreshTokenById(payload.tokenId);

  if (!refreshTokenRecord) {
    throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  if (refreshTokenRecord.revokedAt) {
    throw new AppError(401, "Refresh token has been revoked", "REFRESH_TOKEN_REVOKED");
  }

  if (new Date(refreshTokenRecord.expiresAt) <= new Date()) {
    throw new AppError(401, "Refresh token has expired", "REFRESH_TOKEN_EXPIRED");
  }

  if (refreshTokenRecord.tokenHash !== hashToken(refreshToken)) {
    throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  const user = await findUserById(payload.sub);

  if (!user || user.status !== "active") {
    throw new AppError(401, "User is no longer active", "USER_NOT_ACTIVE");
  }

  return withTransaction(async (client) => {
    await revokeRefreshToken(refreshTokenRecord.id, client);
    return issueSession(user, meta, client);
  });
}

export async function logout(refreshToken?: string) {
  if (!refreshToken) {
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);

    await withTransaction(async (client) => {
      await revokeRefreshToken(payload.tokenId, client);
    });
  } catch {
    return;
  }
}

export async function me(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(404, "User not found", "USER_NOT_FOUND");
  }

  return toPublicUser(user);
}
