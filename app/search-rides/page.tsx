"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

type Stop = {code:string;label:string};
type Policy = {stops:Stop[];permitted_pairs:{origin_code:string;destination_code:string}[]};
type Offer = {id:string;origin_code:string;destination_code:string;departure_at:string;
  contribution_paise:number;currency:string;capacity:number;available_seats:number;
  request_cutoff_at:string;cancellation_notice:string;contact_notice:string};
type SeatRequest = {id:string;offer_id:string;passenger_id:string;driver_id:string;
  status:"pending"|"rejected"|"expired";decision_deadline_at:string;
  offer_terms:{origin_code:string;destination_code:string;departure_at:string;
    contribution_paise:number;currency:string;cancellation_notice?:string;contact_notice?:string};
  confirmed:false;seats_reserved:0};
export default function SearchRidesPage() {
  const {isAuthenticated,loading,user} = useCurrentUser();
  const router = useRouter();
  const [policy,setPolicy] = useState<Policy | null>(null);
  const [origin,setOrigin] = useState("");
  const [destination,setDestination] = useState("");
  const [offers,setOffers] = useState<Offer[]>([]);
  const [message,setMessage] = useState("");
  const [requests,setRequests] = useState<SeatRequest[]>([]);
  const [busy,setBusy] = useState<string | null>(null);
  useEffect(() => {if (!loading && !isAuthenticated) router.replace("/login");},[loading,isAuthenticated,router]);
  useEffect(() => {if (!isAuthenticated) return;
    void apiRequest<{policy:Policy}>("/v1/corridor-offers/policy").then(result => setPolicy(result.policy))
      .catch(error => setMessage(error instanceof Error ? error.message : "Corridor policy is unavailable"));
  },[isAuthenticated]);
  async function refreshRequests() {
    const result = await apiRequest<{requests:SeatRequest[]}>("/v1/seat-requests");
    setRequests(result.requests);
  }
  useEffect(() => {if (isAuthenticated) void refreshRequests().catch(() => undefined);},[isAuthenticated]);
  async function changeRequest(path:string,body:Record<string,unknown>,key:string) {
    setBusy(key);setMessage("");
    try {
      await apiRequest(path,{method:"POST",headers:{"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify(body)});
      await refreshRequests();
      setMessage("Seat request updated. Pending requests are not confirmed and reserve no seat.");
    } catch(error) {setMessage(error instanceof Error ? error.message : "Could not update seat request");}
    finally {setBusy(null);}
  }
  async function search(event:React.FormEvent) {
    event.preventDefault();setMessage("");
    try {
      const query = new URLSearchParams({origin_code:origin,destination_code:destination});
      const result = await apiRequest<{offers:Offer[]}>(`/v1/corridor-offers?${query}`);
      setOffers(result.offers);
      if (!result.offers.length) setMessage("No offers for this stop pair yet.");
    } catch(error) {setMessage(error instanceof Error ? error.message : "Could not load offers");}
  }
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <h1 className="text-3xl font-semibold">Discover corridor offers</h1>
    <p>See departure, contribution, and whole ride capacity before requesting a seat.</p>
    <Link href="/post-a-ride" className="underline">Publish an offer</Link>
    <form onSubmit={search} className="flex flex-wrap items-end gap-3">
      <label>Origin<select className="mt-1 block rounded border p-2" value={origin} onChange={event => {setOrigin(event.target.value);setDestination("");}} required><option value="">Choose origin</option>{policy?.stops.map(stop => <option key={stop.code} value={stop.code}>{stop.label}</option>)}</select></label>
      <label>Destination<select className="mt-1 block rounded border p-2" value={destination} onChange={event => setDestination(event.target.value)} required><option value="">Choose destination</option>{policy?.permitted_pairs.filter(pair => pair.origin_code === origin).map(pair => <option key={pair.destination_code} value={pair.destination_code}>{policy.stops.find(stop => stop.code === pair.destination_code)?.label}</option>)}</select></label>
      <button className="rounded bg-primary px-4 py-2 text-primary-foreground">Find offers</button>
    </form>
    {message && <p role="status">{message}</p>}
    <ul className="space-y-4">{offers.map(offer => <li key={offer.id} className="rounded border p-4">
      <h2 className="font-medium">{policy?.stops.find(stop => stop.code === offer.origin_code)?.label} → {policy?.stops.find(stop => stop.code === offer.destination_code)?.label}</h2>
      <p>Departs {new Date(offer.departure_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</p>
      <p>₹{(offer.contribution_paise/100).toFixed(2)} {offer.currency} per passenger · {offer.available_seats} of {offer.capacity} seats available</p>
      <p className="text-sm">Requests close {new Date(offer.request_cutoff_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</p>
      <p className="mt-2 text-sm">{offer.cancellation_notice} {offer.contact_notice}</p>
      <button className="mt-3 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        disabled={busy !== null || requests.some(item => item.offer_id === offer.id && item.status === "pending")}
        onClick={() => void changeRequest("/v1/seat-requests",{offer_id:offer.id,seats:1},offer.id)}>
        Request one seat
      </button>
    </li>)}</ul>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Seat requests</h2>
      <p className="text-sm">A pending request is unconfirmed and reserves no seat. The driver must decide by the listed deadline. Participant phone numbers are not shared.</p>
      {requests.length === 0 && <p>No seat requests yet.</p>}
      <ul className="space-y-3">{requests.map(item => <li key={item.id} className="rounded border p-4">
        <p>{item.offer_terms.origin_code} → {item.offer_terms.destination_code} · {new Date(item.offer_terms.departure_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</p>
        <p className="font-medium">{item.status === "pending" ? "Pending · no seat reserved" : item.status === "rejected" ? "Rejected" : "Expired"}</p>
        <p className="text-sm">Decision deadline: {new Date(item.decision_deadline_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</p>
        <p className="text-sm">{item.offer_terms.cancellation_notice} {item.offer_terms.contact_notice}</p>
        {item.status === "pending" && item.driver_id === user?.id && <button className="mt-2 rounded border px-3 py-1 disabled:opacity-50"
          disabled={busy !== null} onClick={() => void changeRequest(`/v1/seat-requests/${item.id}/reject`,{},item.id)}>
          Reject request
        </button>}
      </li>)}</ul>
    </section>
  </main>;
}
