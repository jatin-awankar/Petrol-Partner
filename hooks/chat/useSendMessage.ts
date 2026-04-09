"use client";

import { useState } from "react";
import { sendChatMessage } from "@/lib/api/backend";
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
      return await sendChatMessage(chatRoomId, content);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { sendMessage, loading, error };
}
