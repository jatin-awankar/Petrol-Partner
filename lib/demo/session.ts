import { z } from "zod";
import { advanceJourney, emptyJourney, journeyActions, journeySchema, transitionJourney, validJourney } from "./journey";

export const DEMO_STORAGE_KEY = "petrol-partner.demo.session";
export const INITIAL_MINUTE = 15 * 60;
export const LAST_MINUTE = INITIAL_MINUTE + 72 * 60;

export const demoFixture = {
  passenger: { name: "Mira", initials: "MI", description: "A passenger heading across town." },
  driver: { name: "Arjun", initials: "AR", description: "A driver with room along the way." },
  route: {
    id: "sample-route-01",
    stops: ["Market Square", "River Library", "Garden Gate"],
    departureMinute: 17 * 60,
    distanceKm: 4,
    vehicle: "Sample car",
    capacity: 3,
  },
} as const;

const roleSchema = z.enum(["passenger", "driver"]);
export const REQUEST_DEADLINE = demoFixture.route.departureMinute - 60;
export const DECISION_DEADLINE = demoFixture.route.departureMinute - 30;
const stopSchema = z.number().int().min(0).max(2);
const termsSchema = z.strictObject({
  pickup: stopSchema, dropoff: stopSchema,
  metres: z.number().int().positive(), paise: z.number().int().positive(),
  currency: z.literal("INR"), policy: z.literal("sample-car-v1"), routeVersion: z.literal(1),
}).refine(t => { const q = quoteDemoSegment(t.pickup, t.dropoff); return q !== null && q.metres === t.metres && q.paise === t.paise; });
const requestSchema = z.strictObject({ id: z.literal("sample-request-01"), terms: termsSchema, status: z.enum(["pending", "accepted", "rejected", "expired"]), createdMinute: z.number().int().min(INITIAL_MINUTE).max(REQUEST_DEADLINE - 1) });
const allocationSchema = z.strictObject({ id: z.literal("sample-trip-01"), requestId: z.literal("sample-request-01"), terms: termsSchema, acceptedMinute: z.number().int().min(INITIAL_MINUTE).max(DECISION_DEADLINE - 1) });

/** Preset distances, never a routing-provider quote. Round once to integer paise. */
export function quoteDemoSegment(pickup: number, dropoff: number) {
  const positions = [0, 1735, 4000];
  if (!Number.isInteger(pickup) || !Number.isInteger(dropoff) || pickup < 0 || dropoff > 2 || pickup >= dropoff) return null;
  const metres = positions[dropoff] - positions[pickup];
  return { pickup, dropoff, metres, paise: Math.round(metres * 700 / 1000), currency: "INR" as const, policy: "sample-car-v1" as const, routeVersion: 1 as const };
}
export function demoAmount(paise: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100); }

const stateSchema = z.strictObject({
  version: z.literal(3),
  journey: journeySchema,
  occupiedSeats: z.union([z.literal(2), z.literal(3)]),
  request: requestSchema.nullable(),
  allocation: allocationSchema.nullable(),
  role: roleSchema.nullable(),
  minute: z.number().int().min(INITIAL_MINUTE).max(LAST_MINUTE),
}).refine(state => {
  if (state.role === null && (state.minute !== INITIAL_MINUTE || state.request || state.allocation || state.occupiedSeats !== 2)) return false;
  const r = state.request, a = state.allocation;
  if (r && (r.createdMinute > state.minute || (r.status === "pending" && state.minute >= DECISION_DEADLINE) || (r.status === "expired" && state.minute < DECISION_DEADLINE))) return false;
  if ((r?.status === "accepted") !== Boolean(a)) return false;
  if (!validJourney(state.journey, a ? { minute: state.minute, acceptedMinute: a.acceptedMinute, paise: a.terms.paise } : null, state.minute)) return false;
  return !a || (state.occupiedSeats < demoFixture.route.capacity && a.acceptedMinute <= state.minute && a.acceptedMinute >= r!.createdMinute && JSON.stringify(a.terms) === JSON.stringify(r!.terms));
});
const actionSchema = z.discriminatedUnion("type", [
  ...journeyActions,
  z.strictObject({ type: z.literal("choose-role"), role: roleSchema }),
  z.strictObject({ type: z.literal("advance-clock"), minutes: z.union([z.literal(15), z.literal(60), z.literal(1440)]) }),
  z.strictObject({ type: z.literal("reset") }),
  z.strictObject({ type: z.literal("set-scenario"), full: z.boolean() }),
  z.strictObject({ type: z.literal("request-seat"), pickup: stopSchema, dropoff: stopSchema }),
  z.strictObject({ type: z.literal("decide-request"), decision: z.enum(["accepted", "rejected"]) }),
]);
export type DemoRole = z.infer<typeof roleSchema>;
export type DemoState = Readonly<z.infer<typeof stateSchema>>;
export type DemoAction = z.infer<typeof actionSchema>;
export type DemoSnapshot = Readonly<{
  state: DemoState;
  persistence: "tab" | "memory";
  recovered: boolean;
}>;
function freezeState(state: DemoState): DemoState {
  for (const value of Object.values(state.journey)) if (value) Object.freeze(value);
  Object.freeze(state.journey);
  if (state.request) { Object.freeze(state.request.terms); Object.freeze(state.request); }
  if (state.allocation) { Object.freeze(state.allocation.terms); Object.freeze(state.allocation); }
  return Object.freeze(state);
}
type StorageAdapter = Pick<Storage, "getItem" | "setItem">;
const initialState = (): DemoState => Object.freeze({ version: 3, journey: emptyJourney(), role: null, minute: INITIAL_MINUTE, occupiedSeats: 2, request: null, allocation: null });

