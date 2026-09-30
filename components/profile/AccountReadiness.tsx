"use client";

import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {apiRequest} from "@/lib/api/client";

type Adult={state:string;restriction_source:string|null};
type Driver={state:string;restricted:boolean};
type Vehicle={state:string;category?:string};
type Readiness={adult:Adult;driver:Driver;vehicles:Vehicle[]};

export default function AccountReadiness(){
  const [readiness,setReadiness]=useState<Readiness|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const refresh=useCallback(async()=>{
    setLoading(true);setError(false);
    try{
      const [adult,driver]=await Promise.all([
        apiRequest<{declaration:Adult}>("/v1/adult-declaration"),
        apiRequest<{driver:Driver;vehicles:Vehicle[]}>("/v1/driver-vehicle-declarations"),
      ]);
      setReadiness({adult:adult.declaration,driver:driver.driver,vehicles:driver.vehicles});
    }catch{setError(true);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const restricted=readiness?.adult.state==="restricted"||readiness?.driver.restricted;
  const reviewRequired=readiness?.driver.state==="revoked"||readiness?.driver.state==="false_declaration"||readiness?.vehicles.some(vehicle=>vehicle.state==="revoked"||vehicle.state==="false_declaration");
  const next=restricted?{href:"/eligibility#travel-restrictions",label:"Review restrictions"}:
    readiness?.adult.state!=="current"?{href:"/adult-declaration",label:"Review adult declaration"}:
    reviewRequired?null:
    readiness?.driver.state==="missing"?{href:"/driver-vehicle-declarations",label:"Record driver declaration"}:
    readiness?.driver.state==="expired"?{href:"/driver-vehicle-declarations",label:"Renew driver declaration"}:
    readiness?.vehicles.some(vehicle=>vehicle.state==="expired")?{href:"/driver-vehicle-declarations",label:"Renew vehicle declaration"}:
    readiness?.vehicles.length===0?{href:"/driver-vehicle-declarations",label:"Add vehicle declaration"}:null;
  return <section className="rounded-xl border border-primary/20 bg-card p-5" aria-label="Account readiness">
    <h2 className="text-xl font-semibold">What can you do next?</h2>
    <p className="mt-2 text-sm text-muted-foreground">Real bookings remain closed during launch checks. Self-declarations are not document verification; historical corridor approvals do not grant eligibility under the new route policy.</p>
    {loading?<p role="status">Checking account readiness…</p>:error?<div role="alert">Account readiness is unavailable. <button type="button" className="min-h-11 underline" onClick={()=>void refresh()}>Try again</button></div>:readiness&&<div className="mt-4 space-y-2">
      <p>Adult declaration: {readiness.adult.state}</p>
      <p>Driver declaration: {readiness.driver.state}</p>
      <p>Vehicle declarations: {readiness.vehicles.length?readiness.vehicles.map(vehicle=>`${vehicle.category??"vehicle"} ${vehicle.state}`).join(", "):"none"}</p>
      {restricted&&<p>An account restriction blocks new travel actions.</p>}
      {reviewRequired&&<p>A revoked declaration needs account review before driver actions.</p>}
      {next?<Link className="inline-flex min-h-11 items-center rounded-md border px-4 underline" href={next.href}>{next.label}</Link>:!restricted&&!reviewRequired&&<p>Your declarations are recorded. Ride actions remain unavailable.</p>}
    </div>}
  </section>;
}
