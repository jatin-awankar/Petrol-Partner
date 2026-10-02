// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import OperatorShell from "../../../../components/OperatorShell";
import OperatorPage from "../../../../app/operator/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/operator" }));
vi.mock("@/hooks/auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: null, loading: true }),
}));

afterEach(cleanup);

it("lets keyboard users bypass operator queue links to the single page main landmark", () => {
  const { container } = render(<><OperatorShell /><main id="main-content"><OperatorPage /></main></>);
  expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main-content");
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(container.querySelectorAll("#main-content")).toHaveLength(1);
  expect(screen.getByRole("status").textContent).toMatch(/checking operator access/i);
});
