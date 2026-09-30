"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Category = "bike" | "scooter" | "car";
type RecordState = { id?: string; state: string; category?: Category; renew_after?: string; licence_expires_on?: string; registration_expires_on?: string; insurance_expires_on?: string };
type Status = { driver: RecordState; vehicles: RecordState[] };
type Adult = { state: string; current_policy_version: string };

export default function DriverVehicleDeclarationsPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const [status, setStatus] = useState<Status | null>(null);
  const [adult, setAdult] = useState<Adult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [licenceExpiry, setLicenceExpiry] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState<Category>("bike");
  const [registration, setRegistration] = useState("");
  const [registrationExpiry, setRegistrationExpiry] = useState("");
  const [insuranceExpiry, setInsuranceExpiry] = useState("");
  const [capacity, setCapacity] = useState(1);
  const [permission, setPermission] = useState(false);
  const pending = useRef<{ action: string; key: string } | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [driver, adultResponse] = await Promise.all([
        apiRequest<Status>("/v1/driver-vehicle-declarations"),
        apiRequest<{ declaration: Adult }>("/v1/adult-declaration"),
      ]);
      setStatus(driver); setAdult(adultResponse.declaration);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Account state unavailable."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user) void refresh(); }, [user, refresh]);
  async function mutate(action: string, path: string, method: "PUT" | "POST", body: object) {
    setBusy(true); setMessage("");
    try {
      if (!pending.current || pending.current.action !== action) pending.current = { action, key: crypto.randomUUID() };
      await apiRequest(path, { method, headers: { "Idempotency-Key": pending.current.key }, body: JSON.stringify(body) });
      pending.current = null;
      await refresh();
      setMessage("Declaration recorded. This is your statement; Petrol Partner has not verified the documents.");
    } catch (reason) {
      setMessage(`${reason instanceof Error ? reason.message : "The result is unavailable."} Check the current status before retrying; the same operation key will be used.`);
    } finally { setBusy(false); }
  }
  const version = adult?.current_policy_version;
  const canDeclare = adult?.state === "current" && !!version && !status?.driver.state.includes("restricted");
  if (authLoading) return <main className="mx-auto max-w-3xl p-6" role="status">Checking account…</main>;
  if (!user) return <main className="mx-auto max-w-3xl p-6">Sign in to manage declarations. <Link href="/login">Sign in</Link></main>;
  return <main className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-8">
    <div><Link href="/dashboard" className="underline">← Home</Link><h1 className="mt-4 text-3xl font-semibold">Driver and vehicle declarations</h1>
      <p className="mt-2 text-muted-foreground">What can you do next? Record your own licence and vehicle statements. Petrol Partner does not inspect or independently verify these documents. Real offers and bookings remain unavailable.</p></div>
    {loading ? <p role="status">Loading declaration status…</p> : error ? <div role="alert" className="rounded-xl border p-4">{error} <Button type="button" variant="outline" onClick={() => void refresh()}>Try again</Button></div> : <>
      {adult?.state !== "current" && <div className="rounded-xl border p-4" role="status">A current adult declaration is required before recording driver or vehicle statements. <Link href="/adult-declaration" className="underline">Review adult declaration</Link></div>}
      <section className="rounded-xl border p-5" aria-labelledby="driver-state"><h2 id="driver-state" className="text-xl font-semibold">Driver: {status?.driver.state ?? "unavailable"}</h2>
        <p className="mt-2 text-sm">{status?.driver.state === "current" ? "Your statement is current. It does not verify your licence or permit real offers." : status?.driver.state === "revoked" || status?.driver.state === "false_declaration" || status?.driver.state === "restricted" ? "New travel actions are blocked. A new statement cannot remove this restriction; account review is needed." : "Record or renew your statement before preparing a driver route."}</p>
        {status?.driver.renew_after && <p className="text-sm">Renew by {new Date(status.driver.renew_after).toLocaleDateString()}.</p>}
        {status?.driver.state === "current" && <Button type="button" variant="outline" className="mt-3 min-h-11" disabled={busy} onClick={() => void mutate("driver-revoke", "/v1/driver-vehicle-declarations/driver/revoke", "POST", {})}>Revoke my driver declaration</Button>}
      </section>
      {canDeclare && status?.driver.state !== "revoked" && status?.driver.state !== "false_declaration" && <form className="space-y-4 rounded-xl border p-5" onSubmit={event => { event.preventDefault(); void mutate("driver", "/v1/driver-vehicle-declarations/driver", "PUT", { licence_categories: categories, licence_expires_on: licenceExpiry, policy_version: version }); }}>
        <h2 className="text-xl font-semibold">Record driver statement</h2>
        <fieldset><legend className="mb-2 font-medium">Licence categories you hold</legend><div className="flex flex-wrap gap-4">{(["bike", "scooter", "car"] as Category[]).map(category => <label key={category} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={categories.includes(category)} onChange={event => setCategories(old => event.target.checked ? [...old, category] : old.filter(item => item !== category))} />{category}</label>)}</div></fieldset>
        <div className="space-y-2"><Label htmlFor="licence-expiry">Licence expiry date</Label><Input id="licence-expiry" type="date" required value={licenceExpiry} onChange={event => setLicenceExpiry(event.target.value)} /></div>
        <p className="text-sm text-muted-foreground">I declare that my licence is valid for the selected categories. This is a self-declaration.</p>
        <Button disabled={busy || categories.length === 0} className="min-h-11">{busy ? "Recording…" : "Record driver declaration"}</Button>
      </form>}
      <section className="space-y-3"><h2 className="text-xl font-semibold">Vehicles</h2>{status?.vehicles.length ? status.vehicles.map((vehicle, index) => <div key={vehicle.id ?? index} className="rounded-xl border p-4"><p className="font-medium">{vehicle.category ?? "Vehicle"}: {vehicle.state}</p><p className="text-sm">This status describes a declaration, not an inspection or approval.</p>{vehicle.renew_after && <p className="text-sm">Renew by {new Date(vehicle.renew_after).toLocaleDateString()}.</p>}{vehicle.state === "current" && vehicle.id && <Button type="button" variant="outline" className="mt-3 min-h-11" disabled={busy} onClick={() => void mutate(`vehicle-revoke:${vehicle.id}`, `/v1/driver-vehicle-declarations/vehicles/${vehicle.id}/revoke`, "POST", {})}>Revoke this vehicle declaration</Button>}</div>) : <p>No vehicle statement recorded.</p>}</section>
      {canDeclare && status?.driver.state === "current" && <form className="space-y-4 rounded-xl border p-5" onSubmit={event => { event.preventDefault(); void mutate("vehicle", "/v1/driver-vehicle-declarations/vehicles", "POST", { category: vehicleCategory, registration_identifier: registration, registration_expires_on: registrationExpiry, insurance_expires_on: insuranceExpiry, permission_to_use: true, belted_passenger_seats: vehicleCategory === "car" ? capacity : null, passenger_capacity: vehicleCategory === "car" ? capacity : 1, policy_version: version }); }}>
        <h2 className="text-xl font-semibold">Add a vehicle statement</h2>
        <div className="space-y-2"><Label htmlFor="vehicle-category">Vehicle category</Label><select id="vehicle-category" className="min-h-11 w-full rounded-md border bg-background px-3" value={vehicleCategory} onChange={event => setVehicleCategory(event.target.value as Category)}><option value="bike">Bike</option><option value="scooter">Scooter</option><option value="car">Car</option></select></div>
        <div className="space-y-2"><Label htmlFor="registration">Registration identifier</Label><Input id="registration" required maxLength={32} value={registration} onChange={event => setRegistration(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="registration-expiry">Registration expiry date</Label><Input id="registration-expiry" type="date" required value={registrationExpiry} onChange={event => setRegistrationExpiry(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="insurance-expiry">Insurance expiry date</Label><Input id="insurance-expiry" type="date" required value={insuranceExpiry} onChange={event => setInsuranceExpiry(event.target.value)} /></div>
        {vehicleCategory === "car" && <div className="space-y-2"><Label htmlFor="passenger-seats">Belted passenger seats, excluding driver</Label><Input id="passenger-seats" type="number" min={1} max={8} required value={capacity} onChange={event => setCapacity(Number(event.target.value))} /></div>}
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" required checked={permission} onChange={event => setPermission(event.target.checked)} />I declare current registration, insurance, and permission to use this vehicle.</label>
        <Button disabled={busy || !permission} className="min-h-11">{busy ? "Recording…" : "Record vehicle declaration"}</Button>
      </form>}
    </>}
    {message && <p role="status" className="rounded-xl border p-4">{message}</p>}
    <p className="text-sm">Historical corridor approval is separate and does not grant eligibility under the new route policy. <Link href="/eligibility" className="underline">View historical status</Link></p>
  </main>;
}
