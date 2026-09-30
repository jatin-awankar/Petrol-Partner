"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,CircleUserRound,ShieldCheck,Route,ReceiptText} from "lucide-react";
import {apiRequest} from "@/lib/api/client";
import {StatePanel,StatusTag} from "@/components/ProductStates";

type DriverStatus={driver:{state:string;restricted:boolean};vehicles:{state:string}[]};
type Declaration={state:"missing"|"current"|"expired"|"withdrawn"|"restricted";restriction_source:"account_status"|"travel_restriction"|null};
export default function ParticipantHome(){
  const [declaration,setDeclaration]=useState<Declaration|null>(null);
  const [driverStatus,setDriverStatus]=useState<DriverStatus|null>(null);
  const [error,setError]=useState(false);
  const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{setLoading(true);setError(false);try{
    const [adult,driver]=await Promise.all([apiRequest<{declaration:Declaration}>("/v1/adult-declaration"),apiRequest<DriverStatus>("/v1/driver-vehicle-declarations")]);setDeclaration(adult.declaration);setDriverStatus(driver);
  }catch{setError(true);}finally{setLoading(false);}},[]);
  useEffect(()=>{void refresh();},[refresh]);
  const current=declaration?.state==="current";
  const restricted=declaration?.state==="restricted"||driverStatus?.driver.restricted;
  return <div className="participant-home">
    <div className="participant-home-top"><span>YOUR SPACE / 01</span><StatusTag tone="caution">Prelaunch</StatusTag></div>
    <section className="participant-hero"><div><p className="participant-eyebrow">GOOD TO HAVE YOU HERE</p><h1>Make room for<br/><em>the road ahead.</em></h1><p>Ride discovery and bookings will open after launch checks are complete.</p>
      {loading?<p role="status">Checking your account state…</p>:error?<div role="alert" className="product-inline-feedback">Account state unavailable. <button className="product-action-button" onClick={()=>void refresh()}>Try again</button></div>:restricted?<p role="status">{declaration?.restriction_source==="account_status"?"Your account is inactive. A declaration does not restore travel access.":"An account restriction blocks new travel actions. A declaration does not remove it."}</p>:current?<p role="status">Adult declaration current. Real bookings remain disabled.</p>:<Link href="/adult-declaration" className="participant-primary-action">{declaration?.state==="expired"?"Renew adult declaration":declaration?.state==="withdrawn"?"Record adult declaration again":"Review adult declaration"} <ArrowUpRight size={18}/></Link>}
    </div><div className="participant-hero-art" aria-hidden="true"><span>01 / THE NEXT MOVE</span><div className="participant-hero-orbit">✳︎</div><strong>YOUR<br/>ROUTE<br/>STARTS<br/>HERE<span>.</span></strong><span>SHARE THE WAY, WHEN WE&apos;RE READY.</span></div></section>
    <div className="participant-section-heading"><div><span>START HERE</span><h2>Your next steps</h2></div><p>Account actions are available now. Travel actions remain closed until launch.</p></div>
    <div className="participant-card-grid"><Link href="/profile-settings" className="participant-action-card"><CircleUserRound/><span>01 / ACCOUNT</span><h3>Make it yours</h3><p>Review your account details and preferences.</p><ArrowUpRight className="participant-card-arrow"/></Link><Link href="/adult-declaration" className="participant-action-card"><ShieldCheck/><span>02 / DECLARATION</span><h3>{current?"Declaration current":"State your age"}</h3><p>Review your 18+ self-declaration. It is not independent verification.</p><ArrowUpRight className="participant-card-arrow"/></Link><div className="participant-action-card participant-action-card-muted"><Route/><span>03 / RIDES · LATER</span><h3>Roads opening soon</h3><p>Routes may be prepared privately; public discovery and real bookings are unavailable.</p></div></div>
    {!loading&&!error&&driverStatus&&<div className="participant-state-grid"><StatePanel title={`Driver declaration: ${driverStatus.driver.state}`} tone={driverStatus.driver.restricted?"restricted":"neutral"} action={<Link href="/profile-settings">Account settings</Link>}>Driver and vehicle statements are self-declarations. {driverStatus.vehicles.length?`Vehicle states: ${driverStatus.vehicles.map(vehicle=>vehicle.state).join(", ")}.`:"No vehicle declaration recorded."} Real offers remain unavailable.</StatePanel><StatePanel title="Historical pilot eligibility" action={<Link href="/eligibility">View historical status</Link>}>Earlier corridor approval does not grant eligibility for the new route policy.</StatePanel></div>}
    <div className="participant-section-heading participant-section-heading-small"><div><span>WHERE THINGS STAND</span><h2>Clear from the start</h2></div></div>
    <div className="participant-state-grid"><StatePanel title="No public rides yet" action={<Link href="/profile-settings">Go to account <ArrowUpRight size={16}/></Link>}>Ride discovery opens only after the product and operating checks are approved.</StatePanel><StatePanel title="Contributions come later" tone="caution" action={<Link href="/direct-settlements"><ReceiptText size={16}/> Historical records</Link>}>There is no platform collection. Existing pilot records remain available to their participants.</StatePanel></div>
  </div>;
}
