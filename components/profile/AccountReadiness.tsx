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
  const driverReviewRequired=readiness?.driver.state==="revoked"||readiness?.driver.state==="false_declaration";
  const vehicleReviewRecords=readiness?.vehicles.filter(vehicle=>vehicle.state==="revoked"||vehicle.state==="false_declaration")??[];
  const next=restricted?{href:"/eligibility#travel-restrictions",label:"Review restrictions"}:
    readiness?.adult.state!=="current"?{href:"/adult-declaration",label:"Review adult declaration"}:
    driverReviewRequired?null:
    readiness?.driver.state==="missing"?{href:"/driver-vehicle-declarations",label:"Optional: record driver declaration"}:
    readiness?.driver.state==="expired"?{href:"/driver-vehicle-declarations",label:"Optional: renew driver declaration"}:
    readiness?.vehicles.some(vehicle=>vehicle.state==="expired")?{href:"/driver-vehicle-declarations",label:"Optional: renew vehicle declaration"}:
    !readiness?.vehicles.some(vehicle=>vehicle.state==="current")?{href:"/driver-vehicle-declarations",label:"Optional: add vehicle declaration"}:null;
  return <section className="rounded-xl border border-primary/20 bg-card p-5" aria-label="Account readiness">
    <h2 className="text-xl font-semibold">What can you do next?</h2>
    <p className="mt-2 text-sm text-muted-foreground">Real bookings remain closed during launch checks. Self-declarations are not document verification; historical corridor approvals do not grant eligibility under the new route policy.</p>
    {loading?<p role="status">Checking account readiness…</p>:error?<div role="alert">Account readiness is unavailable. <button type="button" className="min-h-11 underline" onClick={()=>void refresh()}>Try again</button></div>:readiness&&<div className="mt-4 space-y-2">
      <p>Adult declaration: {readiness.adult.state}</p>
      <p>Driver declaration: {readiness.driver.state}</p>
      <p>Vehicle declarations: {readiness.vehicles.length?readiness.vehicles.map(vehicle=>`${vehicle.category??"vehicle"} ${vehicle.state}`).join(", "):"none"}</p>
      {restricted&&<p>An account restriction blocks new travel actions.</p>}
      {driverReviewRequired&&<p>A revoked driver declaration needs account review before driver actions.</p>}
      {vehicleReviewRecords.map((vehicle,index)=><p key={`${vehicle.category??"vehicle"}-${index}`}>
        {vehicle.state==="revoked"?`The revoked ${vehicle.category??"vehicle"} declaration cannot be used. That record needs account review.`:
          `The ${vehicle.category??"vehicle"} declaration has been flagged as false and cannot be used. That record needs account review.`}
      </p>)}
      {readiness.adult.state==="current"&&!restricted&&<p>No driver declaration is needed to request a seat when bookings open. Driver and vehicle statements are only for offering a route.</p>}
      {next?<Link className="inline-flex min-h-11 items-center rounded-md border px-4 underline" href={next.href}>{next.label}</Link>:!restricted&&!driverReviewRequired&&<p>Current driver and vehicle statements are recorded. Ride actions remain unavailable.</p>}
    </div>}
  </section>;
}
