"use client";

import {useState} from "react";
import {ApiError,apiRequest} from "@/lib/api/client";

export type BoardingBooking={id:string;offer_id:string;driver_id:string;passenger_id:string;
  passenger_verified_name:string|null;trip_state:string;boarded:boolean|null;started_at:string|null};

export function PilotBoarding({bookings,userId,onRefresh}:{bookings:BoardingBooking[];
  userId:string|undefined;onRefresh:()=>Promise<void>}) {
  const [selected,setSelected]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const groups=Object.values(bookings.reduce<Record<string,BoardingBooking[]>>((out,row)=>{
    (out[row.offer_id]??=[]).push(row);return out;
  },{}));
  async function depart(rows:BoardingBooking[]) {
    const offerId=rows[0].offer_id;
    const storageKey=`pilot-departure:${offerId}`;
    const ids=rows.filter(row=>selected[row.id]).map(row=>row.id).sort();
    const payload=JSON.stringify({boarded_allocation_ids:ids});
    const saved=window.sessionStorage.getItem(storageKey);
    const prior=saved?JSON.parse(saved) as {key:string;payload:string}:null;
    const attempt=prior?.payload===payload?prior:{key:crypto.randomUUID(),payload};
    window.sessionStorage.setItem(storageKey,JSON.stringify(attempt));
    setBusy(offerId);setMessage("");
    try {
      const {departure}=await apiRequest<{departure:{state:string}}>(`/v1/corridor-offers/${offerId}/depart`,{
        method:"POST",headers:{"Idempotency-Key":attempt.key},body:payload});
      if(departure.state==='acknowledged'||departure.state==='recovered') {
        window.sessionStorage.removeItem(storageKey);
        await onRefresh();
        setMessage("Departure and boarding recorded.");
      } else setMessage("Departure outcome is pending. Retry with the same boarding selection.");
    } catch(error) {
      if(error instanceof ApiError&&error.status<500&&error.code!=="OPERATION_PENDING")
        window.sessionStorage.removeItem(storageKey);
      setMessage(error instanceof Error?error.message:"Departure outcome is unknown. Retry with the same boarding selection.");
    } finally {setBusy(null);}
  }
  return <section className="space-y-3" aria-label="Trip departure and boarding">
    <h2 className="text-xl font-semibold">Departure and boarding</h2>
    {message&&<p role="status">{message}</p>}
    {groups.map(rows=>{
      const mine=rows[0].driver_id===userId;
      const state=rows[0].trip_state;
      return <div key={rows[0].offer_id} className="rounded border p-3">
        <p>Ride {rows[0].offer_id} · {state}</p>
        {state==='delayed'&&<p>The ride remains unstarted. Contact pilot support for explicit resolution.</p>}
        {state==='departed'&&<p>Started {rows[0].started_at?new Date(rows[0].started_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):""} IST.</p>}
        {mine&&state==='scheduled'&&<>
          <p>Select only passengers who boarded. Unselected confirmed passengers remain recorded as absent.</p>
          {rows.map(row=><label key={row.id} className="block">
            <input type="checkbox" checked={Boolean(selected[row.id])}
              onChange={event=>setSelected({...selected,[row.id]:event.target.checked})} />
            {row.passenger_verified_name??"Confirmed passenger"}
          </label>)}
          <button type="button" className="rounded border px-3 py-1" disabled={busy!==null}
            onClick={()=>void depart(rows)}>Start trip and record boarding</button>
        </>}
        {state==='departed'&&rows.map(row=><p key={row.id}>
          {mine?row.passenger_verified_name??"Confirmed passenger":"Your seat"}: {row.boarded?"Boarded":"Not boarded"}
        </p>)}
      </div>;
    })}
  </section>;
}
