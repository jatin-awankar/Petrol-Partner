"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { useFetchChatRooms } from "@/hooks/chat/useFetchChatRooms";
import { useFetchMessages } from "@/hooks/chat/useFetchMessages";
import { useSendMessage } from "@/hooks/chat/useSendMessage";
import { frontendConfig } from "@/lib/frontend-config";
import { markChatRoomRead } from "@/lib/api/backend";

function formatMessageTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRetentionTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const bookingIdFromQuery = searchParams.get("bookingId");
  const { user } = useCurrentUser();
  const { chatRooms, loading: roomsLoading, error: roomsError, refetch: refetchRooms } = useFetchChatRooms();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const selectedRoomIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  const [liveMessages, setLiveMessages] = useState<any[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const { sendMessage: sendMessageRest, loading: sendingRest } = useSendMessage();
  const { messages, loading: messagesLoading, error: messagesError, refetch: refetchMessages } =
    useFetchMessages(selectedRoomId);

  const selectedRoom = useMemo(
    () => chatRooms.find((room) => room.id === selectedRoomId) ?? null,
    [chatRooms, selectedRoomId],
  );

  const markRoomRead = useCallback(async (roomId: string) => {
    try {
      const result = await markChatRoomRead(roomId);
      socketRef.current?.emit("chat:read", {
        roomId,
        readAt: result.read_at,
      });
      await refetchRooms();
    } catch {
      return;
    }
  }, [refetchRooms]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    if (!frontendConfig.flags.enableChatUi) {
      return undefined;
    }

    const socket = io(frontendConfig.apiBaseUrl, {
      path: "/v1/chat/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;
    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("chat:new_message", (payload: { roomId?: string; message?: any }) => {
      if (!payload?.roomId || !payload?.message) {
        return;
      }

      if (payload.roomId === selectedRoomIdRef.current) {
        setLiveMessages((prev) => {
          const exists = prev.some((message) => message.id === payload.message.id);
          if (exists) return prev;
          return [...prev, payload.message];
        });

        if (payload.message.sender_id !== user?.id) {
          void markRoomRead(payload.roomId);
        }
      }

      void refetchRooms();
    });

    socket.on("chat:room_locked", (payload: { roomId?: string; deleteAfter?: string | null }) => {
      if (payload?.roomId && payload.roomId === selectedRoomIdRef.current) {
        toast.info(
          payload.deleteAfter
            ? `Chat is now read-only. Messages will be deleted by ${formatRetentionTime(payload.deleteAfter)}.`
            : "Chat is now read-only.",
        );
      }
      void refetchRooms();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [markRoomRead, refetchRooms, user?.id]);

  useEffect(() => {
    if (!chatRooms.length) {
      setSelectedRoomId(null);
      return;
    }

    if (selectedRoomId && chatRooms.some((room) => room.id === selectedRoomId)) {
      return;
    }

    if (bookingIdFromQuery) {
      const roomFromBooking = chatRooms.find((room) => room.booking_id === bookingIdFromQuery);
      if (roomFromBooking) {
        setSelectedRoomId(roomFromBooking.id);
        return;
      }
    }

    setSelectedRoomId(chatRooms[0].id);
  }, [bookingIdFromQuery, chatRooms, selectedRoomId]);

  useEffect(() => {
    setLiveMessages(messages ?? []);
  }, [messages, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoomId) {
      return;
    }

    socketRef.current?.emit("chat:join", {
      roomId: selectedRoomId,
    });
    void markRoomRead(selectedRoomId);
  }, [markRoomRead, selectedRoomId]);

  const handleSend = useCallback(async () => {
    const content = draft.trim();

    if (!content || !selectedRoomId || !selectedRoom) {
      return;
    }

    if (selectedRoom.status !== "active") {
      toast.info("This chat is read-only because the ride is closed.");
      return;
    }

    setDraft("");

    const sendViaSocket = async () =>
      new Promise<any>((resolve, reject) => {
        socketRef.current?.emit(
          "chat:send",
          {
            roomId: selectedRoomId,
            content,
          },
          (response: any) => {
            if (response?.ok && response?.message) {
              resolve(response.message);
              return;
            }
            reject(response?.error ?? new Error("Unable to send message"));
          },
        );
      });

    try {
      let persistedMessage: any;

      if (socketConnected && socketRef.current) {
        persistedMessage = await sendViaSocket();
      } else {
        const response = await sendMessageRest(selectedRoomId, content);
        persistedMessage = response?.message;
      }

      if (persistedMessage) {
        setLiveMessages((prev) => {
          const exists = prev.some((message) => message.id === persistedMessage.id);
          if (exists) return prev;
          return [...prev, persistedMessage];
        });
      }

      void refetchRooms();
      void markRoomRead(selectedRoomId);
    } catch (error: any) {
      setDraft(content);
      if (error?.code === "CHAT_ROOM_LOCKED") {
        toast.info("Chat is locked for this booking.");
      } else {
        toast.error(error?.message ?? "Failed to send message");
      }
    }
  }, [
    draft,
    markRoomRead,
    refetchRooms,
    selectedRoom,
    selectedRoomId,
    sendMessageRest,
    socketConnected,
  ]);

  if (!frontendConfig.flags.enableChatUi) {
    return (
      <div className="page bg-background container p-4 max-w-3xl mx-auto">
        <div className="border border-border rounded-2xl p-8 bg-card text-center space-y-4">
          <h1 className="text-2xl font-semibold text-foreground">
            Messages are temporarily unavailable
          </h1>
          <p className="text-muted-foreground">
            Chat remains disabled in this environment.
          </p>
          <Link href="/dashboard" className="text-primary hover:underline">
            Go back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page bg-background container p-4 space-y-4 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Messages</h1>
        <span className="text-xs text-muted-foreground">
          {socketConnected ? "Realtime connected" : "Realtime reconnecting"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <div className="rounded-2xl border border-border bg-card">
          <div className="p-3 border-b border-border text-sm font-medium text-foreground">
            Conversations
          </div>
          <ScrollArea className="h-[65vh]">
            {roomsLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading chats...</div>
            ) : roomsError ? (
              <div className="p-4 text-sm text-destructive">{roomsError}</div>
            ) : chatRooms.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No chats yet. Confirm a booking to start messaging.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {chatRooms.map((room) => (
                  <button
                    key={room.id}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition ${
                      room.id === selectedRoomId ? "bg-muted/60" : ""
                    }`}
                    onClick={() => setSelectedRoomId(room.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {room.other_user_name || room.other_user_email}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {room.pickup_location} to {room.drop_location}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {room.last_message?.content || "No messages yet"}
                        </p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        {room.unread_count > 0 ? (
                          <span className="inline-flex min-w-5 justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                            {room.unread_count}
                          </span>
                        ) : null}
                        <p className="text-[10px] text-muted-foreground">
                          {room.status === "active" ? "Active" : "Read-only"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="rounded-2xl border border-border bg-card flex flex-col h-[65vh]">
          {!selectedRoom ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8">
              <MessageCircle className="size-8 mb-2" />
              <p>Select a conversation to view messages.</p>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-border">
                <p className="text-sm font-medium text-foreground">
                  {selectedRoom.other_user_name || selectedRoom.other_user_email}
                </p>
                <p className="text-xs text-muted-foreground">
                  Booking {selectedRoom.booking_status} | {selectedRoom.pickup_location} to{" "}
                  {selectedRoom.drop_location}
                </p>
              </div>

              {selectedRoom.status === "locked" ? (
                <div className="px-3 py-2 border-b border-border bg-amber-50 text-amber-700 text-xs">
                  Chat is read-only. This chat will be deleted on{" "}
                  {formatRetentionTime(selectedRoom.delete_after)}.
                </div>
              ) : null}

              <ScrollArea className="flex-1 p-3">
                {messagesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading messages...</p>
                ) : messagesError ? (
                  <p className="text-sm text-destructive">{messagesError}</p>
                ) : liveMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No messages yet. Send a ride-related message to start.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {liveMessages.map((message) => {
                      const mine = message.sender_id === user?.id;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                              mine
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground"
                            }`}
                          >
                            <p>{message.content}</p>
                            <p
                              className={`mt-1 text-[10px] ${
                                mine ? "text-primary-foreground/80" : "text-muted-foreground"
                              }`}
                            >
                              {formatMessageTime(message.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="border-t border-border p-3 flex gap-2">
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={
                    selectedRoom.status === "active"
                      ? "Type a message..."
                      : "Ride completed/cancelled. Messaging is disabled."
                  }
                  disabled={selectedRoom.status !== "active" || sendingRest}
                />
                <Button
                  onClick={() => void handleSend()}
                  disabled={selectedRoom.status !== "active" || !draft.trim() || sendingRest}
                >
                  Send
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
