// app/layout.tsx
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
// import { Toaster } from "@/components/ui/sonner";
import React from "react";
import AuthenticatedNavbars from "@/components/AuthenticatedNavbars";
import ClientProviders from "./providers/ClientProviders";
import { Analytics } from '@vercel/analytics/next';

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Ride Partner",
  description: "College-centric ride sharing platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} font-sans antialiased`}
    >
      <body>
        <ClientProviders>
          <AuthenticatedNavbars />
          {children}
          <Analytics />
        </ClientProviders>
      </body>
    </html>
  );
}
