// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import OperatorMfaPage from "../../../../app/operator/mfa/page";

const state = vi.hoisted(() => ({ calls: [] as string[], existingFactor: false, refreshes: 0 }));
vi.mock("@/hooks/auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { id: "operator", role: "admin" }, loading: false,
    refreshUser: async () => { state.refreshes += 1; } }),
}));
vi.mock("@/lib/api/client", () => ({
  apiRequest: async (path: string) => {
    state.calls.push(path);
    if (path === "/v1/auth/mfa/factors") return { factors: state.existingFactor
      ? [{ id: "df4ecc30-e46e-4bd5-b8c1-a403cbda9a07", friendlyName: "Work authenticator" }] : [], assuranceLevel: "aal1" };
    if (path === "/v1/auth/mfa/enroll") return {
      factorId: "df4ecc30-e46e-4bd5-b8c1-a403cbda9a07", secret: "SYNTHETICSECRET",
      uri: "otpauth://totp/Petrol%20Partner?secret=SYNTHETICSECRET", qrCode: "<svg/>" };
    if (path === "/v1/auth/mfa/challenge") return { challengeId: "b01e9b8c-55bd-4de3-b9b4-b3a6a4c67591" };
    if (path === "/v1/auth/mfa/verify") return { assuranceLevel: "aal2" };
    throw new Error(`Unexpected request: ${path}`);
  },
}));

afterEach(() => { cleanup(); state.calls = []; state.existingFactor = false; state.refreshes = 0; sessionStorage.clear(); });

it("lets an operator begin TOTP setup and reach a labeled keyboard entry field", async () => {
  render(<OperatorMfaPage />);
  expect(await screen.findByRole("button", { name: "Set up authenticator" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
  expect(await screen.findByRole("img", { name: "Authenticator setup QR code" })).not.toBeNull();
  expect(screen.getByText("SYNTHETICSECRET")).not.toBeNull();
  const code = screen.getByRole("textbox", { name: "Six-digit authenticator code" });
  expect(document.activeElement).toBe(code);
  expect(code.getAttribute("autocomplete")).toBe("one-time-code");
  expect(screen.getByRole("button", { name: "Verify and continue" })).not.toBeNull();
  expect(state.calls).toEqual(["/v1/auth/mfa/factors", "/v1/auth/mfa/enroll"]);
});

it("lets an operator submit an existing factor code with Enter and continue", async () => {
  state.existingFactor = true;
  render(<OperatorMfaPage />);
  const code = await screen.findByRole("textbox", { name: "Six-digit authenticator code" });
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.keyDown(code, { key: "Enter", code: "Enter" });
  expect(await screen.findByRole("link", { name: "Continue to operator workspace" })).not.toBeNull();
  expect(state.calls).toEqual([
    "/v1/auth/mfa/factors", "/v1/auth/mfa/challenge", "/v1/auth/mfa/verify",
  ]);
  expect(state.refreshes).toBe(1);
  expect(screen.queryByText("SYNTHETICSECRET")).toBeNull();
});
