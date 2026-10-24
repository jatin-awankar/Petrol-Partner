import { z } from "zod";

export const DEMO_STORAGE_KEY = "petrol-partner.demo.session";
export const INITIAL_MINUTE = 15 * 60;
export const LAST_MINUTE = INITIAL_MINUTE + 48 * 60;

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
const stateSchema = z.strictObject({
  version: z.literal(1),
  role: roleSchema.nullable(),
  minute: z.number().int().min(INITIAL_MINUTE).max(LAST_MINUTE),
}).refine(state => state.role !== null || state.minute === INITIAL_MINUTE);
const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("choose-role"), role: roleSchema }),
  z.strictObject({ type: z.literal("advance-clock"), minutes: z.union([z.literal(15), z.literal(60)]) }),
  z.strictObject({ type: z.literal("reset") }),
]);
export type DemoRole = z.infer<typeof roleSchema>;
export type DemoState = Readonly<z.infer<typeof stateSchema>>;
export type DemoAction = z.infer<typeof actionSchema>;
export type DemoSnapshot = Readonly<{
  state: DemoState;
  persistence: "tab" | "memory";
  recovered: boolean;
}>;
type StorageAdapter = Pick<Storage, "getItem" | "setItem">;
const initialState = (): DemoState => Object.freeze({ version: 1, role: null, minute: INITIAL_MINUTE });

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
      // Bound input before parsing; this key stores three small scalar fields only.
      const parsed = raw.length <= 512 ? stateSchema.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success) state = Object.freeze(parsed.data);
      else recovered = true;
    }
  } catch (error) {
    if (error instanceof SyntaxError) recovered = true;
    else storage = null;
  }
  let snapshot: DemoSnapshot = Object.freeze({ state, persistence: storage ? "tab" : "memory", recovered });
  const listeners = new Set<() => void>();
  function save(next: DemoState, wasRecovered = false) {
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
        save(Object.freeze({ ...current, role: action.role }));
        return true;
      }
      if (!current.role || current.minute + action.minutes > LAST_MINUTE) return false;
      save(Object.freeze({ ...current, minute: current.minute + action.minutes }));
      return true;
    },
  };
}
export type DemoSession = ReturnType<typeof createDemoSession>;
