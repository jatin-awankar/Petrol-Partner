// app/providers/ClientProviders.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "../provider";
import { AuthProvider } from "@/hooks/auth/useAuth";
import { Toaster } from "@/components/ui/sonner";
import React from "react";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AuthProvider>
        <ThemeProvider>
          {children}
          <Toaster richColors={true} />
        </ThemeProvider>
      </AuthProvider>
    </SessionProvider>
  );
}
