"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {apiRequest} from "@/lib/api/client";
import {useCurrentUser} from "@/hooks/auth/useCurrentUser";
import {StatusTag} from "@/components/ProductStates";
import JourneyStateGuide from "@/components/JourneyStateGuide";
import {formatPaiseAmount} from "@/lib/formatPaiseAmount";

type Trip={id:string;driver_id:string;passenger_id:string;departure_at:string;status:string;trip_state:string;
  contribution_paise:number;currency:string;origin_code:string;destination_code:string;boarded:boolean|null;
  driver_recorded_at:string|null;passenger_recorded_at:string|null;obligation_paise:number|null;
  obligation_due_at:string|null;journey_review_reason:string|null};
type Review={id:string;allocation_id:string;reason:string;status:string;outcome:string|null;contribution_owed:boolean|null};
const guide={
  accepted:["Accepted commitment","One seat was allocated and its terms frozen.","Check the recorded departure; nobody has travelled yet.","Driver and passenger","Before departure"],
  held:["Commitment on hold","A restriction or safety concern paused the commitment; the seat is not silently released.","Wait for a recorded operator decision or cancellation.","Operator and participant","Before departure"],
  departure:["Departure and boarding","The driver records departure and each passenger's boarding separately.","Check the boarding record. A missed departure time does not start a trip.","Driver records; passenger reviews","At departure; delay after 30 minutes needs explicit resolution"],
  cancelled:["Cancellation","A recorded cancellation releases a predeparture seat. Interruption after start needs review.","Read the cancellation; a replacement requires a new request.","Participant or operator","Before departure for ordinary cancellation"],
  incident:["Incident","An interruption or safety report opens an operator case.","Follow the recorded case; elapsed time cannot decide travel.","Operator","As soon as safely possible"],
  driver:["Driver journey statement","The driver reports travel and completion for each passenger.","Passenger makes an independent statement. Driver claim alone creates no debt.","Passenger","Within 24 hours of driver statement"],
  passenger:["Passenger journey statement","The passenger independently reports travel and completion.","Compare both statements before any contribution is established.","Passenger, then server","Within 24 hours of driver statement"],
  agreement:["Agreement","Both people affirm completed travel.","Open Contributions for the separate obligation and due time.","Passenger pays driver directly","Within 24 hours of mutual confirmation"],
  disagreement:["Disagreement","The two journey accounts differ. No automatic debt is created.","Wait for an evidence-based operator decision.","Operator","When review is decided"],
  silence:["Silence leads to review","The passenger has not confirmed the driver's account after 24 hours.","Do not infer travel or debt from elapsed time.","Operator","Review opens after 24 hours"],
  outcome:["Operator outcome","An operator records whether contribution is owed or evidence is insufficient.","Read the decision reason; payment still requires separate evidence.","Participant named by decision","At the recorded obligation due time, if any"],
  unknown:["Unknown operation result","A response was lost; the action may have committed.","Look up the owner-scoped operation before retrying with the same key and payload.","Original actor","Before any dependent action"],
} as const;
type GuideState=keyof typeof guide;
const date=(value:string)=>new Date(value).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"});
export default function TripsPage(){
  const {isAuthenticated,loading,user}=useCurrentUser();const router=useRouter();
  const [trips,setTrips]=useState<Trip[]>([]),[reviews,setReviews]=useState<Review[]>([]);
  const [phase,setPhase]=useState<"loading"|"ready"|"error"|"restricted">("loading");
  const [error,setError]=useState(""),[selected,setSelected]=useState<GuideState>("accepted");
  const refresh=useCallback(async()=>{setPhase("loading");try{
    const [recent,cases]=await Promise.all([apiRequest<{bookings:Trip[]}>("/v1/seat-requests/confirmed"),
      apiRequest<{cases:Review[]}>("/v1/seat-requests/journey-reviews")]);
    setTrips(recent.bookings);setReviews(cases.cases);setError("");setPhase("ready");
  }catch(e){const message=e instanceof Error?e.message:"Unable to load records";setError(message);
    setPhase(/restricted|forbidden|unauthorized/i.test(message)?"restricted":"error");}},[]);
  useEffect(()=>{if(!loading&&!isAuthenticated)router.replace("/login");},[loading,isAuthenticated,router]);
  useEffect(()=>{if(isAuthenticated)void refresh();},[isAuthenticated,refresh]);
  const upcoming=trips.filter(t=>t.status!=="cancelled"&&t.trip_state!=="cancelled"&&!t.driver_recorded_at&&!t.passenger_recorded_at);
  const past=trips.filter(t=>!upcoming.includes(t));
  return <main id="main-content" className="journey-page">
    <header className="journey-head"><div><span className="journey-kicker">JOURNEYS / PARTICIPANT</span><h1>Trips</h1><p>Follow commitments and each person&apos;s account of a journey. Time alone never proves travel.</p></div><StatusTag tone="restricted">Real bookings disabled</StatusTag></header>
    <div className="journey-alert"><strong>Current availability</strong><p>New route bookings are closed. The cards below are read-only historical fixed-corridor records. The journey guide is synthetic and sends no action.</p><Link href="/direct-settlements">Open Contributions →</Link></div>
    <section className="journey-section" aria-labelledby="recent-title"><div className="journey-section-head"><div><span>OWNER-SCOPED HISTORICAL READ</span><h2 id="recent-title">Recorded commitments</h2></div><button type="button" onClick={()=>void refresh()} disabled={phase==="loading"}>Retry read</button></div>
      {phase==="loading"&&<p role="status" className="journey-message">Loading recent historical commitments and reviews…</p>}
      {(phase==="error"||phase==="restricted")&&<div role="alert" className="journey-message"><strong>{phase==="restricted"?"Access restricted":"Could not load records"}</strong><p>{error}</p><p>Retry the read. No trip action was submitted.</p></div>}
      {phase==="ready"&&<><p className="journey-help">This legacy read covers recent confirmed records only. Older records may not appear. A missing card does not mean travel happened or a trip was cancelled.</p>
        <div className="journey-columns"><div><h3>Upcoming or unresolved <small>{upcoming.length}</small></h3>{upcoming.length?upcoming.map(t=><TripCard key={t.id} trip={t} review={reviews.find(r=>r.allocation_id===t.id)} userId={user?.id??""}/>):<p className="journey-empty">No recent upcoming commitment is recorded.</p>}</div><div><h3>Past or cancelled <small>{past.length}</small></h3>{past.length?past.map(t=><TripCard key={t.id} trip={t} review={reviews.find(r=>r.allocation_id===t.id)} userId={user?.id??""}/>):<p className="journey-empty">No recent past commitment is in this limited read.</p>}</div></div>
        {reviews.length>0&&<div className="journey-reviews"><h3>Journey reviews</h3>{reviews.map(r=><article key={r.id}><strong>{r.status==="resolved"?"Operator outcome recorded":"Operator review open"}</strong><p>{r.reason.replaceAll("_"," ")} · {r.outcome??"No outcome yet"} · {r.contribution_owed===null?"Contribution undecided":r.contribution_owed?"Contribution owed":"No contribution owed"}</p><Link href={"/journey-reviews/"+r.id}>Read case and reason →</Link></article>)}</div>}
      </>}
    </section>
    <JourneyStateGuide id="guide-title" title="See what happens next"
      description="Choose a state to inspect actor and deadline. These are examples, not your trip status."
      selectLabel="Journey state" states={guide} selected={selected}
      onSelect={key=>setSelected(key as GuideState)}
      link={{href:"/direct-settlements",label:"View Contributions →"}}/>
    <footer className="journey-foot"><Link href="/payments">Historical platform-payment records →</Link><p>Prior platform-payment records are read-only history. Petrol Partner does not collect or transfer new contributions.</p></footer>
  </main>;
}
function TripCard({trip,review,userId}:{trip:Trip;review?:Review;userId:string}){
  const statement=trip.driver_recorded_at&&trip.passenger_recorded_at?"Both statements recorded":trip.driver_recorded_at?"Driver statement recorded; passenger response needed":trip.passenger_recorded_at?"Passenger statement recorded; driver account needed":"No journey statements recorded";
  const next=nextTripStep(trip,review);
  return <article className="journey-record">
    <div className="journey-record-top"><span>HISTORICAL FIXED CORRIDOR · {trip.driver_id===userId?"DRIVER":"PASSENGER"}</span><StatusTag tone={trip.status==="cancelled"||trip.trip_state==="cancelled"?"restricted":trip.status==="held"||trip.trip_state==="held"?"caution":"neutral"}>{trip.status==="cancelled"?"seat cancelled":trip.trip_state.replaceAll("_"," ")}</StatusTag></div>
    <h4>{trip.origin_code} → {trip.destination_code}</h4><p>Scheduled {date(trip.departure_at)}</p>
    <p>Frozen terms: {formatPaiseAmount(trip.contribution_paise,trip.currency)}</p>
    <p>Boarding: {trip.boarded===null?"not recorded":trip.boarded?"recorded boarded":"recorded not boarded"} · {statement}</p>
    <p><strong>Next:</strong> {next.action}</p>
    <p><strong>Actor:</strong> {next.actor} · <strong>By:</strong> {next.deadline}</p>
    {review&&<Link href={"/journey-reviews/"+review.id}>Read journey review →</Link>}
    <Link href="/direct-settlements">Check contribution record →</Link>
  </article>;
}
const ist=(value:string|number)=>new Date(value).toLocaleString("en-IN",{
  dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"})+" IST";
function nextTripStep(trip:Trip,review?:Review){
  if(trip.status==="cancelled"||trip.trip_state==="cancelled") return {action:"Read recorded cancellation",actor:"No action due",deadline:"Cancellation recorded"};
  if(trip.status==="held"||trip.trip_state==="held") return {action:"Operator review before departure",actor:"Operator",deadline:ist(trip.departure_at)};
  if(trip.obligation_paise!==null) return {action:"Open Contributions for the separate obligation",actor:"Passenger",
    deadline:trip.obligation_due_at?ist(trip.obligation_due_at):"Due time unavailable in this record"};
  if(review?.status==="resolved") return {action:"Read the recorded operator decision",actor:"No action due",deadline:"Decision recorded"};
  if(trip.journey_review_reason) return {action:review?"Operator reviews journey evidence":"Check journey review",actor:"Operator",deadline:"When the case is decided"};
  if(trip.driver_recorded_at&&!trip.passenger_recorded_at) return {action:"Passenger reports their own outcome",actor:"Passenger",
    deadline:ist(Date.parse(trip.driver_recorded_at)+24*60*60*1000)};
  if(trip.passenger_recorded_at&&!trip.driver_recorded_at) return {action:"Driver records the journey outcome",actor:"Driver",deadline:"No recorded deadline"};
  if(trip.trip_state==="departed") return {action:"Driver records the journey outcome",actor:"Driver",deadline:"No recorded deadline"};
  if(trip.trip_state==="delayed") return {action:"Resolve the delayed departure explicitly",actor:"Driver or operator",deadline:"No automatic trip outcome"};
  if(trip.trip_state==="scheduled") return {action:"Driver records departure and boarding",actor:"Driver",
    deadline:ist(Date.parse(trip.departure_at)+30*60*1000)};
  return {action:"Check the recorded trip state",actor:"Participant",deadline:"No recorded deadline"};
}
