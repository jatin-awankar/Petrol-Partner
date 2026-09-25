"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

type Capability = "offers" | "requests" | "acceptance" | "booking";
type PilotStatus = { recovery: { mode: string; cause: string | null; started_at: string | null; reconciled_at: string | null }; capabilities: { capability: Capability; paused: boolean; pending: boolean }[] };
type Pending = { id: string; capability: Capability; paused: boolean; reason: string; state: string };
type Delivery = { jobs: { id: string; operation_id: string; status: string; attempts: number; attempt_count: number; attempt_history: { attempt: number; started_at: string; finished_at: string | null; outcome: string | null }[]; due_at: string; updated_at: string; last_error: string | null }[]; health: { due: number; exhausted: number; expired_leases: number; stalled: number; oldest_open_at: string | null; last_attempt_at: string | null; last_worker_seen_at: string | null } };

export default function OperatorPage() {
  const { user, loading } = useCurrentUser();
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    const operations = await apiRequest<{ operations: Pending[] }>("/v1/operator/pending");
    setAuthorized(true);
    const next = await apiRequest<PilotStatus>("/v1/operator/status");
    setStatus(next);
    setPending(operations.operations);
    setDelivery(await apiRequest<Delivery>("/v1/operator/notifications/delivery"));
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
  async function resumePending(operationId: string) {
    if (reason.trim().length < 8) { setMessage("Enter a reason for assuming the pending decision."); return; }
    setBusy(true);
    try {
      await apiRequest(`/v1/operator/operations/${operationId}/resume`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      setMessage(`Pending decision ${operationId} completed. Reconcile before reopening activity.`);
    } catch (error) {
      await checkPendingStatus(operationId, error instanceof Error ? error.message : "Outcome uncertain");
    } finally { await refresh().catch(() => undefined); setBusy(false); }
  }
  async function checkPendingStatus(operationId: string, context = "") {
    try {
      const result = await apiRequest<{ state: string }>(`/v1/operator/pending/${operationId}`);
      setMessage(`${context ? `${context}. ` : ""}Decision ${operationId}: ${result.state}. Reconcile before reopening activity.`);
    } catch (error) { setMessage(`Unable to check ${operationId}: ${error instanceof Error ? error.message : "unknown error"}`); }
  }
  async function retryEmail(jobId: string, exhaustedAt: string) {
    setBusy(true);
    try {
      await apiRequest(`/v1/operator/notifications/email/${jobId}/retry`, { method: "POST", headers: { "Idempotency-Key": `email-retry:${jobId}:${exhaustedAt}` }, body: JSON.stringify({}) });
      setMessage(`Email job ${jobId} queued for retry.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to retry email"); }
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
    <section><h2 className="font-semibold">Uncertain decisions</h2>{pending.length ? pending.map((item) => <div key={item.id} className="rounded border p-3"><p>{item.id} · {item.capability} · {item.paused ? "pause" : "resume"} · {item.state}</p><p>Original reason: {item.reason}</p><div className="flex gap-3"><button disabled={busy || reason.trim().length < 8} onClick={() => resumePending(item.id)}>Complete pending decision</button><button disabled={busy} onClick={() => checkPendingStatus(item.id)}>Check status</button></div></div>) : <p>None recorded.</p>}</section>
    <section className="space-y-3"><h2 className="font-semibold">Notification delivery</h2>
      <p>Due: {delivery?.health.due ?? "—"} · Stalled over five minutes: {delivery?.health.stalled ?? "—"} · Expired leases: {delivery?.health.expired_leases ?? "—"} · Exhausted: {delivery?.health.exhausted ?? "—"}</p>
      <p>Worker last seen: {delivery?.health.last_worker_seen_at ? new Date(delivery.health.last_worker_seen_at).toLocaleString() : "No heartbeat"}</p>
      {delivery?.jobs.map((job) => <div key={job.id} className="rounded border p-3"><p>Operation {job.operation_id} · {job.status} · {job.attempt_count} delivery attempts</p>
        <p>Due: {new Date(job.due_at).toLocaleString()}</p>{job.last_error && <p>{job.last_error}</p>}
        {job.attempt_history.length > 0 && <ul className="list-disc pl-5">{job.attempt_history.map((attempt, index) => <li key={`${attempt.started_at}-${index}`}>Attempt {attempt.attempt}: {attempt.outcome ?? "in progress"} at {new Date(attempt.started_at).toLocaleString()}</li>)}</ul>}
        {job.status === "exhausted" && <button disabled={busy} onClick={() => retryEmail(job.id, job.updated_at)}>Retry email</button>}</div>)}
    </section>
  </main>;
}
