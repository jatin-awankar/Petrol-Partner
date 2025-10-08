// app/layout.tsx
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
// import { Providers } from "./provider";
import React from "react";
import AuthenticatedNavbars from "@/components/AuthenticatedNavbars";

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
    // <Providers>
      <html lang="en" className={`${poppins.variable} font-sans antialiased`}>
        <body>
          <AuthenticatedNavbars />
          {children}
          <Toaster />
        </body>
      </html>
    // </Providers>
  );
}
