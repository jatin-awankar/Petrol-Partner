import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

interface NotificationRow {
  id: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: string;
  dedupe_key: string | null;
  sent_at: Date | string | null;
  read_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface NotificationPreferencesRow {
  user_id: string;
  new_match_push: boolean;
  booking_updates_push: boolean;
  payment_updates_push: boolean;
  marketing_push: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DeviceTokenRow {
  id: string;
  platform: string;
  token: string;
  status: string;
  last_seen_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    channel: row.channel,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    status: row.status,
    dedupe_key: row.dedupe_key,
    sent_at: toIso(row.sent_at),
    read_at: toIso(row.read_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapNotificationPreferences(row: NotificationPreferencesRow) {
  return {
    user_id: row.user_id,
    new_match_push: row.new_match_push,
    booking_updates_push: row.booking_updates_push,
    payment_updates_push: row.payment_updates_push,
    marketing_push: row.marketing_push,
    quiet_hours_start: row.quiet_hours_start,
    quiet_hours_end: row.quiet_hours_end,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapDeviceToken(row: DeviceTokenRow) {
  return {
    id: row.id,
    platform: row.platform,
    token: row.token,
    status: row.status,
    last_seen_at: toIso(row.last_seen_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function listNotificationsForUser(input: {
  userId: string;
  limit: number;
  offset: number;
  status?: string;
}) {
  const filters = ["user_id = $1"];
  const params: unknown[] = [input.userId];
  let parameterIndex = 2;

  if (input.status) {
    filters.push(`status = $${parameterIndex}`);
    params.push(input.status);
    parameterIndex += 1;
  }

  const countResult = await dbQuery<{ total_count: string }>(
    `SELECT COUNT(*)::text AS total_count
     FROM notifications
     WHERE ${filters.join(" AND ")}`,
    params,
  );

  params.push(input.limit, input.offset);
  const limitParam = parameterIndex;
  const offsetParam = parameterIndex + 1;

  const result = await dbQuery<NotificationRow>(
    `SELECT
       id,
       type,
       channel,
       title,
       body,
       data,
       status,
       dedupe_key,
       sent_at,
       read_at,
       created_at,
       updated_at
     FROM notifications
     WHERE ${filters.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params,
  );

  return {
    notifications: result.rows.map(mapNotification),
    totalCount: Number(countResult.rows[0]?.total_count ?? 0),
  };
}

export async function findNotificationPreferencesByUserId(userId: string) {
  const result = await dbQuery<NotificationPreferencesRow>(
    `SELECT
       user_id,
       new_match_push,
       booking_updates_push,
       payment_updates_push,
       marketing_push,
       to_char(quiet_hours_start, 'HH24:MI:SS') AS quiet_hours_start,
       to_char(quiet_hours_end, 'HH24:MI:SS') AS quiet_hours_end,
       created_at,
       updated_at
     FROM notification_preferences
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ? mapNotificationPreferences(result.rows[0]) : null;
}

export async function upsertNotificationPreferences(
  input: {
    userId: string;
    newMatchPush: boolean;
    bookingUpdatesPush: boolean;
    paymentUpdatesPush: boolean;
    marketingPush: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  },
  client?: PoolClient,
) {
  const queryText = `INSERT INTO notification_preferences (
       user_id,
       new_match_push,
       booking_updates_push,
       payment_updates_push,
       marketing_push,
       quiet_hours_start,
       quiet_hours_end
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id)
     DO UPDATE SET
       new_match_push = EXCLUDED.new_match_push,
       booking_updates_push = EXCLUDED.booking_updates_push,
       payment_updates_push = EXCLUDED.payment_updates_push,
       marketing_push = EXCLUDED.marketing_push,
       quiet_hours_start = EXCLUDED.quiet_hours_start,
       quiet_hours_end = EXCLUDED.quiet_hours_end,
       updated_at = now()
     RETURNING
       user_id,
       new_match_push,
       booking_updates_push,
       payment_updates_push,
       marketing_push,
       to_char(quiet_hours_start, 'HH24:MI:SS') AS quiet_hours_start,
       to_char(quiet_hours_end, 'HH24:MI:SS') AS quiet_hours_end,
       created_at,
       updated_at`;
  const params = [
    input.userId,
    input.newMatchPush,
    input.bookingUpdatesPush,
    input.paymentUpdatesPush,
    input.marketingPush,
    input.quietHoursStart,
    input.quietHoursEnd,
  ];
  const result = client
    ? await client.query<NotificationPreferencesRow>(queryText, params)
    : await dbQuery<NotificationPreferencesRow>(queryText, params);

  return mapNotificationPreferences(result.rows[0]);
}

export async function registerDeviceToken(
  input: {
    userId: string;
    platform: string;
    token: string;
  },
  client?: PoolClient,
) {
  const queryText = `INSERT INTO device_tokens (
       user_id,
       platform,
       token,
       status
     )
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (token)
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       status = 'active',
       last_seen_at = now(),
       updated_at = now()
     RETURNING
       id,
       platform,
       token,
       status,
       last_seen_at,
       created_at,
       updated_at`;
  const params = [input.userId, input.platform, input.token];
  const result = client
    ? await client.query<DeviceTokenRow>(queryText, params)
    : await dbQuery<DeviceTokenRow>(queryText, params);

  return mapDeviceToken(result.rows[0]);
}

export async function listDeviceTokensByUser(userId: string) {
  const result = await dbQuery<DeviceTokenRow>(
    `SELECT
       id,
       platform,
       token,
       status,
       last_seen_at,
       created_at,
       updated_at
     FROM device_tokens
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows.map(mapDeviceToken);
}

export async function revokeDeviceToken(userId: string, id: string) {
  const result = await dbQuery<DeviceTokenRow>(
    `UPDATE device_tokens
     SET status = 'revoked',
         updated_at = now()
     WHERE user_id = $1
       AND id = $2
     RETURNING
       id,
       platform,
       token,
       status,
       last_seen_at,
       created_at,
       updated_at`,
    [userId, id],
  );

  return result.rows[0] ? mapDeviceToken(result.rows[0]) : null;
}

export async function createNotification(
  input: {
    userId: string;
    type: string;
    channel?: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    status?: string;
    dedupeKey?: string | null;
    sentAt?: Date | null;
  },
  client?: PoolClient,
) {
  const queryText = `INSERT INTO notifications (
         user_id,
         type,
         channel,
         title,
         body,
         data,
         status,
         dedupe_key,
         sent_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING
         id,
         type,
         channel,
         title,
         body,
         data,
         status,
         dedupe_key,
         sent_at,
         read_at,
         created_at,
         updated_at`;
  const params = [
    input.userId,
    input.type,
    input.channel ?? "in_app",
    input.title,
    input.body,
    JSON.stringify(input.data ?? {}),
    input.status ?? "sent",
    input.dedupeKey ?? null,
    input.sentAt ?? new Date(),
  ];

  try {
    const result = client
      ? await client.query<NotificationRow>(queryText, params)
      : await dbQuery<NotificationRow>(queryText, params);

    return mapNotification(result.rows[0]);
  } catch (error: any) {
    if (error?.code !== "23505" || !input.dedupeKey) {
      throw error;
    }

    return null;
  }
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await dbQuery<NotificationRow>(
    `UPDATE notifications
     SET status = 'read',
         read_at = COALESCE(read_at, now()),
         updated_at = now()
     WHERE user_id = $1
       AND id = $2
     RETURNING
       id,
       type,
       channel,
       title,
       body,
       data,
       status,
       dedupe_key,
       sent_at,
       read_at,
       created_at,
       updated_at`,
    [userId, notificationId],
  );

  return result.rows[0] ? mapNotification(result.rows[0]) : null;
}

export async function markAllNotificationsRead(userId: string) {
  const result = await dbQuery<{ count: string }>(
    `WITH updated AS (
       UPDATE notifications
       SET status = 'read',
           read_at = COALESCE(read_at, now()),
           updated_at = now()
       WHERE user_id = $1
         AND status <> 'read'
       RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM updated`,
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}
