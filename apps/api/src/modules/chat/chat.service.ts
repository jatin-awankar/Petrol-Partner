import type { PoolClient } from "pg";

import { withTransaction } from "../../db/transaction";
import { AppError } from "../../shared/errors/app-error";
import type {
  ListChatMessagesQuery,
  ListChatRoomsQuery,
  MarkChatReadBody,
} from "./chat.schema";
import * as chatRepo from "./chat.repo";

const CHAT_RETENTION_DAYS = 7;

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function ensureRoomForConfirmedBooking(
  input: {
    bookingId: string;
    driverId: string;
    passengerId: string;
  },
  client: PoolClient,
) {
  return chatRepo.ensureChatRoomForBooking(input, client);
}

export async function lockRoomForTerminalBooking(
  bookingId: string,
  client: PoolClient,
) {
  const lockedAt = new Date();
  const deleteAfter = addDays(CHAT_RETENTION_DAYS);
  return chatRepo.lockChatRoomByBookingId(bookingId, lockedAt, deleteAfter, client);
}

export function listChatRooms(userId: string, query: ListChatRoomsQuery) {
  return chatRepo.listChatRoomsForUser({
    userId,
    status: query.status,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function getChatRoomForUser(userId: string, roomId: string) {
  const room = await chatRepo.findChatRoomByIdForUser(roomId, userId);

  if (!room) {
    throw new AppError(404, "Chat room not found", "CHAT_ROOM_NOT_FOUND");
  }

  return room;
}

export async function listChatMessages(
  userId: string,
  roomId: string,
  query: ListChatMessagesQuery,
) {
  const result = await chatRepo.listChatMessagesForRoom({
    roomId,
    userId,
    limit: query.limit,
    before: query.before ? new Date(query.before) : undefined,
  });

  if (!result.room) {
    throw new AppError(404, "Chat room not found", "CHAT_ROOM_NOT_FOUND");
  }

  return result;
}

export async function sendChatMessage(
  userId: string,
  roomId: string,
  content: string,
) {
  return withTransaction(async (client) => {
    const room = await chatRepo.findChatRoomByIdForUpdate(roomId, client);

    if (!room) {
      throw new AppError(404, "Chat room not found", "CHAT_ROOM_NOT_FOUND");
    }

    if (room.driver_id !== userId && room.passenger_id !== userId) {
      throw new AppError(403, "You cannot access this chat room", "FORBIDDEN");
    }

    if (room.status !== "active") {
      throw new AppError(409, "Chat room is locked", "CHAT_ROOM_LOCKED", {
        room_status: room.status,
        locked_at: room.locked_at ? new Date(room.locked_at).toISOString() : null,
        delete_after: room.delete_after ? new Date(room.delete_after).toISOString() : null,
      });
    }

    const receiverId = room.driver_id === userId ? room.passenger_id : room.driver_id;
    const message = await chatRepo.insertChatMessage(
      {
        roomId,
        senderId: userId,
        receiverId,
        content,
      },
      client,
    );

    await chatRepo.touchChatRoomAfterMessage(
      {
        roomId,
        senderId: userId,
        sentAt: message.created_at ?? new Date().toISOString(),
      },
      client,
    );

    return {
      message,
      room: {
        id: room.id,
        booking_id: room.booking_id,
        status: room.status,
      },
    };
  });
}

export async function markChatRoomRead(
  userId: string,
  roomId: string,
  input: MarkChatReadBody,
) {
  const readAt = input.read_at ? new Date(input.read_at) : new Date();
  const room = await chatRepo.markChatRoomRead({
    roomId,
    userId,
    readAt,
  });

  if (!room) {
    throw new AppError(404, "Chat room not found", "CHAT_ROOM_NOT_FOUND");
  }

  return {
    room,
    read_at: readAt.toISOString(),
  };
}
