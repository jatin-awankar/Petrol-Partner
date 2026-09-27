'use client';
import {useCallback,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {apiRequest,ApiError} from '@/lib/api/client';
import {useCurrentUser} from '@/hooks/auth/useCurrentUser';

type Obligation={obligation_id:string;amount_paise:number;currency:string;due_at:string;
  driver_id:string;passenger_id:string;claim:{id:string;method:string;recorded_at:string}|null;
  receipt:{id:string;recorded_at:string}|null;response:string|null;
  review:{id:string|null;reason:string;status?:string}|null;status:string};
const DRIVER_RESPONSE_WINDOW_MS=24*60*60*1000;
export default function DirectSettlementsPage(){
  const {isAuthenticated,loading,user}=useCurrentUser();
  const router=useRouter();
  const [items,setItems]=useState<Obligation[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const [reportReason,setReportReason]=useState<Record<string,string>>({});
  const [caseDetail,setCaseDetail]=useState<Record<string,{review:{status:string}|null;
    decisions:{contribution_owed:boolean|null;receipt_established:boolean|null;
      case_resolution:string;reason:string;recorded_at:string}[];reports:{reason:string}[]}>>({});
  const [now,setNow]=useState(()=>Date.now());
  const refresh=useCallback(async()=>{
    const response=await apiRequest<{obligations:Obligation[]}>('/v1/direct-settlements');
    setItems(response.obligations);
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
  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Direct cash and UPI settlement</h1>
    <p>Pay the driver directly. Petrol Partner does not collect or transfer money.</p>
    {message&&<p role="status">{message}</p>}
    {items.map(item=><section key={item.obligation_id} className="rounded border p-4 space-y-2">
      <h2 className="font-semibold">{item.currency} {(item.amount_paise/100).toFixed(2)} owed</h2>
      <p>Due {new Date(item.due_at).toLocaleString()} · {item.status.replaceAll('_',' ')}</p>
      {item.claim&&<p>Passenger reported {item.claim.method.toUpperCase()} payment at {new Date(item.claim.recorded_at).toLocaleString()}. Awaiting driver receipt unless shown below.</p>}
      {item.receipt&&<p>Driver confirmed receipt at {new Date(item.receipt.recorded_at).toLocaleString()}.</p>}
      {item.review&&<p>Review {item.review.status??'open'}: {item.review.reason.replaceAll('_',' ')}. No automatic restriction applies.</p>}
      {item.claim&&<div className="space-y-2">
        <label className="block">Report a settlement dispute
          <textarea className="mt-1 block w-full rounded border p-2" value={reportReason[item.obligation_id]??''}
            onChange={event=>setReportReason(current=>({...current,[item.obligation_id]:event.target.value}))}
            placeholder="Describe what needs operator review" /></label>
        <button disabled={Boolean(busy)} onClick={()=>void report(item)}>Send dispute report</button>
        <button className="ml-4 underline" onClick={()=>void showCase(item.obligation_id)}>View case history</button>
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
      {user?.id===item.passenger_id&&!item.claim&&<div className="flex gap-2">
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'claim','cash')}>Report cash paid</button>
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'claim','upi')}>Report UPI paid</button>
      </div>}
      {user?.id===item.driver_id&&item.claim&&!item.response&&!item.review&&
        now<Date.parse(item.claim.recorded_at)+DRIVER_RESPONSE_WINDOW_MS&&<div className="flex gap-2">
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'confirm')}>Confirm receipt</button>
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'dispute')}>Dispute claim</button>
      </div>}
    </section>)}
    {!items.length&&<p>No direct contribution obligations are recorded for your journeys.</p>}
  </main>;
}
