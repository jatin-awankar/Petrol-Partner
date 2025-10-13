import React from "react";
// import VerificationBadge from '../../../components/ui/VerificationBadge';
// import NotificationBadge from '../../../components/ui/NotificationBadge';
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import AppImage from "../AppImage";
import Icon from "../AppIcon";

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
}

interface ConversationCardProps {
  conversation?: Conversation;
  onClick: () => void;
  isLoading?: boolean;
}

const ConversationCard: React.FC<ConversationCardProps> = ({
  conversation,
  onClick,
  isLoading = false,
}) => {
  const formatTime = (timestamp: string | number | Date) => {
    if (!timestamp) return "";
    const now = new Date().getTime();
    const messageTime = new Date(timestamp).getTime();
    const diffInHours = (now - messageTime) / (1000 * 60 * 60);
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor((now - messageTime) / (1000 * 60));
      return diffInMinutes < 1 ? "now" : `${diffInMinutes}m`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h`;
    } else {
      return new Date(messageTime).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "confirmed":
        return "text-success";
      case "pending":
        return "text-warning";
      case "completed":
        return "text-muted-foreground";
      case "cancelled":
        return "text-error";
      default:
        return "text-muted-foreground";
    }
  };

  const truncateMessage = (message?: string, maxLength = 50) => {
    if (!message) return "";
    return message.length <= maxLength
      ? message
      : `${message.substring(0, maxLength)}...`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-3 p-4 border-b border-border animate-pulse">
        <Skeleton circle width={48} height={48} />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={12} />
          <Skeleton width="80%" height={12} />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={conversation ? onClick : undefined}
      className="flex items-center space-x-3 p-4 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border last:border-b-0 "
      role="button"
      tabIndex={0}
      aria-label={`Conversation with ${conversation?.name || "Unknown User"}`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-muted">
          <AppImage
            src={conversation?.avatar || "/default-avatar.png"}
            alt={conversation?.name || "User"}
            className="w-full h-full object-cover"
          />
        </div>
        {conversation?.isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-success border-2 border-card rounded-full" />
        )}
        <div className="absolute -top-1 -right-1">
          {/* <VerificationBadge
            isVerified={conversation?.isVerified}
            verificationType={conversation?.verificationType}
            size="sm"
          /> */}
        </div>
      </div>

      {/* Conversation Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-2">
            <h3 className="font-medium text-foreground truncate">
              {conversation?.name || "Unknown User"}
            </h3>
            <span
              className={`text-xs font-medium ${getStatusColor(
                conversation?.rideStatus
              )}`}
            >
              {conversation?.rideStatus || "N/A"}
            </span>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground">
              {conversation?.lastMessageTime
                ? formatTime(conversation.lastMessageTime)
                : ""}
            </span>
            {/* {conversation?.unreadCount ? (
              <NotificationBadge count={conversation.unreadCount} size="sm" />
            ) : null} */}
          </div>
        </div>

        {/* Last Message */}
        <p
          className={`text-sm mb-2 ${
            conversation?.unreadCount
              ? "text-foreground font-medium"
              : "text-muted-foreground"
          }`}
        >
          {conversation?.lastMessage?.type === "text" ? (
            truncateMessage(conversation?.lastMessage?.content)
          ) : conversation?.lastMessage?.type === "location" ? (
            <span className="flex items-center space-x-1">
              <Icon name="MapPin" size={12} />
              <span>Shared location</span>
            </span>
          ) : conversation?.lastMessage?.type === "image" ? (
            <span className="flex items-center space-x-1">
              <Icon name="Image" size={12} />
              <span>Photo</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-muted-foreground italic">
              <Icon name="HelpCircle" size={12} />
              <span>Unsupported message</span>
            </span>
          )}
        </p>

        {/* Ride Context */}
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          <span className="flex items-center space-x-1">
            <Icon name="Calendar" size={10} />
            <span>{conversation?.rideDate || "N/A"}</span>
          </span>
          <span className="flex items-center space-x-1">
            <Icon name="MapPin" size={10} />
            <span>{conversation?.route || "Unknown route"}</span>
          </span>
        </div>
      </div>

      {/* Last Message Status */}
      {conversation?.lastMessage?.senderId === "currentUser" && (
        <div className="flex-shrink-0">
          {conversation.lastMessage.status === "sent" && (
            <Icon name="Check" size={14} className="text-muted-foreground" />
          )}
          {conversation.lastMessage.status === "delivered" && (
            <Icon
              name="CheckCheck"
              size={14}
              className="text-muted-foreground"
            />
          )}
          {conversation.lastMessage.status === "read" && (
            <Icon name="CheckCheck" size={14} className="text-primary" />
          )}
        </div>
      )}
    </div>
  );
};

export default ConversationCard;
