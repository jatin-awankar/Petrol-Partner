"use client";

import { useCallback, useEffect, useState } from "react";

import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { listChatRooms } from "@/lib/api/backend";
import { frontendConfig } from "@/lib/frontend-config";

const POLL_INTERVAL_MS = 30000;

export function useChatUnreadCount() {
  const { isAuthenticated } = useCurrentUser();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!frontendConfig.flags.enableChatUi || !isAuthenticated) {
      setUnreadCount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await listChatRooms({
        limit: 100,
        offset: 0,
      });
      const totalUnread = (result.rooms ?? []).reduce(
        (sum, room) => sum + Number(room.unread_count ?? 0),
        0,
      );
      setUnreadCount(totalUnread);
    } catch (err: any) {
      setError(err?.message ?? "Unable to load unread chats");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();

    if (!frontendConfig.flags.enableChatUi || !isAuthenticated) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isAuthenticated, refresh]);

  return {
    unreadCount,
    loading,
    error,
    refresh,
  };
}
