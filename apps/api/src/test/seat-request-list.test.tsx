// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeatRequestList, type SeatRequest } from "../../../../components/searchRides/SeatRequestList";

const now = new Date("2026-09-26T10:00:00.000Z");
function request(status:SeatRequest["status"],deadline:string):SeatRequest {
  return {id:crypto.randomUUID(),offer_id:crypto.randomUUID(),passenger_id:"passenger",
    driver_id:"driver",status,decision_deadline_at:deadline,confirmed:false,seats_reserved:0,
    offer_terms:{origin_code:"university",destination_code:"prmitr",
      departure_at:"2026-09-26T12:00:00.000Z",contribution_paise:2500,currency:"INR",
      cancellation_notice:"Contact support to cancel.",contact_notice:"Phone numbers are private."}};
}
beforeEach(() => {vi.useFakeTimers();vi.setSystemTime(now);});
afterEach(() => {cleanup();vi.useRealTimers();});

describe("seat request browser states",() => {
  it("shows pending as unconfirmed, then expiry at the decision deadline with the worker stopped",async() => {
    const item = request("pending","2026-09-26T10:01:00.000Z");
    render(<SeatRequestList requests={[item]} currentUserId="driver" busy={false} onReject={vi.fn()} onAccept={vi.fn()} />);
    expect(screen.getByText("Pending · no seat reserved")).not.toBeNull();
    expect(screen.getByRole("button",{name:"Reject request"})).not.toBeNull();
    await act(async() => {await vi.advanceTimersByTimeAsync(60_020);});
    expect(screen.getByText("Expired")).not.toBeNull();
    expect(screen.queryByRole("button",{name:"Reject request"})).toBeNull();
  });
  it("shows rejection to the passenger and hides the driver action",() => {
    render(<SeatRequestList requests={[request("rejected","2026-09-26T10:01:00.000Z")]}
      currentUserId="passenger" busy={false} onReject={vi.fn()} onAccept={vi.fn()} />);
    expect(screen.getByText("Rejected")).not.toBeNull();
    expect(screen.queryByRole("button",{name:"Reject request"})).toBeNull();
    expect(screen.getByText(/Phone numbers are private/)).not.toBeNull();
  });
  it("shows the driver acceptance action and the passenger's confirmed terms",() => {
    const accept = vi.fn();
    const pending = request("pending","2026-09-26T10:01:00.000Z");
    const {rerender} = render(<SeatRequestList requests={[pending]} currentUserId="driver"
      busy={false} onReject={vi.fn()} onAccept={accept} />);
    screen.getByRole("button",{name:"Accept one seat"}).click();
    expect(accept).toHaveBeenCalledWith(pending.id);
    rerender(<SeatRequestList requests={[{...pending,status:"accepted",confirmed:true,seats_reserved:1}]}
      currentUserId="passenger" busy={false} onReject={vi.fn()} onAccept={accept} />);
    expect(screen.getByText("Confirmed · one whole-ride seat")).not.toBeNull();
    expect(screen.getByText(/Nothing is due until the journey is confirmed/)).not.toBeNull();
  });
});
