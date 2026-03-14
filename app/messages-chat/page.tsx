"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import MessagesShell from "@/components/messages/MessagesShell";
import SafetyReminder from "@/components/messages/SafetyReminder";

const MessagesPage: React.FC = () => {
  const { status } = useSession();
  const [showSafetyReminder, setShowSafetyReminder] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card rounded-lg p-6 shadow-card text-center">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") return null;

  return (
    <div className="page bg-background container p-4 space-y-6 max-w-7xl mx-auto w-full">
      {showSafetyReminder && (
        <SafetyReminder onDismiss={() => setShowSafetyReminder(false)} />
      )}
      <MessagesShell />
    </div>
  );
};

export default MessagesPage;
