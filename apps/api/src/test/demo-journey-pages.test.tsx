// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DemoProvider } from "../../../../components/demo/DemoProvider";
import { DemoJourney } from "../../../../components/demo/DemoJourney";
import { DemoBooking } from "../../../../components/demo/DemoBooking";
import { createDemoSession } from "../../../../lib/demo/session";
vi.mock("@/app/demo/demo.module.css", () => ({ default: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Demo cannot call a live API"); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function accepted() {
  const s = createDemoSession(() => sessionStorage);
  s.dispatch({ type: "choose-role", role: "passenger" }); s.dispatch({ type: "request-seat", pickup: 0, dropoff: 1 });
  s.dispatch({ type: "choose-role", role: "driver" }); s.dispatch({ type: "decide-request", decision: "accepted" });
  return s;
}
const click = (name: string) => fireEvent.click(screen.getAllByRole("button", { name, exact: true })[0]);
it("guides both people to a contribution claim, then a separate driver receipt that survives refresh", async () => {
  accepted();
  const view = render(<DemoProvider><DemoJourney /></DemoProvider>);
  expect((await screen.findByRole("button", { name: "Start with Mira aboard" }) as HTMLButtonElement).disabled).toBe(true);
  click("Advance 1 hour"); click("Advance 1 hour"); click("Start with Mira aboard"); click("Confirm journey completed");
  expect(screen.getByText("No contribution owed")).not.toBeNull();
  click("Switch to passenger"); click("Confirm I travelled and completed");
  expect(screen.getByRole("link", { name: "Continue to contribution" }).getAttribute("href")).toBe("/demo/contributions/sample-contribution-01");
  view.rerender(<DemoProvider><DemoJourney screen="contribution" /></DemoProvider>);
  fireEvent.change(screen.getByLabelText("Sample payment method"), { target: { value: "upi" } });
  click("Record sample payment claim");
  expect(screen.getByRole("heading", { name: "Claimed. Not yet received." })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm sample receipt" })).toBeNull();
  click("Switch to driver"); click("Confirm sample receipt");
  expect(screen.getByRole("heading", { name: "Receipt confirmed." })).not.toBeNull();
  view.unmount(); render(<DemoProvider><DemoJourney screen="contribution" /></DemoProvider>);
  expect(await screen.findByRole("heading", { name: "Receipt confirmed." })).not.toBeNull();
  expect(screen.getByText("Mira claimed UPI payment")).not.toBeNull();
  expect(screen.getByText("Arjun confirmed receipt; sample settled")).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("explains disagreement without an obligation or operator power", async () => {
  const s = accepted(); s.dispatch({ type: "advance-clock", minutes: 60 }); s.dispatch({ type: "advance-clock", minutes: 60 }); s.dispatch({ type: "depart", boarded: true });
  s.dispatch({ type: "state-journey", outcome: "completed" }); s.dispatch({ type: "choose-role", role: "passenger" });
  const view = render(<DemoProvider><DemoJourney /></DemoProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Journey did not complete" }));
  expect(screen.getByRole("heading", { name: "This journey needs review." })).not.toBeNull();
  view.rerender(<DemoProvider><DemoJourney screen="review" /></DemoProvider>);
  expect(screen.getByText(/No money is owed in this scenario/)).not.toBeNull();
  expect(screen.getByText(/grants no operator access/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm sample receipt" })).toBeNull();
});
it("shows cancellation across request and trip without claiming an active allocation", async () => {
  accepted();
  const view = render(<DemoProvider><DemoJourney /></DemoProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Cancel sample trip" }));
  expect(screen.getByText("Released once · cancelled")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Start with Mira aboard" })).toBeNull();
  view.rerender(<DemoProvider><DemoBooking screen="request" /></DemoProvider>);
  expect(screen.getByRole("heading", { name: "Cancelled before departure." })).not.toBeNull();
  expect(screen.getByText("1 of 3 · 2 other sample passengers")).not.toBeNull();
});
it("makes an overdue contribution visible while still allowing an explicit claim", async () => {
  const s = accepted(); s.dispatch({ type: "advance-clock", minutes: 60 }); s.dispatch({ type: "advance-clock", minutes: 60 }); s.dispatch({ type: "depart", boarded: true });
  s.dispatch({ type: "state-journey", outcome: "completed" }); s.dispatch({ type: "choose-role", role: "passenger" }); s.dispatch({ type: "state-journey", outcome: "completed" });
  render(<DemoProvider><DemoJourney screen="contribution" /></DemoProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Advance 24 hours" }));
  expect(screen.getByText("Overdue · no payment claimed")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Record sample payment claim" })).not.toBeNull();
});
