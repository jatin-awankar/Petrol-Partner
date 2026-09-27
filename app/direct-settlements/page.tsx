'use client';
import {useCallback,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {apiRequest,ApiError} from '@/lib/api/client';
import {useCurrentUser} from '@/hooks/auth/useCurrentUser';

type Obligation={obligation_id:string;amount_paise:number;currency:string;due_at:string;
  driver_id:string;passenger_id:string;claim:{id:string;method:string;recorded_at:string}|null;
  receipt:{id:string;recorded_at:string}|null;response:string|null;
  review:{id:string|null;reason:string}|null;status:string};
export default function DirectSettlementsPage(){
  const {isAuthenticated,loading,user}=useCurrentUser();
  const router=useRouter();
  const [items,setItems]=useState<Obligation[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const refresh=useCallback(async()=>{
    const response=await apiRequest<{obligations:Obligation[]}>('/v1/direct-settlements');
    setItems(response.obligations);
  },[]);
  useEffect(()=>{if(!loading&&!isAuthenticated) router.replace('/login');},[loading,isAuthenticated,router]);
  useEffect(()=>{if(isAuthenticated) void refresh().catch(error=>setMessage(String(error)));},[isAuthenticated,refresh]);
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
  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Direct cash and UPI settlement</h1>
    <p>Pay the driver directly. Petrol Partner does not collect or transfer money.</p>
    {message&&<p role="status">{message}</p>}
    {items.map(item=><section key={item.obligation_id} className="rounded border p-4 space-y-2">
      <h2 className="font-semibold">{item.currency} {(item.amount_paise/100).toFixed(2)} owed</h2>
      <p>Due {new Date(item.due_at).toLocaleString()} · {item.status.replaceAll('_',' ')}</p>
      {item.claim&&<p>Passenger reported {item.claim.method.toUpperCase()} payment at {new Date(item.claim.recorded_at).toLocaleString()}. Awaiting driver receipt unless shown below.</p>}
      {item.receipt&&<p>Driver confirmed receipt at {new Date(item.receipt.recorded_at).toLocaleString()}.</p>}
      {item.review&&<p>Review open: {item.review.reason.replaceAll('_',' ')}. No automatic restriction applies.</p>}
      {user?.id===item.passenger_id&&!item.claim&&<div className="flex gap-2">
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'claim','cash')}>Report cash paid</button>
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'claim','upi')}>Report UPI paid</button>
      </div>}
      {user?.id===item.driver_id&&item.claim&&!item.response&&<div className="flex gap-2">
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'confirm')}>Confirm receipt</button>
        <button disabled={Boolean(busy)} onClick={()=>void act(item,'dispute')}>Dispute claim</button>
      </div>}
    </section>)}
    {!items.length&&<p>No direct contribution obligations are recorded for your journeys.</p>}
  </main>;
}
