import type { Server as HttpServer } from "http";

import { Server } from "socket.io";
import type { Socket } from "socket.io";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { verifyAccessToken } from "../../shared/jwt/tokens";
import { ACCESS_TOKEN_COOKIE } from "../../shared/utils/cookies";
import * as chatService from "./chat.service";

interface AuthenticatedSocketUser {
  userId: string;
  email: string;
  role: string;
}

interface SocketErrorPayload {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}

let io: Server | null = null;

function roomChannel(roomId: string) {
  return `chat:${roomId}`;
}

function parseCookies(cookieHeader: string | undefined) {
  const values = new Map<string, string>();

  if (!cookieHeader) {
    return values;
  }

  for (const item of cookieHeader.split(";")) {
    const [key, ...valueParts] = item.trim().split("=");

    if (!key || valueParts.length === 0) {
      continue;
    }

    values.set(key, decodeURIComponent(valueParts.join("=")));
  }

  return values;
}

function formatSocketError(error: unknown): SocketErrorPayload {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      status: error.statusCode,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "SOCKET_ERROR",
      message: error.message,
    };
  }

  return {
    code: "SOCKET_ERROR",
    message: "Unexpected socket error",
  };
}

function getSocketUser(socket: Socket): AuthenticatedSocketUser {
  const user = socket.data.user as AuthenticatedSocketUser | undefined;

  if (!user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return user;
}

async function handleJoin(socket: Socket, roomId: string) {
  const user = getSocketUser(socket);
  const room = await chatService.getChatRoomForUser(user.userId, roomId);
  await socket.join(roomChannel(roomId));
  return room;
}

async function handleSend(socket: Socket, payload: { roomId?: string; content?: string }) {
  const user = getSocketUser(socket);
  const roomId = payload.roomId?.trim();
  const content = payload.content?.trim();

  if (!roomId) {
    throw new AppError(400, "roomId is required", "VALIDATION_ERROR");
  }

  if (!content) {
    throw new AppError(400, "content is required", "VALIDATION_ERROR");
  }

  await socket.join(roomChannel(roomId));
  return chatService.sendChatMessage(user.userId, roomId, content);
}

async function handleRead(socket: Socket, payload: { roomId?: string; readAt?: string }) {
  const user = getSocketUser(socket);
  const roomId = payload.roomId?.trim();

  if (!roomId) {
    throw new AppError(400, "roomId is required", "VALIDATION_ERROR");
  }

  await socket.join(roomChannel(roomId));
  const result = await chatService.markChatRoomRead(user.userId, roomId, {
    read_at: payload.readAt,
  });

  return {
    roomId,
    userId: user.userId,
    readAt: result.read_at,
  };
}

export function emitChatRoomLocked(input: {
  roomId: string;
  lockedAt: string | null;
  deleteAfter: string | null;
}) {
  if (!io) {
    return;
  }

  io.to(roomChannel(input.roomId)).emit("chat:room_locked", {
    roomId: input.roomId,
    lockedAt: input.lockedAt,
    deleteAfter: input.deleteAfter,
  });
}

export function initializeChatSocketServer(server: HttpServer) {
  if (!env.ENABLE_CHAT) {
    return null;
  }

  if (io) {
    return io;
  }

  io = new Server(server, {
    path: "/v1/chat/socket.io",
    cors: {
      origin: env.APP_ORIGIN,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies.get(ACCESS_TOKEN_COOKIE);

      if (!token) {
        throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      }

      const payload = verifyAccessToken(token);
      socket.data.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
      } satisfies AuthenticatedSocketUser;

      next();
    } catch (error) {
      next(new Error(formatSocketError(error).message));
    }
  });

  io.on("connection", (socket) => {
    socket.on("chat:join", async (payload: { roomId?: string }, callback?: (value: unknown) => void) => {
      try {
        const roomId = payload?.roomId?.trim();

        if (!roomId) {
          throw new AppError(400, "roomId is required", "VALIDATION_ERROR");
        }

        const room = await handleJoin(socket, roomId);
        callback?.({
          ok: true,
          room,
        });
      } catch (error) {
        callback?.({
          ok: false,
          error: formatSocketError(error),
        });
      }
    });

    socket.on(
      "chat:send",
      async (
        payload: { roomId?: string; content?: string },
        callback?: (value: unknown) => void,
      ) => {
        try {
          const result = await handleSend(socket, payload);
          io?.to(roomChannel(result.room.id)).emit("chat:new_message", {
            roomId: result.room.id,
            message: result.message,
          });
          callback?.({
            ok: true,
            message: result.message,
          });
        } catch (error) {
          const formatted = formatSocketError(error);

          if (formatted.code === "CHAT_ROOM_LOCKED") {
            const details = formatted.details as
              | { locked_at?: string | null; delete_after?: string | null }
              | undefined;
            io?.to(roomChannel(payload.roomId ?? "")).emit("chat:room_locked", {
              roomId: payload.roomId,
              lockedAt: details?.locked_at ?? null,
              deleteAfter: details?.delete_after ?? null,
            });
          }

          callback?.({
            ok: false,
            error: formatted,
          });
        }
      },
    );

    socket.on(
      "chat:read",
      async (
        payload: { roomId?: string; readAt?: string },
        callback?: (value: unknown) => void,
      ) => {
        try {
          const update = await handleRead(socket, payload);
          io?.to(roomChannel(update.roomId)).emit("chat:read_update", update);
          callback?.({
            ok: true,
            ...update,
          });
        } catch (error) {
          callback?.({
            ok: false,
            error: formatSocketError(error),
          });
        }
      },
    );
  });

  return io;
}
