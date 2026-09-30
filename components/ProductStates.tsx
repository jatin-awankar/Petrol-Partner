import type { ReactNode } from "react";

type Tone = "neutral" | "good" | "caution" | "restricted" | "unknown";
export function StatusTag({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) { return <span className={`product-status product-status-${tone}`}>{children}</span>; }
export function Feedback({ title, children, tone = "neutral" }: { title: string; children: ReactNode; tone?: Tone }) { return <div className={`product-feedback product-feedback-${tone}`} role={tone === "restricted" ? "alert" : "status"}><strong>{title}</strong><p>{children}</p></div>; }
export function StatePanel({ title, children, action, tone = "neutral" }: { title: string; children: ReactNode; action?: ReactNode; tone?: Tone }) { return <section className={`product-state product-state-${tone}`}><span className="product-state-symbol" aria-hidden="true">✳</span><div><h2>{title}</h2><p>{children}</p>{action && <div className="product-state-action">{action}</div>}</div></section>; }
export function Money({ paise, currency = "INR" }: { paise: number; currency?: "INR" }) { return <span>{new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(paise / 100)}</span>; }
