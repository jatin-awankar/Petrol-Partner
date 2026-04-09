import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTransactionMock } = vi.hoisted(() => ({
  withTransactionMock: vi.fn(),
}));

vi.mock("../../db/transaction", () => ({
  withTransaction: withTransactionMock,
}));

vi.mock("./chat.repo", () => ({
  ensureChatRoomForBooking: vi.fn(),
  lockChatRoomByBookingId: vi.fn(),
  listChatRoomsForUser: vi.fn(),
  findChatRoomByIdForUser: vi.fn(),
  listChatMessagesForRoom: vi.fn(),
  findChatRoomByIdForUpdate: vi.fn(),
  insertChatMessage: vi.fn(),
  touchChatRoomAfterMessage: vi.fn(),
  markChatRoomRead: vi.fn(),
}));

import { AppError } from "../../shared/errors/app-error";
import * as chatRepo from "./chat.repo";
import * as chatService from "./chat.service";

describe("chat.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects sending when the room is locked", async () => {
    withTransactionMock.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) =>
      callback({}),
    );
    vi.mocked(chatRepo.findChatRoomByIdForUpdate).mockResolvedValue({
      id: "room-1",
      booking_id: "booking-1",
      driver_id: "driver-1",
      passenger_id: "passenger-1",
      status: "locked",
      locked_at: "2026-04-01T00:00:00.000Z",
      delete_after: "2026-04-08T00:00:00.000Z",
      last_message_at: null,
      driver_last_read_at: null,
      passenger_last_read_at: null,
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    } as any);

    await expect(chatService.sendChatMessage("driver-1", "room-1", "Hello")).rejects.toMatchObject({
      code: "CHAT_ROOM_LOCKED",
      statusCode: 409,
    });
  });

  it("persists message and updates room timestamps for active rooms", async () => {
    withTransactionMock.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) =>
      callback({}),
    );
    vi.mocked(chatRepo.findChatRoomByIdForUpdate).mockResolvedValue({
      id: "room-1",
      booking_id: "booking-1",
      driver_id: "driver-1",
      passenger_id: "passenger-1",
      status: "active",
    } as any);
    vi.mocked(chatRepo.insertChatMessage).mockResolvedValue({
      id: "message-1",
      chat_room_id: "room-1",
      sender_id: "driver-1",
      receiver_id: "passenger-1",
      content: "hello",
      created_at: "2026-04-01T01:00:00.000Z",
    });

    const result = await chatService.sendChatMessage("driver-1", "room-1", "hello");

    expect(result.message.id).toBe("message-1");
    expect(chatRepo.insertChatMessage).toHaveBeenCalledWith(
      {
        roomId: "room-1",
        senderId: "driver-1",
        receiverId: "passenger-1",
        content: "hello",
      },
      expect.anything(),
    );
    expect(chatRepo.touchChatRoomAfterMessage).toHaveBeenCalledOnce();
  });

  it("returns 404 when marking read for an unknown room", async () => {
    vi.mocked(chatRepo.markChatRoomRead).mockResolvedValue(null);

    const result = chatService.markChatRoomRead("user-1", "room-404", {});

    await expect(result).rejects.toBeInstanceOf(AppError);
    await expect(result).rejects.toMatchObject({
      code: "CHAT_ROOM_NOT_FOUND",
      statusCode: 404,
    });
  });
});
