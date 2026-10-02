'use client';
import {useCallback,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {apiRequest,ApiError} from '@/lib/api/client';
import {useCurrentUser} from '@/hooks/auth/useCurrentUser';
import JourneyStateGuide from '@/components/JourneyStateGuide';
import {formatPaiseAmount} from '@/lib/formatPaiseAmount';

type Obligation={obligation_id:string;amount_paise:number;currency:string;due_at:string;
  driver_id:string;passenger_id:string;claim:{id:string;method:string;recorded_at:string}|null;
  receipt:{id:string;recorded_at:string}|null;response:string|null;
  review:{id:string|null;reason:string;status?:string}|null;status:string;
  contribution_owed?:boolean|null;receipt_established?:boolean|null};
const DRIVER_RESPONSE_WINDOW_MS=24*60*60*1000;
const contributionGuide={
  due:['Obligation due','Both journey statements agreed, or an operator established that a contribution is owed.','Pay the driver directly in cash or by UPI, then report the method.','Passenger','Within 24 hours of confirmation or decision'],
  cash:['Cash claim awaiting receipt','The passenger reports handing over cash. This claim is not a receipt or a settled payment.','Confirm receipt or dispute the claim.','Driver','Within 24 hours of the claim'],
  upi:['UPI claim awaiting receipt','The passenger reports sending UPI. The platform does not move the funds or verify the transfer.','Confirm receipt or dispute the claim.','Driver','Within 24 hours of the claim'],
  receipt:['Driver receipt confirmed','The driver has recorded receiving the direct contribution.','Review the record if a later dispute needs evidence.','Participant','No response deadline remains'],
  dispute:['Claim disputed','The driver disputes the passenger claim. A disputed claim is not paid or settled.','Review evidence and record a case outcome.','Operator','When the case is decided'],
  overdue:['Overdue obligation','The due time passed with no payment claim. Time does not create a claim or receipt.','Pay directly and report the claim, or seek review if the obligation is disputed.','Passenger','As soon as possible; operator can see overdue work'],
  review:['Operator review','A dispute or driver silence opened review. Silence does not establish receipt.','Read the recorded case decision and distinguish contribution owed from receipt established.','Operator','When the case is decided'],
  unknown:['Unknown operation result','A response to a claim, receipt, dispute, or report was lost.','Check the owner-scoped operation before retrying the same payload and idempotency key.','Original actor','Before any dependent action'],
} as const;
type GuideState=keyof typeof contributionGuide;
export default function DirectSettlementsPage(){
  const {isAuthenticated,loading,user}=useCurrentUser();
  const router=useRouter();
  const [items,setItems]=useState<Obligation[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const [guideState,setGuideState]=useState<GuideState>('cash');
  const [phase,setPhase]=useState<'loading'|'ready'|'error'|'restricted'>('loading');
  const [readError,setReadError]=useState('');
  const [reportReason,setReportReason]=useState<Record<string,string>>({});
  const [caseDetail,setCaseDetail]=useState<Record<string,{review:{status:string}|null;
    decisions:{contribution_owed:boolean|null;receipt_established:boolean|null;
      case_resolution:string;reason:string;recorded_at:string}[];reports:{reason:string}[]}>>({});
  const [now,setNow]=useState(()=>Date.now());
  const refresh=useCallback(async()=>{
    setPhase('loading');
    try {const response=await apiRequest<{obligations:Obligation[]}>('/v1/direct-settlements');
      setItems(response.obligations);setReadError('');setPhase('ready');
    }catch(error){const detail=error instanceof Error?error.message:'Unable to read contributions';
      setReadError(detail);setPhase(/restricted|forbidden|unauthorized/i.test(detail)?'restricted':'error');
      throw error;}
  },[]);
  useEffect(()=>{if(!loading&&!isAuthenticated) router.replace('/login');},[loading,isAuthenticated,router]);
  useEffect(()=>{if(isAuthenticated) void refresh().catch(error=>setMessage(String(error)));},[isAuthenticated,refresh]);
  useEffect(()=>{
    const deadlines=items.map(item=>item.claim&&!item.response?
      Date.parse(item.claim.recorded_at)+DRIVER_RESPONSE_WINDOW_MS:!item.claim?Date.parse(item.due_at):Infinity)
      .filter(deadline=>deadline>now&&Number.isFinite(deadline));
    if(!deadlines.length) return;
    const delay=Math.min(Math.min(...deadlines)-now,2_147_483_647);
    const timer=window.setTimeout(()=>{setNow(Date.now());void refresh().catch(()=>undefined);},delay);
    return ()=>window.clearTimeout(timer);
  },[items,now,refresh]);
  async function act(item:Obligation,kind:'claim'|'confirm'|'dispute',method?:'cash'|'upi'){
    const storageKey=`direct-settlement:${item.obligation_id}:${kind}`;
    const key=sessionStorage.getItem(storageKey)??crypto.randomUUID();
    sessionStorage.setItem(storageKey,key);setBusy(storageKey);setMessage('');
    try{
      const result=await apiRequest<{operation_id:string;state:string}>(
        `/v1/direct-settlements/${item.obligation_id}/${kind}`,{
          method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(kind==='claim'?{method}:{})});
      if(result.state==='acknowledged'||result.state==='recovered'){
        sessionStorage.removeItem(storageKey);await refresh();
        setMessage(kind==='claim'?'Payment claim recorded. The driver must confirm receipt before this is settled.':
          kind==='confirm'?'Receipt confirmed.':'Dispute sent for review.');
      }else setMessage('Outcome pending. Retry this action with the same key.');
    }catch(error){
      if(error instanceof ApiError&&error.status<500&&error.code!=='OPERATION_PENDING')
        sessionStorage.removeItem(storageKey);
      setMessage(error instanceof Error?`${error.message} Retry uses the same operation.`:
        'Outcome unknown. Retry uses the same operation.');
    }finally{setBusy(null);}
  }
  async function report(item:Obligation){
    const reason=reportReason[item.obligation_id]?.trim()??'';
    if(reason.length<8){setMessage('Describe the dispute in at least eight characters.');return;}
    const storageKey=`settlement-report:${item.obligation_id}`;
    const key=sessionStorage.getItem(storageKey)??crypto.randomUUID();
    sessionStorage.setItem(storageKey,key);setBusy(storageKey);setMessage('');
    try{
      const result=await apiRequest<{operation:{state:string}}>(
        `/v1/direct-settlements/${item.obligation_id}/report-dispute`,{
          method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify({reason})});
      if(result.operation.state==='acknowledged'||result.operation.state==='recovered'){
        sessionStorage.removeItem(storageKey);await refresh();
        setMessage('Dispute recorded for operator review. Your original payment claim remains visible.');
      }else setMessage('Outcome pending. Retry with the same key.');
    }catch(error){if(error instanceof ApiError&&error.status<500&&error.code!=='OPERATION_PENDING')
      sessionStorage.removeItem(storageKey);
      setMessage(error instanceof Error?error.message:'Outcome uncertain. Retry with the same key.');
    }finally{setBusy(null);}
  }
  async function showCase(id:string){
    try{const detail=await apiRequest<typeof caseDetail[string]>(`/v1/direct-settlements/${id}/case`);
      setCaseDetail(current=>({...current,[id]:detail}));}
    catch(error){setMessage(error instanceof Error?error.message:'Unable to load settlement case.');}
  }
  return <main id="main-content" className="journey-page">
    <header className="journey-head"><div><span className="journey-kicker">DIRECT SETTLEMENT / PARTICIPANT</span><h1>Contributions</h1><p>Pay each other directly in cash or by UPI. Petrol Partner does not collect or transfer money.</p></div><Link href="/trips">← Back to Trips</Link></header>
    <div className="journey-alert"><strong>Evidence matters</strong><p>A passenger claim is a report, not proof of receipt. Only a driver receipt or recorded operator decision establishes the corresponding outcome. These are historical fixed-corridor pilot records.</p><Link href="/payments">Historical platform-payment records →</Link></div>
    {message&&<p role="status" className="journey-message">{message}</p>}
    <div className="journey-section-head"><div><span>FROZEN OBLIGATIONS / OWNER-SCOPED READ</span><h2>Direct contribution records</h2></div><button type="button" disabled={phase==='loading'} onClick={()=>void refresh().catch(()=>undefined)}>Retry read</button></div>
    {phase==='loading'&&<p role="status" className="journey-message">Loading contribution records…</p>}
    {(phase==='error'||phase==='restricted')&&<div role="alert" className="journey-message"><strong>{phase==='restricted'?'Access restricted':'Could not load contributions'}</strong><p>{readError}</p><p>Retry the read. No payment action was submitted.</p></div>}
    {phase==='ready'&&items.map(item=>{const outstanding=item.review?.status==='resolved'&&
      item.contribution_owed===true&&item.receipt_established===false;
      return <section key={item.obligation_id} className="contribution-card">
      <div className="contribution-card-head"><span>HISTORICAL FIXED CORRIDOR · {user?.id===item.passenger_id?'PASSENGER':'DRIVER'}</span><strong>{item.status.replaceAll('_',' ')}</strong></div>
      <h2>{formatPaiseAmount(item.amount_paise,item.currency)}</h2>
      <p>Frozen amount · due <time dateTime={item.due_at}>{new Date(item.due_at).toLocaleString('en-IN')}</time></p>
      {item.claim&&<p>Passenger reported {item.claim.method.toUpperCase()} payment at {new Date(item.claim.recorded_at).toLocaleString('en-IN')}. Awaiting driver receipt unless shown below.</p>}
      {item.receipt&&<p>Driver confirmed receipt at {new Date(item.receipt.recorded_at).toLocaleString('en-IN')}.</p>}
      {item.review&&<p>Operator review {item.review.status??'pending'}: {item.review.reason.replaceAll('_',' ')}. {item.review.status==='resolved'?'Read the case decision for contribution and receipt findings.':'No automatic restriction or receipt is implied.'}</p>}
      {item.review?.status==='resolved'&&<p>{item.contribution_owed?'Contribution owed':'No contribution owed'}; {item.receipt_established?'receipt established':'receipt not established'}. {outstanding?'The earlier claim is not proof of receipt.':''}</p>}
      <div className="contribution-next"><strong>Next action</strong><p>{outstanding?'Review the case decision and resolve the outstanding direct contribution with the driver.':item.status==='settled'?'Receipt recorded. Review the history if needed.':item.review?.status==='resolved'?'Read the recorded operator decision. A decision and receipt remain separate findings.':item.review?'Operator reviews the evidence; participants can inspect or report the case.':item.claim?'Driver confirms receipt or disputes the claim.':item.status==='overdue'?'Passenger reports a direct payment claim; overdue is not paid.':'Passenger pays the driver directly, then reports cash or UPI.'}</p><p><b>Actor:</b> {outstanding?'Passenger':item.review?.status==='resolved'||item.status==='settled'?'No action due':item.review?'Operator':item.claim?'Driver':'Passenger'} · <b>By:</b> {outstanding?new Date(item.due_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'})+' IST':item.review?.status==='resolved'||item.status==='settled'?'Decision recorded':item.claim&&!item.response?new Date(Date.parse(item.claim.recorded_at)+DRIVER_RESPONSE_WINDOW_MS).toLocaleString('en-IN'):new Date(item.due_at).toLocaleString('en-IN')}</p></div>
      {item.claim&&<div className="contribution-actions">
        {item.review?.status!=='resolved'&&<><label className="block">Report a settlement dispute
          <textarea className="mt-1 block w-full rounded border p-2" value={reportReason[item.obligation_id]??''}
            onChange={event=>setReportReason(current=>({...current,[item.obligation_id]:event.target.value}))}
            placeholder="Describe what needs operator review" /></label>
        <button disabled={Boolean(busy)} onClick={()=>void report(item)}>Send dispute report</button></>}
        <button onClick={()=>void showCase(item.obligation_id)}>View case history</button>
        {caseDetail[item.obligation_id]&&<div className="rounded border p-3 space-y-1">
          <p>Case: {caseDetail[item.obligation_id].review?.status??'No review opened'}</p>
          {caseDetail[item.obligation_id].reports.map((entry,index)=><p key={index}>Report: {entry.reason}</p>)}
          {caseDetail[item.obligation_id].decisions.map((entry,index)=><p key={index}>
            {new Date(entry.recorded_at).toLocaleString()}: {entry.case_resolution}; contribution
            {entry.contribution_owed===null?' undetermined':entry.contribution_owed?' owed':' not owed'};
            receipt {entry.receipt_established===null?'undetermined':entry.receipt_established?'established':'not established'}.
            {' '}{entry.reason}</p>)}
        </div>}
      </div>}
      {user?.id===item.passenger_id&&!item.claim&&item.contribution_owed!==false&&<div className="contribution-actions">
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'claim','cash')}>Report cash handed over</button>
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'claim','upi')}>Report UPI sent</button>
      </div>}
      {user?.id===item.driver_id&&item.claim&&!item.response&&!item.review&&
        now<Date.parse(item.claim.recorded_at)+DRIVER_RESPONSE_WINDOW_MS&&<div className="contribution-actions">
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'confirm')}>Confirm receipt</button>
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'dispute')}>Dispute claim</button>
      </div>}
    </section>})}
    {phase==='ready'&&!items.length&&<p className="journey-empty">No direct contribution obligations are recorded for your journeys. An accepted seat alone does not create an obligation.</p>}
    <JourneyStateGuide id="contribution-guide-title" title="Understand the evidence"
      description="Sample frozen amount: INR 2,500 paise (₹25.00). Sample due time: 3 October, 17:00 IST. No obligation or payment was created by this example."
      selectLabel="Contribution state" states={contributionGuide} selected={guideState}
      onSelect={key=>setGuideState(key as GuideState)}/>
  </main>;
}
