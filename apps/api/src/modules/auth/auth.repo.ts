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
