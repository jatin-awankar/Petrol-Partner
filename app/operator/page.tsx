"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import {JourneyReviewQueue} from "@/components/pilot/JourneyReviewQueue";

type Capability = "offers" | "requests" | "acceptance" | "booking";
type PilotStatus = { recovery: { mode: string; cause: string | null; started_at: string | null; reconciled_at: string | null }; backup: { required: boolean; healthy: boolean; maximumAgeMinutes: number; ageMinutes: number | null; latest: { snapshot_at: string; uploaded_at: string; ciphertext_sha256: string } | null; failedAttempts: { id: string; started_at: string; error_code: string | null }[]; runningAttempts: { id: string; started_at: string }[] }; capabilities: { capability: Capability; paused: boolean; pending: boolean }[] };
type Pending = { id: string; capability: Capability; paused: boolean; reason: string; state: string };
type Delivery = { jobs: { id: string; operation_id: string; status: string; attempts: number; attempt_count: number; attempt_history: { attempt: number; started_at: string; finished_at: string | null; outcome: string | null }[]; due_at: string; updated_at: string; last_error: string | null }[]; health: { due: number; exhausted: number; expired_leases: number; stalled: number; oldest_open_at: string | null; last_attempt_at: string | null; last_worker_seen_at: string | null; last_success_at: string | null; queue_size: number; awaiting_first_attempt: number; first_attempt_late: number; important_stalled: number; oldest_important_queued_at: string | null; recent_failures: number } };
type StudentReview = { user_id: string; status: string; enrolled_name: string | null; institution_name: string; graduation_year: number | null; evidence_category: string | null; age_evidence_category: string | null };
type CancellationReview = {id:string;actor_id:string;offer_id:string;target_type:string;
  target_id:string;reason:string|null;created_at:string;status:string};
type RevocationCase = {id:string;offer_id:string;allocation_id:string|null;subject_type:string;
  subject_id:string;reason:string;created_at:string;resolved_at:string|null;resolution:string|null;
  driver_id:string;passenger_ids:string[];offer_status:string;allocation_status?:string|null};

