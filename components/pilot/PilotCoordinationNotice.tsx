export function PilotCoordinationNotice({contactNotice}:{contactNotice?:string}) {
  return <div className="rounded border p-3 text-sm">
    {contactNotice && <p>{contactNotice}</p>}
    <p>Participant phone numbers are never shared. Confirmed participants coordinate pickup with trip details and durable in-app or email notices.</p>
    <p>Support contact and operating hours are not yet published. Pickup exceptions need operator support before real trips.</p>
  </div>;
}
