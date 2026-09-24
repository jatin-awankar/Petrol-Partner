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
  lockUsersByNormalizedEmail,
  createManagedUser,
  verifyClaimedUserAndRevokeLegacySessions,
  insertManagedIdentity,
  touchAuthIdentity,
  recordClaimReview,
  isManagedCutoverAuthorized,
  isLegacyAuthAuthorized,
  revokeRefreshToken,
  type UserRecord,
} from "./auth.repo";
import { getAuthProvider, isManagedAuthEnabled, type ProviderIdentity, type ProviderSession } from "./auth-provider";

async function assertManagedCutoverAuthorized() {
  if (!isManagedAuthEnabled() || !(await isManagedCutoverAuthorized())) {
    throw new AppError(503, "Managed authentication is not authorized for cutover", "AUTH_CUTOVER_NOT_AUTHORIZED");
  }
}

export async function assertLegacyAuthAuthorized() {
  if (isManagedAuthEnabled() || !(await isLegacyAuthAuthorized())) {
    throw new AppError(503, "Legacy authentication is disabled", "LEGACY_AUTH_DISABLED");
  }
}

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

function createPkcePair() {
  const verifier = createHash("sha256").update(randomUUID()).digest("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
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
    await assertManagedCutoverAuthorized();
    const pkce = createPkcePair();
    await getAuthProvider().register({ ...input, pkceChallenge: pkce.challenge });
    return { pendingVerification: true as const, pkceVerifier: pkce.verifier };
  }
  await assertLegacyAuthAuthorized();
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
  let user: UserRecord | null;
  try {
    user = await withTransaction(async (client) => {
      const existing = await findAuthIdentity("supabase", identity.subject, client);
      if (existing?.disabledAt) return null;
      if (existing) {
        await touchAuthIdentity("supabase", identity.subject, client);
        return findUserById(existing.userId, client);
      }

      const matches = await lockUsersByNormalizedEmail(identity.email!, client);
      if (matches.length > 1) return null;

      let userId = matches[0];
      let eventType: "registered" | "claimed" = "claimed";
      if (userId) {
        await verifyClaimedUserAndRevokeLegacySessions(userId, client);
      } else {
        userId = await createManagedUser({
          email: identity.email!,
          fullName: typeof identity.userMetadata.full_name === "string" ? identity.userMetadata.full_name : "Student",
          college: typeof identity.userMetadata.college === "string" ? identity.userMetadata.college : undefined,
        }, client);
        eventType = "registered";
      }
      await insertManagedIdentity({
        provider: "supabase",
        providerSubject: identity.subject,
        userId,
        email: identity.email!,
        eventType,
      }, client);
      return findUserById(userId, client);
    });
  } catch (error) {
    if (!(typeof error === "object" && error && "code" in error && error.code === "23505")) throw error;
    const mapping = await findAuthIdentity("supabase", identity.subject);
    if (mapping && !mapping.disabledAt) {
      user = await findUserById(mapping.userId);
    } else {
      await recordClaimReview({
        provider: "supabase",
        providerSubject: identity.subject,
        providerEmail: identity.email,
        reason: "identity_conflict",
      });
      throw new AppError(409, "Account requires operator review", "IDENTITY_REVIEW_REQUIRED");
    }
  }
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
    await assertManagedCutoverAuthorized();
    return managedAuthResult(await getAuthProvider().login(input.email, input.password));
  }
  await assertLegacyAuthAuthorized();
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
    await assertManagedCutoverAuthorized();
    return managedAuthResult(await getAuthProvider().refresh(refreshToken));
  }
  await assertLegacyAuthAuthorized();
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
    await assertManagedCutoverAuthorized();
    if (accessToken) {
      try {
        await getAuthProvider().logout(accessToken);
        return;
      } catch (error) {
        if (!refreshToken) throw error;
      }
    }
    if (refreshToken) {
      const refreshed = await getAuthProvider().refresh(refreshToken);
      await getAuthProvider().logout(refreshed.accessToken);
    }
    return;
  }
  await assertLegacyAuthAuthorized();
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

export async function completeProviderSession(code: string, verifier: string) {
  await assertManagedCutoverAuthorized();
  return managedAuthResult(await getAuthProvider().exchangeCode(code, verifier));
}

export async function requestRecovery(email: string) {
  await assertManagedCutoverAuthorized();
  const pkce = createPkcePair();
  await getAuthProvider().requestRecovery(email, pkce.challenge);
  return { pkceVerifier: pkce.verifier };
}

export async function updatePassword(accessToken: string, password: string) {
  await assertManagedCutoverAuthorized();
  await getAuthProvider().validate(accessToken);
  await getAuthProvider().updatePassword(accessToken, password);
}

export async function authenticateProviderAccessToken(accessToken: string, refreshToken?: string) {
  await assertManagedCutoverAuthorized();
  if (!refreshToken) throw new AppError(401, "Current provider session cannot be established", "CURRENT_SESSION_REQUIRED");
  const currentSession = await getAuthProvider().refresh(refreshToken);
  const accessIdentity = await getAuthProvider().validate(accessToken);
  if (currentSession.identity.subject !== accessIdentity.subject) {
    throw new AppError(401, "Provider session identity changed", "INVALID_PROVIDER_SESSION");
  }
  const identity = currentSession.identity;
  const mapping = await findAuthIdentity("supabase", identity.subject);
  if (!identity.emailVerified || !mapping || mapping.disabledAt) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }
  const user = await findUserById(mapping.userId);
  if (!user || user.status !== "active") throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  await touchAuthIdentity("supabase", identity.subject);
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    assuranceLevel: identity.assuranceLevel,
    tokens: { accessToken: currentSession.accessToken, refreshToken: currentSession.refreshToken },
  };
}

export async function me(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(404, "User not found", "USER_NOT_FOUND");
  }

  return toPublicUser(user);
}
