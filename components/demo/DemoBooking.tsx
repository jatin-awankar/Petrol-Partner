"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "./DemoProvider";
import { demoFixture, quoteDemoSegment, demoAmount, formatDemoTime, REQUEST_DEADLINE, DECISION_DEADLINE } from "@/lib/demo/session";
import styles from "@/app/demo/demo.module.css";

type Screen = "find" | "route" | "offer" | "request" | "trip";
const requestPath = "/demo/requests/sample-request-01";
const tripPath = "/demo/trips/sample-trip-01";

export function DemoBooking({ screen }: { screen: Screen }) {
  const { state, dispatch } = useDemo();
  const router = useRouter();
  const [pickup, setPickup] = useState(0);
  const [dropoff, setDropoff] = useState(2);
  const [error, setError] = useState("");
  const route = demoFixture.route;
  const request = state.request;
  const quote = quoteDemoSegment(pickup, dropoff);
  const remaining = route.capacity - state.occupiedSeats - (state.allocation ? 1 : 0);
  const switchRole = () => { dispatch({ type: "choose-role", role: state.role === "driver" ? "passenger" : "driver" }); setError(""); };
  if (!state.role) return <section className={styles.scope}><h1>Choose your perspective.</h1><p>Start a sample session before exploring this route.</p><Link className={styles.primary} href="/demo">Choose a role</Link></section>;
  const titles: Record<Screen, string> = { find: "A seat along your way.", route: "Choose your stretch.", offer: "Your route. Your decision.", request: request ? { pending: "Requested. Not confirmed.", accepted: "A seat is yours.", rejected: "This request was declined.", expired: "The decision window closed." }[request.status] : "No request yet.", trip: state.allocation ? "Your sample commitment." : "No confirmed seat yet." };
  const terms = screen === "trip" ? state.allocation?.terms : request?.terms;
  return <>
    <div className={styles.intro}><div><p className={styles.eyebrow}>SAMPLE JOURNEY / {state.role.toUpperCase()}</p><h1>{titles[screen]}</h1></div><div><p>You’re {demoFixture[state.role].name}. Both perspectives share this tab’s fictional journey.</p><button className={styles.secondary} onClick={switchRole}>Switch to {state.role === "driver" ? "passenger" : "driver"}</button></div></div>
    <div className={styles.homeGrid}>
      <section className={styles.routeTicket} aria-label="Sample route and terms">
        <div className={styles.cardTop}><span>ROUTE / 001</span><span>SIMULATED · NOT A LIVE OFFER</span></div>
        <h2>Market Square<br /><em>to Garden Gate.</em></h2>
        <ol className={styles.stops}>{route.stops.map((stop, index) => <li key={stop}><span aria-hidden="true">0{index + 1}</span><div><small>{index === 0 ? "FROM" : index === 2 ? "TO" : "VIA"}</small><strong>{stop}</strong></div></li>)}</ol>
        <dl className={styles.facts}><div><dt>Departure</dt><dd>{formatDemoTime(route.departureMinute)}</dd></div><div><dt>Available whole-ride seats</dt><dd>{remaining} of {route.capacity} · {state.occupiedSeats} other sample passengers</dd></div><div><dt>Vehicle & driver</dt><dd>Sample car · Arjun</dd></div><div><dt>Sample clock</dt><dd>{formatDemoTime(state.minute)}</dd></div></dl>
        <p className={styles.caption}>Preset stop distances illustrate the route. No map service, verified geometry or real availability is involved.</p>
      </section>
      <section className={styles.side} aria-label="Next action">
        {screen === "find" && <div className={styles.clock}><p className={styles.eyebrow}>ONE CURATED SAMPLE</p><h2>Take a closer look.</h2><p>Choose two stops in route order. Pending requests reserve no seat; the driver decides before departure.</p><Link className={styles.primary} href="/demo/routes/sample-route-01">Select this sample route</Link></div>}
        {screen === "route" && <div className={styles.clock}><p className={styles.eyebrow}>YOUR STOPS / NO DETOUR</p><h2>A simple contribution.</h2>
          {request ? <><p>You already have a {request.status} request in this scenario. Its selected terms stay unchanged.</p><Link className={styles.primary} href={requestPath}>View your request</Link></> : <>
            <div className={styles.fields}><label>Pickup<select value={pickup} onChange={e => setPickup(Number(e.target.value))}>{route.stops.map((stop, i) => <option key={stop} value={i}>{stop}</option>)}</select></label><label>Drop-off<select value={dropoff} onChange={e => setDropoff(Number(e.target.value))}>{route.stops.map((stop, i) => <option key={stop} value={i}>{stop}</option>)}</select></label></div>
            {quote ? <div className={styles.quote} aria-live="polite"><span>SIMULATED QUOTE</span><strong>{demoAmount(quote.paise)}</strong><p>{quote.metres / 1000} km × ₹7/km · rounded to {quote.paise} paise, INR. No added fees.</p><p>For one seat, for Mira. No money is owed by requesting or accepting.</p></div> : <p role="alert">Choose a drop-off after your pickup on this route.</p>}
            <p>Requests close at {formatDemoTime(REQUEST_DEADLINE)}. {state.minute >= REQUEST_DEADLINE ? "This sample’s request window has closed. Reset the demo to start again." : "Arjun must accept before your seat is confirmed."}</p>
            {state.role === "passenger" ? <button className={styles.primary} disabled={!quote || state.minute >= REQUEST_DEADLINE} onClick={() => { if (dispatch({ type: "request-seat", pickup, dropoff })) router.push(requestPath); else setError("The request could not be created. Check the stops and sample clock."); }}>Request one sample seat</button> : <p>Switch to passenger to request Mira’s seat.</p>}
          </>}
        </div>}
        {screen === "offer" && <div className={styles.clock}><p className={styles.eyebrow}>INCOMING / MIRA</p><h2>{request ? "One request to inspect." : "No requests yet."}</h2><p>{request ? `Mira’s request is ${request.status}. Pending requests use no capacity.` : "Switch to passenger and select this route to create a request."}</p><Link className={styles.primary} href={request ? requestPath : "/demo/find"}>{request ? "Review sample request" : "Explore the sample route"}</Link></div>}
        {(screen === "request" || screen === "trip") && <div className={styles.clock}>
          <p className={styles.eyebrow}>{screen === "trip" && state.allocation ? "ACCEPTED TERMS / FROZEN" : "ONE PASSENGER / ONE SEAT"}</p>
          {terms ? <><h2>{demoAmount(terms.paise)}</h2><p>{route.stops[terms.pickup]} → {route.stops[terms.dropoff]}</p><p>{terms.metres / 1000} km · {terms.paise} paise INR · ₹7/km · no added fees.</p><p className={styles.caption}>Route version {terms.routeVersion} · policy {terms.policy}. {state.allocation ? "These accepted terms stay fixed when the clock or perspective changes." : request?.status === "pending" ? "These requested terms will be frozen on acceptance." : "Original requested terms, kept for this sample record."}</p></> : <p>Create a request, then have Arjun accept it to see a commitment.</p>}
          {request?.status === "pending" && <><p>Pending is not confirmed. Arjun acts next, before {formatDemoTime(DECISION_DEADLINE)}.</p>{state.role === "driver" ? <><div className={styles.actions}><button className={styles.primary} disabled={remaining === 0} onClick={() => { if (!dispatch({ type: "decide-request", decision: "accepted" })) setError("Acceptance unavailable. Check capacity and the decision deadline."); }}>Accept sample request</button><button className={styles.secondary} onClick={() => { if (!dispatch({ type: "decide-request", decision: "rejected" })) setError("This request can no longer be decided."); }}>Decline sample request</button></div>{remaining === 0 && <p role="status">This sample car is full. Acceptance cannot allocate another seat; you can decline.</p>}</> : <button className={styles.primary} onClick={switchRole}>Continue as driver</button>}</>}
          {request?.status === "accepted" && <><p>Accepted: one whole-ride seat reserved for Mira. No travel or payment has been recorded.</p>{screen !== "trip" && <Link className={styles.primary} href={tripPath}>View sample trip</Link>}{screen === "trip" && <p>Journey confirmation and contributions are the next stage of this demo. Acceptance alone creates no debt.</p>}</>}
          {(request?.status === "rejected" || request?.status === "expired") && <p>No seat was allocated and no money is owed. Reset this demo to try a new scenario.</p>}
          {!request && <Link className={styles.primary} href="/demo/find">Find the sample route</Link>}
        </div>}
        {error && <p role="alert">{error}</p>}
        {!request && <div className={styles.next}><h2>Try a different outcome.</h2><label className={styles.scenario}><input type="checkbox" checked={state.occupiedSeats === 3} onChange={e => dispatch({ type: "set-scenario", full: e.target.checked })} />Start with a full car</label><p className={styles.caption}>A simulator setting. Occupancy locks after the first request. Reset to change it.</p></div>}
        <div className={styles.actions}><Link className={styles.secondary} href="/demo/home">Demo home & clock</Link><Link className={styles.secondary} href="/demo/offer">Driver route overview</Link></div>
      </section>
    </div>
  </>;
}