export function formatDemoTime(minute: number) {
  const day = Math.floor(minute / 1440) + 1;
  const hour = Math.floor((minute % 1440) / 60);
  return `Day ${day} · ${String(hour).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** No network, real identity, wall clock or business-state side effects. */
export function createDemoSession(getStorage: () => StorageAdapter) {
  let storage: StorageAdapter | null = null;
  let state = initialState();
  let recovered = false;
  try {
    storage = getStorage();
    const raw = storage.getItem(DEMO_STORAGE_KEY);
    if (raw !== null) {
      // Bound this disposable simulator snapshot before parsing. Old versions recover visibly.
      const parsed = raw.length <= 4096 ? stateSchema.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success) state = freezeState(parsed.data);
      else recovered = true;
    }
  } catch (error) {
    if (error instanceof SyntaxError) recovered = true;
    else storage = null;
  }
  let snapshot: DemoSnapshot = Object.freeze({ state, persistence: storage ? "tab" : "memory", recovered });
  const listeners = new Set<() => void>();
  function save(next: DemoState, wasRecovered = false) {
    freezeState(next);
    try { storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(next)); }
    catch { storage = null; }
    snapshot = Object.freeze({ state: next, persistence: storage ? "tab" : "memory", recovered: wasRecovered });
    listeners.forEach(listener => listener());
  }
  // Replace invalid/obsolete content only in our own key. Never clear browser storage.
  if (recovered) save(initialState(), true);
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispatch(input: DemoAction): boolean {
      const result = actionSchema.safeParse(input);
      if (!result.success) return false;
      const action = result.data;
      const current = snapshot.state;
      if (action.type === "reset") { save(initialState()); return true; }
      if (action.type === "choose-role") {
        save(freezeState({ ...current, role: action.role }));
        return true;
      }
      if (!current.role) return false;
      if (action.type === "set-scenario") {
        if (current.request) return false;
        save(freezeState({ ...current, occupiedSeats: action.full ? 3 : 2 }));
        return true;
      }
      if (action.type === "request-seat") {
        if (current.role !== "passenger") return false;
        // One fixed request identity per scenario. Exact retries preserve the original result.
        if (current.request) return current.request.terms.pickup === action.pickup && current.request.terms.dropoff === action.dropoff;
        const terms = quoteDemoSegment(action.pickup, action.dropoff);
        if (!terms || current.minute >= REQUEST_DEADLINE) return false;
        save(freezeState({ ...current, request: { id: "sample-request-01", terms: Object.freeze(terms), status: "pending", createdMinute: current.minute } }));
        return true;
      }
      if (action.type === "decide-request") {
        if (current.role !== "driver" || !current.request) return false;
        if (current.request.status === action.decision) return true;
        if (current.request.status !== "pending" || current.minute >= DECISION_DEADLINE) return false;
        if (action.decision === "accepted" && current.occupiedSeats >= demoFixture.route.capacity) return false;
        save(freezeState({ ...current,
          request: { ...current.request, status: action.decision },
          allocation: action.decision === "accepted" ? { id: "sample-trip-01", requestId: current.request.id, terms: current.request.terms, acceptedMinute: current.minute } : null,
        }));
        return true;
      }
      if (action.type !== "advance-clock") {
        if (!current.allocation) return false;
        const journey = transitionJourney(current.journey, action, { minute: current.minute, role: current.role, acceptedMinute: current.allocation.acceptedMinute, paise: current.allocation.terms.paise });
        if (!journey) return false;
        if (journey !== current.journey) save(freezeState({ ...current, journey }));
        return true;
      }
      if (current.minute + action.minutes > LAST_MINUTE) return false;
      const minute = current.minute + action.minutes;
      save(freezeState({ ...current, minute, journey: advanceJourney(current.journey, minute), request: current.request?.status === "pending" && minute >= DECISION_DEADLINE ? { ...current.request, status: "expired" } : current.request }));
      return true;
    },
  };
}
export type DemoSession = ReturnType<typeof createDemoSession>;
