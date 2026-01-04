"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import MessagesShell from "@/components/messages/MessagesShell";
import SafetyReminder from "@/components/messages/SafetyReminder";

const MessagesPage: React.FC = () => {
  const { data: session, status } = useSession();
  const [showSafetyReminder, setShowSafetyReminder] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login"); // ✅ navigate to login page
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        Checking session...
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <div className="page bg-background container p-4 space-y-6 max-w-7xl mx-auto w-full">
        {showSafetyReminder && (
          <SafetyReminder onDismiss={() => setShowSafetyReminder(false)} />
        )}
        <MessagesShell />
      </div>
    );
  }

  return null; // nothing while redirecting
};

export default MessagesPage;
