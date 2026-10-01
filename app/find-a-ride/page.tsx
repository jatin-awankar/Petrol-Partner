"use client";

import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {StatePanel,StatusTag} from "@/components/ProductStates";

type Step = "discovery"|"detail"|"points"|"quote"|"request";
const steps:Step[]=["discovery","detail","points","quote","request"];
const titles:Record<Step,string>={discovery:"Find",detail:"Route detail",points:"Your points",quote:"Server quote",request:"One-seat request"};
const sampleStops=["Sample origin","Sample midpoint","Sample destination"];
const sampleSegments={"0-1":{distance:"2 km",total:"₹10"},"0-2":{distance:"4 km",total:"₹20"},"1-2":{distance:"2 km",total:"₹10"}} as const;
const requestOutcomes={
  Pending:"A pending request awaits the driver's decision; your seat is not confirmed. Wait for the recorded result.",
  Accepted:"The driver accepted this sample request. A real confirmed seat would appear only after an acknowledged server decision.",
  Rejected:"The driver rejected this sample request. No seat is reserved; choose another route when discovery opens.",
  Expired:"The response deadline passed in this sample. No seat is reserved; refresh the route before trying again.",
  Withdrawn:"The passenger withdrew this sample request. No seat is reserved; review current terms before another request.",
  Cancelled:"This sample booking was cancelled. No active seat remains; check the recorded cancellation details.",
  Held:"Travel is paused in this sample. Follow the recorded next action before making plans.",
  "Result unknown":"The response was lost in this sample. Look up the recorded operation before retrying with the same key; do not assume success.",
} as const;
type RequestOutcome=keyof typeof requestOutcomes;

