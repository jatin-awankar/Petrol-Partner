"use client";

import React, { useEffect, useMemo, useState } from "react";
import RideStatusIndicator from "@/components/ui/RideStatusIndicator";
import EmergencyAccessButton from "@/components/ui/EmergencyAccessButton";
import ConversationList from "@/components/messages/ConversationList";
import ChatInterface from "@/components/messages/ChatInterface";
import Icon from "@/components/AppIcon";

/** Types */
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
};

/** Mock conversations (phase 1) */
const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "conv_1",
    name: "Sarah Johnson",
    avatar:
      "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
    verificationType: "college",
    isOnline: true,
    lastSeen: new Date(Date.now() - 300000).toISOString(),
    rideStatus: "confirmed",
    rideDate: "Today, 8:15 AM",
    route: "Main Gate → Downtown Campus",
    lastMessage: {
      id: "msg_1",
      senderId: "conv_1",
      content: "I'm on my way! Blue Honda Civic, license plate ABC-123",
      timestamp: new Date(Date.now() - 300000).toISOString(),
      status: "read",
      type: "text",
    },
    lastMessageTime: new Date(Date.now() - 300000).toISOString(),
    unreadCount: 2,
    isArchived: false,
  },
  {
    id: "conv_2",
    name: "Mike Chen",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
    verificationType: "driver",
    isOnline: false,
    lastSeen: new Date(Date.now() - 1800000).toISOString(),
    rideStatus: "pending",
    rideDate: "Tomorrow, 9:00 AM",
    route: "North Campus → Library",
    lastMessage: {
      id: "msg_2",
      senderId: "currentUser",
      content: "Sounds good! See you tomorrow",
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      status: "delivered",
      type: "text",
    },
    lastMessageTime: new Date(Date.now() - 1800000).toISOString(),
    unreadCount: 0,
    isArchived: false,
  },
  {
    id: "conv_3",
    name: "Mike Chen",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
    verificationType: "driver",
    isOnline: false,
    lastSeen: new Date(Date.now() - 1800000).toISOString(),
    rideStatus: "pending",
    rideDate: "Tomorrow, 9:00 AM",
    route: "North Campus → Library",
    lastMessage: {
      id: "msg_2",
      senderId: "currentUser",
      content: "Sounds good! See you tomorrow",
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      status: "delivered",
      type: "text",
    },
    lastMessageTime: new Date(Date.now() - 1800000).toISOString(),
    unreadCount: 0,
    isArchived: false,
  },
  {
    id: "conv_4",
    name: "Mike Chen",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
    verificationType: "driver",
    isOnline: false,
    lastSeen: new Date(Date.now() - 1800000).toISOString(),
    rideStatus: "pending",
    rideDate: "Tomorrow, 9:00 AM",
    route: "North Campus → Library",
    lastMessage: {
      id: "msg_2",
      senderId: "currentUser",
      content: "Sounds good! See you tomorrow",
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      status: "delivered",
      type: "text",
    },
    lastMessageTime: new Date(Date.now() - 1800000).toISOString(),
    unreadCount: 0,
    isArchived: false,
  },
  {
    id: "conv_5",
    name: "Mike Chen",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    isVerified: true,
    verificationType: "driver",
    isOnline: false,
    lastSeen: new Date(Date.now() - 1800000).toISOString(),
    rideStatus: "pending",
    rideDate: "Tomorrow, 9:00 AM",
    route: "North Campus → Library",
    lastMessage: {
      id: "msg_2",
      senderId: "currentUser",
      content: "Sounds good! See you tomorrow",
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      status: "delivered",
      type: "text",
    },
    lastMessageTime: new Date(Date.now() - 1800000).toISOString(),
    unreadCount: 0,
    isArchived: false,
  },
];

