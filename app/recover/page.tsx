"use client";

import { useState } from "react";
import Link from "next/link";
import { requestAccountRecovery } from "@/lib/api/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await requestAccountRecovery(email); setSent(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Recovery is unavailable. Try again."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md space-y-5 px-4 py-10 sm:px-8"><h1 className="text-3xl font-semibold">Recover account access</h1>
    <p className="text-sm text-muted-foreground">Recovering access preserves your account identity. It does not change ride eligibility or open bookings.</p>
    {sent ? <div role="status" className="rounded-xl border p-4"><h2 className="font-semibold">Check your email</h2><p className="mt-2 text-sm">If that address belongs to an account, a recovery link has been sent.</p><Button variant="outline" className="mt-4 min-h-11" onClick={() => setSent(false)}>Send another link</Button></div> : <form className="space-y-4" onSubmit={submit}>
      {error && <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">{error}</p>}
      <div className="space-y-2"><Label htmlFor="recovery-email">Email address</Label><Input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></div>
      <Button className="min-h-11" disabled={busy} type="submit">{busy ? "Sending…" : "Send recovery link"}</Button>
    </form>}<Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href="/login">Back to sign in</Link></main>;
}
