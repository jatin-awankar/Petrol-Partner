import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import ParticipantShell from "@/components/ParticipantShell";
import OperatorShell from "@/components/OperatorShell";
import ClientProviders from "./providers/ClientProviders";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Petrol Partner",
  description: "Driver-posted route sharing, preparing for launch.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <ClientProviders>
          <ParticipantShell />
          <OperatorShell />
          <main id="main-content" className="min-h-screen" tabIndex={-1}>{children}</main>
          <Analytics />
        </ClientProviders>
      </body>
    </html>
  );
}
