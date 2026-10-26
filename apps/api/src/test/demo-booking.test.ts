import { describe, expect, it } from "vitest";
import { createDemoSession, quoteDemoSegment, DEMO_STORAGE_KEY } from "../../../../lib/demo/session";
function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  const session = createDemoSession(() => storage);
  session.dispatch({ type: "choose-role", role: "passenger" });
  return { session, storage };
}
const request = { type: "request-seat", pickup: 0, dropoff: 1 } as const;
const accept = { type: "decide-request", decision: "accepted" } as const;
describe("demo simulator rules (not database concurrency proof)", () => {
  it("quotes only ordered preset segments and rounds once to integer paise", () => {
    expect(quoteDemoSegment(0, 1)).toMatchObject({ metres: 1735, paise: 1215 });
    expect(quoteDemoSegment(1, 2)).toMatchObject({ metres: 2265, paise: 1586 });
    expect(quoteDemoSegment(0, 2)).toMatchObject({ metres: 4000, paise: 2800 });
    for (const [a,b] of [[0,0],[2,1],[-1,2],[0,3],[0.5,2],[NaN,2]]) expect(quoteDemoSegment(a,b)).toBeNull();
  });
  it("allocates once and preserves frozen terms across role changes, retries and reload", () => {
    const { session: s, storage } = setup();
    expect(s.dispatch(request)).toBe(true);
    expect(s.getSnapshot().state.allocation).toBeNull();
    expect(s.dispatch(accept)).toBe(false);
    expect(s.dispatch({ ...request, dropoff: 2 })).toBe(false);
    expect(s.dispatch({ type: "set-scenario", full: true })).toBe(false);
    s.dispatch({ type: "choose-role", role: "driver" });
    expect(s.dispatch(accept)).toBe(true);
    const accepted = s.getSnapshot();
    expect(s.dispatch(accept)).toBe(true);
    expect(s.getSnapshot()).toBe(accepted);
    expect(s.dispatch({ type: "decide-request", decision: "rejected" })).toBe(false);
    s.dispatch({ type: "advance-clock", minutes: 60 });
    s.dispatch({ type: "advance-clock", minutes: 60 });
    s.dispatch({ type: "choose-role", role: "passenger" });
    expect(s.dispatch(request)).toBe(true);
    const restored = createDemoSession(() => storage).getSnapshot();
    expect(restored.recovered).toBe(false);
    expect(restored.state.allocation).toEqual(accepted.state.allocation);
    expect(restored.state.request?.status).toBe("accepted");
  });
  it("allows pending without capacity but cannot overbook; decline retries are terminal", () => {
    const { session: s } = setup();
    s.dispatch({ type: "set-scenario", full: true });
    expect(s.dispatch(request)).toBe(true);
    s.dispatch({ type: "choose-role", role: "driver" });
    expect(s.dispatch(request)).toBe(false);
    expect(s.dispatch(accept)).toBe(false);
    expect(s.getSnapshot().state.allocation).toBeNull();
    expect(s.dispatch({ type: "decide-request", decision: "rejected" })).toBe(true);
    expect(s.dispatch({ type: "decide-request", decision: "rejected" })).toBe(true);
    expect(s.dispatch(accept)).toBe(false);
  });
  it("enforces both deadlines synchronously without inventing travel", () => {
    const { session: s } = setup();
    s.dispatch({ type: "advance-clock", minutes: 60 });
    expect(s.dispatch(request)).toBe(false);
    s.dispatch({ type: "reset" }); s.dispatch({ type: "choose-role", role: "passenger" }); s.dispatch(request);
    s.dispatch({ type: "choose-role", role: "driver" });
    s.dispatch({ type: "advance-clock", minutes: 60 }); s.dispatch({ type: "advance-clock", minutes: 15 });
    expect(s.getSnapshot().state.request?.status).toBe("pending");
    s.dispatch({ type: "advance-clock", minutes: 15 });
    expect(s.getSnapshot().state.request?.status).toBe("expired");
    expect(s.dispatch(accept)).toBe(false);
    expect(s.getSnapshot().state.allocation).toBeNull();
  });
  it("recovers contradictory, over-capacity or modified stored terms", () => {
    const { session: s, storage } = setup();
    s.dispatch(request); s.dispatch({ type: "choose-role", role: "driver" }); s.dispatch(accept);
    const original = JSON.parse(storage.getItem(DEMO_STORAGE_KEY)!);
    for (const patch of [{ occupiedSeats: 3 }, { allocation: null }, { request: { ...original.request, terms: { ...original.request.terms, paise: 1 } } }]) {
      storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...original, ...patch }));
      expect(createDemoSession(() => storage).getSnapshot().recovered).toBe(true);
    }
  });
});
