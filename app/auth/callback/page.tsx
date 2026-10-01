"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  return <main className="mx-auto max-w-md space-y-4 px-4 py-10 sm:px-8"><h1 className="text-3xl font-semibold">Completing sign-in</h1>{error ? <div role="alert" className="rounded-xl border p-4"><p>{error}</p><Link href="/login" className="mt-3 inline-flex min-h-11 items-center underline">Return to sign in</Link><Link href="/recover" className="ml-4 inline-flex min-h-11 items-center underline">Recover access</Link></div> : <p role="status" className="text-sm text-muted-foreground">Checking your link and account identity…</p>}<p className="text-sm text-muted-foreground">A successful sign-in opens account readiness. It does not grant ride eligibility or activate bookings.</p></main>;
}
