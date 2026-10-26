"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import ParticipantShell from "@/components/ParticipantShell";
import OperatorShell from "@/components/OperatorShell";
import ClientProviders from "./ClientProviders";

function isDemoPath(path: string) {
  return path === "/demo" || path.startsWith("/demo/");
}

// Analytics scripts can outlive their React component after client navigation.
export function withoutDemoAnalytics(event: { type: "pageview" | "event"; url: string }) {
  try { return isDemoPath(new URL(event.url, "https://local.invalid").pathname) ? null : event; }
  catch { return null; }
}

export default function ApplicationFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const content = <main id="main-content" className="min-h-screen" tabIndex={-1}>{children}</main>;
  // The demo must never mount real auth effects, participant chrome or telemetry.
  // Match a path segment, not prefixes such as /demonstration.
  if (isDemoPath(pathname)) return content;
  return <ClientProviders>
    <ParticipantShell />
    <OperatorShell />
    {content}
    <Analytics beforeSend={withoutDemoAnalytics} />
  </ClientProviders>;
}
