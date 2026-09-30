"use client";
import {useState} from "react";
import {useInAppNotifications} from "@/hooks/notifications/useInAppNotifications";
import {useCurrentUser} from "@/hooks/auth/useCurrentUser";
import {StatePanel,StatusTag} from "@/components/ProductStates";
export default function NotificationsPage(){
  const {user,loading:accountLoading}=useCurrentUser();
  const {items,loading,error,refresh,markOneRead}=useInAppNotifications(Boolean(user));
  const [uncertain,setUncertain]=useState<string|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  async function markRead(id:string){setBusy(id);setUncertain(null);try{await markOneRead(id);}catch{setUncertain(id);}finally{setBusy(null);}}
  async function checkAgain(){await refresh();setUncertain(null);}
  return <div className="participant-placeholder"><span>ACCOUNT / UPDATES</span><h1>Notifications</h1>
    {accountLoading||loading?<StatePanel title="Loading updates">Checking your account notices.</StatePanel>:!user?<StatePanel title="Sign in required" tone="restricted">Sign in to view your private updates.</StatePanel>:error?<StatePanel title="Updates unavailable" tone="unknown" action={<button className="product-action-button" onClick={()=>void refresh()}>Try again</button>}>We could not check for new notices. Your account actions may still have a recorded outcome.</StatePanel>:items.length===0?<StatePanel title="All clear">Account and trip updates will appear here when available.</StatePanel>:<ul className="participant-notification-list">{items.map(item=><li key={item.id}><div><h2>{item.title}</h2><StatusTag tone={item.status==="read"?"neutral":"good"}>{item.status==="read"?"Read":"New"}</StatusTag></div><p>{item.body}</p>{uncertain===item.id&&<div role="alert" className="product-inline-feedback">We could not confirm whether this notice was marked as read. <button className="product-action-button" onClick={()=>void checkAgain()}>Check again</button></div>}{item.status!=="read"&&<button className="product-action-button" disabled={busy===item.id} onClick={()=>void markRead(item.id)}>Mark as read</button>}</li>)}</ul>}
  </div>;
}
