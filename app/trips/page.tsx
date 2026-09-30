import Link from "next/link";
import { StatePanel, StatusTag } from "@/components/ProductStates";
export default function TripsPage() { return <div className="participant-placeholder"><span>JOURNEYS / PRELAUNCH</span><h1>Trips</h1><StatusTag tone="caution">No live bookings</StatusTag><StatePanel title="Your trips will live here" action={<Link href="/direct-settlements">View historical contribution records</Link>}>Real bookings are disabled. Historical pilot trip records will receive their own clear view in the later trips stage.</StatePanel></div>; }
