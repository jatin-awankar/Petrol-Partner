import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import ApplicationFrame from "./providers/ApplicationFrame";

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
        <ApplicationFrame>{children}</ApplicationFrame>
      </body>
    </html>
  );
}
