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
  findAuthIdentity,
  linkVerifiedIdentity,
  touchAuthIdentity,
  recordClaimReview,
  revokeRefreshToken,
  type UserRecord,
} from "./auth.repo";
import { getAuthProvider, isManagedAuthEnabled, type ProviderIdentity, type ProviderSession } from "./auth-provider";

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
  if (isManagedAuthEnabled()) {
    await getAuthProvider().register(input);
    return { pendingVerification: true as const };
  }
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

async function resolveManagedIdentity(identity: ProviderIdentity) {
  if (!identity.email || !identity.emailVerified) {
    await recordClaimReview({
      provider: "supabase",
      providerSubject: identity.subject,
      providerEmail: identity.email,
      reason: identity.email ? "email_not_verified" : "missing_email",
    });
    throw new AppError(403, "Verify email ownership before continuing", "EMAIL_NOT_VERIFIED");
  }
  const user = await withTransaction((client) => linkVerifiedIdentity({
    provider: "supabase",
    providerSubject: identity.subject,
    email: identity.email!,
    fullName: typeof identity.userMetadata.full_name === "string" ? identity.userMetadata.full_name : undefined,
    college: typeof identity.userMetadata.college === "string" ? identity.userMetadata.college : undefined,
  }, client));
  if (!user) {
    await recordClaimReview({
      provider: "supabase",
      providerSubject: identity.subject,
      providerEmail: identity.email,
      reason: "email_collision",
    });
    throw new AppError(409, "Account requires operator review", "IDENTITY_REVIEW_REQUIRED");
  }
  if (user.status !== "active") throw new AppError(403, "Account is not active", "ACCOUNT_DISABLED");
  return user;
}

async function managedAuthResult(session: ProviderSession) {
  const user = await resolveManagedIdentity(session.identity);
  return { user: toPublicUser(user), tokens: { accessToken: session.accessToken, refreshToken: session.refreshToken } };
}

export async function login(input: LoginInput, meta: SessionMeta) {
  if (isManagedAuthEnabled()) {
    return managedAuthResult(await getAuthProvider().login(input.email, input.password));
  }
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
  if (isManagedAuthEnabled()) {
    return managedAuthResult(await getAuthProvider().refresh(refreshToken));
  }
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

export async function logout(refreshToken?: string, accessToken?: string) {
  if (isManagedAuthEnabled()) {
    if (accessToken) await getAuthProvider().logout(accessToken);
    return;
  }
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

export async function completeProviderSession(accessToken: string, refreshToken: string) {
  const identity = await getAuthProvider().validate(accessToken);
  return managedAuthResult({ accessToken, refreshToken, expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60, identity });
}

export async function requestRecovery(email: string) {
  if (!isManagedAuthEnabled()) throw new AppError(503, "Managed account recovery is not configured", "RECOVERY_UNAVAILABLE");
  await getAuthProvider().requestRecovery(email);
}

export async function updatePassword(accessToken: string, password: string) {
  if (!isManagedAuthEnabled()) throw new AppError(503, "Managed account recovery is not configured", "RECOVERY_UNAVAILABLE");
  await getAuthProvider().validate(accessToken);
  await getAuthProvider().updatePassword(accessToken, password);
}

export async function authenticateProviderAccessToken(accessToken: string) {
  const identity = await getAuthProvider().validate(accessToken);
  const mapping = await findAuthIdentity("supabase", identity.subject);
  if (!identity.emailVerified || !mapping || mapping.disabledAt) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }
  const user = await findUserById(mapping.userId);
  if (!user || user.status !== "active") throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  await touchAuthIdentity("supabase", identity.subject);
  return { userId: user.id, email: user.email, role: user.role, assuranceLevel: identity.assuranceLevel };
}

export async function me(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(404, "User not found", "USER_NOT_FOUND");
  }

  return toPublicUser(user);
}
