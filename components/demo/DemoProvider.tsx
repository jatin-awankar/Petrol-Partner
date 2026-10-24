"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createDemoSession, type DemoSession } from "@/lib/demo/session";

const DemoContext = createContext<DemoSession | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null);
  useEffect(() => {
    setSession(createDemoSession(() => window.sessionStorage));
  }, []);
  if (!session) return <div role="status">Opening your demo…</div>;
  return <DemoContext.Provider value={session}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const session = useContext(DemoContext);
  if (!session) throw new Error("Demo screens require DemoProvider");
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { ...snapshot, dispatch: session.dispatch };
}
