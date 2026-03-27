// app/providers/ClientProviders.tsx
"use client";

import { ThemeProvider } from "../provider";
import { Toaster } from "@/components/ui/sonner";
import React from "react";
import { AuthProvider } from "./AuthProvider";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ThemeProvider>
        {children}
        <Toaster richColors={true} />
      </ThemeProvider>
    </AuthProvider>
  );
}
