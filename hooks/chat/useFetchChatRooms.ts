"use client";

import { useState, useEffect } from "react";
import { frontendConfig } from "@/lib/frontend-config";

export function useFetchChatRooms() {
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChatRooms = async () => {
    if (!frontendConfig.flags.enableChatUi) {
      setChatRooms([]);
      setLoading(false);
      setError("Chat is disabled.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/chat", {
        credentials: "include", // Include cookies for NextAuth session
      });
      if (!res.ok) throw new Error("Failed to fetch chat rooms");
      const data = await res.json();
      setChatRooms(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChatRooms();
  }, []);

  return { chatRooms, loading, error, refetch: fetchChatRooms };
}