/** MessagesShell */
export default function MessagesShell() {
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null
  );
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [activeRideStatus, setActiveRideStatus] = useState<
    | "none"
    | "searching"
    | "matched"
    | "en-route"
    | "arrived"
    | "in-progress"
    | "completed"
  >("en-route");

  const [isLoading, setIsLoading] = useState(true);

  // messages stored per conversation
  const [messagesMap, setMessagesMap] = useState<{
    [conversationId: string]: Message[];
  }>({});

  // simulate data load
  useEffect(() => {
    const t = setTimeout(() => {
      setConversations(MOCK_CONVERSATIONS);

      // Initialize messagesMap with lastMessage for each conversation
      const initialMessages: { [id: string]: Message[] } = {};
      MOCK_CONVERSATIONS.forEach((conv) => {
        initialMessages[conv.id] = conv.lastMessage ? [conv.lastMessage] : [];
      });
      setMessagesMap(initialMessages);

      setIsLoading(false);
    }, 600);

    return () => clearTimeout(t);
  }, []);

  // unread messages count
  const totalUnreadCount = useMemo(() => {
    if (!conversations) return 0;
    return conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
  }, [conversations]);

  /** Handlers */
  const handleConversationSelect = (conv: Conversation) => {
    setSelectedConversation(conv);
  };
  const handleBackToList = () => setSelectedConversation(null);
  const handleReportUser = (conv?: Conversation) =>
    console.log("Report user", conv?.id);
  const handleBlockUser = (conv?: Conversation) =>
    console.log("Block user", conv?.id);
  const handleEmergencyCall = () => console.log("Emergency call initiated");
  const handleShareLocation = () => console.log("Share location requested");
  const handleContactSupport = () => console.log("Contacting support...");
  const handleViewRideDetails = () => console.log("Navigate to ride details");
  const handleEmergency = () => console.log("Emergency action triggered");

  /** Handle sending message from ChatInterface */
  const handleSendMessage = (msg: Message) => {
    if (!selectedConversation) return;
    setMessagesMap((prev) => ({
      ...prev,
      [selectedConversation.id]: [
        ...(prev[selectedConversation.id] || []),
        msg,
      ],
    }));
  };

  return (
    <div className="bg-background">
      {/* RideStatusIndicator */}
      {/* <RideStatusIndicator
        status={activeRideStatus}
        driverName="Sarah Johnson"
        estimatedTime="3 mins"
        onViewDetails={handleViewRideDetails}
        onEmergency={handleEmergency}
      /> */}

      {/* Main content */}
      <div className="mb-12 md:mb-0">
        <div className="shadow-md overflow-hidden rounded-md">
          <div className="max-w-7xl mx-auto">
            <div className="md:flex p-0 m-0">
              {/* Sidebar */}
              <aside
                className={`${
                  selectedConversation
                    ? "hidden md:flex md:w-1/3 lg:w-1/4"
                    : "flex w-full md:w-1/3 lg:w-1/4"
                } flex-col border-r border-border bg-card`}
              >
                <div className="flex">
                    <ConversationList
                      conversations={(conversations ?? []).map((conv) => ({
                        ...conv,
                        lastMessage: conv.lastMessage && {
                          ...conv.lastMessage,
                          type: conv.lastMessage.type ?? "",
                        },
                      }))}
                      onConversationSelect={(conversationId: string) => {
                        const conv = (conversations ?? []).find(
                          (c) => c.id === conversationId
                        );
                        if (conv) handleConversationSelect(conv);
                      }}
                      selectedConversationId={selectedConversation?.id || ""}
                    />
                </div>
              </aside>

              {/* Chat panel */}
              <section
                className={`${
                  selectedConversation
                    ? "flex w-full md:w-2/3 lg:w-3/4"
                    : "hidden md:flex md:w-2/3 lg:w-3/4"
                }  flex-col bg-card`}
              >
                {selectedConversation ? (
                  <ChatInterface
                    conversation={selectedConversation}
                    messages={messagesMap[selectedConversation.id] || []}
                    onBack={handleBackToList}
                    onReport={() => handleReportUser(selectedConversation)}
                    onBlock={() => handleBlockUser(selectedConversation)}
                    onSendMessage={handleSendMessage}
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
                      Select a conversation from the sidebar to view messages.
                      New messages will appear here.
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

      {/* Emergency access + bottom nav */}
      <EmergencyAccessButton
        onEmergencyCall={handleEmergencyCall}
        onShareLocation={handleShareLocation}
        onContactSupport={handleContactSupport}
        isVisible={true}
      />
    </div>
  );
}
