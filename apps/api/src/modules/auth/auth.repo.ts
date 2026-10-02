import type { Pool, PoolClient } from "pg";

import { pool } from "../../db/pool";

type Queryable = Pool | PoolClient;

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  status: string;
  role: string;
  fullName: string;
  phone: string | null;
  college: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  avgRating: string | number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string | Date;
  revokedAt: string | Date | null;
}

interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  college?: string;
}

interface CreateRefreshTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
}

function getDb(client?: Queryable) {
  return client ?? pool;
}

function baseUserSelect() {
  return `
    SELECT
      u.id,
      u.email,
      u.password_hash AS "passwordHash",
      u.status,
      u.role,
      p.full_name AS "fullName",
      p.phone,
      p.college,
      p.avatar_url AS "avatarUrl",
      p.is_verified AS "isVerified",
      p.avg_rating AS "avgRating",
      u.created_at AS "createdAt",
      u.updated_at AS "updatedAt"
    FROM users u
    JOIN user_profiles p ON p.user_id = u.id
  `;
}

export async function findUserByEmail(email: string, client?: Queryable) {
  const db = getDb(client);
  const result = await db.query<UserRecord>(
    `${baseUserSelect()} WHERE LOWER(u.email) = LOWER($1) LIMIT 1`,
    [email],
  );

  return result.rows[0] ?? null;
}

export async function findUserById(userId: string, client?: Queryable) {
  const db = getDb(client);
  const result = await db.query<UserRecord>(
    `${baseUserSelect()} WHERE u.id = $1 LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function createUser(input: CreateUserInput, client: Queryable) {
  const userResult = await client.query<{ id: string }>(
    `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id
    `,
    [input.email, input.passwordHash],
  );

  const userId = userResult.rows[0].id;

  await client.query(
    `
      INSERT INTO user_profiles (user_id, full_name, phone, college)
      VALUES ($1, $2, $3, $4)
    `,
    [userId, input.fullName, input.phone ?? null, input.college ?? null],
  );

  return findUserById(userId, client);
}

export async function insertRefreshToken(input: CreateRefreshTokenInput, client: Queryable) {
  await client.query(
    `
      INSERT INTO refresh_tokens (id, user_id, token_hash, user_agent, ip, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.id,
      input.userId,
      input.tokenHash,
      input.userAgent ?? null,
      input.ip ?? null,
      input.expiresAt,
    ],
  );
}

export async function findRefreshTokenById(tokenId: string, client?: Queryable) {
  const db = getDb(client);
  const result = await db.query<RefreshTokenRecord>(
    `
      SELECT
        id,
        user_id AS "userId",
        token_hash AS "tokenHash",
        expires_at AS "expiresAt",
        revoked_at AS "revokedAt"
      FROM refresh_tokens
      WHERE id = $1
      LIMIT 1
    `,
    [tokenId],
  );

  return result.rows[0] ?? null;
}

export async function revokeRefreshToken(tokenId: string, client: Queryable) {
  await client.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = now()
      WHERE id = $1 AND revoked_at IS NULL
    `,
    [tokenId],
  );
}

export interface AuthIdentityRecord {
  provider: string;
  providerSubject: string;
  userId: string;
  providerEmail: string;
  disabledAt: string | Date | null;
}

export async function findAuthIdentity(provider: string, providerSubject: string, client?: Queryable) {
  const result = await getDb(client).query<AuthIdentityRecord>(
    `SELECT provider, provider_subject AS "providerSubject", user_id AS "userId",
            provider_email AS "providerEmail", disabled_at AS "disabledAt"
       FROM auth_identities
      WHERE provider = $1 AND provider_subject = $2`,
    [provider, providerSubject],
  );
  return result.rows[0] ?? null;
}

export async function lockUsersByNormalizedEmail(email: string, client: PoolClient) {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE lower(btrim(email)) = lower(btrim($1)) FOR UPDATE`,
    [email],
  );
  return result.rows.map((row) => row.id);
}

