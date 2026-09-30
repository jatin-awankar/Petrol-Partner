import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CircleUserRound, ShieldCheck, Route, ReceiptText } from "lucide-react";
import { getServerCurrentUser } from "@/lib/server-auth";
import { StatePanel, StatusTag } from "@/components/ProductStates";

export default async function DashboardPage() {
  const user = await getServerCurrentUser();
  if (!user) redirect("/login");
  return <div className="participant-home">
    <div className="participant-home-top"><span>YOUR SPACE / 01</span><StatusTag tone="caution">Prelaunch</StatusTag></div>
    <section className="participant-hero"><div><p className="participant-eyebrow">GOOD TO HAVE YOU HERE</p><h1>Make room for<br/><em>the road ahead.</em></h1><p>Your account is ready to explore. Ride discovery and bookings will open after launch checks are complete.</p><Link href="/adult-declaration" className="participant-primary-action">Review adult declaration <ArrowUpRight size={18}/></Link></div><div className="participant-hero-art" aria-hidden="true"><span>01 / THE NEXT MOVE</span><div className="participant-hero-orbit">✳</div><strong>YOUR<br/>ROUTE<br/>STARTS<br/>HERE<span>.</span></strong><span>SHARE THE WAY, WHEN WE&apos;RE READY.</span></div></section>
    <div className="participant-section-heading"><div><span>START HERE</span><h2>Your next steps</h2></div><p>Account actions are available now. Travel actions remain closed until launch.</p></div>
    <div className="participant-card-grid"><Link href="/profile-settings" className="participant-action-card"><CircleUserRound/><span>01 / ACCOUNT</span><h3>Make it yours</h3><p>Review your account details and preferences.</p><ArrowUpRight className="participant-card-arrow"/></Link><Link href="/adult-declaration" className="participant-action-card"><ShieldCheck/><span>02 / DECLARATION</span><h3>State your age</h3><p>Record your own 18+ declaration. It is not independent verification.</p><ArrowUpRight className="participant-card-arrow"/></Link><div className="participant-action-card participant-action-card-muted"><Route/><span>03 / RIDES · LATER</span><h3>Roads opening soon</h3><p>Routes may be prepared privately; public discovery and real bookings are unavailable.</p></div></div>
    <div className="participant-section-heading participant-section-heading-small"><div><span>WHERE THINGS STAND</span><h2>Clear from the start</h2></div></div>
    <div className="participant-state-grid"><StatePanel title="No public rides yet" tone="neutral" action={<Link href="/profile-settings">Go to account <ArrowUpRight size={16}/></Link>}>Ride discovery opens only after the product and operating checks are approved.</StatePanel><StatePanel title="Contributions come later" tone="caution" action={<Link href="/direct-settlements"><ReceiptText size={16}/> Historical records</Link>}>There is no platform collection. Existing pilot records remain available to their participants.</StatePanel></div>
  </div>;
}
