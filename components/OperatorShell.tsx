"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const queues = [
  { href: "/operator#eligibility", label: "Eligibility" },
  { href: "/operator#routes", label: "Routes & incidents" },
  { href: "/operator#journeys", label: "Journey & settlement" },
  { href: "/operator#delivery", label: "Delivery" },
  { href: "/operator#recovery", label: "Pause & recovery" },
  { href: "/operator#audit", label: "Audit" },
];

export default function OperatorShell() {
  const path = usePathname();
  if (!path.startsWith("/operator")) return null;
  return <><a href="#main-content" className="shell-skip">Skip to content</a><header className="operator-shell">
    <div className="operator-shell-inner">
      <Link href="/operator" className="operator-brand">PETROL PARTNER <span>/ OPERATIONS</span></Link>
      <nav aria-label="Operator queues">
        {queues.map(queue => <Link key={queue.href} href={queue.href}>{queue.label}</Link>)}
      </nav>
      <Link href="/dashboard">Participant home</Link>
    </div>
  </header></>;
}
