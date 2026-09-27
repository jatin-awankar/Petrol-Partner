"use client";

import {useState} from "react";
import {ApiError,apiRequest} from "@/lib/api/client";

export type BoardingBooking={id:string;offer_id:string;driver_id:string;passenger_id:string;
  passenger_verified_name:string|null;status:string;trip_state:string;boarded:boolean|null;started_at:string|null;
  driver_travelled?:boolean|null;driver_completed?:boolean|null;driver_recorded_at?:string|null;
  passenger_travelled?:boolean|null;passenger_completed?:boolean|null;passenger_recorded_at?:string|null;
  obligation_paise?:number|null;obligation_due_at?:string|null;journey_review_reason?:string|null};

type JourneyChoice="completed"|"interrupted"|"did_not_travel";
const claim=(allocation_id:string,choice:JourneyChoice)=>({allocation_id,
  travelled:choice!=="did_not_travel",completed:choice==="completed"});

export function PilotBoarding({bookings,userId,onRefresh}:{bookings:BoardingBooking[];
  userId:string|undefined;onRefresh:()=>Promise<void>}) {
  const [selected,setSelected]=useState<Record<string,boolean>>({});
  const [journeyChoices,setJourneyChoices]=useState<Record<string,JourneyChoice>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const groups=Object.values(bookings.filter(row=>row.status==='confirmed')
    .reduce<Record<string,BoardingBooking[]>>((out,row)=>{
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
  async function submitJourney(rows:BoardingBooking[],passenger?:BoardingBooking){
    const offerId=rows[0].offer_id;
    const choices=passenger?[passenger]:rows.filter(row=>row.boarded);
    if(choices.some(row=>!journeyChoices[row.id])){
      setMessage("Choose an outcome for every boarded passenger.");return;
    }
    const claims=choices.map(row=>claim(row.id,journeyChoices[row.id]));
    const path=passenger?`/v1/corridor-offers/${offerId}/journeys/${passenger.id}/confirm`
      :`/v1/corridor-offers/${offerId}/complete`;
    const payload=JSON.stringify(passenger?{travelled:claims[0].travelled,completed:claims[0].completed}:{claims});
    const storageKey=`pilot-journey:${passenger?passenger.id:offerId}`;
    const saved=window.sessionStorage.getItem(storageKey);
    const prior=saved?JSON.parse(saved) as {key:string;payload:string}:null;
    const attempt=prior?.payload===payload?prior:{key:crypto.randomUUID(),payload};
    window.sessionStorage.setItem(storageKey,JSON.stringify(attempt));
    setBusy(storageKey);setMessage("");
    try{
      const response=await apiRequest<{completion?:{state:string};confirmation?:{state:string}}>(path,{
        method:"POST",headers:{"Idempotency-Key":attempt.key},body:payload});
      const state=(response.completion??response.confirmation)?.state;
      if(state==='acknowledged'||state==='recovered'){
        window.sessionStorage.removeItem(storageKey);
        await onRefresh();
        setMessage(passenger?"Your journey outcome was recorded.":"Driver completion was recorded for each boarded passenger.");
      }else setMessage("Journey outcome is pending. Retry with the same selections.");
    }catch(error){
      if(error instanceof ApiError&&error.status<500&&error.code!=="OPERATION_PENDING")
        window.sessionStorage.removeItem(storageKey);
      setMessage(error instanceof Error?error.message:"Journey outcome is unknown. Retry with the same selections.");
    }finally{setBusy(null);}
  }
  function outcomeChoice(row:BoardingBooking){
    return <select aria-label={`Journey outcome for ${row.passenger_verified_name??"your seat"}`}
      className="rounded border p-1" value={journeyChoices[row.id]??""}
      onChange={event=>setJourneyChoices({...journeyChoices,[row.id]:event.target.value as JourneyChoice})}>
      <option value="">Choose outcome</option>
      <option value="completed">Travelled and completed</option>
      <option value="interrupted">Travelled but interrupted</option>
      <option value="did_not_travel">Did not travel</option>
    </select>;
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
          {row.driver_recorded_at&&<> · Driver: {row.driver_travelled&&row.driver_completed?"completed":row.driver_travelled?"interrupted":"did not travel"}</>}
          {row.passenger_recorded_at&&<> · Passenger: {row.passenger_travelled&&row.passenger_completed?"completed":row.passenger_travelled?"interrupted":"did not travel"}</>}
          {row.obligation_paise!=null&&<> · ₹{(row.obligation_paise/100).toFixed(2)} due {row.obligation_due_at?new Date(row.obligation_due_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):""} IST</>}
          {row.journey_review_reason&&<> · Operator review: {row.journey_review_reason}</>}
        </p>)}
        {mine&&state==='departed'&&rows.some(row=>row.boarded)&&!rows.some(row=>row.driver_recorded_at)&&<>
          <p>Report each boarded passenger separately. This alone creates no amount due.</p>
          {rows.filter(row=>row.boarded).map(row=><label key={row.id} className="block">
            {row.passenger_verified_name??"Confirmed passenger"} {outcomeChoice(row)}
          </label>)}
          <button type="button" className="rounded border px-3 py-1" disabled={busy!==null}
            onClick={()=>void submitJourney(rows)}>Record driver completion</button>
        </>}
        {!mine&&state==='departed'&&rows[0].boarded&&!rows[0].passenger_recorded_at&&<>
          <p>Confirm your own journey outcome.</p>
          {outcomeChoice(rows[0])}
          <button type="button" className="rounded border px-3 py-1" disabled={busy!==null}
            onClick={()=>void submitJourney(rows,rows[0])}>Confirm my journey</button>
        </>}
      </div>;
    })}
  </section>;
}