export async function createManagedUser(input: { email: string; fullName: string; college?: string }, client: PoolClient) {
  const created = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, email_verified_at)
     VALUES ($1, NULL, now()) RETURNING id`,
    [input.email],
  );
  const userId = created.rows[0].id;
  await client.query(
    `INSERT INTO user_profiles (user_id, full_name, college)
     VALUES ($1, $2, $3)`,
    [userId, input.fullName, input.college ?? null],
  );
  return userId;
}

export async function verifyClaimedUserAndRevokeLegacySessions(userId: string, client: PoolClient) {
  await client.query(`UPDATE users SET email_verified_at = now(), password_hash = NULL WHERE id = $1`, [userId]);
  await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}

export async function insertManagedIdentity(input: {
  provider: string;
  providerSubject: string;
  userId: string;
  email: string;
  eventType: "registered" | "claimed";
}, client: PoolClient) {
  await client.query(
    `INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email)
     VALUES ($1, $2, $3, $4)`,
    [input.provider, input.providerSubject, input.userId, input.email],
  );
  await client.query(
    `INSERT INTO auth_identity_events (user_id, provider, provider_subject, event_type)
     VALUES ($1, $2, $3, $4)`,
    [input.userId, input.provider, input.providerSubject, input.eventType],
  );
}

export async function touchAuthIdentity(provider: string, providerSubject: string, client?: Queryable) {
  await getDb(client).query(
    `UPDATE auth_identities SET last_validated_at = now() WHERE provider = $1 AND provider_subject = $2 AND disabled_at IS NULL`,
    [provider, providerSubject],
  );
}

export async function recordClaimReview(input: {
  provider: string;
  providerSubject: string;
  providerEmail: string | null;
  reason: "missing_email" | "email_not_verified" | "email_collision" | "identity_conflict";
}) {
  await pool.query(
    `INSERT INTO auth_claim_reviews (provider, provider_subject, provider_email, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_subject, status) DO NOTHING`,
    [input.provider, input.providerSubject, input.providerEmail, input.reason],
  );
}

export async function isManagedCutoverAuthorized() {
  const result = await pool.query<{ authorized: boolean }>(
    `SELECT active_provider = 'supabase'
            AND legacy_login_enabled = false
            AND authorized_at IS NOT NULL AS authorized
       FROM auth_cutover_state WHERE singleton = true`,
  );
  return result.rows[0]?.authorized === true;
}

export async function isLegacyAuthAuthorized() {
  const result = await pool.query<{ authorized: boolean }>(
    `SELECT active_provider = 'legacy'
            AND legacy_login_enabled = true AS authorized
       FROM auth_cutover_state WHERE singleton = true`,
  );
  return result.rows[0]?.authorized === true;
}

export async function isOperatorAllowlisted(userId: string) {
  const result = await pool.query<{ allowed: boolean }>(
    `SELECT active AS allowed FROM operator_allowlist WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.allowed === true;
}

export async function recordOperatorMfaAudit(userId: string, action: string, metadata: Record<string, string>) {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'operator_mfa', $4, $3::jsonb)`,
    [userId, action, JSON.stringify(metadata), userId],
  );
}

export async function operatorMfaAuditHistory(userId: string) {
  const result = await pool.query<{
    action: string; factorId: string | null; replacedFactorId: string | null; recordedAt: Date;
  }>(
    `SELECT action, metadata->>'factorId' AS "factorId",
            metadata->>'replacedFactorId' AS "replacedFactorId", created_at AS "recordedAt"
       FROM audit_logs
      WHERE actor_user_id = $1 AND entity_type = 'operator_mfa' AND entity_id = $2
      ORDER BY created_at ASC, id ASC`,
    [userId, userId],
  );
  return result.rows;
}

export async function observeOperatorMfaFactors(
  client: PoolClient, userId: string, verifiedFactorIds: string[], pendingFactorIds: string[],
) {
  await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
  const factorIds = [...verifiedFactorIds, ...pendingFactorIds];
  for (const factorId of factorIds) {
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       SELECT $1, 'operator_mfa_factor_observed', 'operator_mfa', $2, jsonb_build_object('factorId', $3::text)
        WHERE NOT EXISTS (
          SELECT 1 FROM audit_logs
           WHERE entity_type = 'operator_mfa' AND entity_id = $2
             AND metadata->>'factorId' = $3
             AND action IN ('operator_mfa_factor_enrolled', 'operator_mfa_factor_replaced', 'operator_mfa_factor_observed')
        )`,
      [userId, userId, factorId],
    );
  }
  for (const factorId of verifiedFactorIds) {
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       SELECT $1, 'operator_mfa_factor_verification_observed', 'operator_mfa', $2,
              jsonb_build_object('factorId', $3::text)
        WHERE NOT EXISTS (
          SELECT 1 FROM audit_logs
           WHERE entity_type = 'operator_mfa' AND entity_id = $2
             AND metadata->>'factorId' = $3
             AND action IN ('operator_mfa_factor_verified', 'operator_mfa_factor_verification_observed')
        )`,
      [userId, userId, factorId],
    );
  }
  const replacements = await client.query<{ operationId: string; factorId: string }>(
    `SELECT metadata->>'operationId' AS "operationId",
            metadata->>'replacedFactorId' AS "factorId"
       FROM audit_logs
      WHERE actor_user_id = $1 AND entity_type = 'operator_mfa' AND entity_id = $2
        AND action = 'operator_mfa_replacement_requested'
        AND NOT EXISTS (
          SELECT 1 FROM audit_logs completed
           WHERE completed.entity_type = 'operator_mfa' AND completed.entity_id = $2
             AND completed.metadata->>'operationId' = audit_logs.metadata->>'operationId'
             AND completed.action IN ('operator_mfa_factor_discarded', 'operator_mfa_factor_discard_observed')
        )`,
    [userId, userId],
  );
  for (const replacement of replacements.rows) {
    if (factorIds.includes(replacement.factorId)) continue;
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'operator_mfa_factor_discard_observed', 'operator_mfa', $2,
               jsonb_build_object('operationId', $3::text, 'factorId', $4::text))`,
      [userId, userId, replacement.operationId, replacement.factorId],
    );
  }
}
