"use client";

import { useEffect, useState } from "react";

export type SeatRequest = {id:string;offer_id:string;passenger_id:string;driver_id:string;
  status:"pending"|"rejected"|"expired"|"accepted"|"withdrawn";decision_deadline_at:string;
  offer_terms:{origin_code:string;destination_code:string;departure_at:string;
    contribution_paise:number;currency:string;cancellation_notice?:string;contact_notice?:string};
  confirmed:boolean;seats_reserved:number};

export function SeatRequestList({requests,currentUserId,busy,onReject,onAccept}:{requests:SeatRequest[];
  currentUserId:string|undefined;busy:boolean;onReject:(id:string)=>void;onAccept:(id:string)=>void}) {
  const [now,setNow] = useState(() => Date.now());
  useEffect(() => {
    const nextDeadline = requests.filter(item => item.status === "pending")
      .map(item => new Date(item.decision_deadline_at).getTime())
      .filter(deadline => deadline > now).sort((a,b) => a-b)[0];
    if (!nextDeadline) return;
    const timer = window.setTimeout(() => setNow(Date.now()),Math.max(0,nextDeadline-Date.now()+10));
    return () => window.clearTimeout(timer);
  },[requests,now]);

  return <section className="space-y-3"><h2 className="text-xl font-semibold">Seat requests</h2>
    <p className="text-sm">A pending request is unconfirmed and reserves no seat. The driver must decide by the listed deadline. Participant phone numbers are not shared.</p>
    {requests.length === 0 && <p>No seat requests yet.</p>}
    <ul className="space-y-3">{requests.map(item => {
      const status = item.status === "pending" && new Date(item.decision_deadline_at).getTime() <= now
        ? "expired" : item.status;
      return <li key={item.id} className="rounded border p-4">
        <p>{item.offer_terms.origin_code} → {item.offer_terms.destination_code} · {new Date(item.offer_terms.departure_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</p>
        <p className="font-medium">{status === "pending" ? "Pending · no seat reserved" : status === "rejected" ? "Rejected" : status === "accepted" ? "Confirmed · one whole-ride seat" : status === "withdrawn" ? "Withdrawn · overlapping ride confirmed" : "Expired"}</p>
        {status === "accepted" && <p className="text-sm">Confirmed contribution: ₹{(item.offer_terms.contribution_paise/100).toFixed(2)} {item.offer_terms.currency}. Nothing is due until the journey is confirmed.</p>}
        <p className="text-sm">Decision deadline: {new Date(item.decision_deadline_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</p>
        <p className="text-sm">{item.offer_terms.cancellation_notice} {item.offer_terms.contact_notice}</p>
        {status === "pending" && item.driver_id === currentUserId && <div className="mt-2 flex gap-2">
          <button className="rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
            disabled={busy} onClick={() => onAccept(item.id)}>Accept one seat</button>
          <button className="rounded border px-3 py-1 disabled:opacity-50"
            disabled={busy} onClick={() => onReject(item.id)}>Reject request</button>
        </div>}
      </li>;
    })}</ul>
  </section>;
}
