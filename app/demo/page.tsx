"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { demoFixture, type DemoRole } from "@/lib/demo/session";
import { useDemo } from "@/components/demo/DemoProvider";
import styles from "./demo.module.css";

export default function DemoEntry() {
  const { state, dispatch } = useDemo();
  const router = useRouter();
  function start(role: DemoRole) {
    dispatch({ type: "choose-role", role });
    router.push("/demo/home");
  }
  return <>
    <div className={styles.intro}>
      <div><p className={styles.eyebrow}>THE DEMO / YOUR FRONT-ROW SEAT</p><h1>Same route.<br /><em>Two perspectives.</em></h1></div>
      <p>Meet the people on a sample route. Choose a side, switch roles, and make this little journey your own. No sign-up required.</p>
    </div>
    {state.role && <div className={styles.resume}><p>Your sample is ready to continue as <b>{demoFixture[state.role].name}</b>.</p><Link href="/demo/home" className={styles.secondary}>Resume demo <ArrowRight size={18} aria-hidden="true" /></Link></div>}
    <div className={styles.roles}>
      {(["passenger", "driver"] as const).map((role, index) => <section key={role} className={styles.roleCard}>
        <div className={styles.cardTop}><span>0{index + 1} / {role.toUpperCase()}</span><span className={styles.initials} aria-hidden="true">{demoFixture[role].initials}</span></div>
        <h2>Meet {demoFixture[role].name}.</h2><p>{demoFixture[role].description}</p>
        <p className={styles.roleDetail}>{role === "passenger" ? "Start with the rider’s perspective. Your driver is taking the same route." : "See the route from the driver’s seat. Three sample seats, one shared direction."}</p>
        <button className={styles.primary} onClick={() => start(role)}>Explore as {role} <ArrowRight size={18} aria-hidden="true" /></button>
      </section>)}
    </div>
    <section className={styles.scope}><span className={styles.eyebrow}>WHAT YOU CAN TRY TODAY</span><h2>A place to start.</h2><p>Explore the sample route, switch between people, move the sample clock, and reset. Choose ordered stops, preview a sample contribution, request a seat, then accept or decline as the driver. Continue through journey statements, a simulated payment claim and driver receipt. Try cancellation or disagreement too.</p></section>
  </>;
}
