"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDemo } from "./DemoProvider";
import styles from "@/app/demo/demo.module.css";

export default function DemoShell({ children }: { children: ReactNode }) {
  const { state, persistence, recovered, dispatch } = useDemo();
  const router = useRouter();
  const [resetOpen, setResetOpen] = useState(false);
  function reset() {
    dispatch({ type: "reset" });
    setResetOpen(false);
    router.push("/demo");
  }
  return <>
    <a href="#demo-content" className={styles.skip}>Skip to demo content</a>
    <div className={styles.notice}><span aria-hidden="true" />Demo — no real rides or payments</div>
    <header className={styles.header}>
      <Link href="/demo" className={styles.brand} aria-label="Petrol Partner demo entry"><span aria-hidden="true">pp.</span><b>petrol<br />partner.</b></Link>
      <nav aria-label="Demo navigation" className={styles.nav}>
        {state.role && <Link href="/demo/home">Demo home</Link>}
        <Link href="/" prefetch={false}>Back to website <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </nav>
    </header>
    <div className={styles.sessionBar}>
      <span><b>{state.role ? `${state.role === "passenger" ? "Passenger" : "Driver"} view` : "Your own sample journey"}</b> · Fictional people and places</span>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogTrigger asChild><button className={styles.textButton}><RotateCcw size={14} aria-hidden="true" />Reset demo</button></DialogTrigger>
        <DialogContent className={styles.resetDialog} showCloseButton={false}>
          <DialogTitle>Start this demo again?</DialogTitle>
          <DialogDescription className={styles.dialogDescription}>This resets your role and sample clock in this tab. Real accounts and other browser data stay untouched.</DialogDescription>
          <div className={styles.actions}>
            <DialogClose asChild><button className={styles.secondary} autoFocus>Keep exploring</button></DialogClose>
            <button className={styles.primary} onClick={reset}>Reset this demo</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    {persistence === "memory" && <p role="status" className={styles.warning}>Changes cannot be saved in this tab. You can keep exploring, but refreshing may restore an earlier session or start again.</p>}
    {recovered && <p role="status" className={styles.warning}>The saved demo was outdated or unreadable. A fresh sample is ready; other browser data is unchanged.</p>}
    <div id="demo-content" tabIndex={-1} className={styles.content}>{children}</div>
    <footer className={styles.footer}><span>FOR THE ROUTE YOU’RE ALREADY TAKING.</span><p>Sample progress stays in this tab through refresh. Closing the tab ends the session. No real account is needed.</p></footer>
  </>;
}
