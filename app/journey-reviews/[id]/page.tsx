"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import Link from "next/link";
import {apiRequest} from "@/lib/api/client";
type Detail={case:{id:string;offer_id:string;review_reason:string;status:string;
  frozen_paise:number;currency:string;driver_travelled:boolean|null;driver_completed:boolean|null;
  passenger_travelled:boolean|null;passenger_completed:boolean|null;obligation_paise:number|null;
  obligation_due_at:string|null};decisions:{id:string;outcome:string;
    contribution_owed:boolean|null;reason:string;decided_at:string}[]};
export default function JourneyReviewDetail(){
  const {id}=useParams<{id:string}>();
  const [detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState("");
  useEffect(()=>{if(id)void apiRequest<Detail>(`/v1/seat-requests/journey-reviews/${id}`)
    .then(setDetail).catch(e=>setError(e instanceof Error?e.message:"Unable to load review"));},[id]);
  return <main className="mx-auto max-w-2xl space-y-4 p-8"><Link href="/search-rides">Back to trips</Link>
    <h1 className="text-2xl font-semibold">Journey review</h1>{error&&<p role="alert">{error}</p>}
    {detail&&<><p>Ride {detail.case.offer_id} · {detail.case.review_reason} · {detail.case.status}</p>
      <p>Frozen contribution: ₹{(detail.case.frozen_paise/100).toFixed(2)} {detail.case.currency}</p>
      <p>Driver said: {detail.case.driver_travelled===null?"no claim":
        `${detail.case.driver_travelled?"travelled":"did not travel"}, ${detail.case.driver_completed?"completed":"not completed"}`}</p>
      <p>Passenger said: {detail.case.passenger_travelled===null?"no claim":
        `${detail.case.passenger_travelled?"travelled":"did not travel"}, ${detail.case.passenger_completed?"completed":"not completed"}`}</p>
      {detail.decisions.map(item=><p key={item.id} className="rounded border p-3">
        {item.outcome} · contribution {item.contribution_owed===null?"unresolved":item.contribution_owed?"owed":"not owed"}.
        {" "}{item.reason} · {new Date(item.decided_at).toLocaleString()}</p>)}
      <p>{detail.case.obligation_paise===null?"No contribution obligation has been established.":
        `Contribution owed: ₹${(detail.case.obligation_paise/100).toFixed(2)}, due ${new Date(detail.case.obligation_due_at!).toLocaleString()}. Payment receipt is recorded separately.`}</p>
    </>}
  </main>;
}
