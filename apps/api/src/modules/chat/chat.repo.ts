import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

interface ChatRoomRecord {
  id: string;
  booking_id: string;
  driver_id: string;
  passenger_id: string;
  status: "active" | "locked";
  locked_at: Date | string | null;
  delete_after: Date | string | null;
  last_message_at: Date | string | null;
  driver_last_read_at: Date | string | null;
  passenger_last_read_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ChatRoomListRow extends ChatRoomRecord {
  booking_status: string;
  pickup_location: string | null;
  drop_location: string | null;
  date: string | null;
  time: string | null;
  other_user_id: string;
  other_user_name: string | null;
  other_user_email: string;
  other_user_avatar_url: string | null;
  unread_count: string;
  last_message_content: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: Date | string | null;
}

interface ChatMessageRow {
  id: string;
  chat_room_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: Date | string;
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function mapChatRoom(row: ChatRoomRecord) {
  return {
    id: row.id,
    booking_id: row.booking_id,
    driver_id: row.driver_id,
    passenger_id: row.passenger_id,
    status: row.status,
    locked_at: toIso(row.locked_at),
    delete_after: toIso(row.delete_after),
    last_message_at: toIso(row.last_message_at),
    driver_last_read_at: toIso(row.driver_last_read_at),
    passenger_last_read_at: toIso(row.passenger_last_read_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapChatMessage(row: ChatMessageRow) {
  return {
    id: row.id,
    chat_room_id: row.chat_room_id,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    content: row.content,
    created_at: toIso(row.created_at),
  };
}

export async function ensureChatRoomForBooking(
  input: {
    bookingId: string;
    driverId: string;
    passengerId: string;
  },
  client: PoolClient,
) {
  const result = await client.query<ChatRoomRecord>(
    `WITH inserted AS (
       INSERT INTO chat_rooms (
         booking_id,
         driver_id,
         passenger_id,
         status,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, 'active', now(), now())
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING *
     )
     SELECT * FROM inserted
     UNION ALL
     SELECT * FROM chat_rooms WHERE booking_id = $1
     LIMIT 1`,
    [input.bookingId, input.driverId, input.passengerId],
  );

  return result.rows[0] ? mapChatRoom(result.rows[0]) : null;
}

export async function lockChatRoomByBookingId(
  bookingId: string,
  lockedAt: Date,
  deleteAfter: Date,
  client: PoolClient,
) {
  const result = await client.query<ChatRoomRecord>(
    `UPDATE chat_rooms
     SET status = 'locked',
         locked_at = COALESCE(locked_at, $2),
         delete_after = COALESCE(delete_after, $3),
         updated_at = now()
     WHERE booking_id = $1
       AND status = 'active'
     RETURNING *`,
    [bookingId, lockedAt, deleteAfter],
  );

  return result.rows[0] ? mapChatRoom(result.rows[0]) : null;
}

export async function findChatRoomByIdForUser(roomId: string, userId: string) {
  const result = await dbQuery<ChatRoomRecord>(
    `SELECT *
     FROM chat_rooms
     WHERE id = $1
       AND (driver_id = $2 OR passenger_id = $2)
     LIMIT 1`,
    [roomId, userId],
  );

  return result.rows[0] ? mapChatRoom(result.rows[0]) : null;
}

export async function listChatRoomsForUser(input: {
  userId: string;
  status?: "active" | "locked";
  limit: number;
  offset: number;
}) {
  const filters = ["(cr.driver_id = $1 OR cr.passenger_id = $1)"];
  const params: unknown[] = [input.userId];
  let parameterIndex = 2;

  if (input.status) {
    filters.push(`cr.status = $${parameterIndex}`);
    params.push(input.status);
    parameterIndex += 1;
  }

  const countResult = await dbQuery<{ total_count: string }>(
    `SELECT COUNT(*)::text AS total_count
     FROM chat_rooms cr
     WHERE ${filters.join(" AND ")}`,
    params,
  );

  params.push(input.limit, input.offset);
  const limitParam = parameterIndex;
  const offsetParam = parameterIndex + 1;

  const rowsResult = await dbQuery<ChatRoomListRow>(
    `SELECT
       cr.*,
       b.status AS booking_status,
       COALESCE(ro.pickup_location, rr.pickup_location) AS pickup_location,
       COALESCE(ro.drop_location, rr.drop_location) AS drop_location,
       COALESCE(ro.date, rr.date) AS date,
       COALESCE(ro.time, rr.time) AS time,
       other_user.id AS other_user_id,
       other_profile.full_name AS other_user_name,
       other_user.email AS other_user_email,
       other_profile.avatar_url AS other_user_avatar_url,
       CASE
         WHEN cr.driver_id = $1 THEN (
           SELECT COUNT(*)::text
           FROM chat_messages m
           WHERE m.chat_room_id = cr.id
             AND m.sender_id <> $1
             AND (
               cr.driver_last_read_at IS NULL
               OR m.created_at > cr.driver_last_read_at
             )
         )
         ELSE (
           SELECT COUNT(*)::text
           FROM chat_messages m
           WHERE m.chat_room_id = cr.id
             AND m.sender_id <> $1
             AND (
               cr.passenger_last_read_at IS NULL
               OR m.created_at > cr.passenger_last_read_at
             )
         )
       END AS unread_count,
       lm.content AS last_message_content,
       lm.sender_id AS last_message_sender_id,
       lm.created_at AS last_message_created_at
     FROM chat_rooms cr
     INNER JOIN bookings b ON b.id = cr.booking_id
     LEFT JOIN ride_offers ro ON ro.id = b.ride_offer_id
     LEFT JOIN ride_requests rr ON rr.id = b.ride_request_id
     INNER JOIN users other_user
       ON other_user.id = CASE WHEN cr.driver_id = $1 THEN cr.passenger_id ELSE cr.driver_id END
     LEFT JOIN user_profiles other_profile ON other_profile.user_id = other_user.id
     LEFT JOIN LATERAL (
       SELECT
         m.content,
         m.sender_id,
         m.created_at
       FROM chat_messages m
       WHERE m.chat_room_id = cr.id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) lm ON TRUE
     WHERE ${filters.join(" AND ")}
     ORDER BY COALESCE(cr.last_message_at, cr.created_at) DESC
     LIMIT $${limitParam}
     OFFSET $${offsetParam}`,
    params,
  );

  const rooms = rowsResult.rows.map((row) => ({
    ...mapChatRoom(row),
    booking_status: row.booking_status,
    pickup_location: row.pickup_location,
    drop_location: row.drop_location,
    date: row.date,
    time: row.time,
    other_user_id: row.other_user_id,
    other_user_name: row.other_user_name,
    other_user_email: row.other_user_email,
    other_user_avatar_url: row.other_user_avatar_url,
    unread_count: Number(row.unread_count ?? 0),
    last_message: row.last_message_content
      ? {
          content: row.last_message_content,
          sender_id: row.last_message_sender_id,
          created_at: toIso(row.last_message_created_at),
        }
      : null,
  }));

  return {
    rooms,
    totalCount: Number(countResult.rows[0]?.total_count ?? 0),
  };
}

export async function listChatMessagesForRoom(input: {
  roomId: string;
  userId: string;
  limit: number;
  before?: Date;
}) {
  const room = await findChatRoomByIdForUser(input.roomId, input.userId);

  if (!room) {
    return {
      room: null,
      messages: [],
    };
  }

  const result = await dbQuery<ChatMessageRow>(
    `SELECT
       id,
       chat_room_id,
       sender_id,
       receiver_id,
       content,
       created_at
     FROM chat_messages
     WHERE chat_room_id = $1
       AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
     ORDER BY created_at DESC
     LIMIT $3`,
    [input.roomId, input.before ?? null, input.limit],
  );

  return {
    room,
    messages: result.rows.map(mapChatMessage).reverse(),
  };
}

export async function findChatRoomByIdForUpdate(roomId: string, client: PoolClient) {
  const result = await client.query<ChatRoomRecord>(
    `SELECT *
     FROM chat_rooms
     WHERE id = $1
     FOR UPDATE`,
    [roomId],
  );

  return result.rows[0] ?? null;
}

export async function insertChatMessage(
  input: {
    roomId: string;
    senderId: string;
    receiverId: string;
    content: string;
  },
  client: PoolClient,
) {
  const result = await client.query<ChatMessageRow>(
    `INSERT INTO chat_messages (
       chat_room_id,
       sender_id,
       receiver_id,
       content
     )
     VALUES ($1, $2, $3, $4)
     RETURNING
       id,
       chat_room_id,
       sender_id,
       receiver_id,
       content,
       created_at`,
    [input.roomId, input.senderId, input.receiverId, input.content],
  );

  return mapChatMessage(result.rows[0]);
}

export async function touchChatRoomAfterMessage(input: {
  roomId: string;
  senderId: string;
  sentAt: string;
}, client: PoolClient) {
  await client.query(
    `UPDATE chat_rooms
     SET last_message_at = $3::timestamptz,
         driver_last_read_at = CASE
           WHEN driver_id = $2 THEN $3::timestamptz
           ELSE driver_last_read_at
         END,
         passenger_last_read_at = CASE
           WHEN passenger_id = $2 THEN $3::timestamptz
           ELSE passenger_last_read_at
         END,
         updated_at = now()
     WHERE id = $1`,
    [input.roomId, input.senderId, input.sentAt],
  );
}

export async function markChatRoomRead(input: {
  roomId: string;
  userId: string;
  readAt: Date;
}) {
  const result = await dbQuery<ChatRoomRecord>(
    `UPDATE chat_rooms
     SET driver_last_read_at = CASE
           WHEN driver_id = $2 THEN $3::timestamptz
           ELSE driver_last_read_at
         END,
         passenger_last_read_at = CASE
           WHEN passenger_id = $2 THEN $3::timestamptz
           ELSE passenger_last_read_at
         END,
         updated_at = now()
     WHERE id = $1
       AND (driver_id = $2 OR passenger_id = $2)
     RETURNING *`,
    [input.roomId, input.userId, input.readAt.toISOString()],
  );

  return result.rows[0] ? mapChatRoom(result.rows[0]) : null;
}
