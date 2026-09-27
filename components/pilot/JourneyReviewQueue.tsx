"use client";
import {useCallback,useEffect,useState} from "react";
import {apiRequest} from "@/lib/api/client";
type Item={id:string;allocation_id:string;offer_id:string;reason:string;status:string;
  latest_outcome:string|null;passenger_id:string;created_at:string};
type Detail={case:{id:string;allocation_id:string;offer_id:string;review_reason:string;status:string;
  frozen_paise:number;currency:string;driver_travelled:boolean|null;driver_completed:boolean|null;
  passenger_travelled:boolean|null;passenger_completed:boolean|null;obligation_paise:number|null;
  obligation_due_at:string|null;outcome:string|null;contribution_owed:boolean|null};
  decisions:{id:string;outcome:string;contribution_owed:boolean|null;reason:string;
    evidence_refs:string[];operator_id:string;decided_at:string}[]};
type Outcome="travelled_completed"|"did_not_travel"|"interrupted"|"insufficient_evidence";
export function JourneyReviewQueue(){
  const [items,setItems]=useState<Item[]>([]),[selected,setSelected]=useState<Detail|null>(null);
  const [outcome,setOutcome]=useState<Outcome>("insufficient_evidence");
  const [owed,setOwed]=useState(false),[reason,setReason]=useState(""),[refs,setRefs]=useState("");
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    const cases=(await apiRequest<{cases:Item[]}>("/v1/operator/journey-reviews")).cases;
    setItems(cases);
    if(selected) setSelected(await apiRequest<Detail>(`/v1/operator/journey-reviews/${selected.case.id}`));
  },[selected]);
  useEffect(()=>{void apiRequest<{cases:Item[]}>("/v1/operator/journey-reviews")
    .then(result=>setItems(result.cases)).catch(()=>setMessage("Unable to load journey reviews."));},[]);
  async function open(id:string){try{setSelected(await apiRequest<Detail>(`/v1/operator/journey-reviews/${id}`));
    setMessage("");}catch(error){setMessage(error instanceof Error?error.message:"Unable to load review");}}
  async function decide(){
    if(!selected||reason.trim().length<8)return;
    const command={outcome,contribution_owed:outcome==="insufficient_evidence"?null:
      outcome==="did_not_travel"?false:owed,reason:reason.trim(),
      evidence_refs:refs.split("\n").map(x=>x.trim()).filter(Boolean)};
    const storageKey=`journey-review:${selected.case.id}:${JSON.stringify(command)}`;
    const key=sessionStorage.getItem(storageKey)??crypto.randomUUID();
    sessionStorage.setItem(storageKey,key);setBusy(true);
    try{
      const result=await apiRequest<{operation:{operation_id:string;state:string}}>(
        `/v1/operator/journey-reviews/${selected.case.id}/decide`,{method:"POST",
          headers:{"Idempotency-Key":key},body:JSON.stringify(command)});
      sessionStorage.removeItem(storageKey);
      setMessage(`Decision ${result.operation.operation_id}: ${result.operation.state}.`);
      await refresh();
    }catch(error){setMessage(`Decision outcome uncertain. Retry with the same inputs and key ${key}. ${error instanceof Error?error.message:""}`);}
    finally{setBusy(false);}
  }
  return <section className="space-y-3 rounded border p-4" aria-label="Journey review queue">
    <h2 className="font-semibold">Journey review queue</h2><p role="status">{message}</p>
    {items.length?items.map(item=><button key={item.id} className="block w-full rounded border p-3 text-left"
      onClick={()=>void open(item.id)}>Ride {item.offer_id} · passenger {item.passenger_id} · {item.reason} · {item.status}
      {item.latest_outcome?` · latest: ${item.latest_outcome}`:""}</button>):<p>No open journey reviews.</p>}
    {selected&&<div className="space-y-3 rounded border p-3" aria-label="Journey review detail">
      <h3 className="font-semibold">Case {selected.case.id}</h3>
      <p>Ride {selected.case.offer_id} · seat {selected.case.allocation_id} · {selected.case.review_reason} · {selected.case.status}</p>
      <p>Frozen contribution: ₹{(selected.case.frozen_paise/100).toFixed(2)} {selected.case.currency}</p>
      <p>Driver claim: {selected.case.driver_travelled===null?"missing":
        `${selected.case.driver_travelled?"travelled":"did not travel"}, ${selected.case.driver_completed?"completed":"not completed"}`}</p>
      <p>Passenger claim: {selected.case.passenger_travelled===null?"missing":
        `${selected.case.passenger_travelled?"travelled":"did not travel"}, ${selected.case.passenger_completed?"completed":"not completed"}`}</p>
      <p>Obligation: {selected.case.obligation_paise===null?"none":
        `₹${(selected.case.obligation_paise/100).toFixed(2)} due ${new Date(selected.case.obligation_due_at!).toLocaleString()}`}. Payment receipt is separate.</p>
      {selected.decisions.map(d=><p key={d.id} className="rounded border p-2">{d.outcome} · contribution {d.contribution_owed===null?"unresolved":d.contribution_owed?"owed":"not owed"} · {d.reason} · evidence {d.evidence_refs.join(", ")||"none"} · operator {d.operator_id} · {new Date(d.decided_at).toLocaleString()}</p>)}
      {selected.case.status==="open"&&<div className="space-y-2">
        <label className="block">Journey outcome<select className="block rounded border p-1" value={outcome}
          onChange={event=>setOutcome(event.target.value as Outcome)}>
          <option value="insufficient_evidence">Insufficient evidence, keep open</option>
          <option value="travelled_completed">Travelled and completed</option>
          <option value="did_not_travel">Did not travel</option>
          <option value="interrupted">Interrupted</option></select></label>
        {(outcome==="travelled_completed"||outcome==="interrupted")&&<label className="flex gap-2">
          <input type="checkbox" checked={owed} onChange={event=>setOwed(event.target.checked)}/>Frozen contribution owed</label>}
        <label className="block">Decision reason<input className="block w-full rounded border p-1" value={reason}
          onChange={event=>setReason(event.target.value)} maxLength={500}/></label>
        <label className="block">Evidence references, one per line<textarea className="block w-full rounded border p-1"
          value={refs} onChange={event=>setRefs(event.target.value)}/></label>
        <button disabled={busy||reason.trim().length<8} onClick={()=>void decide()}>Record decision</button>
      </div>}
    </div>}
  </section>;
}
