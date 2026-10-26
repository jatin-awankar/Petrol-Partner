"use client";

import Link from "next/link";
import { DemoClock } from "@/components/demo/DemoClock";
import { ArrowRight, ArrowLeftRight } from "lucide-react";
import { useDemo } from "@/components/demo/DemoProvider";
import { demoFixture, formatDemoTime } from "@/lib/demo/session";
import styles from "../demo.module.css";

export default function DemoHome() {
  const { state, dispatch } = useDemo();
  if (!state.role) return <section className={styles.scope}><p className={styles.eyebrow}>YOUR DEMO / START HERE</p><h1>Choose your perspective.</h1><p>There’s no active sample role in this tab. Start with Mira or Arjun.</p><Link href="/demo" className={styles.primary}>Choose a role <ArrowRight size={18} aria-hidden="true" /></Link></section>;
  const person = demoFixture[state.role];
  const otherRole = state.role === "passenger" ? "driver" : "passenger";
  return <>
    <div className={styles.intro}><div><p className={styles.eyebrow}>DEMO HOME / {state.role.toUpperCase()}</p><h1>You’re {person.name}.<br /><em>Here’s the route.</em></h1></div><div><p>{state.role === "passenger" ? "Arjun has a sample route across town. Choose your stops, request a sample seat, then switch roles for the driver’s decision." : "Your sample route is ready to inspect. Switch to Mira’s view to see the passenger’s perspective."}</p><button className={styles.secondary} onClick={() => dispatch({ type: "choose-role", role: otherRole })}><ArrowLeftRight size={17} aria-hidden="true" />Switch to {otherRole}</button></div></div>
    <div className={styles.homeGrid}>
      <section className={styles.routeTicket} aria-label="Sample route">
        <div className={styles.cardTop}><span>ROUTE / 001</span><span>FICTIONAL EXAMPLE</span></div>
        <h2>Across town.<br /><em>Along the way.</em></h2>
        <ol className={styles.stops}>{demoFixture.route.stops.map((stop, index) => <li key={stop}><span aria-hidden="true">0{index + 1}</span><div><small>{index === 0 ? "FROM" : index === 2 ? "TO" : "VIA"}</small><strong>{stop}</strong></div></li>)}</ol>
        <dl className={styles.facts}><div><dt>Sample departure</dt><dd>{formatDemoTime(demoFixture.route.departureMinute)}</dd></div><div><dt>Vehicle & capacity</dt><dd>{demoFixture.route.vehicle} · {demoFixture.route.capacity} seats</dd></div><div><dt>Sample distance</dt><dd>{demoFixture.route.distanceKm} km · preset illustration</dd></div><div><dt>Requests & contributions</dt><dd>{state.journey.receipt ? "Sample receipt confirmed" : state.journey.claim ? "Payment claimed · receipt unconfirmed" : state.journey.obligation ? "Sample contribution owed" : state.journey.cancellation ? "Cancelled · no money owed" : state.request ? `${state.request.status} request · no money owed` : "No request or money owed"}</dd></div></dl>
        <p className={styles.caption}>A preset sample, not a published offer or verified route.</p>
      </section>
      <aside className={styles.side}>
        <DemoClock />
        <section className={styles.next}><p className={styles.eyebrow}>NEXT / THE CONNECTED JOURNEY</p><h2>A seat. Then a story.</h2><p>Follow both sides from request to journey confirmation, then a sample payment claim and receipt.</p><Link href={state.allocation ? "/demo/trips/sample-trip-01" : state.role === "passenger" ? "/demo/find" : "/demo/offer"} className={styles.primary}>Continue the sample journey <ArrowRight size={16} aria-hidden="true" /></Link></section>
      </aside>
    </div>
  </>;
}
