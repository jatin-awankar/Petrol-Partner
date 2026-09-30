import Link from "next/link";
import { StatePanel, StatusTag } from "@/components/ProductStates";
export default function OfferRidePage() { return <div className="participant-placeholder"><span>DRIVE / PRELAUNCH</span><h1>Offer a ride</h1><StatusTag tone="restricted">Launch gated</StatusTag><StatePanel title="Live offers are not open" tone="restricted" action={<Link href="/dashboard">Back to Home</Link>}>Route preparation exists, but publishing an offer and accepting seats remain unavailable. Driver and vehicle declarations will be surfaced in the later driver journey.</StatePanel></div>; }
