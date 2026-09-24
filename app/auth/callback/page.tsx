"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeProviderSession } from "@/lib/api/backend";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const values = new URLSearchParams(window.location.search);
    const code = values.get("code");
    const next = values.get("next");
    if (!code) { setError("The authentication link is invalid or expired."); return; }
    void completeProviderSession({ code })
      .then(() => router.replace(next === "recovery" ? "/recover/password" : "/dashboard"))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to complete authentication"));
  }, [router]);
  return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-semibold">Completing secure sign-in</h1><p className="mt-3 text-sm text-muted-foreground">{error ?? "Please wait…"}</p></main>;
}
