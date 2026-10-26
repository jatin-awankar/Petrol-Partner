"use client";

import { useDemo } from "./DemoProvider";
import { formatDemoTime, LAST_MINUTE } from "@/lib/demo/session";
import styles from "@/app/demo/demo.module.css";

export function DemoClock() {
  const { state, dispatch } = useDemo();
  return <section className={styles.clock} aria-label="Sample clock">
    <p className={styles.eyebrow}>YOU CONTROL THE PACE</p><h2>Sample clock</h2>
    <p className={styles.clockTime} role="status" aria-live="polite">{formatDemoTime(state.minute)}</p>
    <p>Time moves only when you move it. Advancing the clock never starts a ride, confirms travel, or creates a payment.</p>
    <div className={styles.actions}>{([{ minutes: 15, label: "Advance 15 minutes" }, { minutes: 60, label: "Advance 1 hour" }, { minutes: 1440, label: "Advance 24 hours" }] as const).map(({ minutes, label }) => <button key={minutes} className={styles.secondary} disabled={state.minute + minutes > LAST_MINUTE} onClick={() => dispatch({ type: "advance-clock", minutes })}>{label}</button>)}</div>
    <p className={styles.caption}>A 72-hour sample window. Advancing 24 hours can close a response window. Reset the demo to rewind.</p>
  </section>;
}
