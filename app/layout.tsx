import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import React from "react";
import AuthenticatedNavbars from "@/components/AuthenticatedNavbars";
import ClientProviders from "./providers/ClientProviders";
import { Analytics } from "@vercel/analytics/next";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: {
    default: "Petrol Partner",
    template: "%s | Petrol Partner",
  },
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
      <body className="app-body min-h-screen bg-background text-foreground">
        <ClientProviders>
          <AuthenticatedNavbars />
          <div className="app-content">
            <main role="main">{children}</main>
          </div>
          <Analytics />
        </ClientProviders>
      </body>
    </html>
  );
}
