"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ChevronLeft, MessageCircle } from "lucide-react";
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
  const {
    chatRooms,
    loading: roomsLoading,
    error: roomsError,
    refetch: refetchRooms,
  } = useFetchChatRooms();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showRoomsOnMobile, setShowRoomsOnMobile] = useState(true);
  const selectedRoomIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  const [liveMessages, setLiveMessages] = useState<any[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const { sendMessage: sendMessageRest, loading: sendingRest } =
    useSendMessage();
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
  } = useFetchMessages(selectedRoomId);

  const selectedRoom = useMemo(
    () => chatRooms.find((room) => room.id === selectedRoomId) ?? null,
    [chatRooms, selectedRoomId],
  );

  const markRoomRead = useCallback(
    async (roomId: string) => {
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
    },
    [refetchRooms],
  );

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

    socket.on(
      "chat:new_message",
      (payload: { roomId?: string; message?: any }) => {
        if (!payload?.roomId || !payload?.message) {
          return;
        }

        if (payload.roomId === selectedRoomIdRef.current) {
          setLiveMessages((prev) => {
            const exists = prev.some(
              (message) => message.id === payload.message.id,
            );
            if (exists) return prev;
            return [...prev, payload.message];
          });

          if (payload.message.sender_id !== user?.id) {
            void markRoomRead(payload.roomId);
          }
        }

        void refetchRooms();
      },
    );

    socket.on(
      "chat:room_locked",
      (payload: { roomId?: string; deleteAfter?: string | null }) => {
        if (payload?.roomId && payload.roomId === selectedRoomIdRef.current) {
          toast.info(
            payload.deleteAfter
              ? `Chat is now read-only. Messages will be deleted by ${formatRetentionTime(payload.deleteAfter)}.`
              : "Chat is now read-only.",
          );
        }
        void refetchRooms();
      },
    );

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

    if (
      selectedRoomId &&
      chatRooms.some((room) => room.id === selectedRoomId)
    ) {
      return;
    }

    if (bookingIdFromQuery) {
      const roomFromBooking = chatRooms.find(
        (room) => room.booking_id === bookingIdFromQuery,
      );
      if (roomFromBooking) {
        setSelectedRoomId(roomFromBooking.id);
        return;
      }
    }

    setSelectedRoomId(chatRooms[0].id);
  }, [bookingIdFromQuery, chatRooms, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoomId) {
      setShowRoomsOnMobile(true);
    }
  }, [selectedRoomId]);

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
          const exists = prev.some(
            (message) => message.id === persistedMessage.id,
          );
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
      <div className="page container mx-auto max-w-3xl bg-background p-4">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
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
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-none gap-0 overflow-hidden bg-background md:max-w-7xl md:gap-4 md:px-4 md:py-4">
      <section
        className={`${
          showRoomsOnMobile ? "flex" : "hidden"
        } w-full flex-col overflow-hidden border-border bg-card md:flex md:w-[360px] md:rounded-2xl md:border`}
      >
        <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-foreground">Messages</h1>
            <span
              className={`text-[11px] ${socketConnected ? "text-emerald-600" : "text-muted-foreground"}`}
            >
              {socketConnected ? "Live" : "Reconnecting"}
            </span>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 pb-[calc(env(safe-area-inset-bottom)+4.75rem)] md:pb-0">
          {roomsLoading ? (
            <div className="p-4 text-sm text-muted-foreground">
              Loading chats...
            </div>
          ) : roomsError ? (
            <div className="p-4 text-sm text-destructive">{roomsError}</div>
          ) : chatRooms.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                No active conversations
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Confirm a booking to start chatting with your ride partner.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {chatRooms.map((room) => (
                <button
                  key={room.id}
                  className={`w-full px-4 py-4 text-left transition-colors hover:bg-muted/50 ${
                    room.id === selectedRoomId ? "bg-muted/60" : ""
                  }`}
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setShowRoomsOnMobile(false);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {room.other_user_name || room.other_user_email}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {room.pickup_location} to {room.drop_location}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {room.last_message?.content || "No messages yet"}
                      </p>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      {room.unread_count > 0 ? (
                        <span className="inline-flex min-w-5 justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                          {room.unread_count}
                        </span>
                      ) : null}
                      <p className="text-[10px] text-muted-foreground">
                        {room.status === "active" ? "Open" : "Locked"}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </section>

      <section
        className={`${
          showRoomsOnMobile ? "hidden" : "flex"
        } relative min-w-0 flex-1 flex-col overflow-hidden border-border bg-card md:flex md:rounded-2xl md:border`}
      >
        {!selectedRoom ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center text-muted-foreground">
            <MessageCircle className="mb-2 size-8" />
            <p>Select a conversation to view messages.</p>
          </div>
        ) : (
          <>
            <div className="absolute inset-x-0 top-0 z-20 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur">
              <div className="flex items-start gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 md:hidden"
                  onClick={() => setShowRoomsOnMobile(true)}
                  aria-label="Back to conversations"
                >
                  <ChevronLeft className="size-5" />
                </Button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {selectedRoom.other_user_name ||
                      selectedRoom.other_user_email}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    Booking {selectedRoom.booking_status} |{" "}
                    {selectedRoom.pickup_location} to{" "}
                    {selectedRoom.drop_location}
                  </p>
                </div>
              </div>
              {selectedRoom.status === "locked" ? (
                <div className="mt-2 -mx-4 border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                  Chat is read-only. Messages auto-delete on{" "}
                  {formatRetentionTime(selectedRoom.delete_after)}.
                </div>
              ) : null}
            </div>

            <ScrollArea
              className={`min-h-0 flex-1 bg-gradient-to-b from-background to-muted/20 my-3 px-4 py-4 ${
                selectedRoom.status === "locked" ? "pt-28" : "pt-16"
              } pb-[calc(env(safe-area-inset-bottom)+8rem)] md:pb-6`}
            >
              {messagesLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading messages...
                </p>
              ) : messagesError ? (
                <p className="text-sm text-destructive">{messagesError}</p>
              ) : liveMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No messages yet. Share pickup clarity, arrival timing, or seat
                  details.
                </p>
              ) : (
                <div className="space-y-3 mb-4 md:mb-10">
                  {liveMessages.map((message) => {
                    const mine = message.sender_id === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[75%] ${
                            mine
                              ? "rounded-br-md bg-primary text-primary-foreground"
                              : "rounded-bl-md border border-border bg-background text-foreground"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {message.content}
                          </p>
                          <p
                            className={`mt-1 text-[10px] ${
                              mine
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground"
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

            <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.8rem)] z-20 border-t border-border bg-card px-4 py-2  md:bottom-0">
              <div className="flex items-center gap-2">
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
                      ? "Message your ride partner..."
                      : "Ride closed. Messaging is disabled."
                  }
                  disabled={selectedRoom.status !== "active" || sendingRest}
                  className="h-11 text-base"
                />
                <Button
                  onClick={() => void handleSend()}
                  disabled={
                    selectedRoom.status !== "active" ||
                    !draft.trim() ||
                    sendingRest
                  }
                  className="h-11 px-4"
                >
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