export default function OperatorPage() {
  const { user, loading } = useCurrentUser();
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [studentReviews, setStudentReviews] = useState<StudentReview[]>([]);
  const [cancellationReviews,setCancellationReviews] = useState<CancellationReview[]>([]);
  const [revocationCases,setRevocationCases] = useState<{holds:RevocationCase[];incidents:RevocationCase[]}>({holds:[],incidents:[]});
  const [studentToRevoke,setStudentToRevoke] = useState("");
  const [outreachParticipant,setOutreachParticipant] = useState("");
  const [outreachMethod,setOutreachMethod] = useState<"email"|"phone"|"in_person"|"other">("email");
  const [outreachReason,setOutreachReason] = useState("safety_check");
  const [outreachOutcome,setOutreachOutcome] = useState("follow_up_required");
  const [outreach,setOutreach] = useState<{id:string;participant_id:string;method:string;reason:string;outcome:string;occurred_at:string}[]>([]);
  const [adultFindings, setAdultFindings] = useState<Record<string, boolean>>({});
  const [evidenceMode, setEvidenceMode] = useState<"closed" | "synthetic" | "real">("closed");
  const [evidenceRetention, setEvidenceRetention] = useState<{ overdue_count: number; failed_count: number; oldest_due_at: string | null } | null>(null);
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
    setOutreach((await apiRequest<{records:typeof outreach}>("/v1/operator/urgent-outreach")).records);
    setCancellationReviews((await apiRequest<{cases:CancellationReview[]}>("/v1/operator/cancellation-reviews")).cases);
    setRevocationCases(await apiRequest<{holds:RevocationCase[];incidents:RevocationCase[]}>("/v1/operator/revocation-cases"));
    const reviews = await apiRequest<{ student_verifications: StudentReview[] }>("/v1/verification/admin/pending");
    setStudentReviews(reviews.student_verifications);
    setEvidenceMode((await apiRequest<{ mode: "closed" | "synthetic" | "real" }>("/v1/verification/evidence-capability")).mode);
    setEvidenceRetention(await apiRequest<{ overdue_count: number; failed_count: number; oldest_due_at: string | null }>("/v1/verification/admin/student-evidence-retention"));
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
  async function recordOutreach() {
    setBusy(true);
    try {
      const id=crypto.randomUUID();
      await apiRequest("/v1/operator/urgent-outreach",{method:"POST",headers:{"Idempotency-Key":id},
        body:JSON.stringify({participantId:outreachParticipant.trim(),method:outreachMethod,
          occurredAt:new Date().toISOString(),reason:outreachReason,outcome:outreachOutcome})});
      setMessage(`Urgent outreach ${id} recorded.`);
      await refresh();
    } catch(error) {setMessage(error instanceof Error?error.message:"Outreach record failed");}
    finally {setBusy(false);}
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
  async function reviewStudent(userId: string, outcome: "verified" | "rejected") {
    if (reason.trim().length < 8) { setMessage("Enter a reason of at least eight characters."); return; }
    const adultEligible = adultFindings[userId] === true;
    if (outcome === "verified" && !adultEligible) { setMessage("Confirm adult eligibility before approval."); return; }
    setBusy(true);
    const storageKey = `student-review:${userId}:${outcome}:${adultEligible}:${reason.trim()}`;
    const key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
    try {
      const result = await apiRequest<{ operation: { id: string; state: string } }>(`/v1/verification/admin/student/${userId}/review`, {
        method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ outcome, adult_eligible: adultEligible, reason: reason.trim() }),
      });
      sessionStorage.removeItem(storageKey);
      setMessage(`Student review ${outcome}: ${result.operation.state} (${result.operation.id}).`);
      await refresh();
    } catch (error) {
      let reference = key;
      try {
        const lookup = await apiRequest<{ operation: { id: string; state: string } }>(`/v1/verification/admin/student/review-operations/by-key/${encodeURIComponent(key)}`);
        reference = `${lookup.operation.id} (${lookup.operation.state})`;
      } catch { /* The original key remains available for the next retry. */ }
      setMessage(`Review outcome uncertain. Reference ${reference}. Retry with the same reason to use the same decision key. ${error instanceof Error ? error.message : ""}`);
    }
    finally { setBusy(false); }
  }
  async function revokeStudent() {
    if(reason.trim().length<8 || !studentToRevoke.trim()) {
      setMessage("Enter a student ID and a reason of at least eight characters."); return;
    }
    const storageKey=`student-revocation:${studentToRevoke.trim()}:${reason.trim()}`;
    const key=sessionStorage.getItem(storageKey)??crypto.randomUUID();
    sessionStorage.setItem(storageKey,key);
    setBusy(true);
    try {
      const result=await apiRequest<{operation:{operation_id:string;state:string}}>(
        `/v1/operator/students/${encodeURIComponent(studentToRevoke.trim())}/revoke`,{
          method:"POST",headers:{"Idempotency-Key":key},body:JSON.stringify({reason:reason.trim()})});
      sessionStorage.removeItem(storageKey);
      setMessage(`Student revocation ${result.operation.operation_id}: ${result.operation.state}.`);
      await refresh();
    } catch(error) {
      setMessage(`Revocation outcome uncertain. Retry with the same student ID and reason. Key ${key}. ${error instanceof Error?error.message:""}`);
    } finally {setBusy(false);}
  }
  async function actOnCase(type:"hold"|"incident",item:RevocationCase,
    action:"outreach"|"resolve",outcome?:"cancelled"|"safe_completion"|"interrupted") {
    if(reason.trim().length<8) {setMessage("Enter a reason of at least eight characters.");return;}
    const recipients=[item.driver_id,...item.passenger_ids].filter((id,index,all)=>all.indexOf(id)===index);
    const body=action==="outreach"?{recipient_ids:recipients,reason:reason.trim()}
      :{outcome,reason:reason.trim()};
    const storageKey=`revocation-case:${type}:${item.id}:${action}:${JSON.stringify(body)}`;
    const key=sessionStorage.getItem(storageKey)??crypto.randomUUID();
    sessionStorage.setItem(storageKey,key);
    setBusy(true);
    try {
      const result=await apiRequest<{operation:{operation_id:string;state:string}}>(
        `/v1/operator/revocation-cases/${type}/${item.id}/${action}`,{
          method:"POST",headers:{"Idempotency-Key":key},body:JSON.stringify(body)});
      sessionStorage.removeItem(storageKey);
      setMessage(`Case action ${result.operation.operation_id}: ${result.operation.state}.`);
      await refresh();
    } catch(error) {
      setMessage(`Case action outcome uncertain. Retry the same action and reason. Key ${key}. ${error instanceof Error?error.message:""}`);
    } finally {setBusy(false);}
  }
  async function openEvidence(userId: string, purpose: "enrollment" | "age") {
    const preview = window.open("about:blank", "_blank");
    if (preview) preview.opener = null;
    try {
      const grant = await apiRequest<{ token: string }>(`/v1/verification/admin/student/${userId}/evidence-access?purpose=${purpose}`, { method: "POST" });
      const response = await fetch(`/v1/verification/admin/student/${userId}/evidence?purpose=${purpose}`, {
        credentials: "include", cache: "no-store", headers: { "X-Evidence-Token": grant.token },
      });
      if (!response.ok) throw new Error("Evidence link expired or unavailable");
      const objectUrl = URL.createObjectURL(await response.blob());
      if (preview) preview.location.href = objectUrl;
      else { URL.revokeObjectURL(objectUrl); throw new Error("Allow pop-ups to inspect evidence"); }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) { preview?.close(); setMessage(error instanceof Error ? error.message : "Unable to open evidence"); }
  }
  if (loading) return <main className="p-8">Checking operator access…</main>;
  if (!user) return <main className="p-8">Sign in to access the operator console. <Link href="/login">Sign in</Link></main>;
  if (authorized === false) return <main className="p-8">Operator access requires current allowlist membership and MFA. {message}</main>;
  return <main className="mx-auto max-w-3xl space-y-6 p-8">
    <Link className="underline" href="/operator/settlement-reviews">Open settlement review queue</Link>
    <Link className="ml-4 underline" href="/operator/restrictions">Review account restrictions</Link>
    <h1 className="text-2xl font-semibold">Pilot operator console</h1>
    <p>All decisions require current operator access and MFA. A pending decision keeps protected activity paused.</p>
    <p role="status">{message}</p>
    <section className="rounded border p-4"><h2 className="font-semibold">Recovery mode: {status?.recovery.mode ?? "loading"}</h2>
      {status?.recovery.cause && <p>Cause: {status.recovery.cause}</p>}
      {status?.recovery.started_at && <p>Since: {new Date(status.recovery.started_at).toLocaleString()}</p>}
      <div className="mt-3 flex gap-3"><button disabled={busy} onClick={() => recovery("reconcile")}>Reconcile receipts</button>
      <button disabled={busy || !status?.recovery.reconciled_at || reason.trim().length < 8} onClick={() => recovery("reopen")}>Manually reopen</button></div>
    </section>
    <section className="space-y-2 rounded border p-4"><h2 className="font-semibold">Database backup</h2>
      <p>Protection: {status?.backup.required ? "required" : "rehearsal only"} · {status?.backup.healthy ? "fresh" : "stale or unavailable"} · Maximum age: {status?.backup.maximumAgeMinutes ?? 50} minutes</p>
      <p>Latest snapshot: {status?.backup.latest?.snapshot_at ? new Date(status.backup.latest.snapshot_at).toLocaleString() : "None"} · Age: {status?.backup.ageMinutes ?? "—"} minutes</p>
      <p>Upload completed: {status?.backup.latest?.uploaded_at ? new Date(status.backup.latest.uploaded_at).toLocaleString() : "None"}</p>
      <p>Running attempts: {status?.backup.runningAttempts.length ?? 0} · Failed attempts: {status?.backup.failedAttempts.length ?? 0}</p>
      {status?.backup.failedAttempts.map((attempt) => <p key={attempt.id}>Failed {new Date(attempt.started_at).toLocaleString()}: {attempt.error_code ?? "unknown"}</p>)}
    </section>
    <label className="block">Decision reason<input className="mt-1 block w-full rounded border p-2" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
    <section className="space-y-3"><h2 className="font-semibold">Pause controls</h2>{status?.capabilities.map((item) => <div key={item.capability} className="flex items-center justify-between rounded border p-3"><span>{item.capability}: {item.paused ? "paused" : "open"}{item.pending ? " (pending)" : ""}</span><div className="flex gap-3"><button disabled={busy || reason.trim().length < 8} onClick={() => decide(item.capability, true)}>Pause</button><button disabled={busy || reason.trim().length < 8} onClick={() => decide(item.capability, false)}>Resume</button></div></div>)}</section>
    <section><h2 className="font-semibold">Uncertain decisions</h2>{pending.length ? pending.map((item) => <div key={item.id} className="rounded border p-3"><p>{item.id} · {item.capability} · {item.paused ? "pause" : "resume"} · {item.state}</p><p>Original reason: {item.reason}</p><div className="flex gap-3"><button disabled={busy || reason.trim().length < 8} onClick={() => resumePending(item.id)}>Complete pending decision</button><button disabled={busy} onClick={() => checkPendingStatus(item.id)}>Check status</button></div></div>) : <p>None recorded.</p>}</section>
    <section className="space-y-3"><h2 className="font-semibold">Notification delivery</h2>
      <p>Due: {delivery?.health.due ?? "—"} · Stalled over five minutes: {delivery?.health.stalled ?? "—"} · Expired leases: {delivery?.health.expired_leases ?? "—"} · Exhausted: {delivery?.health.exhausted ?? "—"}</p>
      <p>Queue size: {delivery?.health.queue_size ?? "—"} · Awaiting first attempt: {delivery?.health.awaiting_first_attempt ?? "—"} · First attempt late: {delivery?.health.first_attempt_late ?? "—"} · Recent failures: {delivery?.health.recent_failures ?? "—"}</p>
      <p>Oldest important queued: {delivery?.health.oldest_important_queued_at ? new Date(delivery.health.oldest_important_queued_at).toLocaleString() : "None"} · Last successful processing: {delivery?.health.last_success_at ? new Date(delivery.health.last_success_at).toLocaleString() : "None"}</p>
      <p>Worker last seen: {delivery?.health.last_worker_seen_at ? new Date(delivery.health.last_worker_seen_at).toLocaleString() : "No heartbeat"}</p>
      {delivery?.jobs.map((job) => <div key={job.id} className="rounded border p-3"><p>Operation {job.operation_id} · {job.status} · {job.attempt_count} delivery attempts</p>
        <p>Due: {new Date(job.due_at).toLocaleString()}</p>{job.last_error && <p>{job.last_error}</p>}
        {job.attempt_history.length > 0 && <ul className="list-disc pl-5">{job.attempt_history.map((attempt, index) => <li key={`${attempt.started_at}-${index}`}>Attempt {attempt.attempt}: {attempt.outcome ?? "in progress"} at {new Date(attempt.started_at).toLocaleString()}</li>)}</ul>}
        {job.status === "exhausted" && <button disabled={busy} onClick={() => retryEmail(job.id, job.updated_at)}>Retry email</button>}</div>)}
    </section>
    <section className="space-y-2 rounded border p-4"><h2 className="font-semibold">Urgent participant outreach</h2>
      <p>Record the participant ID and coded result. Keep phone numbers and message content out of this record.</p>
      <label className="block">Participant ID<input className="w-full rounded border p-2" value={outreachParticipant} onChange={e=>setOutreachParticipant(e.target.value)} /></label>
      <label className="block">Method<select value={outreachMethod} onChange={e=>setOutreachMethod(e.target.value as typeof outreachMethod)}>{["email","phone","in_person","other"].map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="block">Reason<select value={outreachReason} onChange={e=>setOutreachReason(e.target.value)}>{["safety_check","pickup_exception","service_outage","delivery_failure","other_support"].map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="block">Outcome<select value={outreachOutcome} onChange={e=>setOutreachOutcome(e.target.value)}>{["contacted","no_answer","follow_up_required","resolved","escalated"].map(value=><option key={value}>{value}</option>)}</select></label>
      <button disabled={busy||!outreachParticipant.trim()} onClick={recordOutreach}>Record outreach</button>
      {outreach.map(item=><p key={item.id}>{item.participant_id} · {item.method} · {item.reason} · {item.outcome} · {new Date(item.occurred_at).toLocaleString()}</p>)}
    </section>
    <JourneyReviewQueue />
    <section className="space-y-3"><h2 className="font-semibold">Cancellation review cases</h2>
      {cancellationReviews.length ? cancellationReviews.map(item => <div key={item.id} className="rounded border p-3">
        <p>Case {item.id} · {item.target_type} {item.target_id} · offer {item.offer_id}</p>
        <p>Requested by {item.actor_id} on {new Date(item.created_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST.</p>
        {item.reason && <p>Reason: {item.reason}</p>}
        <p>Status: {item.status}. The ride and seat remain unchanged pending operator resolution.</p>
      </div>) : <p>No open cancellation review cases.</p>}
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Eligibility revocation</h2>
      <p>Suspending a student holds future confirmed seats and opens urgent cases for active trips.</p>
      <label className="block">Student ID<input className="mt-1 block w-full rounded border p-2" value={studentToRevoke}
        onChange={event=>setStudentToRevoke(event.target.value)} /></label>
      <button disabled={busy||reason.trim().length<8||!studentToRevoke.trim()} onClick={revokeStudent}>
        Suspend student eligibility</button>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Revocation holds</h2>
      {revocationCases.holds.length?revocationCases.holds.map(item=><div key={item.id} className="rounded border p-3">
        <p>Case {item.id} · offer {item.offer_id} · {item.allocation_id?`seat ${item.allocation_id}`:"whole ride"}</p>
        <p>{item.subject_type} {item.subject_id} · ride {item.offer_status} · seat {item.allocation_status??"—"}</p>
        <p>Original reason: {item.reason}</p><p>{item.resolved_at?`Resolved: ${item.resolution}`:"Open: seat remains reserved until recorded cancellation."}</p>
        {!item.resolved_at&&<div className="flex gap-3"><button disabled={busy||reason.trim().length<8}
          onClick={()=>actOnCase("hold",item,"outreach")}>Record participant outreach</button>
          <button disabled={busy||reason.trim().length<8} onClick={()=>actOnCase("hold",item,"resolve","cancelled")}>
            Resolve after cancellation</button></div>}
      </div>):<p>No revocation holds recorded.</p>}
    </section>
    <section className="space-y-3"><h2 className="font-semibold">High priority active trip incidents</h2>
      {revocationCases.incidents.length?revocationCases.incidents.map(item=><div key={item.id} className="rounded border p-3">
        <p>Incident {item.id} · offer {item.offer_id} · {item.offer_status}</p>
        <p>{item.subject_type} {item.subject_id} · original reason: {item.reason}</p>
        <p>{item.resolved_at?`Resolved: ${item.resolution}`:"Open: coordinate support with confirmed participants."}</p>
        <p><Link className="underline" href={`/operator/restrictions?source_type=incident&source_id=${item.id}&target=${item.subject_id}`}>
          Review an account restriction from this incident</Link></p>
        {!item.resolved_at&&<div className="flex gap-3"><button disabled={busy||reason.trim().length<8}
          onClick={()=>actOnCase("incident",item,"outreach")}>Record participant outreach</button>
          <button disabled={busy||reason.trim().length<8} onClick={()=>actOnCase("incident",item,"resolve","safe_completion")}>
            Close safety case</button>
          <button disabled={busy||reason.trim().length<8} onClick={()=>actOnCase("incident",item,"resolve","interrupted")}>
            Record interruption</button></div>}
      </div>):<p>No revocation incidents recorded.</p>}
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Student reviews</h2>
      <p>{evidenceMode === "real" ? "Inspect the private enrollment and age evidence before deciding." : "Inspect fabricated evidence only. Real evidence intake remains closed pending provider verification."}</p>
      <p role="status">Evidence deletion: {evidenceRetention?.overdue_count ?? "—"} overdue · {evidenceRetention?.failed_count ?? "—"} failed attempts{evidenceRetention?.oldest_due_at ? ` · oldest due ${new Date(evidenceRetention.oldest_due_at).toLocaleString()}` : ""}.</p>
      {studentReviews.length ? studentReviews.map((review) => <div key={review.user_id} className="rounded border p-3">
        <p>{review.enrolled_name ?? "Name missing"} · {review.institution_name} · graduation {review.graduation_year} · {review.evidence_category} · {review.age_evidence_category}</p>
        <div className="flex gap-3"><button className="underline" onClick={() => openEvidence(review.user_id, "enrollment")}>Enrollment evidence</button><button className="underline" onClick={() => openEvidence(review.user_id, "age")}>Age evidence</button></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={adultFindings[review.user_id] === true} onChange={(event) => setAdultFindings((findings) => ({ ...findings, [review.user_id]: event.target.checked }))} />Age evidence confirms this student is at least 18</label>
        <div className="flex gap-3"><button disabled={busy || adultFindings[review.user_id] !== true} onClick={() => reviewStudent(review.user_id, "verified")}>Approve adult student</button><button disabled={busy} onClick={() => reviewStudent(review.user_id, "rejected")}>Reject</button></div>
      </div>) : <p>No pending student reviews.</p>}
    </section>
  </main>;
}
