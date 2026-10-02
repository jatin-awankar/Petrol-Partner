"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import {JourneyReviewQueue} from "@/components/pilot/JourneyReviewQueue";

type Capability = "offers" | "requests" | "acceptance" | "booking";
type PilotStatus = { recovery: { mode: string; cause: string | null; started_at: string | null; reconciled_at: string | null }; backup: { required: boolean; healthy: boolean; maximumAgeMinutes: number; ageMinutes: number | null; latest: { snapshot_at: string; uploaded_at: string; ciphertext_sha256: string } | null; failedAttempts: { id: string; started_at: string; error_code: string | null }[]; runningAttempts: { id: string; started_at: string }[] }; capabilities: { capability: Capability; paused: boolean; pending: boolean }[] };
type Pending = { id: string; capability: Capability; paused: boolean; reason: string; state: string };
type Delivery = { jobs: { id: string; operation_id: string; origin_type: string; event_type: string; related_entity_type: string; related_entity_id: string; status: string; attempts: number; attempt_count: number; attempt_history: { attempt: number; started_at: string; finished_at: string | null; outcome: string | null }[]; due_at: string; updated_at: string; last_error: string | null }[]; health: { due: number; exhausted: number; expired_leases: number; stalled: number; oldest_open_at: string | null; last_attempt_at: string | null; last_worker_seen_at: string | null; last_success_at: string | null; queue_size: number; awaiting_first_attempt: number; first_attempt_late: number; important_stalled: number; oldest_important_queued_at: string | null; recent_failures: number } };
type StudentReview = { user_id: string; status: string; enrolled_name: string | null; institution_name: string; graduation_year: number | null; evidence_category: string | null; age_evidence_category: string | null };
type CancellationReview = {id:string;actor_id:string;offer_id:string;target_type:string;
  target_id:string;reason:string|null;created_at:string;status:string};
type RevocationCase = {id:string;offer_id:string;allocation_id:string|null;subject_type:string;
  subject_id:string;reason:string;created_at:string;resolved_at:string|null;resolution:string|null;
  driver_id:string;passenger_ids:string[];offer_status:string;allocation_status?:string|null};
type DepartureSignal = {offer_id:string;operation_id:string;allocation_id:string;signal_type:string;created_at:string};

