"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateRecoveredPassword } from "@/lib/api/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RecoveryPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await updateRecoveredPassword(password); router.replace("/dashboard"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update password. Try again."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md space-y-5 px-4 py-10 sm:px-8"><h1 className="text-3xl font-semibold">Choose a new password</h1>
    <p className="text-sm text-muted-foreground">This restores account access. Your declarations and any restrictions are reviewed separately on Home.</p>
    <form className="space-y-4" onSubmit={submit}>{error && <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">{error}</p>}
      <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} /></div>
      <Button className="min-h-11" disabled={busy} type="submit">{busy ? "Updating…" : "Update password"}</Button></form>
    <Link href="/recover" className="inline-flex min-h-11 items-center underline">Request a new recovery link</Link></main>;
}
