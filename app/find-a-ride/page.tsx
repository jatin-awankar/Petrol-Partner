import Link from "next/link";
import { StatePanel, StatusTag } from "@/components/ProductStates";
export default function FindRidePage() { return <div className="participant-placeholder"><span>DISCOVER / PRELAUNCH</span><h1>Find a ride</h1><StatusTag tone="restricted">Launch gated</StatusTag><StatePanel title="No public routes to browse" tone="restricted" action={<Link href="/dashboard">Back to Home</Link>}>Public posted-route discovery and real booking are not available yet. A driver&apos;s prepared route stays private.</StatePanel></div>; }
