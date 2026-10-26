import { describe, expect, it } from "vitest";
import { createDemoSession, DEMO_STORAGE_KEY, type DemoAction } from "../../../../lib/demo/session";
import { emptyJourney } from "../../../../lib/demo/journey";

function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const s = createDemoSession(() => storage);
  const send = (action: DemoAction) => { expect(s.dispatch(action)).toBe(true); };
  send({ type: "choose-role", role: "passenger" }); send({ type: "request-seat", pickup: 0, dropoff: 1 });
  send({ type: "choose-role", role: "driver" }); send({ type: "decide-request", decision: "accepted" });
  const role = (role: "driver" | "passenger") => send({ type: "choose-role", role });
  const hour = () => send({ type: "advance-clock", minutes: 60 });
  const depart = (boarded = true) => { hour(); hour(); send({ type: "depart", boarded }); };
  const agree = () => { depart(); send({ type: "state-journey", outcome: "completed" }); role("passenger"); send({ type: "state-journey", outcome: "completed" }); };
  const reload = () => createDemoSession(() => storage).getSnapshot();
  return { s, storage, send, role, hour, depart, agree, reload };
}

describe("browser-only demo journey rules; not PostgreSQL or payment proof", () => {
  it.each(["cash", "upi"] as const)("completes with a separate %s claim and explicit receipt, preserving accepted terms and retries", method => {
    const { s, send, role, agree, reload } = setup();
    const terms = s.getSnapshot().state.allocation!.terms;
    agree();
    expect(s.getSnapshot().state.journey.obligation).toMatchObject({ paise: 1215, currency: "INR", minute: 1020, dueMinute: 2460 });
    send({ type: "claim-payment", method });
    expect(s.getSnapshot().state.journey.receipt).toBeNull();
    expect(s.dispatch({ type: "respond-payment", response: "received" })).toBe(false);
    expect(s.dispatch({ type: "claim-payment", method: method === "cash" ? "upi" : "cash" })).toBe(false);
    const claimed = s.getSnapshot(); send({ type: "claim-payment", method }); expect(s.getSnapshot()).toBe(claimed);
    role("driver"); send({ type: "respond-payment", response: "received" });
    const settled = s.getSnapshot(); send({ type: "respond-payment", response: "received" }); expect(s.getSnapshot()).toBe(settled);
    expect(s.dispatch({ type: "respond-payment", response: "disputed" })).toBe(false);
    expect(reload().recovered).toBe(false); expect(reload().state.journey).toEqual(settled.state.journey);
    expect(reload().state.allocation!.terms).toEqual(terms);
  });
  it("clock movement and one party's statement never invent travel, debt or receipt", () => {
    const { s, send, depart, reload } = setup();
    expect(s.dispatch({ type: "state-journey", outcome: "completed" })).toBe(false);
    expect(s.dispatch({ type: "claim-payment", method: "cash" })).toBe(false);
    expect(s.dispatch({ type: "respond-payment", response: "received" })).toBe(false);
    depart(); send({ type: "state-journey", outcome: "completed" });
    expect(s.getSnapshot().state.journey.obligation).toBeNull();
    send({ type: "advance-clock", minutes: 1440 });
    expect(s.getSnapshot().state.journey).toMatchObject({ obligation: null, passengerStatement: null, receipt: null, review: { reason: "journey-silence" } });
    send({ type: "choose-role", role: "passenger" });
    expect(s.dispatch({ type: "state-journey", outcome: "completed" })).toBe(false);
    expect(reload().recovered).toBe(false);
  });
  it("permits either statement order while preserving each statement", () => {
    const { s, depart, send, role } = setup(); depart(); role("passenger"); send({ type: "state-journey", outcome: "completed" });
    const first = s.getSnapshot(); send({ type: "state-journey", outcome: "completed" }); expect(s.getSnapshot()).toBe(first);
    expect(s.dispatch({ type: "state-journey", outcome: "not-completed" })).toBe(false);
    expect(s.getSnapshot().state.journey.obligation).toBeNull();
    role("driver"); send({ type: "state-journey", outcome: "completed" }); expect(s.getSnapshot().state.journey.obligation?.paise).toBe(1215);
  });
  it.each(["driver", "passenger"] as const)("cancels as %s before departure, releases once and preserves history", actor => {
    const { s, role, send, reload } = setup(); role(actor); send({ type: "cancel-trip" });
    const cancelled = s.getSnapshot(); send({ type: "cancel-trip" }); expect(s.getSnapshot()).toBe(cancelled);
    expect(s.getSnapshot().state.allocation).not.toBeNull();
    expect(s.getSnapshot().state.journey.obligation).toBeNull();
    role("driver"); expect(s.dispatch({ type: "depart", boarded: true })).toBe(false);
    expect(reload().recovered).toBe(false);
  });
  it("requires a driver and departure window; a late clock only marks the departure delayed", () => {
    const { s, send, role, hour } = setup();
    expect(s.dispatch({ type: "depart", boarded: true })).toBe(false);
    hour(); for (let n = 0; n < 3; n++) send({ type: "advance-clock", minutes: 15 });
    role("passenger"); expect(s.dispatch({ type: "depart", boarded: true })).toBe(false);
    role("driver"); send({ type: "depart", boarded: true });
    const started = s.getSnapshot(); send({ type: "depart", boarded: true }); expect(s.getSnapshot()).toBe(started);
    expect(s.dispatch({ type: "depart", boarded: false })).toBe(false);
    const late = setup(); late.hour(); late.hour(); late.send({ type: "advance-clock", minutes: 15 }); late.send({ type: "advance-clock", minutes: 15 });
    expect(late.s.dispatch({ type: "depart", boarded: true })).toBe(false);
    expect(late.s.getSnapshot().state.journey).toEqual(emptyJourney());
  });
  it.each(["absence", "disagreement", "interruption"])("opens review for %s without obligation or seat release", scenario => {
    const { s, send, depart, role, reload } = setup(); depart(scenario !== "absence");
    if (scenario === "disagreement") { send({ type: "state-journey", outcome: "completed" }); role("passenger"); send({ type: "state-journey", outcome: "not-completed" }); }
    if (scenario === "interruption") { expect(s.dispatch({ type: "cancel-trip" })).toBe(false); send({ type: "report-interruption" }); send({ type: "report-interruption" }); }
    expect(s.getSnapshot().state.journey.review).not.toBeNull();
    expect(s.getSnapshot().state.journey.cancellation).toBeNull();
    expect(s.getSnapshot().state.journey.obligation).toBeNull();
    expect(s.dispatch({ type: "claim-payment", method: "cash" })).toBe(false);
    expect(reload().recovered).toBe(false);
  });
  it.each(["dispute", "silence"])("preserves an obligation and claim during receipt %s without settling", outcome => {
    const { s, agree, send, role, reload } = setup(); agree(); send({ type: "claim-payment", method: "upi" }); role("driver");
    if (outcome === "dispute") send({ type: "respond-payment", response: "disputed" });
    else send({ type: "advance-clock", minutes: 1440 });
    expect(s.getSnapshot().state.journey.obligation?.paise).toBe(1215);
    expect(s.getSnapshot().state.journey.claim?.method).toBe("upi");
    expect(s.getSnapshot().state.journey.receipt).toBeNull();
    expect(s.dispatch({ type: "respond-payment", response: "received" })).toBe(false);
    expect(reload().recovered).toBe(false);
  });
  it("keeps overdue amounts fixed and reset removes every related record only from this demo", () => {
    const { s, agree, send, storage, reload } = setup(); agree(); send({ type: "advance-clock", minutes: 1440 });
    expect(s.getSnapshot().state.journey.obligation?.paise).toBe(1215); expect(s.getSnapshot().state.journey.claim).toBeNull();
    send({ type: "claim-payment", method: "cash" });
    storage.setItem("account-preference", "keep"); send({ type: "reset" });
    expect(reload().state.journey).toEqual(emptyJourney()); expect(reload().state.allocation).toBeNull(); expect(reload().state.request).toBeNull();
    expect(storage.getItem("account-preference")).toBe("keep");
  });
  it("rejects impossible persisted obligations, receipts and late mutual confirmation", () => {
    const { storage, agree, s, reload } = setup(); agree();
    const original = JSON.parse(storage.getItem(DEMO_STORAGE_KEY)!);
    const j = original.journey;
    for (const journey of [{ ...j, passengerStatement: null }, { ...j, obligation: { ...j.obligation, paise: 1 } }, { ...j, receipt: { minute: 1020 } }, { ...j, departure: null }, { ...j, passengerStatement: { outcome: "completed", minute: 2460 }, obligation: { ...j.obligation, minute: 2460, dueMinute: 3900 } }]) {
      storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...original, minute: 2460, journey })); expect(reload().recovered).toBe(true);
    }
    expect(Object.isFrozen(s.getSnapshot().state.journey.obligation)).toBe(true);
  });
});
