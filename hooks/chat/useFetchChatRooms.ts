"use client";

import { useCallback, useState, useEffect } from "react";
import { listChatRooms } from "@/lib/api/backend";
import { frontendConfig } from "@/lib/frontend-config";

export function useFetchChatRooms() {
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChatRooms = useCallback(async () => {
    if (!frontendConfig.flags.enableChatUi) {
      setChatRooms([]);
      setLoading(false);
      setError("Chat is disabled.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await listChatRooms({
        limit: 50,
        offset: 0,
      });
      setChatRooms(result.rooms ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchChatRooms();
  }, [fetchChatRooms]);

  return { chatRooms, loading, error, refetch: fetchChatRooms };
}
