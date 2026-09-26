"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

type Stop = { code: string; label: string };
type Pair = { origin_code: string; destination_code: string; amount_paise: number };
type Policy = { version: number; provisional: boolean; currency: string; stops: Stop[];
  permitted_pairs: Pair[]; cancellation_notice: string; contact_notice: string;
  schedule_start: string; schedule_end: string; weekdays: number[] };
type Car = { id: string; make: string | null; model: string | null; seat_capacity: number;
  verification_status: string; status: string };

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
  const pendingOperation = useRef<{payload:string;key:string} | null>(null);
  useEffect(() => { if (!loading && !isAuthenticated) router.replace("/login"); },[loading,isAuthenticated,router]);
  useEffect(() => {
    if (!isAuthenticated) return;
    void Promise.all([
      apiRequest<{policy:Policy}>("/v1/corridor-offers/policy"),
      apiRequest<{vehicles:Car[]}>("/v1/verification/overview"),
    ]).then(([p,v]) => {setPolicy(p.policy);setCars(v.vehicles.filter(car => car.verification_status === "approved" && car.status === "active"));})
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
        departure_at:`${departure}:00+05:30`,capacity});
      if (pendingOperation.current?.payload !== payload) pendingOperation.current = {payload,key:crypto.randomUUID()};
      const result = await apiRequest<{offer:{id:string;state:string}}>("/v1/corridor-offers",{
        method:"POST",headers:{"Idempotency-Key":pendingOperation.current.key},body:payload,
      });
      if (result.offer.state === "acknowledged") pendingOperation.current = null;
      setMessage(result.offer.state === "acknowledged" ? "Offer published for the supervised corridor." : "Offer publication is pending recovery confirmation.");
    } catch(error) {setMessage(error instanceof Error ? error.message : "Could not publish offer");}
    finally {setBusy(false);}
  }
  return <main className="mx-auto max-w-2xl space-y-6 p-6">
    <Link href="/search-rides" className="text-sm underline">Discover offers</Link>
    <h1 className="text-3xl font-semibold">Publish a corridor offer</h1>
    <p>Choose an approved car and permitted stop pair. The contribution is set by the corridor policy.</p>
    {policy && <p className="rounded border p-3 text-sm">{policy.provisional ? "Provisional development policy" : `Policy version ${policy.version}`} · Operating hours {policy.schedule_start.slice(0,5)}–{policy.schedule_end.slice(0,5)} IST</p>}
    <form onSubmit={publish} className="space-y-4">
      <label className="block">Approved car<select className="mt-1 w-full rounded border p-2" value={vehicle} onChange={event => setVehicle(event.target.value)} required><option value="">Choose a car</option>{cars.map(car => <option key={car.id} value={car.id}>{[car.make,car.model].filter(Boolean).join(" ") || "Approved car"} · {car.seat_capacity} passenger seats</option>)}</select></label>
      <label className="block">Origin<select className="mt-1 w-full rounded border p-2" value={origin} onChange={event => {setOrigin(event.target.value);setDestination("");}} required><option value="">Choose origin</option>{policy?.stops.map(stop => <option key={stop.code} value={stop.code}>{stop.label}</option>)}</select></label>
      <label className="block">Destination<select className="mt-1 w-full rounded border p-2" value={destination} onChange={event => setDestination(event.target.value)} required><option value="">Choose destination</option>{policy?.permitted_pairs.filter(item => item.origin_code === origin).map(item => <option key={item.destination_code} value={item.destination_code}>{policy.stops.find(stop => stop.code === item.destination_code)?.label}</option>)}</select></label>
      <label className="block">Departure (IST)<input className="mt-1 w-full rounded border p-2" type="datetime-local" value={departure} onChange={event => setDeparture(event.target.value)} required /></label>
      <label className="block">Whole ride passenger capacity<input className="mt-1 w-full rounded border p-2" type="number" min="1" max={selectedCar?.seat_capacity ?? 12} value={capacity} onChange={event => setCapacity(Number(event.target.value))} required /></label>
      {pair && <p className="rounded border p-3 font-medium">Contribution per passenger: ₹{(pair.amount_paise/100).toFixed(2)} {policy?.currency}</p>}
      {policy && <div className="space-y-2 text-sm"><p>{policy.cancellation_notice}</p><p>{policy.contact_notice}</p></div>}
      <button className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy || !pair || !policy}>Publish offer</button>
    </form>
    {message && <p role="status" className="rounded border p-3">{message}</p>}
  </main>;
}
