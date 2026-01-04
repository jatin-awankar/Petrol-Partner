"use client";

import { useState, useEffect, useCallback } from "react";

export function useFetchMessages(chatRoomId: string | null) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(
    async () => {
      if (!chatRoomId) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/messages/${chatRoomId}`, {
          credentials: "include", // Include cookies for NextAuth session
        });
        if (!res.ok) throw new Error("Failed to fetch messages");
        const data = await res.json();
        setMessages(data.messages || data);
      } catch (err: any) {
        setError(err?.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [chatRoomId] // add chatRoomId as dependency for useCallback
  );

  useEffect(() => {
    fetchMessages();
  }, [chatRoomId, fetchMessages]);

  return { messages, loading, error, refetch: fetchMessages };
}
