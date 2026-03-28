"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type BackendNotification,
} from "@/lib/api/backend";

export function useInAppNotifications(enabled: boolean) {
  const [items, setItems] = useState<BackendNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await listNotifications({ limit: 20, offset: 0 });
      setItems(Array.isArray(response.notifications) ? response.notifications : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const unreadCount = useMemo(
    () => items.filter((item) => item.status !== "read").length,
    [items],
  );

  const markOneRead = useCallback(async (notificationId: string) => {
    await markNotificationRead(notificationId);
    setItems((prev) =>
      prev.map((item) =>
        item.id === notificationId ? { ...item, status: "read", read_at: new Date().toISOString() } : item,
      ),
    );
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => ({ ...item, status: "read", read_at: item.read_at ?? now })),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  return {
    items,
    unreadCount,
    loading,
    error,
    refresh,
    markOneRead,
    markAllRead,
  };
}

