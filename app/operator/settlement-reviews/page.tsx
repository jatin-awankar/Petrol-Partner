'use client';
import {useCallback,useEffect,useState} from 'react';
import {apiRequest,ApiError} from '@/lib/api/client';
type QueueItem={obligation_id:string;reason:string|null;claimed_at:string;amount_paise:number;currency:string};
type Detail={claim:{method:string;recorded_at:string}|null;response:{id:string;kind:string;recorded_at:string}|null;
  reports:{reason:string}[];decisions:{case_resolution:string;contribution_owed:boolean|null;
    receipt_established:boolean|null;reason:string}[];
  audit:{action:string;created_at:string;operation_id:string}[]};
export default function SettlementReviewsPage(){
  const [queue,setQueue]=useState<QueueItem[]>([]),[detail,setDetail]=useState<Detail|null>(null);
  const [id,setId]=useState<string|null>(null),[reason,setReason]=useState(''),[evidence,setEvidence]=useState('');
  const [owed,setOwed]=useState('unknown'),[received,setReceived]=useState('unknown');
  const [basis,setBasis]=useState<'participant_confirmation'|'reviewed_evidence'>('reviewed_evidence');
  const [confirmation,setConfirmation]=useState(''),[reviewSummary,setReviewSummary]=useState('');
  const [resolution,setResolution]=useState<'resolved'|'unresolved'>('unresolved');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>setQueue((await apiRequest<{queue:QueueItem[]}>(
    '/v1/operator/settlement-reviews')).queue),[]);
  useEffect(()=>{void refresh().catch(error=>setMessage(String(error)));},[refresh]);
  async function inspect(obligationId:string){
    try{setId(obligationId);setDetail(await apiRequest<Detail>(
      `/v1/operator/settlement-reviews/${obligationId}`));}
    catch(error){setMessage(String(error));}
  }
  async function decide(){
    if(!id||reason.trim().length<8) return;
    const storageKey=`settlement-decision:${id}`;
    const key=sessionStorage.getItem(storageKey)??crypto.randomUUID();
    sessionStorage.setItem(storageKey,key);setBusy(true);
    const finding=(value:string)=>value==='unknown'?null:value==='yes';
    try{
      const result=await apiRequest<{operation:{state:string;operation_id:string}}>(
        `/v1/operator/settlement-reviews/${id}/decide`,{method:'POST',
          headers:{'Idempotency-Key':key},body:JSON.stringify({contribution_owed:finding(owed),
            receipt_established:finding(received),case_resolution:resolution,reason:reason.trim(),
            evidence_refs:received==='yes'&&basis==='participant_confirmation'?[]:
              evidence.split('\n').map(x=>x.trim()).filter(Boolean),
            participant_confirmation_id:received==='yes'&&basis==='participant_confirmation'?
              confirmation.trim()||null:null,
            receipt_basis:received==='yes'?basis:null,
            reviewed_evidence_summary:received==='yes'&&basis==='reviewed_evidence'?
              reviewSummary.trim():null})});
      if(result.operation.state==='acknowledged'||result.operation.state==='recovered'){
        sessionStorage.removeItem(storageKey);setMessage(`Decision ${result.operation.operation_id} recorded.`);
        await refresh();await inspect(id);
      }else setMessage(`Decision ${result.operation.operation_id} pending. Retry with the same key.`);
    }catch(error){if(error instanceof ApiError&&error.status<500&&error.code!=='OPERATION_PENDING')
      sessionStorage.removeItem(storageKey);
      setMessage(error instanceof Error?error.message:'Outcome uncertain. Retry with the same key.');
    }finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Settlement reviews</h1>
    <p>Record contribution, receipt, and case findings separately. Closing a case creates no payment or penalty.</p>
    {message&&<p role="status">{message}</p>}
    <section><h2 className="font-semibold">Open disputes and unanswered claims</h2>
      {queue.map(item=><button key={item.obligation_id} className="block w-full rounded border p-3 text-left"
        onClick={()=>void inspect(item.obligation_id)}>{item.obligation_id} · {item.currency}
        {' '}{(item.amount_paise/100).toFixed(2)} · {item.reason??'unanswered for 24 hours'}</button>)}
      {!queue.length&&<p>No open settlement cases.</p>}
    </section>
    {id&&detail&&<section className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Case {id}</h2>
      <p>Claim: {detail.claim?`${detail.claim.method} at ${new Date(detail.claim.recorded_at).toLocaleString()}`:'none'}</p>
      <p>Driver response: {detail.response?`${detail.response.kind} (${detail.response.id}) at ${new Date(detail.response.recorded_at).toLocaleString()}`:'none'}</p>
      {detail.reports.map((item,index)=><p key={index}>Participant report: {item.reason}</p>)}
      {detail.decisions.map((item,index)=><p key={index}>Decision: {item.case_resolution}; contribution
        {' '}{String(item.contribution_owed)}; receipt {String(item.receipt_established)}. {item.reason}</p>)}
      <details><summary>Audit history</summary>{detail.audit.map((item,index)=><p key={index}>
        {item.action} · {new Date(item.created_at).toLocaleString()} · {item.operation_id}</p>)}</details>
      <label className="block">Contribution owed <select value={owed} onChange={e=>setOwed(e.target.value)}>
        <option value="unknown">Undetermined</option><option value="yes">Owed</option><option value="no">Not owed</option></select></label>
      <label className="block">Receipt established <select value={received} onChange={e=>setReceived(e.target.value)}>
        <option value="unknown">Undetermined</option><option value="yes">Established</option><option value="no">Not established</option></select></label>
      {received==='yes'&&<label className="block">Receipt basis <select value={basis}
        onChange={e=>setBasis(e.target.value as typeof basis)}><option value="reviewed_evidence">Reviewed evidence</option>
        <option value="participant_confirmation">Recorded driver confirmation</option></select></label>}
      {received==='yes'&&basis==='participant_confirmation'&&<label className="block">
        Driver confirmation ID<input className="block w-full rounded border p-2" value={confirmation}
          onChange={e=>setConfirmation(e.target.value)} placeholder={detail.response?.kind==='confirm'?
            detail.response.id:'No confirmation recorded'} /></label>}
      <label className="block">Case outcome <select value={resolution} onChange={e=>setResolution(e.target.value as typeof resolution)}>
        <option value="unresolved">Keep actionable</option><option value="resolved">Resolve</option></select></label>
      <label className="block">Reason<textarea className="block w-full rounded border p-2" value={reason}
        onChange={e=>setReason(e.target.value)} /></label>
      <label className="block">Reviewed evidence references, one per line<textarea className="block w-full rounded border p-2"
        value={evidence} onChange={e=>setEvidence(e.target.value)} /></label>
      {received==='yes'&&basis==='reviewed_evidence'&&<label className="block">What evidence was reviewed?
        <textarea className="block w-full rounded border p-2" value={reviewSummary}
          onChange={e=>setReviewSummary(e.target.value)} /></label>}
      <button disabled={busy||reason.trim().length<8} onClick={()=>void decide()}>Record findings</button>
    </section>}
  </main>;
}
