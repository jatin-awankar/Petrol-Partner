'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {apiRequest,ApiError} from '@/lib/api/client';
import Link from 'next/link';
type QueueItem={obligation_id:string;reason:string|null;claimed_at:string;amount_paise:number;currency:string};
type Detail={obligation:{id:string;amount_paise:number;currency:string;due_at:string};
  participants?:{driver_id:string;passenger_id:string};
  claim:{method:string;recorded_at:string}|null;response:{id:string;kind:string;recorded_at:string}|null;
  reports:{reason:string}[];decisions:{case_resolution:string;contribution_owed:boolean|null;
    receipt_established:boolean|null;reason:string}[];
  audit:{action:string;created_at:string;operation_id:string}[]};
type DecisionAttempt={caseId:string;key:string;body:string;operationId:string|null};
const attemptStorage='operator:settlement-decision-attempt';
export default function SettlementReviewsPage(){
  const [queue,setQueue]=useState<QueueItem[]>([]),[detail,setDetail]=useState<Detail|null>(null);
  const [id,setId]=useState<string|null>(null),[reason,setReason]=useState(''),[evidence,setEvidence]=useState('');
  const [owed,setOwed]=useState('unknown'),[received,setReceived]=useState('unknown');
  const [basis,setBasis]=useState<'participant_confirmation'|'reviewed_evidence'>('reviewed_evidence');
  const [confirmation,setConfirmation]=useState(''),[reviewSummary,setReviewSummary]=useState('');
  const [resolution,setResolution]=useState<'resolved'|'unresolved'>('unresolved');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [attempt,setAttempt]=useState<DecisionAttempt|null>(null);
  const inspection=useRef(0);
  const [access,setAccess]=useState<'loading'|'ready'|'denied'|'error'>('loading');
  const refresh=useCallback(async()=>{
    setQueue((await apiRequest<{queue:QueueItem[]}>(
      '/v1/operator/settlement-reviews')).queue);
    setAccess('ready');
  },[]);
  useEffect(()=>{void refresh().catch(error=>{
    setAccess(error instanceof ApiError&&(error.status===401||error.status===403)?'denied':'error');
    setMessage(error instanceof Error?error.message:'Unable to load settlement reviews');
  });},[refresh]);
  useEffect(()=>{
    const saved=sessionStorage.getItem(attemptStorage);
    if(saved)try{setAttempt(JSON.parse(saved) as DecisionAttempt);}catch{sessionStorage.removeItem(attemptStorage);}
  },[]);
  function saveAttempt(next:DecisionAttempt|null){
    setAttempt(next);
    if(next)sessionStorage.setItem(attemptStorage,JSON.stringify(next));
    else sessionStorage.removeItem(attemptStorage);
  }
  async function inspect(obligationId:string){
    const request=++inspection.current;
    setId(null);setDetail(null);setMessage('');
    try{
      const next=await apiRequest<Detail>(`/v1/operator/settlement-reviews/${obligationId}`);
      if(request!==inspection.current)return false;
      if(next.obligation.id!==obligationId)throw new Error('Case detail did not match the selected obligation');
      setDetail(next);setId(obligationId);
      return true;
    }catch(error){if(request===inspection.current)setMessage(String(error));return false;}
  }
  async function decide(){
    if(!id||detail?.obligation.id!==id||reason.trim().length<8||attempt) return;
    const finding=(value:string)=>value==='unknown'?null:value==='yes';
    const body=JSON.stringify({contribution_owed:finding(owed),
      receipt_established:finding(received),case_resolution:resolution,reason:reason.trim(),
      evidence_refs:received==='yes'&&basis==='participant_confirmation'?[]:
        evidence.split('\n').map(x=>x.trim()).filter(Boolean),
      participant_confirmation_id:received==='yes'&&basis==='participant_confirmation'?
        confirmation.trim()||null:null,
      receipt_basis:received==='yes'?basis:null,
      reviewed_evidence_summary:received==='yes'&&basis==='reviewed_evidence'?
        reviewSummary.trim():null});
    const next={caseId:id,key:crypto.randomUUID(),body,operationId:null};
    saveAttempt(next);void sendAttempt(next);
  }
  async function sendAttempt(next:DecisionAttempt){
    setBusy(true);
    try{
      const result=await apiRequest<{operation:{state:string;operation_id:string}}>(
        `/v1/operator/settlement-reviews/${next.caseId}/decide`,{method:'POST',
          headers:{'Idempotency-Key':next.key},body:next.body});
      if(result.operation.state==='acknowledged'||result.operation.state==='recovered'){
        saveAttempt(null);
        const refreshed=await refresh().then(()=>true).catch(()=>false);
        const inspected=id===next.caseId?await inspect(next.caseId):true;
        setMessage(`Decision ${result.operation.operation_id} recorded.${refreshed?'':' Queue could not refresh; retry the read.'}${inspected?'':' Case detail could not refresh; reopen it.'}`);
      }else {saveAttempt({...next,operationId:result.operation.operation_id});setMessage(`Decision ${result.operation.operation_id} pending. Check its status before another decision.`);}
    }catch(error){
      const details=error&&typeof error==='object'&&'details' in error?error.details:null;
      const operationId=details&&typeof details==='object'&&'operationId' in details?String(details.operationId):null;
      if(operationId)saveAttempt({...next,operationId});
      else if(error instanceof ApiError&&error.status<500&&error.code!=='OPERATION_PENDING')saveAttempt(null);
      setMessage(error instanceof Error?error.message:'Outcome uncertain. Retry the same decision.');
    }finally{setBusy(false);}
  }
  async function checkDecision(){
    if(!attempt?.operationId)return;
    setBusy(true);
    try{
      const result=await apiRequest<{operation:{state:string}}>(`/v1/operator/settlement-case-operations/${attempt.operationId}`);
      if(result.operation.state==='acknowledged'||result.operation.state==='recovered'){
        saveAttempt(null);
        const refreshed=await refresh().then(()=>true).catch(()=>false);
        const inspected=id===attempt.caseId?await inspect(id):true;
        setMessage(`Decision ${attempt.operationId}: ${result.operation.state}.${refreshed?'':' Queue could not refresh; retry the read.'}${inspected?'':' Case detail could not refresh; reopen it.'}`);
      }else setMessage(`Decision ${attempt.operationId} is still ${result.operation.state}. Keep the same decision key.`);
    }catch(error){setMessage(`Could not check decision ${attempt.operationId}: ${error instanceof Error?error.message:'unknown error'}`);}
    finally{setBusy(false);}
  }
  if(access==='loading')return <main id="main-content" className="operator-workspace" role="status">Loading settlement reviews…</main>;
  if(access==='denied')return <main id="main-content" className="operator-workspace" role="alert">Operator access requires current allowlist membership and MFA. {message}</main>;
  return <main id="main-content" className="operator-workspace space-y-5">
    <Link href="/operator#journeys">← Operator workspace</Link>
    <h1 className="text-2xl font-semibold">Settlement reviews</h1>
    <p>Historical fixed-corridor cases. Record contribution, receipt, and case findings separately. Closing a case creates no payment or penalty.</p>
    {access==='error'&&<p role="alert">Queue unavailable. <button onClick={()=>void refresh()}>Retry load</button></p>}
    {message&&<p role="status">{message}</p>}
    {attempt&&<div className="operator-notice" role="status">Decision for case {attempt.caseId} needs a confirmed outcome.
      {' '}{attempt.operationId?<button disabled={busy} onClick={()=>void checkDecision()}>Check settlement decision status</button>
        :<button disabled={busy} onClick={()=>void sendAttempt(attempt)}>Retry same settlement decision</button>}</div>}
    <section className="operator-panel"><h2 className="font-semibold">Open disputes and unanswered claims</h2>
      {queue.map(item=><button key={item.obligation_id} className="block w-full rounded border p-3 text-left"
        onClick={()=>void inspect(item.obligation_id)}>{item.obligation_id} · {item.currency}
        {' '}{(item.amount_paise/100).toFixed(2)} · {item.reason??'unanswered for 24 hours'}</button>)}
      {!queue.length&&<p>{access==='error'?'Settlement queue unavailable. Retry load.':'No open settlement cases.'}</p>}
    </section>
    {id&&detail&&<section className="operator-panel space-y-3">
      <h2 className="font-semibold">Case {id}</h2>
      <p>Original obligation: {detail.obligation.currency}
        {' '}{(detail.obligation.amount_paise/100).toFixed(2)}</p>
      <time dateTime={detail.obligation.due_at}>Due {new Date(detail.obligation.due_at).toLocaleString()}</time>
      <p>Claim: {detail.claim?`${detail.claim.method} at ${new Date(detail.claim.recorded_at).toLocaleString()}`:'none'}</p>
      <p>Driver response: {detail.response?`${detail.response.kind} (${detail.response.id}) at ${new Date(detail.response.recorded_at).toLocaleString()}`:'none'}</p>
      {detail.reports.map((item,index)=><p key={index}>Participant report: {item.reason}</p>)}
      {detail.decisions.map((item,index)=><p key={index}>Decision: {item.case_resolution}; contribution
        {' '}{String(item.contribution_owed)}; receipt {String(item.receipt_established)}. {item.reason}</p>)}
      {detail.decisions.some(item=>item.case_resolution==='resolved')&&detail.participants&&<p>
        <Link className="underline" href={`/operator/restrictions?source_type=settlement&source_id=${id}&target=${detail.participants.passenger_id}&scope=passenger`}>
          Review passenger restriction</Link>{' · '}
        <Link className="underline" href={`/operator/restrictions?source_type=settlement&source_id=${id}&target=${detail.participants.driver_id}&scope=driver`}>
          Review driver restriction</Link></p>}
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
      <div className="operator-case" aria-label="Decision impact preview">
        <p>Affected: passenger {detail.participants?.passenger_id??'not supplied'}; driver {detail.participants?.driver_id??'not supplied'}. Actor: current operator.</p>
        <p>Contribution owed: {owed==='yes'?'yes':owed==='no'?'no':'undetermined'}; receipt established: {received==='yes'?'yes':received==='no'?'no':'undetermined'}.</p>
        <p>Case will be {resolution==='resolved'?'resolved':'kept actionable'} after a recorded decision. Resolution requires both findings; this action creates no payment or automatic restriction.</p>
        <p>Reason and reviewed evidence are recorded with the findings. Existing claims and receipts remain in the case history.</p>
      </div>
      {resolution==='resolved'&&(owed==='unknown'||received==='unknown')&&<p>Select both contribution and receipt findings to resolve this case.</p>}
      <button disabled={busy||!!attempt||reason.trim().length<8||(resolution==='resolved'&&(owed==='unknown'||received==='unknown'))} onClick={()=>void decide()}>Record findings</button>
    </section>}
  </main>;
}
