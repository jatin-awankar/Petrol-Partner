"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import Icon from "./AppIcon";
import { Button } from "./ui/button";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { useChatUnreadCount } from "@/hooks/chat/useChatUnreadCount";
import { frontendConfig } from "@/lib/frontend-config";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import NotificationBadge from "./ui/NotificationBadge";
import { useInAppNotifications } from "@/hooks/notifications/useInAppNotifications";
import Image from "next/image";

function formatRelativeTime(value: string | null) {
  if (!value) return "Just now";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const { logout, user } = useCurrentUser();
  const {
    items: notifications,
    unreadCount: notificationUnreadCount,
    loading: notificationsLoading,
    error: notificationsError,
    refresh: refreshNotifications,
    markOneRead,
    markAllRead,
  } = useInAppNotifications(Boolean(user));
  const { unreadCount: chatUnreadCount } = useChatUnreadCount();

  const navigationItems = [
    { label: "Home", path: "/dashboard", icon: "Home" },
    { label: "Search", path: "/search-rides", icon: "Search" },
    { label: "Post", path: "/post-a-ride", icon: "Plus" },
    { label: "Payments", path: "/payments", icon: "CreditCard" },
    { label: "Messages", path: "/messages-chat", icon: "MessageCircle" },
  ];

  const isActive = (path: string) => pathname === path;

  const getPageText = () => {
    switch (pathname) {
      case "/dashboard":
        return "Dashboard";
      case "/search-rides":
        return "Find Rides";
      case "/post-a-ride":
        return "Post Ride";
      case "/messages-chat":
        return "Messages";
      case "/profile-settings":
        return "Profile";
      case "/payments":
        return "Payments";
      default:
        return "Petrol Partner";
    }
  };

  const userInitial = user?.full_name?.trim()?.[0]?.toUpperCase() ?? "U";

  const handleLogout = async () => {
    try {
      setIsMenuOpen(false);
      await logout();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <header className="sticky top-0 left-0 right-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8">
        <div
          className="flex cursor-pointer items-center gap-3 select-none"
          onClick={() => router.push("/dashboard")}
        >
          <Image src="/icons/logo.png" alt="logo" width={36} height={36} />
          <div className="hidden sm:flex sm:flex-col sm:leading-tight">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Petrol Partner
            </span>
            <span className="text-xs text-muted-foreground">
              {getPageText()}
            </span>
          </div>
        </div>

        <nav className="hidden items-center gap-1 rounded-full border border-border/60 bg-card/70 p-1 shadow-sm md:flex">
          {navigationItems.map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all",
                isActive(item.path)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Icon
                name={item.icon}
                size={16}
                strokeWidth={isActive(item.path) ? 2.5 : 2}
              />
              <span>{item.label}</span>
              {item.path === "/messages-chat" ? (
                <NotificationBadge count={chatUnreadCount} size="sm" />
              ) : null}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Popover
            open={isNotificationOpen}
            onOpenChange={(open) => {
              setIsNotificationOpen(open);
              if (open) {
                void refreshNotifications();
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 rounded-full border border-border/70 bg-card/70 hover:bg-muted/70"
                aria-label="Notifications"
              >
                <Icon name="Bell" size={18} />
                <NotificationBadge
                  count={notificationUnreadCount}
                  size="sm"
                  className="absolute -right-1 -top-1"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px] p-0">
              <div className="border-b border-border/70 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">
                    Notifications
                  </h4>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => void refreshNotifications()}
                    >
                      Refresh
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => void markAllRead()}
                      disabled={notificationUnreadCount === 0}
                    >
                      Mark all read
                    </Button>
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {notificationUnreadCount > 0
                    ? `${notificationUnreadCount} unread updates`
                    : "You are all caught up"}
                </p>
              </div>

              <ScrollArea className="h-[360px]">
                <div className="space-y-1 p-2">
                  {notificationsLoading ? (
                    <div className="rounded-lg p-3 text-sm text-muted-foreground">
                      Loading notifications...
                    </div>
                  ) : notificationsError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      {notificationsError}
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="rounded-lg p-5 text-center">
                      <p className="text-sm font-medium text-foreground">
                        No notifications yet
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ride matches and payment updates will appear here.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const unread = notification.status !== "read";
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => {
                            if (unread) {
                              void markOneRead(notification.id);
                            }
                          }}
                          className={cn(
                            "w-full rounded-lg border p-3 text-left transition-colors",
                            unread
                              ? "border-primary/20 bg-primary/5 hover:bg-primary/10"
                              : "border-border/60 bg-background hover:bg-muted/50",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-1 text-sm font-semibold text-foreground">
                              {notification.title}
                            </p>
                            {unread ? (
                              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {notification.body}
                          </p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {formatRelativeTime(
                              notification.sent_at ?? notification.created_at,
                            )}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="h-9 gap-2 rounded-full border-border/70 bg-card/80 px-2.5 hover:bg-muted/80"
              aria-label="Profile menu"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {userInitial}
              </span>
              <Icon
                name="ChevronDown"
                size={14}
                className="text-muted-foreground"
              />
            </Button>

            {isMenuOpen && (
              <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-border/80 bg-popover/95 p-2 shadow-lg backdrop-blur-xl">
                <div className="px-2 py-2">
                  <p className="truncate text-sm font-medium text-popover-foreground">
                    {user?.full_name ?? "Account"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user?.email ?? "Signed in"}
                  </p>
                </div>
                <div className="my-1 h-px bg-border" />
                <div className="space-y-1">
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground hover:bg-muted"
                    onClick={() => {
                      setIsMenuOpen(false);
                      router.push("/profile-settings");
                    }}
                  >
                    <Icon name="Settings" size={16} />
                    <span>Settings</span>
                  </button>

                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-error hover:bg-muted"
                    onClick={handleLogout}
                  >
                    <Icon name="LogOut" size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </header>
  );
};

export default Navbar;
