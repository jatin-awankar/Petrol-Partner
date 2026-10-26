// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ApplicationFrame from "../../../../app/providers/ApplicationFrame";
import { DemoProvider } from "../../../../components/demo/DemoProvider";
import DemoShell from "../../../../components/demo/DemoShell";
import DemoEntry from "../../../../app/demo/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/demo", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/demo/demo.module.css", () => ({ default: {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); document.cookie = "pp_access_token=; Max-Age=0; path=/"; });

it("the actual application frame makes no auth, telemetry or live calls even with an existing account cookie", async () => {
  document.cookie = "pp_access_token=synthetic-existing-session; path=/";
  localStorage.setItem("account-preferences", "keep");
  const cookies = document.cookie;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network call"); }));
  render(<ApplicationFrame><DemoProvider><DemoShell><DemoEntry /></DemoShell></DemoProvider></ApplicationFrame>);
  fireEvent.click(await screen.findByRole("button", { name: "Explore as driver" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset this demo" }));
  expect(fetch).not.toHaveBeenCalled();
  expect(document.cookie).toBe(cookies);
  expect(localStorage.getItem("account-preferences")).toBe("keep");
  expect(screen.queryByRole("navigation", { name: "Participant" })).toBeNull();
  expect(screen.queryByRole("navigation", { name: "Operator queues" })).toBeNull();
  expect(screen.getAllByRole("main")).toHaveLength(1);
});
