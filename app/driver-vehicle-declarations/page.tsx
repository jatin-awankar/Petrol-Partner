"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Category = "bike" | "scooter" | "car";
type RecordState = { id?: string; state: string; category?: Category; renew_after?: string; licence_expires_on?: string; registration_identifier?: string; registration_expires_on?: string; insurance_expires_on?: string; passenger_capacity?: number };
type Status = { driver: RecordState; vehicles: RecordState[] };
type Adult = { state: string; current_policy_version: string };
type DeclarationOperation =
  | { kind: "driver" | "vehicle-add"; body: object }
  | { kind: "driver-revoke" }
  | { kind: "vehicle-renew"; id: string; body: object }
  | { kind: "vehicle-revoke"; id: string };

function requestFor(operation: DeclarationOperation) {
  switch (operation.kind) {
    case "driver": return { action: operation.kind, path: "/v1/driver-vehicle-declarations/driver", method: "PUT" as const, body: operation.body };
    case "driver-revoke": return { action: operation.kind, path: "/v1/driver-vehicle-declarations/driver/revoke", method: "POST" as const, body: {} };
    case "vehicle-add": return { action: operation.kind, path: "/v1/driver-vehicle-declarations/vehicles", method: "POST" as const, body: operation.body };
    case "vehicle-renew": return { action: `${operation.kind}:${operation.id}`, path: `/v1/driver-vehicle-declarations/vehicles/${operation.id}`, method: "PUT" as const, body: operation.body };
    case "vehicle-revoke": return { action: `${operation.kind}:${operation.id}`, path: `/v1/driver-vehicle-declarations/vehicles/${operation.id}/revoke`, method: "POST" as const, body: {} };
  }
}

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
  const [renewingVehicle, setRenewingVehicle] = useState<string | null>(null);
  const pending = useRef<{ action: string; key: string; path: string; method: "PUT" | "POST"; body: string } | null>(null);
  const pendingStorageKey = user ? `pp-declaration-pending:driver-vehicle:${user.id}` : null;
  function clearPending() {
    pending.current = null;
    if (pendingStorageKey) sessionStorage.removeItem(pendingStorageKey);
  }
  async function checkPendingOperation() {
    if (!pending.current) return "absent" as const;
    const lookup = await apiRequest<{operation:{state:string}|null}>(`/v1/driver-vehicle-declarations/operations/${encodeURIComponent(pending.current.key)}`);
    if (lookup.operation?.state === "acknowledged" || lookup.operation?.state === "recovered") {
      clearPending();
      await refresh();
      setMessage("Earlier declaration was recorded. Check the current state before making another change.");
      return "resolved" as const;
    }
    if (lookup.operation) {
      setMessage("That declaration is committed but still awaiting recovery acknowledgement. Check again later.");
      return "pending" as const;
    }
    setMessage("No committed operation was found. You can retry the original declaration using its saved key.");
    return "absent" as const;
  }
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
  useEffect(() => {
    if (!user) return;
    const stored = sessionStorage.getItem(`pp-declaration-pending:driver-vehicle:${user.id}`);
    if (stored) {
      try {
        const operation=JSON.parse(stored);
        if (typeof operation.key!=="string"||typeof operation.action!=="string"||
          typeof operation.body!=="string"||typeof operation.path!=="string"||
          !operation.path.startsWith("/v1/driver-vehicle-declarations/")||
          !["PUT","POST"].includes(operation.method)) throw new Error("Invalid saved operation");
        pending.current=operation;
        setMessage("An earlier declaration has an uncertain result. Check its result before trying another action.");
      }
      catch { sessionStorage.removeItem(`pp-declaration-pending:driver-vehicle:${user.id}`); }
    }
    void refresh();
  }, [user, refresh]);
  async function mutate(command: DeclarationOperation) {
    const {action,path,method,body}=requestFor(command);
    setBusy(true); setMessage("");
    try {
      if (pending.current && pending.current.action !== action) {
        setMessage("Finish checking the previous declaration result before starting another action.");
        return;
      }
      if (pending.current) {
        let result:Awaited<ReturnType<typeof checkPendingOperation>>;
        try { result=await checkPendingOperation(); }
        catch (reason) {
          setMessage(`${reason instanceof Error ? reason.message : "Unable to check the operation result."} The earlier result is still uncertain; try checking again.`);
          return;
        }
        if(result!=="absent") return;
      }
      if (!pending.current) {
        pending.current = { action, key: crypto.randomUUID(), path, method, body: JSON.stringify(body) };
        if (pendingStorageKey) sessionStorage.setItem(pendingStorageKey, JSON.stringify(pending.current));
      }
      const operation = pending.current;
      await apiRequest(operation.path, { method: operation.method, headers: { "Idempotency-Key": operation.key }, body: operation.body });
      clearPending();
      await refresh();
      setMessage(command.kind.endsWith("revoke")
        ? `${command.kind === "driver-revoke" ? "Driver" : "Vehicle"} declaration revoked. New driver actions may require account review.`
        : "Declaration recorded. This is your statement; Petrol Partner has not verified the documents.");
    } catch (reason) {
      const response = reason as {status?:number;code?:string};
      const rejected = typeof response?.status === "number" && response.status < 500 && response.code !== "OPERATION_PENDING";
      if (rejected) clearPending();
      setMessage(rejected
        ? `${reason instanceof Error ? reason.message : "Declaration rejected."} Update the details and submit again.`
        : `${reason instanceof Error ? reason.message : "The result is unavailable."} Check the current status before retrying; the same operation key will be used.`);
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
        {status?.driver.state === "current" && <Button type="button" variant="outline" className="mt-3 min-h-11" disabled={busy} onClick={() => void mutate({kind:"driver-revoke"})}>Revoke my driver declaration</Button>}
      </section>
      {canDeclare && status?.driver.state !== "revoked" && status?.driver.state !== "false_declaration" && <form className="space-y-4 rounded-xl border p-5" onSubmit={event => { event.preventDefault(); void mutate({kind:"driver",body:{ licence_categories: categories, licence_expires_on: licenceExpiry, policy_version: version }}); }}>
        <h2 className="text-xl font-semibold">Record driver statement</h2>
        <fieldset><legend className="mb-2 font-medium">Licence categories you hold</legend><div className="flex flex-wrap gap-4">{(["bike", "scooter", "car"] as Category[]).map(category => <label key={category} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={categories.includes(category)} onChange={event => setCategories(old => event.target.checked ? [...old, category] : old.filter(item => item !== category))} />{category}</label>)}</div></fieldset>
        <div className="space-y-2"><Label htmlFor="licence-expiry">Licence expiry date</Label><Input id="licence-expiry" type="date" required value={licenceExpiry} onChange={event => setLicenceExpiry(event.target.value)} /></div>
        <p className="text-sm text-muted-foreground">I declare that my licence is valid for the selected categories. This is a self-declaration.</p>
        <Button disabled={busy || categories.length === 0} className="min-h-11">{busy ? "Recording…" : "Record driver declaration"}</Button>
      </form>}
      <section className="space-y-3"><h2 className="text-xl font-semibold">Vehicles</h2>{status?.vehicles.length ? status.vehicles.map((vehicle, index) => <div key={vehicle.id ?? index} className="rounded-xl border p-4"><p className="font-medium">{vehicle.category ?? "Vehicle"}: {vehicle.state}</p><p className="text-sm">This status describes a declaration, not an inspection or approval.</p>{vehicle.renew_after && <p className="text-sm">Renew by {new Date(vehicle.renew_after).toLocaleDateString()}.</p>}{vehicle.state === "expired" && vehicle.id && canDeclare && status?.driver.state === "current" && <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => { setRenewingVehicle(vehicle.id!); setVehicleCategory(vehicle.category ?? "bike"); setRegistration(vehicle.registration_identifier ?? ""); setRegistrationExpiry(vehicle.registration_expires_on ?? ""); setInsuranceExpiry(vehicle.insurance_expires_on ?? ""); setCapacity(vehicle.passenger_capacity ?? 1); setPermission(false); }}>Renew this vehicle declaration</Button>}{vehicle.state === "current" && vehicle.id && <Button type="button" variant="outline" className="mt-3 min-h-11" disabled={busy} onClick={() => void mutate({kind:"vehicle-revoke",id:vehicle.id!})}>Revoke this vehicle declaration</Button>}</div>) : <p>No vehicle statement recorded.</p>}</section>
      {canDeclare && status?.driver.state === "current" && <form className="space-y-4 rounded-xl border p-5" onSubmit={event => { event.preventDefault(); const body={ category: vehicleCategory, registration_identifier: registration, registration_expires_on: registrationExpiry, insurance_expires_on: insuranceExpiry, permission_to_use: true, belted_passenger_seats: vehicleCategory === "car" ? capacity : null, passenger_capacity: vehicleCategory === "car" ? capacity : 1, policy_version: version }; void mutate(renewingVehicle ? {kind:"vehicle-renew",id:renewingVehicle,body} : {kind:"vehicle-add",body}); }}>
        <h2 className="text-xl font-semibold">{renewingVehicle ? "Renew vehicle statement" : "Add a vehicle statement"}</h2>
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
    {pending.current && <Button type="button" variant="outline" className="min-h-11" disabled={busy}
      onClick={async()=>{setBusy(true);try{await checkPendingOperation();}
        catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to check the operation result.");}
        finally{setBusy(false);}}}>Check earlier result</Button>}
    <p className="text-sm">Historical corridor approval is separate and does not grant eligibility under the new route policy. <Link href="/eligibility" className="underline">View historical status</Link></p>
  </main>;
}
