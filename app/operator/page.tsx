"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

type Capability = "offers" | "requests" | "acceptance" | "booking";
type PilotStatus = { recovery: { mode: string; cause: string | null; started_at: string | null; reconciled_at: string | null }; capabilities: { capability: Capability; paused: boolean; pending: boolean }[] };
type Pending = { id: string; capability: Capability; paused: boolean; state: string };

export default function OperatorPage() {
  const { user, loading } = useCurrentUser();
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    const operations = await apiRequest<{ operations: Pending[] }>("/v1/operator/pending");
    setAuthorized(true);
    const next = await apiRequest<PilotStatus>("/v1/operator/pilot-status");
    setStatus(next);
    setPending(operations.operations);
  }, []);
  useEffect(() => {
    if (user) void refresh().catch((error) => {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setAuthorized(false);
      setMessage(error instanceof Error ? error.message : "Unable to load operator status");
    });
  }, [user, refresh]);
  async function decide(capability: Capability, paused: boolean) {
    if (reason.trim().length < 8) { setMessage("Enter a reason of at least eight characters."); return; }
    setBusy(true);
    const key = crypto.randomUUID();
    try {
      const result = await apiRequest<{ id: string }>("/v1/operator/pause", {
        method: "POST", headers: { "Idempotency-Key": key },
        body: JSON.stringify({ capability, paused, reason: reason.trim() }),
      });
      setMessage(`Decision ${result.id} recorded.`);
      await refresh();
    } catch (error) {
      const operationId = error instanceof ApiError && typeof error.details === "object" && error.details !== null && "operationId" in error.details ? String(error.details.operationId) : null;
      let reference = operationId ?? key;
      try {
        const lookup = await apiRequest<{ id: string }>(`/v1/operator/operations/by-key/${encodeURIComponent(key)}`);
        reference = lookup.id;
      } catch { /* The key remains the lookup reference after a lost response. */ }
      setMessage(`Decision outcome uncertain. Reference ${reference}. Check status before retrying. ${error instanceof Error ? error.message : ""}`);
      await refresh();
    } finally { setBusy(false); }
  }
  async function recovery(action: "reconcile" | "reopen") {
    setBusy(true);
    try {
      await apiRequest(`/v1/operator/${action}`, { method: "POST", headers: action === "reopen" ? { "Idempotency-Key": crypto.randomUUID() } : undefined, body: JSON.stringify({ reason: reason.trim() }) });
      setMessage(`${action} recorded.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Recovery action failed"); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="p-8">Checking operator access…</main>;
  if (!user) return <main className="p-8">Sign in to access the operator console. <Link href="/login">Sign in</Link></main>;
  if (authorized === false) return <main className="p-8">Operator access requires current allowlist membership and MFA. {message}</main>;
  return <main className="mx-auto max-w-3xl space-y-6 p-8">
    <h1 className="text-2xl font-semibold">Pilot operator console</h1>
    <p>All decisions require current operator access and MFA. A pending decision keeps protected activity paused.</p>
    <p role="status">{message}</p>
    <section className="rounded border p-4"><h2 className="font-semibold">Recovery mode: {status?.recovery.mode ?? "loading"}</h2>
      {status?.recovery.cause && <p>Cause: {status.recovery.cause}</p>}
      {status?.recovery.started_at && <p>Since: {new Date(status.recovery.started_at).toLocaleString()}</p>}
      <div className="mt-3 flex gap-3"><button disabled={busy} onClick={() => recovery("reconcile")}>Reconcile receipts</button>
      <button disabled={busy || !status?.recovery.reconciled_at || reason.trim().length < 8} onClick={() => recovery("reopen")}>Manually reopen</button></div>
    </section>
    <label className="block">Decision reason<input className="mt-1 block w-full rounded border p-2" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
    <section className="space-y-3"><h2 className="font-semibold">Pause controls</h2>{status?.capabilities.map((item) => <div key={item.capability} className="flex items-center justify-between rounded border p-3"><span>{item.capability}: {item.paused ? "paused" : "open"}{item.pending ? " (pending)" : ""}</span><div className="flex gap-3"><button disabled={busy || reason.trim().length < 8} onClick={() => decide(item.capability, true)}>Pause</button><button disabled={busy || reason.trim().length < 8} onClick={() => decide(item.capability, false)}>Resume</button></div></div>)}</section>
    <section><h2 className="font-semibold">Uncertain decisions</h2>{pending.length ? pending.map((item) => <p key={item.id}>{item.id} · {item.capability} · {item.state}</p>) : <p>None recorded.</p>}</section>
  </main>;
}
