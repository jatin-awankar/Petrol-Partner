"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeProviderSession } from "@/lib/api/backend";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const values = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = values.get("access_token");
    const refreshToken = values.get("refresh_token");
    const type = values.get("type");
    if (!accessToken || !refreshToken) { setError("The authentication link is invalid or expired."); return; }
    void completeProviderSession({ accessToken, refreshToken })
      .then(() => router.replace(type === "recovery" ? "/recover/password" : "/dashboard"))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to complete authentication"));
  }, [router]);
  return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-semibold">Completing secure sign-in</h1><p className="mt-3 text-sm text-muted-foreground">{error ?? "Please wait…"}</p></main>;
}
