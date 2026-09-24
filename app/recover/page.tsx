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
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await requestAccountRecovery(email); setSent(true); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-semibold">Recover account access</h1>{sent ? <p className="mt-4 text-sm">If that address belongs to an account, a recovery link has been sent. The link preserves your existing Petrol Partner identity.</p> : <form className="mt-6 space-y-4" onSubmit={submit}><div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div><Button disabled={busy} type="submit">{busy ? "Sending…" : "Send recovery link"}</Button></form>}<Link className="mt-6 block text-sm text-primary hover:underline" href="/login">Back to sign in</Link></main>;
}
