"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import ConversationList from "@/components/messages/ConversationList";
import ChatInterface from "@/components/messages/ChatInterface";
import Icon from "@/components/AppIcon";
import EmergencyAccessButton from "@/components/ui/EmergencyAccessButton";
import { useSession } from "next-auth/react";

export type Message = {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  status?: "sent" | "delivered" | "read";
  type?: "text" | "image" | "location";
};

export type Conversation = {
  id: string;
  name: string;
  avatar?: string;
  isVerified?: boolean;
  verificationType?: string;
  isOnline?: boolean;
  lastSeen?: string;
  rideStatus?: string;
  rideDate?: string;
  route?: string;
  lastMessage?: Message;
  lastMessageTime?: string;
  unreadCount?: number;
  isArchived?: boolean;
  partnerId?: string;
};

type ChatRow = {
  chat_room_id: string;
  partner_name: string;
  partner_id: string;
  last_message: string | null;
  last_message_time: string | null;
};

type MessageRow = {
  id: string;
  chat_room_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
};

export default function MessagesShell() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id as string | undefined;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMessages, setIsFetchingMessages] = useState(false);

  const mapChatToConversation = useCallback((chat: ChatRow): Conversation => {
    const lastMessage: Message | undefined = chat.last_message
      ? {
          id: `${chat.chat_room_id}-last`,
          senderId: chat.partner_id,
          content: chat.last_message,
          timestamp: chat.last_message_time || new Date().toISOString(),
          status: "delivered",
          type: "text",
        }
      : undefined;

    return {
      id: chat.chat_room_id,
      name: chat.partner_name,
      partnerId: chat.partner_id,
      isVerified: true,
      verificationType: "college",
      isOnline: false,
      rideStatus: "pending",
      rideDate: "",
      route: "",
      lastMessage,
      lastMessageTime: chat.last_message_time || undefined,
      unreadCount: 0,
      isArchived: false,
    };
  }, []);

  const fetchChats = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/messages/chat", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to load chats");
      const data = await res.json();
      const rows: ChatRow[] = data.chats || [];
      const mapped = rows.map(mapChatToConversation);
      setConversations(mapped);
      setSelectedConversationId((prev) => prev || mapped[0]?.id || "");
    } catch (err) {
      console.error("Fetch chats error:", err);
      setConversations([]);
    } finally {
      setIsLoading(false);
    }
  }, [mapChatToConversation]);

  const fetchMessages = useCallback(
    async (chatRoomId: string) => {
      if (!chatRoomId) return;
      setIsFetchingMessages(true);
      try {
        const res = await fetch(`/api/messages/${chatRoomId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error("Failed to load messages");
        const data = await res.json();
        const rows: MessageRow[] = data.messages || [];
        const mapped: Message[] = rows.map((row) => ({
          id: row.id,
          senderId:
            currentUserId && row.sender_id === currentUserId
              ? "currentUser"
              : row.sender_id,
          content: row.content,
          timestamp: row.created_at,
          status: row.is_read ? "read" : "delivered",
          type: "text",
        }));
        setMessagesMap((prev) => ({
          ...prev,
          [chatRoomId]: mapped,
        }));
      } catch (err) {
        console.error("Fetch messages error:", err);
      } finally {
        setIsFetchingMessages(false);
      }
    },
    [currentUserId]
  );

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useEffect(() => {
    if (selectedConversationId) {
      fetchMessages(selectedConversationId);
    }
  }, [selectedConversationId, fetchMessages]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const totalUnreadCount = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [conversations]
  );

  const handleConversationSelect = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
      )
    );
  };

  const handleBackToList = () => setSelectedConversationId("");
  const handleReportUser = () => console.log("Report user");
  const handleBlockUser = () => console.log("Block user");
  const handleEmergencyCall = () => console.log("Emergency call initiated");
  const handleShareLocation = () => console.log("Share location requested");
  const handleContactSupport = () => console.log("Contacting support...");

  const handleSendMessage = async (msg: Message) => {
    if (!selectedConversation) return;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_room_id: selectedConversation.id,
          content: msg.content,
        }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      const data = await res.json();
      const created = data?.data?.created_at || msg.timestamp;
      const newMessage: Message = {
        ...msg,
        id: data?.data?.id || msg.id,
        timestamp: created,
        status: "sent",
      };

      setMessagesMap((prev) => ({
        ...prev,
        [selectedConversation.id]: [
          ...(prev[selectedConversation.id] || []),
          newMessage,
        ],
      }));
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === selectedConversation.id
            ? {
                ...conv,
                lastMessage: newMessage,
                lastMessageTime: newMessage.timestamp,
              }
            : conv
        )
      );
    } catch (err) {
      console.error("Send message error:", err);
    }
  };

  return (
    <div className="bg-background">
      <div className="mb-12 md:mb-0">
        <div className="shadow-md overflow-hidden rounded-md">
          <div className="max-w-7xl mx-auto">
            <div className="md:flex p-0 m-0">
              <aside
                className={`${
                  selectedConversationId
                    ? "hidden md:flex md:w-1/3 lg:w-1/4"
                    : "flex w-full md:w-1/3 lg:w-1/4"
                } flex-col border-r border-border bg-card`}
              >
                <ConversationList
                  conversations={conversations.map((conv) => ({
                    ...conv,
                    lastMessage: conv.lastMessage && {
                      ...conv.lastMessage,
                      type: conv.lastMessage.type ?? "text",
                    },
                  }))}
                  onConversationSelect={handleConversationSelect}
                  selectedConversationId={selectedConversationId}
                  isLoading={isLoading}
                />
              </aside>

              <section
                className={`${
                  selectedConversationId
                    ? "flex w-full md:w-2/3 lg:w-3/4"
                    : "hidden md:flex md:w-2/3 lg:w-3/4"
                } flex-col bg-card`}
              >
                {selectedConversation ? (
                  <ChatInterface
                    conversation={selectedConversation}
                    messages={messagesMap[selectedConversation.id] || []}
                    onBack={handleBackToList}
                    onReport={handleReportUser}
                    onBlock={handleBlockUser}
                    onSendMessage={handleSendMessage}
                    isLoading={isFetchingMessages}
                  />
                ) : (
                  <div className="hidden md:flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
                    <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center">
                      <Icon
                        name="MessageCircle"
                        size={32}
                        className="text-muted-foreground"
                      />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">
                      Select a conversation
                    </h2>
                    <p className="max-w-md">
                      Pick a conversation from the list to view messages.
                    </p>
                    {totalUnreadCount > 0 && (
                      <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm">
                        {totalUnreadCount} unread message
                        {totalUnreadCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      <EmergencyAccessButton
        onEmergencyCall={handleEmergencyCall}
        onShareLocation={handleShareLocation}
        onContactSupport={handleContactSupport}
        isVisible={true}
      />
    </div>
  );
}
