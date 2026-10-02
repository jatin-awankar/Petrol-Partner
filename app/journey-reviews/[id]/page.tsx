"use client";
import {useCallback,useEffect,useState} from "react";
import {useParams} from "next/navigation";
import Link from "next/link";
import {apiRequest} from "@/lib/api/client";
import {StatusTag} from "@/components/ProductStates";
import {formatPaiseAmount} from "@/lib/formatPaiseAmount";
type Detail={case:{id:string;offer_id:string;review_reason:string;status:string;
  frozen_paise:number;currency:string;driver_travelled:boolean|null;driver_completed:boolean|null;
  passenger_travelled:boolean|null;passenger_completed:boolean|null;obligation_paise:number|null;
  obligation_due_at:string|null};decisions:{id:string;outcome:string;contribution_owed:boolean|null;
  reason:string;decided_at:string}[]};
const statement=(travelled:boolean|null,completed:boolean|null)=>travelled===null?"No statement recorded":
  travelled?completed?"Says travelled and completed":"Says travelled but not completed":"Says did not travel";
export default function JourneyReviewDetail(){
  const {id}=useParams<{id:string}>();
  const [detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState("");
  const [phase,setPhase]=useState<"loading"|"ready"|"error"|"restricted">("loading");
  const refresh=useCallback(async()=>{if(!id)return;setPhase("loading");
    try{const result=await apiRequest<Detail>("/v1/seat-requests/journey-reviews/"+id);
      setDetail(result);setError("");setPhase("ready");
    }catch(e){const message=e instanceof Error?e.message:"Unable to load review";
      setError(message);setPhase(/restricted|forbidden|unauthorized/i.test(message)?"restricted":"error");}},[id]);
  useEffect(()=>{void refresh();},[refresh]);
  return <main id="main-content" className="journey-page">
    <header className="journey-head"><div><span className="journey-kicker">HISTORICAL FIXED CORRIDOR / REVIEW</span><h1>Journey review</h1><p>Each person&apos;s statement and the operator outcome remain separate records.</p></div><Link href="/trips">← Back to Trips</Link></header>
    <div className="journey-section-head"><div><span>OWNER-SCOPED CASE READ</span><h2>Recorded outcome</h2></div><button type="button" onClick={()=>void refresh()} disabled={phase==="loading"}>Retry read</button></div>
    {phase==="loading"&&<p role="status" className="journey-message">Loading journey review…</p>}
    {(phase==="error"||phase==="restricted")&&<div role="alert" className="journey-message"><strong>{phase==="restricted"?"Access restricted":"Could not load review"}</strong><p>{error}</p><p>Retry the read. No decision has been submitted.</p></div>}
    {phase==="ready"&&detail&&<div className="journey-review-layout">
      <section className="journey-record"><div className="journey-record-top"><span>CASE / {detail.case.offer_id}</span><StatusTag tone={detail.case.status==="resolved"?"good":"caution"}>{detail.case.status}</StatusTag></div>
        <h2>What each person said</h2><p>Review reason: {detail.case.review_reason.replaceAll("_"," ")}</p>
        <p><strong>Driver:</strong> {statement(detail.case.driver_travelled,detail.case.driver_completed)}</p>
        <p><strong>Passenger:</strong> {statement(detail.case.passenger_travelled,detail.case.passenger_completed)}</p>
        <p>Frozen terms: {formatPaiseAmount(detail.case.frozen_paise,detail.case.currency)}. This is not a payment receipt.</p>
      </section>
      <section className="journey-record"><h2>Operator decision</h2>
        {detail.decisions.length?detail.decisions.map(d=><article key={d.id}><strong>{d.outcome.replaceAll("_"," ")}</strong><p>Contribution {d.contribution_owed===null?"undetermined":d.contribution_owed?"owed":"not owed"} · {d.reason}</p><p>Recorded {new Date(d.decided_at).toLocaleString("en-IN")}</p></article>):<p>No operator decision is recorded. Silence or elapsed time does not establish travel or debt.</p>}
        <p>{detail.case.obligation_paise===null?"No contribution obligation is recorded.":<>Contribution obligation: {formatPaiseAmount(detail.case.obligation_paise,detail.case.currency)}, due {detail.case.obligation_due_at?new Date(detail.case.obligation_due_at).toLocaleString("en-IN"):"at the recorded deadline"}. Receipt remains separate.</>}</p>
        <p><strong>Next actor:</strong> {detail.case.status==="resolved"?detail.case.obligation_paise===null?"No payment action due":"Passenger and driver check Contributions":"Operator"} · <strong>By:</strong> {detail.case.obligation_due_at?new Date(detail.case.obligation_due_at).toLocaleString("en-IN"):"recorded case decision"}</p>
        <Link href="/direct-settlements">Open Contributions →</Link>
      </section>
    </div>}
  </main>;
}
