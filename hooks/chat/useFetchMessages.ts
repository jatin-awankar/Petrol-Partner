"use client";

import { useState, useEffect, useCallback } from "react";
import { listChatMessages } from "@/lib/api/backend";
import { frontendConfig } from "@/lib/frontend-config";

export function useFetchMessages(chatRoomId: string | null) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(
    async () => {
      if (!chatRoomId) {
        setMessages([]);
        setLoading(false);
        setError(null);
        return;
      }
      if (!frontendConfig.flags.enableChatUi) {
        setMessages([]);
        setLoading(false);
        setError("Chat is disabled.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await listChatMessages(chatRoomId, {
          limit: 100,
        });
        setMessages(data.messages || []);
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
