"use client";

import React from "react";
import Link from "next/link";

import { frontendConfig } from "@/lib/frontend-config";

const MessagesPage: React.FC = () => {
  if (frontendConfig.flags.enableChatUi) {
    return (
      <div className="page bg-background container p-4 space-y-6 max-w-7xl mx-auto w-full">
        Chat UI is enabled, but the realtime cutover page has not been migrated yet.
      </div>
    );
  }

  return (
    <div className="page bg-background container p-4 max-w-3xl mx-auto">
      <div className="border border-border rounded-2xl p-8 bg-card text-center space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">
          Messages are temporarily unavailable
        </h1>
        <p className="text-muted-foreground">
          Chat and live tracking stay disabled during the backend cutover until the new realtime
          service is ready.
        </p>
        <Link href="/dashboard" className="text-primary hover:underline">
          Go back to dashboard
        </Link>
      </div>
    </div>
  );
};

export default MessagesPage;
