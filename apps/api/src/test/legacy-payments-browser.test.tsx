// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PaymentsPage from "../../../../app/payments/page";

const browserFixture = vi.hoisted(() => ({
  bookingsData: { bookings: [
    { booking_id: "old-passenger", status: "completed", user_role: "passenger",
      pickup_location: "Old origin", drop_location: "Old destination",
      date: "2026-01-01", time: "09:00", other_user_name: "Driver",
      total_price: 25, payment_state: "unpaid" },
    { booking_id: "old-driver", status: "completed", user_role: "driver",
      pickup_location: "Old depot", drop_location: "Old campus",
      date: "2026-01-02", time: "10:00", other_user_name: "Passenger",
      total_price: 25, payment_state: "unpaid" },
  ], pagination: { count: 2, limit: 30, offset: 0, total: 2 } },
  refetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/hooks/auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ isAuthenticated: true, loading: false }),
}));
vi.mock("@/hooks/bookings/useFetchBookings", () => ({
  useFetchBookings: () => ({
    bookingsData: browserFixture.bookingsData,
    loading: false,
    refetch: browserFixture.refetch,
  }),
}));
vi.mock("@/lib/api/backend", () => ({
  getFinancialHoldStatus: async () => ({ has_financial_hold: true, total_outstanding_paise: 2500 }),
  getSettlementByBooking: async (id: string) => ({
    status: id === "old-passenger" ? "due" : "passenger_marked_paid",
    preferred_payment_method: "upi",
  }),
  getBookingPaymentStatus: async () => ({ booking_payment_state: "unpaid" }),
}));

afterEach(cleanup);

it("shows historical settlement status without legacy payment actions", async () => {
  render(<PaymentsPage />);
  await waitFor(() => expect(screen.getByText("due")).not.toBeNull());
  expect(screen.getByText("passenger_marked_paid")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Mark Offline Paid" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm Receipt" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Pay Online" })).toBeNull();
  expect(screen.getByText(/historical financial hold/i)).not.toBeNull();
  expect(screen.queryByText(/restore full platform access/i)).toBeNull();
});

it("names the historical payment search and sort controls", () => {
  render(<PaymentsPage />);
  expect(screen.getByRole("textbox", { name: "Search historical payment records" })).not.toBeNull();
  expect(screen.getByRole("combobox", { name: "Sort historical payment records" })).not.toBeNull();
});
