"use client";

import Link from "next/link";
import { useState } from "react";
import { useDemo } from "./DemoProvider";
import { DemoClock } from "./DemoClock";
import { demoAmount, demoFixture, formatDemoTime, type DemoAction } from "@/lib/demo/session";
import { DEPARTURE_OPEN, DEPARTURE_CLOSE, RESPONSE_WINDOW } from "@/lib/demo/journey";
import styles from "@/app/demo/demo.module.css";

const tripPath = "/demo/trips/sample-trip-01";
const contributionPath = "/demo/contributions/sample-contribution-01";
const reviewPath = "/demo/reviews/sample-review-01";
const reviewText = {
  "not-boarded": "Arjun recorded Mira as absent at pickup. This does not prove travel or create a no-show charge.",
  "journey-disagreement": "One participant reported that the journey did not complete. No contribution was created.",
  "journey-silence": "One journey statement is still missing after 24 sample hours. Silence does not prove travel or create a contribution.",
  "payment-dispute": "Arjun disputed Mira’s payment claim. The claim is preserved, but receipt has not been confirmed.",
  "receipt-silence": "Arjun did not respond within 24 sample hours of the claim. Silence does not confirm payment.",
  "interruption": "A participant reported an interruption after departure. The seat history remains; no automatic charge or cancellation was recorded.",
};

