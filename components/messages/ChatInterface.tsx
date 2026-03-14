"use client";

import React, { useState, useRef, useEffect } from "react";
import { Message, Conversation } from "./MessagesShell";
import AppImage from "../AppImage";
import Icon from "../AppIcon";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import VerificationBadge from "../ui/VerificationBadge";

interface ChatInterfaceProps {
  conversation: Conversation;
  messages: Message[];
  onBack: () => void;
  onReport: () => void;
  onBlock: () => void;
  onSendMessage: (msg: Message) => void;
  isLoading?: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  conversation,
  messages,
  onBack,
  onReport,
  onBlock,
  onSendMessage,
  isLoading = false,
}) => {
  const [message, setMessage] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickReplies = [
    "I'm running 5 minutes late",
    "Arrived at pickup point",
    "On my way!",
    "Thanks for the ride!",
    "See you soon",
    "Traffic is heavy, might be delayed",
  ];

  const emojis = ["👍", "👎", "😊", "😢", "❤️", "🚗", "⏰", "📍", "✅", "❌"];

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (showEmojiPicker) setShowQuickReplies(false);
    if (showQuickReplies) setShowEmojiPicker(false);
  }, [showEmojiPicker, showQuickReplies]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-chat-menu]")) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef?.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = () => {
    if (!message.trim()) return;
    const newMsg: Message = {
      id: `msg_${Date.now()}`,
      senderId: "currentUser",
      content: message.trim(),
      timestamp: new Date().toISOString(),
      status: "sent",
      type: "text",
    };
    onSendMessage(newMsg);
    setMessage("");
    setShowQuickReplies(false);
    setShowEmojiPicker(false);
  };

  const handleQuickReply = (reply: string) => {
    setMessage(reply);
    setShowQuickReplies(false);
    inputRef?.current?.focus();
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef?.current?.focus();
  };

  const handleShareLocation = () => {
    console.log("Sharing location...");
  };

  const formatMessageTime = (timestamp?: string) => {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const renderMessage = (msg: Message) => {
    const isCurrentUser = msg.senderId === "currentUser";
    return (
      <div
        key={msg.id}
        className={`flex ${
          isCurrentUser ? "justify-end" : "justify-start"
        }`}
      >
        {!isCurrentUser && (
          <div className="w-8 h-8 rounded-full overflow-hidden mr-2 flex-shrink-0">
            <AppImage
              src={conversation.avatar ?? ""}
              alt={conversation.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className={`max-w-[70%] ${isCurrentUser ? "order-1" : "order-2"}`}>
          <div
            className={`px-4 py-2 rounded-2xl ${
              isCurrentUser
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-muted text-foreground rounded-bl-md"
            }`}
          >
            <p className="text-sm whitespace-pre-line">{msg.content}</p>
          </div>

          <div
            className={`flex items-center mt-1 space-x-1 ${
              isCurrentUser ? "justify-end" : "justify-start"
            }`}
          >
            <span className="text-xs text-muted-foreground">
              {formatMessageTime(msg.timestamp)}
            </span>
            {isCurrentUser && (
              <div className="flex items-center">
                {msg.status === "sent" && (
                  <Icon
                    name="Check"
                    size={12}
                    className="text-muted-foreground"
                  />
                )}
                {msg.status === "delivered" && (
                  <Icon
                    name="CheckCheck"
                    size={12}
                    className="text-muted-foreground"
                  />
                )}
                {msg.status === "read" && (
                  <Icon name="CheckCheck" size={12} className="text-primary" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between p-4 border-b border-border bg-card sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="md:hidden"
          >
            <Icon name="ArrowLeft" size={20} />
          </Button>
          <div className="relative">
            <div className="w-10 h-10 rounded-full overflow-hidden">
              <AppImage
                src={conversation.avatar ?? ""}
                alt={conversation.name}
                className="w-full h-full object-cover"
              />
            </div>
            {conversation.isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success border-2 border-card rounded-full"></div>
            )}
            <div className="absolute -top-1 -right-1">
              <VerificationBadge
                isVerified={conversation.isVerified}
                verificationType={
                  conversation.verificationType === "college" ||
                  conversation.verificationType === "identity" ||
                  conversation.verificationType === "driver"
                    ? conversation.verificationType
                    : undefined
                }
                size={16}
                showTooltip={true}
              />
            </div>
          </div>
          <div>
            <h3 className="font-medium text-foreground">{conversation.name}</h3>
            <p className="text-xs text-muted-foreground">
              {conversation.isOnline
                ? "Online"
                : `Last seen ${formatMessageTime(conversation.lastSeen)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2" data-chat-menu>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => console.log("Voice call")}
          >
            <Icon name="Phone" size={18} />
          </Button>

          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMenu((prev) => !prev)}
            >
              <Icon name="MoreVertical" size={18} />
            </Button>

            {showMenu && (
              <div className="absolute right-0 top-12 w-48 bg-popover border border-border rounded-lg shadow-medium z-50">
                <div className="py-2">
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted flex items-center space-x-2"
                    onClick={() => {
                      onReport();
                      setShowMenu(false);
                    }}
                  >
                    <Icon name="Flag" size={16} />
                    <span>Report User</span>
                  </button>
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-error hover:bg-muted flex items-center space-x-2"
                    onClick={() => {
                      onBlock();
                      setShowMenu(false);
                    }}
                  >
                    <Icon name="UserX" size={16} />
                    <span>Block User</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-b border-border p-3">
        <div className="flex flex-wrap items-center justify-between text-sm gap-2">
          <div className="flex items-center gap-4 text-muted-foreground">
            <span className="flex items-center space-x-1">
              <Icon name="Calendar" size={14} />
              <span>{conversation.rideDate}</span>
            </span>
            <span className="flex items-center space-x-1">
              <Icon name="MapPin" size={14} />
              <span>{conversation.route}</span>
            </span>
          </div>
          <span
            className={`font-medium capitalize ${
              conversation.rideStatus === "confirmed"
                ? "text-success"
                : conversation.rideStatus === "completed"
                ? "text-muted-foreground"
                : "text-warning"
            }`}
          >
            {conversation.rideStatus}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[53vh] max-h-[53vh] md:min-h-[56vh] md:max-h-[56vh]">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading messages...</div>
        ) : (
          messages.map(renderMessage)
        )}
        {isTyping && (
          <div className="flex justify-start mb-4">
            <div className="w-8 h-8 rounded-full overflow-hidden mr-2 flex-shrink-0">
              <AppImage
                src={conversation.avatar ?? ""}
                alt={conversation.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="bg-muted text-foreground px-4 py-2 rounded-2xl rounded-bl-md">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {showQuickReplies && (
        <div className="border-t border-border p-3 bg-muted/30">
          <div className="flex flex-wrap gap-2">
            {quickReplies.map((reply, index) => (
              <button
                key={index}
                onClick={() => handleQuickReply(reply)}
                className="px-3 py-1.5 bg-card border border-border rounded-full text-sm text-foreground hover:bg-muted transition-colors"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
      )}

      {showEmojiPicker && (
        <div className="border-t border-border p-3 bg-muted/30">
          <div className="flex flex-wrap gap-2">
            {emojis.map((emoji, index) => (
              <button
                key={index}
                onClick={() => handleEmojiSelect(emoji)}
                className="w-10 h-10 flex items-center justify-center text-lg hover:bg-muted rounded-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border p-4 bg-card sticky bottom-0">
        <div className="flex items-end space-x-2">
          <div className="flex space-x-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              className="text-muted-foreground"
            >
              <Icon name="Smile" size={20} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleShareLocation}
              className="text-muted-foreground"
            >
              <Icon name="MapPin" size={20} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowQuickReplies((prev) => !prev)}
              className="text-muted-foreground"
            >
              <Icon name="Zap" size={20} />
            </Button>
          </div>

          <div className="flex-1">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="border-0 bg-muted focus:bg-background"
            />
          </div>

          <Button
            variant={message.trim() ? "default" : "ghost"}
            size="icon"
            onClick={handleSendMessage}
            disabled={!message.trim()}
          >
            <Icon name="Send" size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
