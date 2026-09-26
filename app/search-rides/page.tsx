"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { SeatRequestList, type SeatRequest } from "@/components/searchRides/SeatRequestList";

type Stop = {code:string;label:string};
type Policy = {stops:Stop[];permitted_pairs:{origin_code:string;destination_code:string}[]};
type Offer = {id:string;origin_code:string;destination_code:string;departure_at:string;
  contribution_paise:number;currency:string;capacity:number;available_seats:number;
  request_cutoff_at:string;cancellation_notice:string;contact_notice:string};
export default function SearchRidesPage() {
  const {isAuthenticated,loading,user} = useCurrentUser();
  const router = useRouter();
  const [policy,setPolicy] = useState<Policy | null>(null);
  const [origin,setOrigin] = useState("");
  const [destination,setDestination] = useState("");
  const [offers,setOffers] = useState<Offer[]>([]);
  const [message,setMessage] = useState("");
  const [requests,setRequests] = useState<SeatRequest[]>([]);
  const [bookings,setBookings] = useState<Array<{id:string;offer_id:string;contribution_paise:number;currency:string;
    departure_at:string;status:string;origin_code:string;destination_code:string;
    car_registration_last4:string;driver_verified_name:string|null;passenger_verified_name:string|null}>>([]);
  const [busy,setBusy] = useState<string | null>(null);
  useEffect(() => {if (!loading && !isAuthenticated) router.replace("/login");},[loading,isAuthenticated,router]);
  useEffect(() => {if (!isAuthenticated) return;
    void apiRequest<{policy:Policy}>("/v1/corridor-offers/policy").then(result => setPolicy(result.policy))
      .catch(error => setMessage(error instanceof Error ? error.message : "Corridor policy is unavailable"));
  },[isAuthenticated]);
  async function refreshRequests() {
    const [result,confirmed] = await Promise.all([
      apiRequest<{requests:SeatRequest[]}>("/v1/seat-requests"),
      apiRequest<{bookings:typeof bookings}>("/v1/seat-requests/confirmed")]);
    setRequests(result.requests);
    setBookings(confirmed.bookings);
  }
  useEffect(() => {if (isAuthenticated) void refreshRequests().catch(() => undefined);},[isAuthenticated]);
  async function changeRequest(path:string,body:Record<string,unknown>,key:string) {
    setBusy(key);setMessage("");
    const storageKey = `seat-request:${user?.id ?? "unknown"}:${key}`;
    const operationKey = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    window.sessionStorage.setItem(storageKey,operationKey);
    try {
      const result = await apiRequest<{operation_id:string;state:string}>(path,
        {method:"POST",headers:{"Idempotency-Key":operationKey},body:JSON.stringify(body)});
      if (result.state !== "acknowledged" && result.state !== "recovered") {
        setMessage("Request outcome is pending. Retry this action to check the same operation.");
        return;
      }
      window.sessionStorage.removeItem(storageKey);
      const refreshed = await refreshRequests().then(() => true,() => false);
      setMessage(refreshed ? "Seat decision updated. Check the request and confirmed bookings below."
        : "Seat decision recorded. Reload this page to see its latest status.");
    } catch(error) {
      if (error instanceof ApiError && error.status < 500 && error.code !== "OPERATION_PENDING") {
        window.sessionStorage.removeItem(storageKey);
        setMessage(error.message);
        return;
      }
      const operationId = error instanceof ApiError && typeof error.details === "object" && error.details !== null
        && "operationId" in error.details ? error.details.operationId : null;
      if (typeof operationId === "string") {
        const status = await apiRequest<{operation:{state:string}}>(`/v1/seat-requests/operations/${operationId}`)
          .catch(() => null);
        if (status?.operation.state === "acknowledged" || status?.operation.state === "recovered") {
          window.sessionStorage.removeItem(storageKey);
          await refreshRequests().catch(() => undefined);
          setMessage("Seat decision updated. Check the request and confirmed bookings below.");
        } else setMessage("Request outcome is pending. Retry this action to check the same operation.");
      } else {
        setMessage(error instanceof Error ? `${error.message} Retry uses the same operation.`
          : "Outcome unknown. Retry uses the same operation.");
      }
    }
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
    <SeatRequestList requests={requests} currentUserId={user?.id} busy={busy !== null}
      onReject={id => void changeRequest(`/v1/seat-requests/${id}/reject`,{},`reject:${id}`)}
      onAccept={id => void changeRequest(`/v1/seat-requests/${id}/accept`,{},`accept:${id}`)} />
    <section><h2 className="text-xl font-semibold">Confirmed bookings</h2>
      <ul>{bookings.map(booking => <li key={booking.id} className="rounded border p-3">
        {booking.origin_code} → {booking.destination_code} · One seat ·
        {new Date(booking.departure_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST ·
        ₹{(booking.contribution_paise/100).toFixed(2)} {booking.currency} · {booking.status}
        <span className="block text-sm">Car registration ending {booking.car_registration_last4}.
          {booking.driver_verified_name && ` Driver: ${booking.driver_verified_name}.`}
          {booking.passenger_verified_name && ` Passenger: ${booking.passenger_verified_name}.`}
          No contribution is due before journey confirmation.</span>
      </li>)}</ul>
    </section>
  </main>;
}
