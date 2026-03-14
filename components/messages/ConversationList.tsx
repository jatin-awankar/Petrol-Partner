"use client";

import React, { useState, useEffect, useMemo } from "react";
import ConversationCard from "./ConversationCard";
import { Input } from "../ui/input";
import Icon from "../AppIcon";
import { Button } from "../ui/button";

interface LastMessage {
  type: "text" | "location" | "image" | string;
  content?: string;
  senderId?: string;
  status?: "sent" | "delivered" | "read";
}

interface Conversation {
  id: string;
  name?: string;
  avatar?: string;
  isVerified?: boolean;
  verificationType?: string;
  isOnline?: boolean;
  rideStatus?: string;
  lastMessageTime?: string | number | Date;
  lastMessage?: LastMessage;
  unreadCount?: number;
  rideDate?: string;
  route?: string;
  isArchived?: boolean;
}

interface ConversationListProps {
  conversations: Conversation[];
  onConversationSelect: (conversationId: string) => void;
  selectedConversationId: string;
  isLoading?: boolean;
  loadMoreConversations?: () => Promise<void>;
}

const PAGE_SIZE = 10;

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  onConversationSelect,
  selectedConversationId,
  isLoading = false,
  loadMoreConversations,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "completed" | "archived"
  >("all");
  const [page, setPage] = useState<number>(1);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterStatus]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      const matchesSearch =
        conversation?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conversation?.route?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter =
        filterStatus === "all" ||
        (filterStatus === "active" &&
          ["confirmed", "pending"].includes(conversation?.rideStatus ?? "")) ||
        (filterStatus === "completed" &&
          (conversation?.rideStatus ?? "") === "completed") ||
        (filterStatus === "archived" && conversation?.isArchived);

      return matchesSearch && matchesFilter;
    });
  }, [conversations, searchQuery, filterStatus]);

  const displayedConversations = useMemo(
    () => filteredConversations.slice(0, page * PAGE_SIZE),
    [filteredConversations, page]
  );

  useEffect(() => {
    const container = document.getElementById("conversation-scroll");
    if (!container) return;

    const handleScroll = () => {
      if (loadingMore) return;
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
        if (displayedConversations.length < filteredConversations.length) {
          setLoadingMore(true);
          setTimeout(() => {
            setPage((prev) => prev + 1);
            setLoadingMore(false);
          }, 300);
        } else if (loadMoreConversations) {
          setLoadingMore(true);
          loadMoreConversations().finally(() => setLoadingMore(false));
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [displayedConversations.length, filteredConversations.length, loadMoreConversations, loadingMore]);

  const getFilterCount = (status: "all" | "active" | "completed" | "archived") => {
    return conversations.filter((conv) => {
      switch (status) {
        case "active":
          return ["confirmed", "pending"].includes(conv.rideStatus ?? "");
        case "completed":
          return (conv.rideStatus ?? "") === "completed";
        case "archived":
          return conv?.isArchived;
        default:
          return true;
      }
    }).length;
  };

  const handleArchiveCompleted = () => {
    console.log("Archive all completed");
  };

  return (
    <div className="flex flex-col bg-card">
      <div className="p-4 border-b border-border sticky top-0 z-10 bg-card">
        <div className="relative mb-4">
          <Input
            type="search"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e?.target?.value)}
            className="pl-10"
          />
          <Icon
            name="Search"
            size={18}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 bg-muted rounded-lg p-1">
          {[
            { key: "all", label: "All", count: conversations.length },
            { key: "active", label: "Active", count: getFilterCount("active") },
            { key: "completed", label: "Done", count: getFilterCount("completed") },
            { key: "archived", label: "Archived", count: getFilterCount("archived") },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() =>
                setFilterStatus(filter.key as "all" | "active" | "completed" | "archived")
              }
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                filterStatus === filter.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {filter.label}
              {filter.count > 0 && (
                <span
                  className={`ml-1 text-xs ${
                    filterStatus === filter.key
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70"
                  }`}
                >
                  ({filter.count})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div
        id="conversation-scroll"
        className="flex-1 overflow-y-auto min-h-[47vh] max-h-[47vh] md:min-h-[50vh] md:max-h-[50vh]"
      >
        {isLoading ? (
          Array.from({ length: PAGE_SIZE }).map((_, idx) => (
            <ConversationCard key={idx} isLoading onClick={() => {}} />
          ))
        ) : displayedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Icon name="MessageCircle" size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery ? "No conversations found" : "No messages yet"}
            </h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              {searchQuery
                ? "Try adjusting your search terms or filters"
                : "Start a conversation when you book or offer a ride"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {displayedConversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                conversation={conversation}
                onClick={() => onConversationSelect(conversation.id)}
                isLoading={false}
                selected={selectedConversationId === conversation.id}
              />
            ))}
            {loadingMore &&
              Array.from({ length: 3 }).map((_, idx) => (
                <ConversationCard key={`loading-${idx}`} isLoading onClick={() => {}} />
              ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-muted/30 sticky bottom-0">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {displayedConversations.length} conversation
            {displayedConversations.length !== 1 ? "s" : ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleArchiveCompleted}
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon name="Archive" size={14} className="mr-1" />
            Archive completed
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConversationList;
