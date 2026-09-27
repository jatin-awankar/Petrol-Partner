'use client';
import {useCallback,useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {apiRequest,ApiError} from '@/lib/api/client';

type Scope='driver'|'passenger'|'all';
type Source='incident'|'settlement';
type Item={id:string;operator_id:string;target_user_id:string;action:'restrict'|'reverse';
  scope:Scope;source_type:Source;source_id:string;reason:string;reviewed_evidence:string;
  reverses_id:string|null;committed_at:string};

export default function AccountRestrictionsPage(){
  const params=useSearchParams();
  const [target,setTarget]=useState(params.get('target')??'');
  const [sourceType,setSourceType]=useState<Source>(params.get('source_type')==='settlement'?'settlement':'incident');
  const [sourceId,setSourceId]=useState(params.get('source_id')??'');
  const [scope,setScope]=useState<Scope>(params.get('scope')==='driver'?'driver':
    params.get('scope')==='passenger'?'passenger':'all');
  const [reason,setReason]=useState(''),[evidence,setEvidence]=useState('');
  const [history,setHistory]=useState<Item[]>([]),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async(id:string)=>{
    if(!id) return;
    setHistory((await apiRequest<{history:Item[]}>(
      `/v1/operator/account-restrictions/${encodeURIComponent(id)}`)).history);
  },[]);
  useEffect(()=>{if(target) void refresh(target).catch(e=>setMessage(String(e)));},[target,refresh]);
  async function submit(path:string,body:unknown,storageKey:string){
    const key=sessionStorage.getItem(storageKey)??crypto.randomUUID();
    sessionStorage.setItem(storageKey,key);setBusy(true);
    try{
      const result=await apiRequest<{operation:{operation_id:string;state:string}}>(path,{method:'POST',
        headers:{'Idempotency-Key':key},body:JSON.stringify(body)});
      if(['acknowledged','recovered'].includes(result.operation.state)){
        sessionStorage.removeItem(storageKey);
        setMessage(`Decision ${result.operation.operation_id} recorded.`);
        await refresh(target);
      }else setMessage(`Decision ${result.operation.operation_id} pending. Retry with the same key.`);
    }catch(error){
      if(error instanceof ApiError&&error.status<500&&error.code!=='OPERATION_PENDING')
        sessionStorage.removeItem(storageKey);
      setMessage(error instanceof Error?error.message:'Outcome uncertain. Retry with the same key.');
    }finally{setBusy(false);}
  }
  const ready=target&&sourceId&&reason.trim().length>=8&&evidence.trim().length>=8;
  const reversed=new Set(history.filter(item=>item.action==='reverse').map(item=>item.reverses_id));
  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <Link href="/operator" className="underline">Operator console</Link>
    <h1 className="text-2xl font-semibold">Reviewed account restrictions</h1>
    <p>Review the incident or resolved settlement case before acting. A restriction holds future commitments; seats stay reserved until recorded cancellation. Reversals do not override other eligibility checks.</p>
    <p role="status">{message}</p>
    <section className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Record a restriction</h2>
      <label className="block">Participant ID<input className="block w-full rounded border p-2" value={target}
        onChange={e=>setTarget(e.target.value)} /></label>
      <label className="block">Reviewed source<select className="block rounded border p-2" value={sourceType}
        onChange={e=>setSourceType(e.target.value as Source)}><option value="incident">Incident</option>
        <option value="settlement">Resolved settlement case</option></select></label>
      <label className="block">{sourceType==='incident'?'Incident ID':'Obligation ID'}
        <input className="block w-full rounded border p-2" value={sourceId}
          onChange={e=>setSourceId(e.target.value)} /></label>
      <label className="block">Scope<select className="block rounded border p-2" value={scope}
        onChange={e=>setScope(e.target.value as Scope)}><option value="all">All travel actions</option>
        <option value="driver">Driver actions</option><option value="passenger">Passenger actions</option></select></label>
      <label className="block">Reason<textarea className="block w-full rounded border p-2" value={reason}
        onChange={e=>setReason(e.target.value)} /></label>
      <label className="block">Reviewed evidence summary<textarea className="block w-full rounded border p-2"
        value={evidence} onChange={e=>setEvidence(e.target.value)} /></label>
      <button disabled={busy||!ready} onClick={()=>void submit('/v1/operator/account-restrictions',{
        target_user_id:target,source_type:sourceType,source_id:sourceId,scope,
        reason:reason.trim(),reviewed_evidence:evidence.trim()},
        `account-restrict:${target}:${sourceType}:${sourceId}:${scope}`)}>Record restriction</button>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Decision history</h2>
      <button onClick={()=>void refresh(target)} disabled={busy||!target}>Refresh history</button>
      {history.map(item=><div key={item.id} className="space-y-2 rounded border p-3">
        <p>{item.action==='restrict'?(reversed.has(item.id)?'Reversed restriction':'Active restriction'):'Reversal'}
          {' '}· {item.scope} · {new Date(item.committed_at).toLocaleString()}</p>
        <p>Operator {item.operator_id} · {item.source_type} {item.source_id}</p>
        <p>Reason: {item.reason}</p><p>Reviewed evidence: {item.reviewed_evidence}</p>
        {item.action==='restrict'&&!reversed.has(item.id)&&<button disabled={busy||reason.trim().length<8||evidence.trim().length<8}
          onClick={()=>void submit(`/v1/operator/account-restrictions/${item.id}/reverse`,{
            reason:reason.trim(),reviewed_evidence:evidence.trim()},`account-reverse:${item.id}`)}>
          Reverse after review</button>}
      </div>)}
      {!history.length&&<p>No restrictions recorded for this participant.</p>}
    </section>
  </main>;
}
