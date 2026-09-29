"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {apiRequest} from "@/lib/api/client";
import {useCurrentUser} from "@/hooks/auth/useCurrentUser";

type Declaration={state:"missing"|"current"|"expired"|"withdrawn"|"restricted";
  kind:"self_declaration";policy_version:string|null;current_policy_version:string;
  declared_at:string|null;expires_at:string|null;withdrawn_at:string|null};
export default function AdultDeclarationPage(){
  const {user,loading}=useCurrentUser();
  const [declaration,setDeclaration]=useState<Declaration|null>(null);
  const [accepted,setAccepted]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const pendingKey=useRef<{action:"declare"|"withdraw";key:string}|null>(null);
  const refresh=useCallback(async()=>{
    setDeclaration((await apiRequest<{declaration:Declaration}>("/v1/adult-declaration")).declaration);
  },[]);
  useEffect(()=>{if(user)void refresh().catch(error=>setMessage(error instanceof Error?error.message:"Unable to load declaration"));},[user,refresh]);
  async function change(action:"declare"|"withdraw"){
    if(!declaration)return;
    setBusy(true);setMessage("");
    try{
      if(!pendingKey.current||pendingKey.current.action!==action)pendingKey.current={action,key:crypto.randomUUID()};
      const path=action==="declare"?"/v1/adult-declaration":"/v1/adult-declaration/withdraw";
      await apiRequest(path,{method:action==="declare"?"PUT":"POST",
        headers:{"Idempotency-Key":pendingKey.current.key},
        body:JSON.stringify(action==="declare"?{at_least_18:true,policy_version:declaration.current_policy_version}:
          {policy_version:declaration.current_policy_version})});
      pendingKey.current=null;setAccepted(false);await refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to update declaration");}
    finally{setBusy(false);}
  }
  if(loading)return <main className="p-8">Checking account…</main>;
  if(!user)return <main className="p-8">Sign in to view your adult declaration. <Link href="/login">Sign in</Link></main>;
  return <main className="mx-auto max-w-2xl space-y-5 p-8">
    <h1 className="text-2xl font-semibold">Adult self-declaration</h1>
    <p>This is your statement that you are at least 18. Petrol Partner has not independently verified your age. College affiliation and identity documents are not required for this declaration.</p>
    {declaration&&<section className="space-y-2 rounded border p-4" aria-label="Adult declaration state">
      <h2 className="font-semibold">State: {declaration.state}</h2>
      {declaration.declared_at&&<p>Declared {new Date(declaration.declared_at).toLocaleString()}.</p>}
      {declaration.expires_at&&<p>Renew by {new Date(declaration.expires_at).toLocaleString()}.</p>}
      {declaration.state==="restricted"&&<p>An account restriction blocks new travel actions. A declaration does not remove it.</p>}
      <p>Policy: {declaration.current_policy_version}</p>
    </section>}
    <p role="status">{message}</p>
    {declaration&&<div className="space-y-3">
      <label className="flex gap-2"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>
        I declare that I am at least 18 under the current policy.</label>
      <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={busy||!accepted}
        onClick={()=>void change("declare")}>{declaration.state==="current"?"Reconfirm declaration":"Record declaration"}</button>
      {declaration.declared_at&&!declaration.withdrawn_at&&<button className="ml-3 rounded border px-4 py-2" disabled={busy}
        onClick={()=>void change("withdraw")}>Withdraw declaration</button>}
    </div>}
  </main>;
}
