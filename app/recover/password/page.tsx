"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateRecoveredPassword } from "@/lib/api/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RecoveryPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await updateRecoveredPassword(password); router.replace("/dashboard"); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-semibold">Choose a new password</h1><form className="mt-6 space-y-4" onSubmit={submit}><div><Label htmlFor="password">New password</Label><Input id="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div><Button disabled={busy} type="submit">{busy ? "Updating…" : "Update password"}</Button></form></main>;
}
