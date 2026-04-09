import { z } from "zod";

const roomStatusValues = ["active", "locked"] as const;

export const chatRoomIdParamSchema = z.object({
  roomId: z.string().uuid(),
});

export const listChatRoomsQuerySchema = z.object({
  status: z.enum(roomStatusValues).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listChatMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  before: z.string().datetime().optional(),
});

export const sendChatMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export const markChatReadBodySchema = z.object({
  read_at: z.string().datetime().optional(),
});

export type ChatRoomStatus = (typeof roomStatusValues)[number];
export type ListChatRoomsQuery = z.infer<typeof listChatRoomsQuerySchema>;
export type ListChatMessagesQuery = z.infer<typeof listChatMessagesQuerySchema>;
export type SendChatMessageBody = z.infer<typeof sendChatMessageBodySchema>;
export type MarkChatReadBody = z.infer<typeof markChatReadBodySchema>;