export default function OperatorPage() {
  const { user, loading } = useCurrentUser();
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [studentReviews, setStudentReviews] = useState<StudentReview[]>([]);
  const [cancellationReviews,setCancellationReviews] = useState<CancellationReview[]>([]);
  const [departureSignals,setDepartureSignals] = useState<DepartureSignal[]>([]);
  const [readErrors,setReadErrors] = useState<string[]>([]);
  const [readsLoading,setReadsLoading]=useState(true);
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
  const [pendingAction,setPendingAction]=useState<{label:string;id:string;path:string;storageKey:string}|null>(null);
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    const operations = await apiRequest<{ operations: Pending[] }>("/v1/operator/pending");
    setAuthorized(true);
    setPending(operations.operations);
    const reads: [string, () => Promise<void>][] = [
      ["Pause and recovery", async()=>setStatus(await apiRequest<PilotStatus>("/v1/operator/status"))],
      ["Notification delivery", async()=>setDelivery(await apiRequest<Delivery>("/v1/operator/notifications/delivery"))],
      ["Outreach history", async()=>setOutreach((await apiRequest<{records:typeof outreach}>("/v1/operator/urgent-outreach")).records)],
      ["Cancellation reviews", async()=>setCancellationReviews((await apiRequest<{cases:CancellationReview[]}>("/v1/operator/cancellation-reviews")).cases)],
      ["Departure reviews", async()=>setDepartureSignals((await apiRequest<{signals:DepartureSignal[]}>("/v1/operator/departure-reviews")).signals)],
      ["Revocation cases", async()=>setRevocationCases(await apiRequest<{holds:RevocationCase[];incidents:RevocationCase[]}>("/v1/operator/revocation-cases"))],
      ["Historical student reviews", async()=>setStudentReviews((await apiRequest<{student_verifications:StudentReview[]}>("/v1/verification/admin/pending")).student_verifications)],
      ["Evidence capability", async()=>setEvidenceMode((await apiRequest<{mode:"closed"|"synthetic"|"real"}>("/v1/verification/evidence-capability")).mode)],
      ["Evidence retention", async()=>setEvidenceRetention(await apiRequest<{overdue_count:number;failed_count:number;oldest_due_at:string|null}>("/v1/verification/admin/student-evidence-retention"))],
    ];
    const results = await Promise.allSettled(reads.map(([,run])=>run()));
    setReadsLoading(false);
    if(results.some(result=>result.status==="rejected"&&result.reason instanceof ApiError&&
      (result.reason.status===401||result.reason.status===403))) {
      setAuthorized(false);
      setStatus(null);setDelivery(null);setPending([]);setOutreach([]);setCancellationReviews([]);
      setDepartureSignals([]);setRevocationCases({holds:[],incidents:[]});setStudentReviews([]);
      return;
    }
    setReadErrors(results.flatMap((result,index)=>result.status==="rejected"?[reads[index][0]]:[]));
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
      setMessage(`Decision ${result.id} returned. Checking durable state.`);
      await refresh();
      const checked = await apiRequest<{state:string}>(`/v1/operator/operations/${result.id}`);
      setMessage(`Decision ${result.id}: ${checked.state}. ${checked.state === "acknowledged" || checked.state === "recovered" ? "Recorded outcome confirmed." : "Outcome remains pending; do not submit a new decision."}`);
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
      await refresh();
      setMessage(`${action} response received. Confirm the recovery mode and pending operations shown below before any further action.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Recovery action failed"); }
    finally { setBusy(false); }
  }
  async function resumePending(operationId: string) {
    if (reason.trim().length < 8) { setMessage("Enter a reason for assuming the pending decision."); return; }
    setBusy(true);
    try {
      await apiRequest(`/v1/operator/operations/${operationId}/resume`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      await checkPendingStatus(operationId);
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
  async function checkActionStatus(){
    if(!pendingAction)return;
    try{
      const result=await apiRequest<{operation:{state:string}}>(pendingAction.path);
      if(result.operation.state==="acknowledged"||result.operation.state==="recovered"){
        sessionStorage.removeItem(pendingAction.storageKey);
        setMessage(`${pendingAction.label} ${pendingAction.id}: ${result.operation.state}.`);
        setPendingAction(null);
        await refresh();
      }else setMessage(`${pendingAction.label} ${pendingAction.id} is still ${result.operation.state}. Keep the same decision key.`);
    }catch(error){setMessage(`Could not check ${pendingAction.label.toLowerCase()} ${pendingAction.id}: ${error instanceof Error?error.message:"unknown error"}`);}
  }
  async function showActionResult(label:string,id:string,state:string,path:string,storageKey:string,successMessage:string){
    if(state==="acknowledged"||state==="recovered"){
      sessionStorage.removeItem(storageKey);
      setPendingAction(null);
      setMessage(successMessage);
      await refresh();
    }else{
      setPendingAction({label,id,path,storageKey});
      setMessage(`${label} ${id} is ${state}. Check the operation before retrying.`);
    }
  }
  async function recordOutreach() {
    setBusy(true);
    try {
      const id=crypto.randomUUID();
      await apiRequest("/v1/operator/urgent-outreach",{method:"POST",headers:{"Idempotency-Key":id},
        body:JSON.stringify({participantId:outreachParticipant.trim(),method:outreachMethod,
          occurredAt:new Date().toISOString(),reason:outreachReason,outcome:outreachOutcome})});
      await refresh();
      setMessage(`Outreach response received. Check the recorded entry in audit history; contact is not proof of receipt.`);
    } catch(error) {setMessage(error instanceof Error?error.message:"Outreach record failed");}
    finally {setBusy(false);}
  }
  async function retryEmail(jobId: string, exhaustedAt: string) {
    setBusy(true);
    try {
      await apiRequest(`/v1/operator/notifications/email/${jobId}/retry`, { method: "POST", headers: { "Idempotency-Key": `email-retry:${jobId}:${exhaustedAt}` }, body: JSON.stringify({}) });
      await refresh();
      setMessage(`Retry requested for ${jobId}. Check the delivery state below; the participant may not have received it.`);
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
      await showActionResult("Student review",result.operation.id,result.operation.state,
        `/v1/verification/admin/student/review-operations/${result.operation.id}`,storageKey,
        `Student review ${outcome}: ${result.operation.state} (${result.operation.id}).`);
    } catch (error) {
      let reference = key;
      try {
        const lookup = await apiRequest<{ operation: { id: string; state: string } }>(`/v1/verification/admin/student/review-operations/by-key/${encodeURIComponent(key)}`);
        reference = `${lookup.operation.id} (${lookup.operation.state})`;
        if(lookup.operation.state==="acknowledged"||lookup.operation.state==="recovered"){
          sessionStorage.removeItem(storageKey);
          setPendingAction(null);
          setMessage(`Student review ${lookup.operation.id}: ${lookup.operation.state}.`);
          await refresh().catch(()=>undefined);
          return;
        }else setPendingAction({label:"Student review",id:lookup.operation.id,path:`/v1/verification/admin/student/review-operations/${lookup.operation.id}`,storageKey});
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
      await showActionResult("Student revocation",result.operation.operation_id,result.operation.state,
        `/v1/operator/students/revocations/${result.operation.operation_id}`,storageKey,
        `Student revocation ${result.operation.operation_id}: ${result.operation.state}.`);
    } catch(error) {
      const operationId=error instanceof ApiError&&typeof error.details==="object"&&error.details!==null&&"operationId" in error.details?String(error.details.operationId):null;
      if(operationId)setPendingAction({label:"Student revocation",id:operationId,path:`/v1/operator/students/revocations/${operationId}`,storageKey});
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
      await showActionResult("Case action",result.operation.operation_id,result.operation.state,
        `/v1/operator/revocation-cases/operations/${result.operation.operation_id}`,storageKey,
        `Case action ${result.operation.operation_id}: ${result.operation.state}.`);
    } catch(error) {
      const operationId=error instanceof ApiError&&typeof error.details==="object"&&error.details!==null&&"operationId" in error.details?String(error.details.operationId):null;
      if(operationId)setPendingAction({label:"Case action",id:operationId,path:`/v1/operator/revocation-cases/operations/${operationId}`,storageKey});
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
  if (loading) return <main id="main-content" className="operator-workspace"><div className="operator-access" role="status">Checking operator access…</div></main>;
  if (!user) return <main id="main-content" className="operator-workspace"><div className="operator-access">Sign in to access the operator workspace. <Link href="/login">Sign in</Link></div></main>;
  if (authorized === false) return <main id="main-content" className="operator-workspace"><div className="operator-access" role="alert">Operator access requires current allowlist membership and MFA. {message}</div></main>;
  if (authorized === null) return <main id="main-content" className="operator-workspace"><div className="operator-access" role="status">{message||"Loading protected queues…"} {message&&<button onClick={()=>void refresh()}>Retry access check</button>}</div></main>;
  return <main id="main-content" className="operator-workspace">
    <div className="operator-heading"><div><span className="operator-kicker">OPERATIONS / CURRENT VIEW</span><h1>Operator workspace</h1>
      <p>Server-authorized queues. Real route bookings remain disabled. Historical fixed-corridor cases are marked below.</p></div>
      <span className="product-status product-status-restricted">Prelaunch</span></div>
    {message&&<p className="operator-notice" role="status">{message}</p>}
    {pendingAction&&<button disabled={busy} onClick={()=>void checkActionStatus()}>Check {pendingAction.label.toLowerCase()} status</button>}
    {readErrors.length>0&&<div className="operator-notice operator-error" role="alert">Could not refresh: {readErrors.join(", ")}. Values in those queues may be stale. <button onClick={()=>void refresh()}>Retry reads</button></div>}
    <div className="operator-summary" aria-label="Queue summary">
      <a href="#eligibility"><span>01 / ELIGIBILITY</span><strong>{readsLoading ? "Loading" : readErrors.includes("Historical student reviews") ? "Unavailable" : `${studentReviews.length} student reviews`}</strong><small>Historical approvals and restrictions</small></a>
      <a href="#routes"><span>02 / ROUTES</span><strong>{readsLoading ? "Loading" : ["Cancellation reviews","Departure reviews","Revocation cases"].some(name=>readErrors.includes(name)) ? "Unavailable" : `${cancellationReviews.length+revocationCases.holds.length+revocationCases.incidents.length+departureSignals.length} cases`}</strong><small>Historical corridor · route read gated</small></a>
      <a href="#journeys"><span>03 / OUTCOMES</span><strong>Review queues</strong><small>Journey and direct settlement</small></a>
      <a href="#delivery"><span>04 / DELIVERY</span><strong>{delivery?.health.exhausted ?? "—"} exhausted</strong><small>Delivery is not receipt</small></a>
      <a href="#recovery"><span>05 / RECOVERY</span><strong>{status?.recovery.mode ?? "Loading"}</strong><small>{pending.length} pending operations</small></a>
      <a href="#audit"><span>06 / HISTORY</span><strong>Recorded outcomes</strong><small>Case-level audit and outreach</small></a>
    </div>
    <section id="recovery" className="operator-panel"><div className="operator-panel-head"><span>05 / PAUSE & RECOVERY</span><h2>Recovery mode: {status?.recovery.mode ?? "loading"}</h2><p>Pending or unknown decisions do not authorize new activity. Reconcile durable evidence before reopening.</p></div>
      {status?.recovery.cause && <p>Cause: {status.recovery.cause}</p>}
      {status?.recovery.started_at && <p>Since: {new Date(status.recovery.started_at).toLocaleString()}</p>}
      <div className="mt-3 flex gap-3"><button disabled={busy} onClick={() => recovery("reconcile")}>Reconcile receipts</button>
      <button disabled={busy || !status?.recovery.reconciled_at || reason.trim().length < 8} onClick={() => recovery("reopen")}>Manually reopen</button></div>
    </section>
    <section className="operator-panel"><h2 className="font-semibold">Database backup</h2>
      <p>Protection: {status?.backup.required ? "required" : "rehearsal only"} · {status?.backup.healthy ? "fresh" : "stale or unavailable"} · Maximum age: {status?.backup.maximumAgeMinutes ?? 50} minutes</p>
      <p>Latest snapshot: {status?.backup.latest?.snapshot_at ? new Date(status.backup.latest.snapshot_at).toLocaleString() : "None"} · Age: {status?.backup.ageMinutes ?? "—"} minutes</p>
      <p>Upload completed: {status?.backup.latest?.uploaded_at ? new Date(status.backup.latest.uploaded_at).toLocaleString() : "None"}</p>
      <p>Running attempts: {status?.backup.runningAttempts.length ?? 0} · Failed attempts: {status?.backup.failedAttempts.length ?? 0}</p>
      {status?.backup.failedAttempts.map((attempt) => <p key={attempt.id}>Failed {new Date(attempt.started_at).toLocaleString()}: {attempt.error_code ?? "unknown"}</p>)}
    </section>
    <label className="block">Decision reason<input className="mt-1 block w-full rounded border p-2" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
    <section className="operator-panel space-y-3"><h2 className="font-semibold">Pause controls</h2><p>Proposed action: pause or resume the named historical capability. Impact: server permission changes, but the booking launch gate remains closed.</p>{status?.capabilities.map((item) => <div key={item.capability} className="operator-case"><span>{item.capability}: {item.paused ? "paused" : "open"}{item.pending ? " (pending)" : ""}</span><div className="flex flex-wrap gap-3"><button disabled={busy || reason.trim().length < 8} onClick={() => decide(item.capability, true)}>Pause</button><button disabled={busy || reason.trim().length < 8} onClick={() => decide(item.capability, false)}>Resume</button></div></div>)}</section>
    <section className="operator-panel"><h2 className="font-semibold">Unknown and pending decisions</h2>{pending.length ? pending.map((item) => <div key={item.id} className="operator-case"><p>{item.id} · {item.capability} · {item.paused ? "pause" : "resume"} · {item.state}</p><p>Original reason: {item.reason}</p><p>Actor: operator · deadline: before protected writes reopen · outcome: pending durable confirmation.</p><div className="flex flex-wrap gap-3"><button disabled={busy || reason.trim().length < 8} onClick={() => resumePending(item.id)}>Complete pending decision</button><button disabled={busy} onClick={() => checkPendingStatus(item.id)}>Check status</button></div></div>) : <p>No pending operator decisions recorded.</p>}</section>
    <section className="space-y-2 rounded border p-4"><h2 className="font-semibold">Unrestricted support preparation</h2>
      <p>Proposed contact: jatinawankar23@gmail.com. Nominated fallback inbox: supportpp@gmail.com.</p>
      <p>Both inboxes depend on Gmail and the same operator. Separately reachable fallback and active-trip escalation are pending approval. This is an internal plan, not published service coverage. Real bookings remain disabled.</p>
      <p>Proposed monitoring: Monday–Friday, 09:00–18:00 IST and until every active trip is resolved. Pause new commitments whenever coverage is unavailable.</p>
    </section>
    <section id="delivery" className="operator-panel space-y-3"><div className="operator-panel-head"><span>04 / DELIVERY</span><h2>Notification delivery</h2><p>Investigate failed sends and act before their due time. A sent email is not proof that anyone received or read it.</p></div>
      <p>A sent email or recorded outreach is not proof that a participant received or read a notice. Confirm urgent contact independently and record its outcome.</p>
      <p>Due: {delivery?.health.due ?? "—"} · Stalled over five minutes: {delivery?.health.stalled ?? "—"} · Expired leases: {delivery?.health.expired_leases ?? "—"} · Exhausted: {delivery?.health.exhausted ?? "—"}</p>
      <p>Queue size: {delivery?.health.queue_size ?? "—"} · Awaiting first attempt: {delivery?.health.awaiting_first_attempt ?? "—"} · First attempt late: {delivery?.health.first_attempt_late ?? "—"} · Recent failures: {delivery?.health.recent_failures ?? "—"}</p>
      <p>Oldest important queued: {delivery?.health.oldest_important_queued_at ? new Date(delivery.health.oldest_important_queued_at).toLocaleString() : "None"} · Last successful processing: {delivery?.health.last_success_at ? new Date(delivery.health.last_success_at).toLocaleString() : "None"}</p>
      <p>Worker last seen: {delivery?.health.last_worker_seen_at ? new Date(delivery.health.last_worker_seen_at).toLocaleString() : "No heartbeat"}</p>
      {delivery?.jobs.map((job) => <div key={job.id} className="operator-case"><p>{job.origin_type} / {job.event_type} · {job.related_entity_type} {job.related_entity_id}</p><p>Operation {job.operation_id} · {job.status} · {job.attempt_count} delivery attempts</p>
        <p>Due: {new Date(job.due_at).toLocaleString()}</p>{job.last_error && <p>{job.last_error}</p>}
        {job.attempt_history.length > 0 && <ul className="list-disc pl-5">{job.attempt_history.map((attempt, index) => <li key={`${attempt.started_at}-${index}`}>Attempt {attempt.attempt}: {attempt.outcome ?? "in progress"} at {new Date(attempt.started_at).toLocaleString()}</li>)}</ul>}
        <p>Actor: delivery worker · affected person: notification recipient · impact: notice may remain unseen · recorded outcome: {job.status}</p>
        {job.status === "exhausted" && <button disabled={busy} onClick={() => retryEmail(job.id, job.updated_at)}>Retry email</button>}</div>)}
      {delivery?.jobs.length===0&&<p>No delivery jobs require operator attention.</p>}
    </section>
    <section id="audit" className="operator-panel space-y-2"><div className="operator-panel-head"><span>06 / AUDIT HISTORY</span><h2>Outreach and recorded outcomes</h2><p>Case decisions retain their own audit history. The API does not yet expose one cross-domain audit feed.</p></div>
      <h3 className="font-semibold">Urgent participant outreach</h3>
      <p>Record the participant ID and coded result. Keep phone numbers and message content out of this record.</p>
      <label className="block">Participant ID<input className="w-full rounded border p-2" value={outreachParticipant} onChange={e=>setOutreachParticipant(e.target.value)} /></label>
      <label className="block">Method<select value={outreachMethod} onChange={e=>setOutreachMethod(e.target.value as typeof outreachMethod)}>{["email","phone","in_person","other"].map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="block">Reason<select value={outreachReason} onChange={e=>setOutreachReason(e.target.value)}>{["safety_check","pickup_exception","service_outage","delivery_failure","other_support"].map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="block">Outcome<select value={outreachOutcome} onChange={e=>setOutreachOutcome(e.target.value)}>{["contacted","no_answer","follow_up_required","resolved","escalated"].map(value=><option key={value}>{value}</option>)}</select></label>
      <button disabled={busy||!outreachParticipant.trim()} onClick={recordOutreach}>Record outreach</button>
      {outreach.map(item=><p key={item.id}>{item.participant_id} · {item.method} · {item.reason} · {item.outcome} · {new Date(item.occurred_at).toLocaleString()}</p>)}
    </section>
    <section id="journeys" className="operator-section-heading"><span>03 / JOURNEY & SETTLEMENT</span><h2>Review outcomes</h2><p>Historical fixed-corridor journey and settlement cases remain separate from the new posted-route policy.</p><Link href="/operator/settlement-reviews">Open settlement review queue →</Link></section>
    <JourneyReviewQueue />
    <section id="routes" className="operator-panel space-y-3"><div className="operator-panel-head"><span>02 / ROUTES & INCIDENTS</span><h2>Historical corridor cases</h2><p>These records come from the fixed-corridor pilot. Posted-route incident reads are test-gated; no live route queue is available.</p></div><h3 className="font-semibold">Cancellation review cases</h3>
      {cancellationReviews.length ? cancellationReviews.map(item => <div key={item.id} className="operator-case">
        <p>Case {item.id} · {item.target_type} {item.target_id} · offer {item.offer_id}</p>
        <p>Requested by {item.actor_id} on {new Date(item.created_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST.</p>
        {item.reason && <p>Reason: {item.reason}</p>}
        <p>Status: {item.status}. The ride and seat remain unchanged pending operator resolution.</p><p>Affected: actor {item.actor_id} and seat owner · proposed action: inspect case · deadline: no server deadline supplied · recorded outcome: none.</p>
      </div>) : <p>{readsLoading ? "Loading cancellation reviews…" : readErrors.includes("Cancellation reviews") ? "Cancellation reviews unavailable. Retry reads." : "No open cancellation review cases."}</p>}
    </section>
    <section className="operator-panel"><h2>Departure review signals</h2>{departureSignals.length?departureSignals.map(item=><div className="operator-case" key={`${item.operation_id}:${item.allocation_id}`}><p>Ride {item.offer_id} · seat {item.allocation_id} · {item.signal_type}</p><p>Evidence: operation {item.operation_id} · signalled {new Date(item.created_at).toLocaleString()} · affected passenger: inspect the seat record. No outcome is recorded here.</p></div>):<p>{readsLoading ? "Loading departure reviews…" : readErrors.includes("Departure reviews") ? "Departure reviews unavailable. Retry reads." : "No departure signals require review."}</p>}</section>
    <section id="eligibility" className="operator-panel space-y-3"><div className="operator-panel-head"><span>01 / ELIGIBILITY & RESTRICTIONS</span><h2>Historical student eligibility</h2><p>Existing corridor evidence review is historical policy. New-policy adults and drivers self-declare; this queue does not approve them.</p></div><h3 className="font-semibold">Eligibility revocation</h3>
      <Link href="/operator/restrictions">Open reviewed account restrictions →</Link>
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
        <p>Affected: driver {item.driver_id}; passengers {item.passenger_ids.join(", ")||"none listed"}. Actor: operator. Proposed action: outreach or resolve after cancellation. Impact: holds remain until a recorded outcome. Deadline: no server deadline supplied.</p>
        {!item.resolved_at&&<div className="flex gap-3"><button disabled={busy||reason.trim().length<8}
          onClick={()=>actOnCase("hold",item,"outreach")}>Record participant outreach</button>
          <button disabled={busy||reason.trim().length<8} onClick={()=>actOnCase("hold",item,"resolve","cancelled")}>
            Resolve after cancellation</button></div>}
      </div>):<p>{readsLoading ? "Loading revocation cases…" : readErrors.includes("Revocation cases") ? "Revocation cases unavailable. Retry reads." : "No revocation holds recorded."}</p>}
    </section>
    <section className="space-y-3"><h2 className="font-semibold">High priority active trip incidents</h2>
      {revocationCases.incidents.length?revocationCases.incidents.map(item=><div key={item.id} className="rounded border p-3">
        <p>Incident {item.id} · offer {item.offer_id} · {item.offer_status}</p>
        <p>{item.subject_type} {item.subject_id} · original reason: {item.reason}</p>
        <p>{item.resolved_at?`Resolved: ${item.resolution}`:"Open: coordinate support with confirmed participants."}</p>
        <p>Affected: driver {item.driver_id}; passengers {item.passenger_ids.join(", ")||"none listed"}. Actor: operator. Proposed action: outreach or reviewed resolution. Impact: active-trip outcome may change. Deadline: urgent; no timestamp supplied.</p>
        <p><Link className="underline" href={`/operator/restrictions?source_type=incident&source_id=${item.id}&target=${item.subject_id}`}>
          Review an account restriction from this incident</Link></p>
        {!item.resolved_at&&<div className="flex gap-3"><button disabled={busy||reason.trim().length<8}
          onClick={()=>actOnCase("incident",item,"outreach")}>Record participant outreach</button>
          <button disabled={busy||reason.trim().length<8} onClick={()=>actOnCase("incident",item,"resolve","safe_completion")}>
            Close safety case</button>
          <button disabled={busy||reason.trim().length<8} onClick={()=>actOnCase("incident",item,"resolve","interrupted")}>
            Record interruption</button></div>}
      </div>):<p>{readsLoading ? "Loading revocation incidents…" : readErrors.includes("Revocation cases") ? "Revocation incidents unavailable. Retry reads." : "No revocation incidents recorded."}</p>}
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Student reviews</h2>
      <p>{evidenceMode === "real" ? "Inspect the private enrollment and age evidence before deciding." : "Inspect fabricated evidence only. Real evidence intake remains closed pending provider verification."}</p>
      <p role="status">Evidence deletion: {evidenceRetention?.overdue_count ?? "—"} overdue · {evidenceRetention?.failed_count ?? "—"} failed attempts{evidenceRetention?.oldest_due_at ? ` · oldest due ${new Date(evidenceRetention.oldest_due_at).toLocaleString()}` : ""}.</p>
      {studentReviews.length ? studentReviews.map((review) => <div key={review.user_id} className="rounded border p-3">
        <p>{review.enrolled_name ?? "Name missing"} · {review.institution_name} · graduation {review.graduation_year} · {review.evidence_category} · {review.age_evidence_category}</p>
        <p>State: awaiting historical student review · affected person: {review.user_id} · evidence: enrollment and age records. Proposed action: approve or reject after inspection. Impact: historical corridor eligibility only. Actor: operator · deadline: no server deadline supplied · outcome: none recorded.</p>
        <div className="flex gap-3"><button className="underline" onClick={() => openEvidence(review.user_id, "enrollment")}>Enrollment evidence</button><button className="underline" onClick={() => openEvidence(review.user_id, "age")}>Age evidence</button></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={adultFindings[review.user_id] === true} onChange={(event) => setAdultFindings((findings) => ({ ...findings, [review.user_id]: event.target.checked }))} />Age evidence confirms this student is at least 18</label>
        <div className="flex gap-3"><button disabled={busy || adultFindings[review.user_id] !== true} onClick={() => reviewStudent(review.user_id, "verified")}>Approve adult student</button><button disabled={busy} onClick={() => reviewStudent(review.user_id, "rejected")}>Reject</button></div>
      </div>) : <p>{readsLoading ? "Loading student reviews…" : readErrors.includes("Historical student reviews") ? "Historical student reviews unavailable. Retry reads." : "No pending student reviews."}</p>}
    </section>
  </main>;
}
