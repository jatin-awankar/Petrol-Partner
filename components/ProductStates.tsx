import type { ReactNode } from "react";

type Tone = "neutral" | "good" | "caution" | "restricted" | "unknown";
export function StatusTag({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) { return <span className={`product-status product-status-${tone}`}>{children}</span>; }
export function StatePanel({ title, children, action, tone = "neutral" }: { title: string; children: ReactNode; action?: ReactNode; tone?: Tone }) { return <section className={`product-state product-state-${tone}`}><span className="product-state-symbol" aria-hidden="true">✳</span><div><h2>{title}</h2><p>{children}</p>{action && <div className="product-state-action">{action}</div>}</div></section>; }
