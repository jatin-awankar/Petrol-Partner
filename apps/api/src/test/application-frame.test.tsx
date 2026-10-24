// @vitest-environment jsdom
import { useEffect, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import ApplicationFrame, { withoutDemoAnalytics } from "../../../../app/providers/ApplicationFrame";

const effects = vi.hoisted(() => ({ auth: vi.fn(), unmount: vi.fn(), analytics: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/demo") }));
vi.mock("../../../../app/providers/ClientProviders", () => ({ default: function TestProviders({ children }: { children: ReactNode }) {
  useEffect(() => { effects.auth(); return effects.unmount; }, []);
  return <div data-testid="real-providers">{children}</div>;
} }));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => { useEffect(() => { effects.analytics(); }, []); return null; } }));
vi.mock("@/components/ParticipantShell", () => ({ default: () => <nav>Real participant navigation</nav> }));
vi.mock("@/components/OperatorShell", () => ({ default: () => <nav>Real operator navigation</nav> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each(["/demo", "/demo/home", "/demo/unknown"])("does not mount real auth, chrome or analytics at %s", path => {
  vi.mocked(usePathname).mockReturnValue(path);
  render(<ApplicationFrame><h1>Sample</h1></ApplicationFrame>);
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Sample" })).not.toBeNull();
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(effects.auth).not.toHaveBeenCalled();
  expect(effects.analytics).not.toHaveBeenCalled();
});

it.each(["/", "/login", "/dashboard", "/operator", "/demonstration"])("preserves real providers and chrome at %s", path => {
  vi.mocked(usePathname).mockReturnValue(path);
  render(<ApplicationFrame>Live page</ApplicationFrame>);
  expect(effects.auth).toHaveBeenCalledOnce();
  expect(effects.analytics).toHaveBeenCalledOnce();
  expect(screen.getAllByRole("navigation")).toHaveLength(2);
});

it("unmounts real effects on client navigation into demo and restores them when leaving", () => {
  vi.mocked(usePathname).mockReturnValue("/dashboard");
  const view = render(<ApplicationFrame>Page</ApplicationFrame>);
  vi.mocked(usePathname).mockReturnValue("/demo/home");
  view.rerender(<ApplicationFrame>Page</ApplicationFrame>);
  expect(effects.unmount).toHaveBeenCalledOnce();
  expect(screen.queryByTestId("real-providers")).toBeNull();
  vi.mocked(usePathname).mockReturnValue("/login");
  view.rerender(<ApplicationFrame>Page</ApplicationFrame>);
  expect(effects.auth).toHaveBeenCalledTimes(2);
});


it("filters demo events even when an analytics script outlives its component", () => {
  expect(withoutDemoAnalytics({ type: "pageview", url: "https://example.test/demo" })).toBeNull();
  expect(withoutDemoAnalytics({ type: "event", url: "https://example.test/demo/home?role=driver" })).toBeNull();
  const normal = { type: "pageview" as const, url: "https://example.test/demonstration" };
  expect(withoutDemoAnalytics(normal)).toBe(normal);
});
