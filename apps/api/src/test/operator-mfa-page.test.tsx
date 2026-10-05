// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import OperatorMfaPage from "../../../../app/operator/mfa/page";

const state = vi.hoisted(() => ({ calls: [] as string[], existingFactor: false, pendingFactor: false,
  enrollBody: "", challengeBody: "", enrollConflict: false, refreshes: 0 }));
vi.mock("@/hooks/auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { id: "operator", role: "admin" }, loading: false,
    refreshUser: async () => { state.refreshes += 1; } }),
}));
vi.mock("@/lib/api/client", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  }
  return { ApiError,
  apiRequest: async (path: string, options?: { body?: string }) => {
    state.calls.push(path);
    if (path === "/v1/auth/mfa/factors") return { factors: state.existingFactor
      ? [{ id: "df4ecc30-e46e-4bd5-b8c1-a403cbda9a07", friendlyName: "Work authenticator" }] : [],
    pendingFactors: state.pendingFactor
      ? [{ id: "4385e583-a2c9-4294-af3a-a420b165a319", friendlyName: "Unfinished setup" }] : [],
    assuranceLevel: "aal1" };
    if (path === "/v1/auth/mfa/enroll") {
      state.enrollBody = options?.body ?? "";
      if (state.enrollConflict) {
        state.pendingFactor = true;
        throw new ApiError("MFA_SETUP_PENDING");
      }
      return {
      factorId: "df4ecc30-e46e-4bd5-b8c1-a403cbda9a07", secret: "SYNTHETICSECRET",
      uri: "otpauth://totp/Petrol%20Partner?secret=SYNTHETICSECRET", qrCode: "<svg/>" };
    }
    if (path === "/v1/auth/mfa/challenge") {
      state.challengeBody = options?.body ?? "";
      return { challengeId: "b01e9b8c-55bd-4de3-b9b4-b3a6a4c67591" };
    }
    if (path === "/v1/auth/mfa/verify") return { assuranceLevel: "aal2" };
    throw new Error(`Unexpected request: ${path}`);
  },
  };
});

afterEach(() => { cleanup(); state.calls = []; state.existingFactor = false; state.pendingFactor = false;
  state.enrollBody = ""; state.challengeBody = ""; state.enrollConflict = false; state.refreshes = 0; sessionStorage.clear(); });

it("lets an operator begin TOTP setup and reach a labeled keyboard entry field", async () => {
  render(<OperatorMfaPage />);
  expect(await screen.findByRole("button", { name: "Set up authenticator" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
  expect(await screen.findByRole("img", { name: "Authenticator setup QR code" })).not.toBeNull();
  expect(screen.getByText("SYNTHETICSECRET")).not.toBeNull();
  const code = screen.getByRole("textbox", { name: "Six-digit authenticator code" });
  await waitFor(() => expect(document.activeElement).toBe(code));
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

it("lets an operator finish an already scanned pending factor without replacing it", async () => {
  state.pendingFactor = true;
  render(<OperatorMfaPage />);
  expect(await screen.findByText("Unfinished authenticator setup")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Set up authenticator" })).toBeNull();
  const code = screen.getByRole("textbox", { name: "Six-digit authenticator code" });
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.keyDown(code, { key: "Enter", code: "Enter" });
  expect(await screen.findByRole("link", { name: "Continue to operator workspace" })).not.toBeNull();
  expect(state.calls).toEqual([
    "/v1/auth/mfa/factors", "/v1/auth/mfa/challenge", "/v1/auth/mfa/verify",
  ]);
});

it("lets an operator select an unfinished factor when a verified factor also exists", async () => {
  state.existingFactor = true;
  state.pendingFactor = true;
  render(<OperatorMfaPage />);
  const selector = await screen.findByRole("combobox", { name: "Authenticator" });
  fireEvent.change(selector, { target: { value: "4385e583-a2c9-4294-af3a-a420b165a319" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Six-digit authenticator code" }),
    { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  expect(await screen.findByRole("link", { name: "Continue to operator workspace" })).not.toBeNull();
  expect(JSON.parse(state.challengeBody)).toEqual({ factorId: "4385e583-a2c9-4294-af3a-a420b165a319" });
});

it("asks before replacing an unfinished factor whose secret was lost", async () => {
  state.pendingFactor = true;
  render(<OperatorMfaPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Replace unfinished setup" }));
  expect(screen.getByText(/the old authenticator code will stop working/i)).not.toBeNull();
  expect(state.calls).toEqual(["/v1/auth/mfa/factors"]);
  fireEvent.click(screen.getByRole("button", { name: "Discard unfinished setup and create a new secret" }));
  expect(await screen.findByRole("img", { name: "Authenticator setup QR code" })).not.toBeNull();
  expect(JSON.parse(state.enrollBody)).toEqual({ replacePendingFactorId: "4385e583-a2c9-4294-af3a-a420b165a319" });
});

it("explains that an unfinished setup survived an uncertain response", async () => {
  state.enrollConflict = true;
  render(<OperatorMfaPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
  expect(await screen.findByText("Unfinished authenticator setup")).not.toBeNull();
  expect(screen.getByText(/your unfinished setup is still available/i)).not.toBeNull();
});
