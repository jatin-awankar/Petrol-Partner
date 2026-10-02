// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LoginPage from "../../../../app/login/page";
import RegisterPage from "../../../../app/register/page";
import RecoverPage from "../../../../app/recover/page";
import RecoveryPasswordPage from "../../../../app/recover/password/page";
import AuthCallbackPage from "../../../../app/auth/callback/page";

const state = vi.hoisted(() => ({
  user: null as null | { role: string },
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/hooks/auth/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: state.user,
    isAuthenticated: Boolean(state.user),
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
  }),
}));

afterEach(() => { cleanup(); state.user = null; state.replace.mockReset(); });

it("routes a signed-in operator to the authenticator challenge", () => {
  state.user = { role: "admin" };
  render(<main><LoginPage /></main>);
  expect(state.replace).toHaveBeenCalledWith("/operator/mfa");
  expect(state.replace).not.toHaveBeenCalledWith("/dashboard");
});

it("renders one sign-in heading and one main landmark with the unavailable provider stated up front", () => {
  const { container } = render(<main><LoginPage /></main>);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getAllByRole("heading")[0].tagName).toBe("H1");
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

it("renders account recovery inside the page's single main landmark", () => {
  render(<main id="main-content"><RecoverPage /></main>);
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: "Recover account access" })).not.toBeNull();
});

it("renders the new-password page inside one main landmark", () => {
  render(<main id="main-content"><RecoveryPasswordPage /></main>);
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: "Choose a new password" })).not.toBeNull();
});

it("renders the sign-in callback inside one main landmark", () => {
  render(<main id="main-content"><AuthCallbackPage /></main>);
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: "Completing sign-in" })).not.toBeNull();
});
