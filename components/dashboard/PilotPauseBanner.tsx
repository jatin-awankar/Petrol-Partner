"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api/client";

type Status = { recovery: { mode: string }; capabilities: { capability: string; paused: boolean }[] };

export default function PilotPauseBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    apiRequest<Status>("/v1/operator/pilot-status").then(setStatus).catch(() => setStatus({ recovery: { mode: "restricted" }, capabilities: [] }));
  }, []);
  if (!status || (status.recovery.mode === "open" && status.capabilities.every((item) => !item.paused))) return null;
  const paused = status.capabilities.filter((item) => item.paused).map((item) => item.capability);
  return <div role="status" className="rounded-xl border border-amber-500 bg-amber-50 p-4 text-amber-950">
    <strong>Pilot activity is paused.</strong> {status.recovery.mode !== "open" ? "Recovery is restricted." : `${paused.join(", ")} are paused.`} Existing information remains available.
  </div>;
}
