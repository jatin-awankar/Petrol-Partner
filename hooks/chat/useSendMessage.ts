"use client";

import { useState } from "react";
import { frontendConfig } from "@/lib/frontend-config";

export function useSendMessage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (chatRoomId: string, content: string) => {
    if (!frontendConfig.flags.enableChatUi) {
      setError("Chat is disabled.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for NextAuth session
        body: JSON.stringify({ chat_room_id: chatRoomId, content }),
      });

      if (!res.ok) throw new Error("Failed to send message");
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { sendMessage, loading, error };
}
