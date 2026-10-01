"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {apiRequest} from "@/lib/api/client";
import {useCurrentUser} from "@/hooks/auth/useCurrentUser";

type Declaration={state:"missing"|"current"|"expired"|"withdrawn"|"restricted";
  kind:"self_declaration";restriction_source:"account_status"|"travel_restriction"|null;policy_version:string|null;current_policy_version:string;
  declared_at:string|null;expires_at:string|null;withdrawn_at:string|null};
export default function AdultDeclarationPage(){
  const {user,loading}=useCurrentUser();
  const [declaration,setDeclaration]=useState<Declaration|null>(null);
  const [accepted,setAccepted]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [fetching,setFetching]=useState(true);
  const [loadError,setLoadError]=useState(false);
  const pending=useRef<{action:"declare"|"withdraw";key:string;body:string}|null>(null);
  const pendingStorageKey=user?`pp-declaration-pending:adult:${user.id}`:null;
  function clearPending(){pending.current=null;if(pendingStorageKey)sessionStorage.removeItem(pendingStorageKey);}
  async function checkPendingOperation(){
    if(!pending.current)return "absent" as const;
    const lookup=await apiRequest<{operation:{state:string}|null}>(`/v1/adult-declaration/operations/${encodeURIComponent(pending.current.key)}`);
    if(lookup.operation?.state==="acknowledged"||lookup.operation?.state==="recovered"){
      clearPending();await refresh();setMessage("Earlier declaration was recorded. Check the current state before making another change.");return "resolved" as const;}
    if(lookup.operation){setMessage("That declaration is committed but still awaiting recovery acknowledgement. Check again later.");return "pending" as const;}
    setMessage("No committed operation was found. You can retry the original declaration using its saved key.");
    return "absent" as const;
  }
  const refresh=useCallback(async()=>{
    setFetching(true);setLoadError(false);
    try{setDeclaration((await apiRequest<{declaration:Declaration}>("/v1/adult-declaration")).declaration);}
    catch(error){setLoadError(true);setMessage(error instanceof Error?error.message:"Unable to load declaration");}
    finally{setFetching(false);}
  },[]);
  useEffect(()=>{if(!user)return;
    const stored=sessionStorage.getItem(`pp-declaration-pending:adult:${user.id}`);
    if(stored){try{const operation=JSON.parse(stored);
        if(!["declare","withdraw"].includes(operation.action)||typeof operation.key!=="string"||typeof operation.body!=="string")throw new Error("Invalid saved operation");
        pending.current=operation;setMessage("An earlier declaration has an uncertain result. Check it before starting another action.");}
      catch{sessionStorage.removeItem(`pp-declaration-pending:adult:${user.id}`);}}
    void refresh();},[user,refresh]);
  async function change(action:"declare"|"withdraw"){
    if(!declaration)return;
    setBusy(true);setMessage("");
    try{
      if(pending.current&&pending.current.action!==action){setMessage("Check the earlier declaration result before starting another action.");return;}
      if(pending.current){
        let result:Awaited<ReturnType<typeof checkPendingOperation>>;
        try{result=await checkPendingOperation();}
        catch(reason){setMessage(`${reason instanceof Error?reason.message:"Unable to check the operation result."} The earlier result is still uncertain; try checking again.`);return;}
        if(result!=="absent")return;
      }
      if(!pending.current){
        pending.current={action,key:crypto.randomUUID(),body:JSON.stringify(action==="declare"?
          {at_least_18:true,policy_version:declaration.current_policy_version}:{policy_version:declaration.current_policy_version})};
        if(pendingStorageKey)sessionStorage.setItem(pendingStorageKey,JSON.stringify(pending.current));
      }
      const path=action==="declare"?"/v1/adult-declaration":"/v1/adult-declaration/withdraw";
      await apiRequest(path,{method:action==="declare"?"PUT":"POST",
        headers:{"Idempotency-Key":pending.current.key},body:pending.current.body});
      clearPending();setAccepted(false);await refresh();
      setMessage(action==="withdraw"?"Adult declaration withdrawn.":"Adult declaration recorded. This is your statement, not independent age verification.");
    }catch(error){
      const response=error as {status?:number;code?:string};
      const rejected=typeof response?.status==="number"&&response.status<500&&response.code!=="OPERATION_PENDING";
      if(rejected){clearPending();await refresh();}
      setMessage(rejected?`${error instanceof Error?error.message:"Declaration rejected."} Review the current terms and submit again.`:
        `${error instanceof Error?error.message:"The result is unavailable."} Check the operation result before retrying the original terms.`);
    }
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
      {declaration.state==="restricted"&&<p>{declaration.restriction_source==="account_status"?
        "Your account is inactive. A declaration does not restore travel access.":
        "An account restriction blocks new travel actions. A declaration does not remove it."}</p>}
      <p>Policy: {declaration.current_policy_version}</p>
    </section>}
    {fetching&&<p role="status">Loading declaration status…</p>}
    {loadError&&<div role="alert" className="rounded border p-4">{message} <button className="min-h-11 rounded border px-4" onClick={()=>void refresh()}>Try again</button></div>}
    {!loadError&&<p role="status">{message}</p>}
    {pending.current&&<button type="button" className="min-h-11 rounded border px-4" disabled={busy}
      onClick={async()=>{setBusy(true);try{await checkPendingOperation();}
        catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to check the operation result.");}
        finally{setBusy(false);}}}>Check earlier result</button>}
    {declaration&&<div className="space-y-3">
      <label className="flex gap-2"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>
        I declare that I am at least 18 under the current policy.</label>
      <button className="min-h-11 rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={busy||!accepted}
        onClick={()=>void change("declare")}>{declaration.state==="current"?"Reconfirm declaration":"Record declaration"}</button>
      {declaration.declared_at&&!declaration.withdrawn_at&&<button className="ml-3 min-h-11 rounded border px-4 py-2" disabled={busy}
        onClick={()=>void change("withdraw")}>Withdraw declaration</button>}
    </div>}
  </main>;
}
