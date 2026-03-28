import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

interface ProfileRow {
  id: string;
  email: string;
  role: string;
  status: string;
  full_name: string;
  phone: string | null;
  college: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  gender_for_matching: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  is_verified: boolean;
  avg_rating: string | number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PreferencesRow {
  settings: Record<string, unknown>;
}

interface SafetyRow {
  trusted_contacts: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
}

interface LoginActivityRow {
  id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: Date | string;
  revoked_at: Date | string | null;
  expires_at: Date | string;
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function maskIp(ip: string | null) {
  if (!ip) {
    return null;
  }

  if (ip.includes(".")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : ip;
  }

  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.length > 2 ? `${parts.slice(0, 2).join(":")}:xxxx` : ip;
  }

  return ip;
}

function formatDevice(userAgent: string | null) {
  if (!userAgent) {
    return "Unknown Device";
  }

  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("android")) return "Android";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("macintosh") || ua.includes("mac os")) return "Mac";
  if (ua.includes("linux")) return "Linux";
  if (ua.includes("ipad")) return "iPad";
  return "Browser Session";
}

function mapProfile(row: ProfileRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    full_name: row.full_name,
    phone: row.phone,
    college: row.college,
    avatar_url: row.avatar_url,
    date_of_birth: row.date_of_birth,
    gender_for_matching: row.gender_for_matching,
    emergency_contact_name: row.emergency_contact_name,
    emergency_contact_phone: row.emergency_contact_phone,
    address: row.address,
    is_verified: row.is_verified,
    avg_rating: Number(row.avg_rating ?? 0),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function findProfileByUserId(userId: string, client?: PoolClient) {
  const query = `
    SELECT
      u.id,
      u.email,
      u.role,
      u.status,
      p.full_name,
      p.phone,
      p.college,
      p.avatar_url,
      to_char(p.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
      p.gender_for_matching,
      p.emergency_contact_name,
      p.emergency_contact_phone,
      p.address,
      p.is_verified,
      p.avg_rating,
      u.created_at,
      p.updated_at
    FROM users u
    JOIN user_profiles p ON p.user_id = u.id
    WHERE u.id = $1
    LIMIT 1
  `;

  const result = client
    ? await client.query<ProfileRow>(query, [userId])
    : await dbQuery<ProfileRow>(query, [userId]);

  return result.rows[0] ? mapProfile(result.rows[0]) : null;
}

export async function updateProfileByUserId(
  userId: string,
  input: {
    full_name?: string | null;
    phone?: string | null;
    college?: string | null;
    avatar_url?: string | null;
    date_of_birth?: string | null;
    gender_for_matching?: "female" | "male" | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
    address?: string | null;
  },
  client: PoolClient,
) {
  const values: unknown[] = [userId];
  const updates: string[] = [];
  let idx = 2;

  const append = (column: string, value: unknown) => {
    updates.push(`${column} = $${idx}`);
    values.push(value);
    idx += 1;
  };

  if (input.full_name !== undefined) append("full_name", input.full_name);
  if (input.phone !== undefined) append("phone", input.phone);
  if (input.college !== undefined) append("college", input.college);
  if (input.avatar_url !== undefined) append("avatar_url", input.avatar_url);
  if (input.date_of_birth !== undefined) append("date_of_birth", input.date_of_birth);
  if (input.gender_for_matching !== undefined) append("gender_for_matching", input.gender_for_matching);
  if (input.emergency_contact_name !== undefined)
    append("emergency_contact_name", input.emergency_contact_name);
  if (input.emergency_contact_phone !== undefined)
    append("emergency_contact_phone", input.emergency_contact_phone);
  if (input.address !== undefined) append("address", input.address);

  if (!updates.length) {
    return findProfileByUserId(userId, client);
  }

  updates.push("updated_at = now()");

  await client.query(
    `UPDATE user_profiles
     SET ${updates.join(", ")}
     WHERE user_id = $1`,
    values,
  );

  return findProfileByUserId(userId, client);
}

export async function getPreferencesByUserId(userId: string, client?: PoolClient) {
  const query = `
    SELECT settings
    FROM user_preferences
    WHERE user_id = $1
    LIMIT 1
  `;
  const result = client
    ? await client.query<PreferencesRow>(query, [userId])
    : await dbQuery<PreferencesRow>(query, [userId]);

  return result.rows[0]?.settings ?? null;
}

export async function upsertPreferencesByUserId(
  userId: string,
  settings: Record<string, unknown>,
  client: PoolClient,
) {
  const result = await client.query<PreferencesRow>(
    `INSERT INTO user_preferences (user_id, settings)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id)
     DO UPDATE SET
       settings = EXCLUDED.settings,
       updated_at = now()
     RETURNING settings`,
    [userId, JSON.stringify(settings)],
  );

  return result.rows[0]?.settings ?? {};
}

export async function getSafetyByUserId(userId: string, client?: PoolClient) {
  const query = `
    SELECT trusted_contacts, settings
    FROM user_safety_settings
    WHERE user_id = $1
    LIMIT 1
  `;
  const result = client
    ? await client.query<SafetyRow>(query, [userId])
    : await dbQuery<SafetyRow>(query, [userId]);

  if (!result.rows[0]) {
    return null;
  }

  return {
    trusted_contacts: Array.isArray(result.rows[0].trusted_contacts)
      ? result.rows[0].trusted_contacts
      : [],
    settings: result.rows[0].settings ?? {},
  };
}

export async function upsertSafetyByUserId(
  userId: string,
  input: { trustedContacts: Array<Record<string, unknown>>; settings: Record<string, unknown> },
  client: PoolClient,
) {
  const result = await client.query<SafetyRow>(
    `INSERT INTO user_safety_settings (user_id, trusted_contacts, settings)
     VALUES ($1, $2::jsonb, $3::jsonb)
     ON CONFLICT (user_id)
     DO UPDATE SET
       trusted_contacts = EXCLUDED.trusted_contacts,
       settings = EXCLUDED.settings,
       updated_at = now()
     RETURNING trusted_contacts, settings`,
    [userId, JSON.stringify(input.trustedContacts), JSON.stringify(input.settings)],
  );

  return {
    trusted_contacts: Array.isArray(result.rows[0]?.trusted_contacts)
      ? result.rows[0].trusted_contacts
      : [],
    settings: result.rows[0]?.settings ?? {},
  };
}

export async function listLoginActivityByUserId(userId: string, limit = 20) {
  const result = await dbQuery<LoginActivityRow>(
    `SELECT
       id,
       user_agent,
       ip,
       created_at,
       revoked_at,
       expires_at
     FROM refresh_tokens
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    device: formatDevice(row.user_agent),
    user_agent: row.user_agent,
    ip_address: maskIp(row.ip),
    time: toIso(row.created_at),
    current: row.revoked_at === null && new Date(row.expires_at).getTime() > Date.now(),
    revoked_at: toIso(row.revoked_at),
    expires_at: toIso(row.expires_at),
  }));
}
