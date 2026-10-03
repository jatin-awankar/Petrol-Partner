import Link from "next/link";

export function PilotCoordinationNotice({contactNotice}:{contactNotice?:string}) {
  return <div className="rounded border p-3 text-sm">
    {contactNotice && <p>{contactNotice}</p>}
    <p>Participant phone numbers are never shared. Confirmed participants coordinate pickup with trip details and durable in-app or email notices.</p>
    <p><Link href="/support" className="underline">Help and support</Link>: controlled contacts, approved coverage and prelaunch limitations. Real bookings remain disabled.</p>
  </div>;
}
