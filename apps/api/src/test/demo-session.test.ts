import { describe, expect, it } from "vitest";
import { createDemoSession, DEMO_STORAGE_KEY, INITIAL_MINUTE, LAST_MINUTE, type DemoAction } from "../../../../lib/demo/session";

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("isolated demo session", () => {
  it("persists a role and explicit clock through reload, switching roles preserves the same scenario", () => {
    const store = storage();
    const session = createDemoSession(() => store);
    expect(session.dispatch({ type: "advance-clock", minutes: 15 })).toBe(false);
    session.dispatch({ type: "choose-role", role: "passenger" });
    session.dispatch({ type: "advance-clock", minutes: 60 });
    session.dispatch({ type: "choose-role", role: "driver" });
    expect(createDemoSession(() => store).getSnapshot().state).toMatchObject({ version: 3, role: "driver", minute: INITIAL_MINUTE + 60 });
  });

  it("reset changes only the demo key and returns to the fixture clock and no role", () => {
    const store = storage();
    store.setItem("real-account-preferences", "keep");
    const session = createDemoSession(() => store);
    session.dispatch({ type: "choose-role", role: "driver" });
    session.dispatch({ type: "advance-clock", minutes: 15 });
    session.dispatch({ type: "reset" });
    expect(store.getItem("real-account-preferences")).toBe("keep");
    expect(createDemoSession(() => store).getSnapshot().state).toMatchObject({ version: 3, role: null, minute: INITIAL_MINUTE });
  });

  it.each([
    "broken json", JSON.stringify({ version: 0, role: "driver", minute: 900 }),
    JSON.stringify({ version: 1, role: "admin", minute: 900 }),
    JSON.stringify({ version: 1, role: null, minute: 1000 }),
    JSON.stringify({ version: 1, role: "driver", minute: -1 }),
    JSON.stringify({ version: 1, role: "driver", minute: 900, token: "untrusted" }),
    "x".repeat(513), "null",
  ])("recovers invalid or obsolete persisted content safely: %s", raw => {
    const store = storage(); store.setItem(DEMO_STORAGE_KEY, raw);
    const session = createDemoSession(() => store);
    expect(session.getSnapshot().recovered).toBe(true);
    expect(session.getSnapshot().state.role).toBeNull();
    expect(createDemoSession(() => store).getSnapshot().recovered).toBe(false);
  });

  it("uses memory when storage access or writes fail", () => {
    const unavailable = createDemoSession(() => { throw new Error("denied"); });
    expect(unavailable.getSnapshot().persistence).toBe("memory");
    expect(unavailable.dispatch({ type: "choose-role", role: "driver" })).toBe(true);
    const failingWrite = createDemoSession(() => ({ getItem: () => null, setItem: () => { throw new Error("quota"); } }));
    failingWrite.dispatch({ type: "choose-role", role: "passenger" });
    expect(failingWrite.getSnapshot().persistence).toBe("memory");
    expect(failingWrite.getSnapshot().state.role).toBe("passenger");
  });

  it("rejects forged actions and clock overflow without changing or saving state", () => {
    const store = storage();
    const session = createDemoSession(() => store);
    session.dispatch({ type: "choose-role", role: "driver" });
    for (let i = 0; i < (LAST_MINUTE - INITIAL_MINUTE) / 60; i++) session.dispatch({ type: "advance-clock", minutes: 60 });
    expect(session.getSnapshot().state.minute).toBe(LAST_MINUTE);
    const previous = session.getSnapshot();
    const persisted = store.getItem(DEMO_STORAGE_KEY);
    expect(session.dispatch({ type: "advance-clock", minutes: 15 })).toBe(false);
    expect(session.dispatch({ type: "real-booking" } as unknown as DemoAction)).toBe(false);
    expect(session.dispatch({ type: "choose-role", role: "admin" } as unknown as DemoAction)).toBe(false);
    expect(session.getSnapshot()).toBe(previous);
    expect(store.getItem(DEMO_STORAGE_KEY)).toBe(persisted);
  });

  it("independent browser storage contexts do not share state", () => {
    const first = createDemoSession(storage);
    const second = createDemoSession(storage);
    first.dispatch({ type: "choose-role", role: "driver" });
    first.dispatch({ type: "advance-clock", minutes: 15 });
    expect(second.getSnapshot().state).toMatchObject({ version: 3, role: null, minute: INITIAL_MINUTE });
  });
});
