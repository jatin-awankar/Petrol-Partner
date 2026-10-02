"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { PilotCoordinationNotice } from "@/components/pilot/PilotCoordinationNotice";

type Stop = { code: string; label: string };
type Pair = { origin_code: string; destination_code: string; amount_paise: number };
type Policy = { version: number; provisional: boolean; currency: string; stops: Stop[];
  permitted_pairs: Pair[]; cancellation_notice: string; contact_notice: string;
  schedule_start: string; schedule_end: string; weekdays: number[] };
type Car = { id: string; make: string | null; model: string | null; seat_capacity: number;
  verification_status: string; status: string };
type OwnOffer = {id:string;status:string;origin_code:string;destination_code:string;
  departure_at:string;contribution_paise:number;capacity:number;replaces_offer_id:string|null;
  cancelled_by:string|null;cancelled_at:string|null;cancellation_reason:string|null};

export default function PostRide() {
  const {isAuthenticated,loading} = useCurrentUser();
  const router = useRouter();
  const [policy,setPolicy] = useState<Policy | null>(null);
  const [cars,setCars] = useState<Car[]>([]);
  const [origin,setOrigin] = useState("");
  const [destination,setDestination] = useState("");
  const [vehicle,setVehicle] = useState("");
  const [departure,setDeparture] = useState("");
  const [capacity,setCapacity] = useState(1);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [operationId,setOperationId] = useState<string | null>(null);
  const [offers,setOffers] = useState<OwnOffer[]>([]);
  const [replacesOfferId,setReplacesOfferId] = useState<string | null>(null);
  const [cancelReasons,setCancelReasons] = useState<Record<string,string>>({});
  const pendingOperation = useRef<{payload:string;key:string} | null>(null);
  useEffect(() => { if (!loading && !isAuthenticated) router.replace("/login"); },[loading,isAuthenticated,router]);
  useEffect(() => {
    if (!isAuthenticated) return;
    setReplacesOfferId(new URLSearchParams(window.location.search).get("replaces"));
    void Promise.all([
      apiRequest<{policy:Policy}>("/v1/corridor-offers/policy"),
      apiRequest<{vehicles:Car[]}>("/v1/verification/overview"),
      apiRequest<{offers:OwnOffer[]}>("/v1/corridor-offers/mine"),
    ]).then(([p,v,m]) => {setPolicy(p.policy);setCars(v.vehicles.filter(car => car.verification_status === "approved" && car.status === "active"));setOffers(m.offers);})
      .catch(error => setMessage(error instanceof Error ? error.message : "Corridor policy is unavailable"));
  },[isAuthenticated]);
  const pair = policy?.permitted_pairs.find(item => item.origin_code === origin && item.destination_code === destination);
  const selectedCar = cars.find(car => car.id === vehicle);
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!pair || !vehicle || !departure) return;
    setBusy(true);setMessage("");
    try {
      const payload = JSON.stringify({vehicle_id:vehicle,origin_code:origin,destination_code:destination,
        departure_at:`${departure}:00+05:30`,capacity,...(replacesOfferId ? {replaces_offer_id:replacesOfferId} : {})});
      if (pendingOperation.current?.payload !== payload) pendingOperation.current = {payload,key:crypto.randomUUID()};
      const result = await apiRequest<{offer:{id:string;state:string}}>("/v1/corridor-offers",{
        method:"POST",headers:{"Idempotency-Key":pendingOperation.current.key},body:payload,
      });
      if (result.offer.state === "acknowledged") pendingOperation.current = null;
      if (result.offer.state !== "acknowledged") setOperationId((result.offer as {operation_id?:string}).operation_id ?? null);
      else setOperationId(null);
      setMessage(result.offer.state === "acknowledged" ? "Offer published for the supervised corridor." : "Offer publication is pending recovery confirmation.");
      if (result.offer.state === "acknowledged") {
        setOffers((await apiRequest<{offers:OwnOffer[]}>("/v1/corridor-offers/mine")).offers);
        setReplacesOfferId(null);
      }
    } catch(error) {
      const pendingId = error instanceof ApiError && error.code === "OPERATION_PENDING"
        ? (error.details as {operationId?:string} | undefined)?.operationId : undefined;
      if (pendingId) setOperationId(pendingId);
      setMessage(pendingId ? "Offer publication is pending recovery confirmation." : error instanceof Error ? error.message : "Could not publish offer");
    }
    finally {setBusy(false);}
  }
  async function cancelOffer(id:string) {
    const storageKey=`pilot-cancel-offer:${id}`;
    const key=window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    window.sessionStorage.setItem(storageKey,key);
    setBusy(true);setMessage("");
    try {
      const result=await apiRequest<{state:string;kind?:string}>(`/v1/corridor-offers/${id}/cancel`,{
        method:"POST",headers:{"Idempotency-Key":key},
        body:JSON.stringify({reason:cancelReasons[id]?.trim() || null})});
      if (result.state === "acknowledged" || result.state === "recovered") {
        window.sessionStorage.removeItem(storageKey);
        setOffers((await apiRequest<{offers:OwnOffer[]}>("/v1/corridor-offers/mine")).offers);
        setMessage(result.kind === "review_required"
          ? "The ride remains active. Your case was sent for operator review."
          : "Ride cancelled. A replacement needs a new offer and fresh passenger requests.");
      } else setMessage("Cancellation outcome is pending. Retry with the same reason.");
    } catch(error) {
      if (error instanceof ApiError && error.status < 500 && error.code !== "OPERATION_PENDING")
        window.sessionStorage.removeItem(storageKey);
      setMessage(error instanceof Error ? error.message : "Cancellation outcome is unknown. Retry with the same reason.");
    } finally {setBusy(false);}
  }
  async function checkOperation() {
    if (!operationId) return;
    setBusy(true);
    try {
      const {operation} = await apiRequest<{operation:{state:string}}>(`/v1/corridor-offers/operations/${operationId}`);
      if (operation.state === "acknowledged" || operation.state === "recovered") {
        pendingOperation.current = null;
        setOperationId(null);
        setMessage("Offer published for the supervised corridor.");
      } else setMessage("Offer publication is pending recovery confirmation.");
    } catch(error) {setMessage(error instanceof Error ? error.message : "Could not check offer status");}
    finally {setBusy(false);}
  }
  return <div className="mx-auto max-w-2xl space-y-6 p-6">
    <Link href="/search-rides" className="text-sm underline">Discover offers</Link>
    <h1 className="text-3xl font-semibold">Publish a corridor offer</h1>
    {replacesOfferId && <p className="rounded border p-3">Replacing cancelled offer {replacesOfferId}. This creates a new offer; passengers must request seats again.</p>}
    <p>Choose an approved car and permitted stop pair. The contribution is set by the corridor policy.</p>
    {policy && <p className="rounded border p-3 text-sm">{policy.provisional ? "Provisional development policy" : `Policy version ${policy.version}`} · Corridor departure hours {policy.schedule_start.slice(0,5)}–{policy.schedule_end.slice(0,5)} IST</p>}
    <PilotCoordinationNotice contactNotice={policy?.contact_notice} />
    <form onSubmit={publish} className="space-y-4">
      <label className="block">Approved car<select className="mt-1 w-full rounded border p-2" value={vehicle} onChange={event => setVehicle(event.target.value)} required><option value="">Choose a car</option>{cars.map(car => <option key={car.id} value={car.id}>{[car.make,car.model].filter(Boolean).join(" ") || "Approved car"} · {car.seat_capacity} passenger seats</option>)}</select></label>
      <label className="block">Origin<select className="mt-1 w-full rounded border p-2" value={origin} onChange={event => {setOrigin(event.target.value);setDestination("");}} required><option value="">Choose origin</option>{policy?.stops.map(stop => <option key={stop.code} value={stop.code}>{stop.label}</option>)}</select></label>
      <label className="block">Destination<select className="mt-1 w-full rounded border p-2" value={destination} onChange={event => setDestination(event.target.value)} required><option value="">Choose destination</option>{policy?.permitted_pairs.filter(item => item.origin_code === origin).map(item => <option key={item.destination_code} value={item.destination_code}>{policy.stops.find(stop => stop.code === item.destination_code)?.label}</option>)}</select></label>
      <label className="block">Departure (IST)<input className="mt-1 w-full rounded border p-2" type="datetime-local" value={departure} onChange={event => setDeparture(event.target.value)} required /></label>
      <label className="block">Whole ride passenger capacity<input className="mt-1 w-full rounded border p-2" type="number" min="1" max={selectedCar?.seat_capacity ?? 12} value={capacity} onChange={event => setCapacity(Number(event.target.value))} required /></label>
      {pair && <p className="rounded border p-3 font-medium">Contribution per passenger: ₹{(pair.amount_paise/100).toFixed(2)} {policy?.currency}</p>}
      {policy && <p className="text-sm">{policy.cancellation_notice}</p>}
      <button className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy || !pair || !policy}>Publish offer</button>
    </form>
    {message && <p role="status" className="rounded border p-3">{message}</p>}
    {operationId && <div className="space-y-2 text-sm"><p>Operation ID: {operationId}</p><button type="button" className="rounded border px-3 py-2" disabled={busy} onClick={checkOperation}>Check publication status</button></div>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Your corridor offers</h2>
      <ul className="space-y-3">{offers.map(offer => <li key={offer.id} className="rounded border p-3">
        <p>{offer.origin_code} → {offer.destination_code} · {new Date(offer.departure_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST · {offer.status}</p>
        <p>₹{(offer.contribution_paise/100).toFixed(2)} INR per passenger · {offer.capacity} seats</p>
        {offer.replaces_offer_id && <p>Replaces cancelled offer {offer.replaces_offer_id}.</p>}
        {offer.cancelled_at && <p>Cancelled by driver on {new Date(offer.cancelled_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST{offer.cancellation_reason ? ` · ${offer.cancellation_reason}` : ""}.</p>}
        {(offer.status === "active" || offer.status === "held" || offer.status === "departed") && <div className="mt-2 flex gap-2">
          <input className="rounded border p-1" aria-label="Ride cancellation reason (optional)" maxLength={500}
            value={cancelReasons[offer.id] ?? ""} onChange={event => setCancelReasons({...cancelReasons,[offer.id]:event.target.value})} />
          <button className="rounded border px-3 py-1 disabled:opacity-50" disabled={busy}
            onClick={() => void cancelOffer(offer.id)}>{offer.status === "departed" || new Date(offer.departure_at).getTime() <= Date.now()
              ? "Request operator review" : "Cancel whole ride"}</button>
        </div>}
        {offer.status === "cancelled" && <Link className="underline" href={`/post-a-ride?replaces=${offer.id}`}>Create a replacement offer</Link>}
      </li>)}</ul>
    </section>
  </div>;
}
