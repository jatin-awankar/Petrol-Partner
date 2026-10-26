// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DemoProvider } from "../../../../components/demo/DemoProvider";
import DemoShell from "../../../../components/demo/DemoShell";
import DemoEntry from "../../../../app/demo/page";
import DemoNotFound from "../../../../app/demo/not-found";
import DemoHome from "../../../../app/demo/home/page";
import { emptyJourney } from "../../../../lib/demo/journey";
import { DEMO_STORAGE_KEY } from "../../../../lib/demo/session";

vi.mock("@/app/demo/demo.module.css", () => ({ default: {} }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
beforeEach(() => { sessionStorage.clear(); push.mockClear(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Demo must not fetch"); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const home = () => <DemoProvider><DemoShell><DemoHome /></DemoShell></DemoProvider>;

it("chooses a role without authentication or a network call", async () => {
  render(<DemoProvider><DemoShell><DemoEntry /></DemoShell></DemoProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Explore as passenger" }));
  expect(push).toHaveBeenCalledWith("/demo/home");
  expect(JSON.parse(sessionStorage.getItem(DEMO_STORAGE_KEY)!).role).toBe("passenger");
  expect(fetch).not.toHaveBeenCalled();
});

it("shares the clock between roles and resumes after remount", async () => {
  sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ version: 3, journey: emptyJourney(), occupiedSeats: 2, request: null, allocation: null, role: "passenger", minute: 900 }));
  const view = render(home());
  fireEvent.click(await screen.findByRole("button", { name: "Advance 15 minutes" }));
  fireEvent.click(screen.getByRole("button", { name: "Switch to driver" }));
  expect(screen.getByRole("heading", { name: /You’re Arjun/ })).not.toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Day 1 · 15:15");
  view.unmount(); render(home());
  expect(await screen.findByRole("heading", { name: /You’re Arjun/ })).not.toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Day 1 · 15:15");
  expect(fetch).not.toHaveBeenCalled();
});

it("requires explicit reset, preserves unrelated data, and handles a deep link after reset", async () => {
  sessionStorage.setItem("account-preference", "unchanged");
  sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ version: 3, journey: emptyJourney(), occupiedSeats: 2, request: null, allocation: null, role: "driver", minute: 960 }));
  render(home());
  fireEvent.click(await screen.findByRole("button", { name: "Reset demo" }));
  expect(screen.getByRole("dialog")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Keep exploring" }));
  expect(screen.getByRole("heading", { name: /You’re Arjun/ })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset this demo" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("heading", { name: "Choose your perspective." })).not.toBeNull();
  expect(sessionStorage.getItem("account-preference")).toBe("unchanged");
  expect(push).toHaveBeenCalledWith("/demo");
  expect(fetch).not.toHaveBeenCalled();
});

it("explains recovered storage and offers a usable fresh entry", async () => {
  sessionStorage.setItem(DEMO_STORAGE_KEY, "invalid");
  render(<DemoProvider><DemoShell><DemoEntry /></DemoShell></DemoProvider>);
  expect(await screen.findByText(/saved demo was outdated/)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Explore as driver" }));
  expect(push).toHaveBeenCalledWith("/demo/home");
});


it("keeps missing demo links inside the demo", async () => {
  render(<DemoProvider><DemoShell><DemoNotFound /></DemoShell></DemoProvider>);
  expect((await screen.findByRole("link", { name: "Return to demo" })).getAttribute("href")).toBe("/demo");
  expect(screen.queryByRole("link", { name: "Return Home" })).toBeNull();
});


it("keeps role selection usable when browser persistence is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  render(<DemoProvider><DemoShell><DemoEntry /></DemoShell></DemoProvider>);
  expect(await screen.findByText(/Changes cannot be saved in this tab/)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Explore as passenger" }));
  expect(push).toHaveBeenCalledWith("/demo/home");
  expect(screen.getByText(/ready to continue as/)).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
