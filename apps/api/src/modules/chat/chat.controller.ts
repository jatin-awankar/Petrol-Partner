import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  chatRoomIdParamSchema,
  listChatMessagesQuerySchema,
  listChatRoomsQuerySchema,
  markChatReadBodySchema,
  sendChatMessageBodySchema,
} from "./chat.schema";
import * as chatService from "./chat.service";

function requireUserId(req: Request) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return req.user.userId;
}

export async function listRooms(req: Request, res: Response) {
  const userId = requireUserId(req);
  const query = listChatRoomsQuerySchema.parse(req.query);
  const result = await chatService.listChatRooms(userId, query);

  res.status(200).json({
    rooms: result.rooms,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      count: result.rooms.length,
      total: result.totalCount,
    },
  });
}

export async function listMessages(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { roomId } = chatRoomIdParamSchema.parse(req.params);
  const query = listChatMessagesQuerySchema.parse(req.query);
  const result = await chatService.listChatMessages(userId, roomId, query);

  res.status(200).json({
    room: result.room,
    messages: result.messages,
  });
}

export async function sendMessage(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { roomId } = chatRoomIdParamSchema.parse(req.params);
  const { content } = sendChatMessageBodySchema.parse(req.body);
  const result = await chatService.sendChatMessage(userId, roomId, content);

  res.status(201).json({
    message: result.message,
    room: result.room,
  });
}

export async function markRead(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { roomId } = chatRoomIdParamSchema.parse(req.params);
  const body = markChatReadBodySchema.parse(req.body ?? {});
  const result = await chatService.markChatRoomRead(userId, roomId, body);

  res.status(200).json({
    room: result.room,
    read_at: result.read_at,
  });
}