export default function FindRidePage(){
  const [step,setStep]=useState<Step>("discovery");
  const [pickup,setPickup]=useState(0);
  const [dropoff,setDropoff]=useState(2);
  const [sampleQuote,setSampleQuote]=useState(false);
  const [quoteBlock,setQuoteBlock]=useState<"stale"|"restricted"|null>(null);
  const [sampleRequest,setSampleRequest]=useState(false);
  const [requestOutcome,setRequestOutcome]=useState<RequestOutcome>("Pending");
  const [discoveryPreview,setDiscoveryPreview]=useState<"loading"|"matching"|"failed"|null>(null);
  const stageHeading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(step!=="discovery")stageHeading.current?.focus();},[step]);
  const sample=step!=="discovery";
  const ordered=pickup<dropoff;
  const sampleTerms=sampleSegments[`${pickup}-${dropoff}` as keyof typeof sampleSegments];
  return <main className="find-page">
    <header className="find-heading">
      <div><span className="find-eyebrow">DISCOVER / PRELAUNCH</span><h1>Find a ride</h1><p>When route sharing opens, choose a driver-posted route, then request one seat for yourself.</p></div>
      <StatusTag tone="restricted">Real bookings disabled</StatusTag>
    </header>
    <nav className="find-steps" aria-label="Find and request stages">{steps.map((item,index)=><span key={item} aria-current={step===item?"step":undefined}><b>{String(index+1).padStart(2,"0")}</b>{titles[item]}</span>)}</nav>
    {!sample?<div className="find-layout">
      <StatePanel title="No public routes to browse" tone="restricted" action={<button className="product-action-button" onClick={()=>setStep("detail")}>Explore synthetic example</button>}>
        Public discovery is not open. A driver&apos;s prepared route stays private. No live offers or bookings appear here.
      </StatePanel>
      <aside className="find-side"><h2>What happens later</h2><ol><li>Browse routes a driver has actually published.</li><li>Choose ordered pickup and drop-off points on the saved route.</li><li>Review a fresh server quote before asking for one seat.</li><li>Wait for the driver to accept; pending is not confirmed.</li></ol></aside>
    </div>:<div className="find-layout">
      <section className="find-example" aria-label="Synthetic passenger example">
        <span className="find-example-label">Synthetic example · not a published ride</span>
        <div className="find-actions"><button className="product-action-button" onClick={()=>setDiscoveryPreview("loading")}>Preview discovery loading</button><button className="product-action-button" onClick={()=>setDiscoveryPreview("matching")}>Preview matching routes</button><button className="product-action-button" onClick={()=>setDiscoveryPreview("failed")}>Preview discovery failure</button></div>
        {discoveryPreview==="loading"&&<StatePanel title="Loading routes · sample" tone="restricted">A future passenger view would wait for the server before showing published routes. This preview does not fetch real routes.</StatePanel>}
        {discoveryPreview==="matching"&&<StatePanel title="One matching route · sample" tone="restricted">Route version 1 · sample. This fixture represents a published route in a future passenger view; no route is publicly discoverable now.</StatePanel>}
        {discoveryPreview==="failed"&&<StatePanel title="Discovery failed · sample" tone="restricted" action={<button className="product-action-button" onClick={()=>setDiscoveryPreview("matching")}>Retry sample discovery</button>}>The route read failed. Retry discovery before selecting a route; no booking action is available.</StatePanel>}
        {step==="detail"&&<><h2 ref={stageHeading} tabIndex={-1}>See the route before choosing a place</h2><p className="find-lede">This sample has three ordered stops. The actual passenger view will use a published, server-owned route.</p><div className="find-route"><div><b>Sample origin</b><span>Driver starts</span></div><div><b>Sample midpoint</b><span>On the same route</span></div><div><b>Sample destination</b><span>Driver ends</span></div></div><p className="find-meta">Route version 1 · Sample geometry only</p><button className="product-action-button" onClick={()=>setStep("points")}>Choose pickup and drop-off</button></>}
        {step==="points"&&<><h2 ref={stageHeading} tabIndex={-1}>Choose points in travel order</h2><p className="find-lede">Pickup must come before drop-off. Both places must be safe and on the driver&apos;s saved route; the server makes the final check.</p><div className="find-fields"><label>Pickup<select value={pickup} onChange={event=>setPickup(Number(event.target.value))}>{sampleStops.map((stop,index)=><option key={stop} value={index}>{stop}</option>)}</select></label><label>Drop-off<select value={dropoff} onChange={event=>setDropoff(Number(event.target.value))}>{sampleStops.map((stop,index)=><option key={stop} value={index}>{stop}</option>)}</select></label></div>{!ordered&&<p role="alert" className="find-alert">Choose a drop-off after your pickup.</p>}<div className="find-actions"><button className="product-action-button" onClick={()=>setStep("detail")}>Back to route</button><button className="product-action-button" disabled={!ordered} onClick={()=>setStep("quote")}>See quote state</button></div></>}
        {step==="quote"&&<><h2 ref={stageHeading} tabIndex={-1}>{sampleQuote?"Sample quoted terms":"A server quote is unavailable"}</h2><p className="find-lede">The sample points are {sampleStops[pickup]} → {sampleStops[dropoff]}. {sampleQuote?"These illustrative terms are a fixed fixture, not a server quote or an offer.":"A valid quote must come from the server for this saved route version and segment. No amount can be calculated or accepted here."}</p><div className="find-terms"><span>Route version <b>1 · sample</b></span><span>Segment distance <b>{sampleQuote&&!quoteBlock?`${sampleTerms.distance} · sample segment`:"Awaiting server verification"}</b></span><span>Category rate <b>{sampleQuote&&!quoteBlock?"Bike · ₹5/km · sample only":"Awaiting server quote"}</b></span><span>Total and currency <b>{sampleQuote&&!quoteBlock?`${sampleTerms.total} · INR · sample only`:"Unavailable"}</b></span><span>Additional charges <b>None proposed</b></span></div>{quoteBlock==="stale"&&<StatePanel title="Quote expired · sample" tone="restricted">This illustrative quote is stale. Refresh the route and obtain a new server quote before any real request.</StatePanel>}{quoteBlock==="restricted"&&<StatePanel title="Request restricted · sample" tone="restricted">An account restriction or missing adult declaration blocks a request. Resolve eligibility before requesting a seat.</StatePanel>}<p className="find-meta">A stale, reversed, off-route, unsafe, or unverifiable selection needs new points or a fresh quote.</p><div className="find-actions"><button className="product-action-button" onClick={()=>{setSampleQuote(false);setQuoteBlock(null);setSampleRequest(false);setStep("points");}}>Change points</button><button className="product-action-button" onClick={()=>{setSampleQuote(true);setQuoteBlock(null);}}>Preview sample quote</button><button className="product-action-button" onClick={()=>setQuoteBlock("stale")}>Preview stale quote</button><button className="product-action-button" onClick={()=>setQuoteBlock("restricted")}>Preview account restriction</button>{!quoteBlock&&<button className="product-action-button" onClick={()=>setStep("request")}>{sampleQuote?"Review one-seat request":"See request state"}</button>}</div></>}
        {step==="request"&&<><h2 ref={stageHeading} tabIndex={-1}>One seat for yourself</h2><p className="find-lede">A passenger would confirm the server-quoted route, selected points, distance, currency, and contribution. The request would be pending until the driver accepts.</p>{sampleQuote&&<p>One passenger · {sampleStops[pickup]} → {sampleStops[dropoff]} · {sampleTerms.distance} · {sampleTerms.total} INR · sample only</p>}{sampleRequest?<><label className="find-preview-field">Preview request outcome<select value={requestOutcome} onChange={event=>setRequestOutcome(event.target.value as RequestOutcome)}>{Object.keys(requestOutcomes).map(outcome=><option key={outcome} value={outcome}>{outcome}</option>)}</select></label><StatePanel title={`${requestOutcome} · sample`} tone="restricted">No real request was sent. {requestOutcomes[requestOutcome]}</StatePanel></>:<StatePanel title="No request was sent" tone="restricted">Real requests are disabled. This example has no server quote or recorded operation. It does not reserve a seat.</StatePanel>}<div className="find-actions">{sampleQuote&&!sampleRequest&&<button className="product-action-button" onClick={()=>{setRequestOutcome("Pending");setSampleRequest(true);}}>Preview pending request</button>}<button className="product-action-button" onClick={()=>setStep("quote")}>Back to quote state</button></div></>}
      </section>
      <aside className="find-side"><h2>Request status guide</h2><dl><dt>Pending</dt><dd>Driver decides before the deadline. Your seat is not confirmed.</dd><dt>Accepted</dt><dd>A confirmed seat appears only after an acknowledged server decision.</dd><dt>Rejected / expired / withdrawn / cancelled</dt><dd>No active seat. Check the recorded status before trying again.</dd><dt>Held</dt><dd>Travel is paused; follow the recorded next action.</dd><dt>Result unknown</dt><dd>Look up the operation before retrying with the same key. Never assume success from a lost response.</dd></dl><Link href="/dashboard">Back to Home</Link></aside>
    </div>}
    <section className="find-availability" aria-label="Availability and recovery states"><h2>When this opens</h2><div><article><h3>Loading and empty</h3><p>Wait for discovery. An empty result means no published route matches; broaden the search later.</p></article><article><h3>Invalid or restricted</h3><p>Correct point order or choose safe on-route places. An account restriction or missing adult declaration blocks a request.</p></article><article><h3>Expired or failed</h3><p>Refresh a stale route or quote. If the service fails, retry the read; never reuse an old amount.</p></article><article><h3>Uncertain result</h3><p>After a lost request response, check the recorded operation and request status before any retry.</p></article></div></section>
  </main>;
}