export function DemoJourney({ screen = "trip" }: { screen?: "trip" | "contribution" | "review" }) {
  const { state, dispatch } = useDemo();
  const [method, setMethod] = useState<"cash" | "upi">("cash");
  const [error, setError] = useState("");
  const j = state.journey;
  const allocation = state.allocation;
  const run = (action: DemoAction) => { setError(dispatch(action) ? "" : "That action is unavailable in the current sample state. Check the role, clock and next step."); };
  if (!state.role || !allocation) return <section className={styles.scope}><h1>No confirmed seat yet.</h1><p>Start with a passenger request and the driver’s acceptance. Nothing has travelled or been paid.</p><Link className={styles.primary} href={state.role ? "/demo/find" : "/demo"}>{state.role ? "Find the sample route" : "Choose a role"}</Link></section>;
  const role = state.role;
  const other = role === "driver" ? "passenger" : "driver";
  const terms = allocation.terms;
  const overdue = Boolean(j.obligation && !j.claim && state.minute >= j.obligation.dueMinute);
  const title = screen === "review" ? (j.review ? "A pause for review." : "No review needed.") : screen === "contribution" ? (j.receipt ? "Receipt confirmed." : j.review ? "Contribution under review." : j.claim ? "Claimed. Not yet received." : j.obligation ? "A shared journey. A contribution." : "No contribution owed.") : j.cancellation ? "Cancelled before departure." : j.review ? "This journey needs review." : j.receipt ? "A shared journey, completed." : j.obligation ? "Both people confirmed." : j.departure ? "Tell your side of the journey." : "Your sample commitment.";
  const switchRole = <button className={styles.secondary} onClick={() => run({ type: "choose-role", role: other })}>Switch to {other}</button>;
  const timeline: { label: string; minute: number }[] = [{ label: "Mira requested one seat", minute: state.request!.createdMinute }, { label: "Arjun accepted; terms frozen", minute: allocation.acceptedMinute }];
  if (j.cancellation) timeline.push({ label: `${demoFixture[j.cancellation.actor].name} cancelled; Mira’s seat released`, minute: j.cancellation.minute });
  if (j.departure) timeline.push({ label: j.departure.boarded ? "Arjun started; Mira recorded aboard" : "Arjun started; Mira recorded absent", minute: j.departure.minute });
  if (j.driverStatement) timeline.push({ label: `Arjun: ${j.driverStatement.outcome === "completed" ? "journey completed" : "journey did not complete"}`, minute: j.driverStatement.minute });
  if (j.passengerStatement) timeline.push({ label: `Mira: ${j.passengerStatement.outcome === "completed" ? "travelled and completed" : "journey did not complete"}`, minute: j.passengerStatement.minute });
  if (j.obligation) timeline.push({ label: `Both confirmed; ${demoAmount(j.obligation.paise)} contribution recorded`, minute: j.obligation.minute });
  if (j.claim) timeline.push({ label: `Mira claimed ${j.claim.method === "upi" ? "UPI" : "cash"} payment`, minute: j.claim.minute });
  if (j.receipt) timeline.push({ label: "Arjun confirmed receipt; sample settled", minute: j.receipt.minute });
  if (j.dispute) timeline.push({ label: "Arjun disputed receipt", minute: j.dispute.minute });
  if (j.review) timeline.push({ label: "Sample review opened; no decision invented", minute: j.review.minute });
  timeline.sort((a, b) => a.minute - b.minute);
  return <>
    <div className={styles.intro}><div><p className={styles.eyebrow}>SAMPLE {screen.toUpperCase()} / {role.toUpperCase()}</p><h1 aria-live="polite">{title}</h1></div><div><p>You’re {demoFixture[role].name}. Every action here is fictional. No real money moves.</p>{switchRole}</div></div>
    <div className={styles.homeGrid}>
      <section className={styles.routeTicket} aria-label="Frozen trip terms">
        <div className={styles.cardTop}><span>TRIP / 001</span><span>SIMULATED JOURNEY</span></div><h2>{demoFixture.route.stops[terms.pickup]}<br /><em>to {demoFixture.route.stops[terms.dropoff]}.</em></h2>
        <dl className={styles.facts}><div><dt>Accepted contribution</dt><dd>{demoAmount(terms.paise)} · {terms.paise} paise INR</dd></div><div><dt>Selected distance</dt><dd>{terms.metres / 1000} km · no added fees</dd></div><div><dt>Mira’s whole-ride seat</dt><dd>{j.cancellation ? "Released once · cancelled" : "Accepted · not reused by segment"}</dd></div><div><dt>Contribution record</dt><dd>{j.receipt ? "Receipt confirmed · sample settled" : j.claim ? "Payment claimed · receipt unconfirmed" : j.obligation ? overdue ? "Overdue · no payment claimed" : "Owed in this sample · no payment claimed" : "No contribution owed"}</dd></div></dl>
        <p className={styles.caption}>The original accepted stops and amount remain unchanged, including after cancellation or review. No real trip or payment is being arranged.</p>
        <h2 className={styles.timelineTitle}>The story so far.</h2><ol className={styles.timeline}>{timeline.map((item, i) => <li key={`${i}-${item.label}`}><strong>{item.label}</strong><span>{formatDemoTime(item.minute)}</span></li>)}</ol>
      </section>
      <div className={styles.side}>
        <section className={styles.clock} aria-label="Journey next action">
          {j.cancellation ? <><p className={styles.eyebrow}>CANCELLED / NO CHARGE</p><h2>Plans can change.</h2><p>{demoFixture[j.cancellation.actor].name} cancelled before this sample departed. Mira’s allocation is released once. No travel, obligation or payment was recorded.</p><p>Reset the demo to try a new journey.</p></> : j.review ? <><p className={styles.eyebrow}>SIMULATED REVIEW / UNRESOLVED</p><h2>Keep the facts separate.</h2><p>{reviewText[j.review.reason]}</p><p>{j.obligation ? `The original ${demoAmount(j.obligation.paise)} obligation remains recorded. It is not marked settled.` : "No money is owed in this scenario."}</p><p>A real service would need a reasoned, authorized review. This demo grants no operator access, sends no report and makes no review decision. Reset to explore another outcome.</p>{screen !== "review" && <Link className={styles.primary} href={reviewPath}>Inspect sample review</Link>}</> : screen === "review" ? <><h2>No review record.</h2><p>Return to the journey to continue. Reporting a journey disagreement or disputing a payment claim opens a sample review.</p><Link className={styles.primary} href={tripPath}>Continue sample trip</Link></> : screen === "contribution" ? <>
            {!j.obligation ? <><h2>Two confirmations first.</h2><p>Acceptance, departure and one person’s statement cannot create a contribution. Both must confirm travel and completion.</p><Link className={styles.primary} href={tripPath}>Return to sample trip</Link></> : j.receipt ? <><p className={styles.eyebrow}>RECEIPT CONFIRMED / DEMO COMPLETE</p><h2>{demoAmount(j.obligation.paise)} acknowledged.</h2><p>Arjun confirmed receipt of Mira’s simulated {j.claim!.method === "upi" ? "UPI" : "cash"} payment. The claim and receipt remain separate in the timeline.</p><p>You’ve completed both sides of the sample journey. Reset to try disagreement, absence, cancellation or a disputed receipt.</p></> : j.claim ? <><p className={styles.eyebrow}>AWAITING DRIVER / NOT SETTLED</p><h2>A claim needs a response.</h2><p>Mira claimed {demoAmount(j.obligation.paise)} by {j.claim.method === "upi" ? "UPI" : "cash"}. Arjun acts before {formatDemoTime(j.claim.minute + RESPONSE_WINDOW)}.</p>{role === "driver" ? <div className={styles.actions}><button className={styles.primary} onClick={() => run({ type: "respond-payment", response: "received" })}>Confirm sample receipt</button><button className={styles.secondary} onClick={() => run({ type: "respond-payment", response: "disputed" })}>Dispute sample receipt</button></div> : switchRole}</> : <><p className={styles.eyebrow}>{overdue ? "OVERDUE / STILL UNPAID" : "BOTH CONFIRMED / CONTRIBUTION OWED"}</p><h2>{demoAmount(j.obligation.paise)} in this sample.</h2><p>Due {formatDemoTime(j.obligation.dueMinute)}. {overdue ? "The sample deadline passed without a claim. Time has not marked it paid or added a fee." : "Mira acts next by recording a fictional direct-payment claim."}</p>{role === "passenger" ? <><div className={styles.fields}><label>Sample payment method<select value={method} onChange={e => setMethod(e.target.value as "cash" | "upi")}><option value="cash">Cash — simulated</option><option value="upi">UPI — simulated</option></select></label></div><p>No transfer, QR code or payment app is involved.</p><button className={styles.primary} onClick={() => run({ type: "claim-payment", method })}>Record sample payment claim</button></> : switchRole}</>}
          </> : !j.departure ? <><p className={styles.eyebrow}>BEFORE DEPARTURE / DRIVER ACTS NEXT</p><h2>Who’s at the pickup?</h2><p>Start between {formatDemoTime(DEPARTURE_OPEN)} and before {formatDemoTime(DEPARTURE_CLOSE)}. Move the sample clock below to reach the window.</p>{state.minute >= DEPARTURE_CLOSE ? <p role="status">Departure is delayed. The demo will not start it automatically; cancel or reset this scenario.</p> : role === "driver" ? <div className={styles.actions}><button className={styles.primary} disabled={state.minute < DEPARTURE_OPEN} onClick={() => run({ type: "depart", boarded: true })}>Start with Mira aboard</button><button className={styles.secondary} disabled={state.minute < DEPARTURE_OPEN} onClick={() => run({ type: "depart", boarded: false })}>Start with Mira absent</button></div> : switchRole}<div className={styles.actions}><button className={styles.secondary} onClick={() => run({ type: "cancel-trip" })}>Cancel sample trip</button></div></> : j.obligation ? <><p className={styles.eyebrow}>MUTUAL CONFIRMATION / NEXT: CONTRIBUTION</p><h2>{j.receipt ? "The sample is settled." : "Both sides agree."}</h2><p>{j.receipt ? "The driver has explicitly confirmed the passenger’s sample payment claim." : `Both confirmed travel and completion. The frozen ${demoAmount(j.obligation.paise)} is now owed only within this fictional scenario.`}</p><Link className={styles.primary} href={contributionPath}>{j.receipt ? "View sample receipt" : "Continue to contribution"}</Link></> : <><p className={styles.eyebrow}>AFTER DEPARTURE / EACH PERSON SPEAKS</p><h2>What happened along the way?</h2><p>Starting the trip did not confirm completion. Choose the statement for {demoFixture[role].name}; it will be preserved.</p>{(j.driverStatement || j.passengerStatement) && <p>Respond before {formatDemoTime((j.driverStatement ?? j.passengerStatement)!.minute + RESPONSE_WINDOW)}. Silence opens review, not a contribution.</p>}{(role === "driver" ? j.driverStatement : j.passengerStatement) ? <><p>Your statement is recorded. The other person acts next.</p>{switchRole}</> : <div className={styles.actions}><button className={styles.primary} onClick={() => run({ type: "state-journey", outcome: "completed" })}>{role === "driver" ? "Confirm journey completed" : "Confirm I travelled and completed"}</button><button className={styles.secondary} onClick={() => run({ type: "state-journey", outcome: "not-completed" })}>Journey did not complete</button></div>}<div className={styles.actions}><button className={styles.secondary} onClick={() => run({ type: "report-interruption" })}>Report sample interruption</button></div><p className={styles.caption}>After departure, an interruption needs review; it does not silently cancel the seat or create a charge.</p></>}
          {error && <p role="alert">{error}</p>}
        </section>
        <DemoClock />
        <nav className={styles.actions} aria-label="Sample journey navigation"><Link className={styles.secondary} href={tripPath}>Sample trip</Link><Link className={styles.secondary} href={contributionPath}>Contribution record</Link><Link className={styles.secondary} href="/demo/home">Demo home</Link></nav>
      </div>
    </div>
  </>;
}
