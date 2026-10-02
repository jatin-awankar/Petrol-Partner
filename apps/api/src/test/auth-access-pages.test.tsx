// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LoginPage from "../../../../app/login/page";
import RegisterPage from "../../../../app/register/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/hooks/auth/useCurrentUser", () => ({
  useCurrentUser: () => ({
    isAuthenticated: false,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
  }),
}));

afterEach(cleanup);

it("renders one sign-in heading and one main landmark with the unavailable provider stated up front", () => {
  const { container } = render(<main><LoginPage /></main>);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getAllByRole("link", { name: /create your account/i })).toHaveLength(1);
  expect(screen.getByRole("link", { name: /Petrol Partner home/i }).getAttribute("href")).toBe("/");
  const google = screen.getByRole("button", { name: "Sign in with Google" });
  expect(google.hasAttribute("disabled")).toBe(true);
  expect(google.getAttribute("aria-describedby")).toBe("google-signin-status");
  expect(container.querySelector("#google-signin-status")?.textContent).toMatch(/unavailable during the backend cutover/i);
});

it("renders registration as the page heading with one main landmark", () => {
  render(<main><RegisterPage /></main>);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: "Register" })).not.toBeNull();
});
