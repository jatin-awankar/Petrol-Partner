"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { useFetchBookings } from "@/hooks/bookings/useFetchBookings";
import {
  confirmOfflineSettlement,
  createPaymentOrder,
  getBookingPaymentStatus,
  getFinancialHoldStatus,
  getSettlementByBooking,
  markSettlementPassengerPaid,
  submitClientPaymentVerification,
} from "@/lib/api/backend";
import { loadRazorpay } from "@/lib/razorpay-client";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";

type SettlementRecord = {
  id: string;
  status: string;
  preferred_payment_method?: string | null;
  total_due?: number;
  total_due_paise?: number;
};

type PaymentRecord = {
  booking_payment_state: string;
  settlement_status?: string;
  payment_order?: {
    id: string;
    provider_order_id: string;
    status: string;
  } | null;
};

type TransactionState = {
  settlement: SettlementRecord | null;
  payment: PaymentRecord | null;
  loading: boolean;
};

type FinancialHoldState = {
  has_financial_hold: boolean;
  total_outstanding: number;
};

export default function PaymentTransactionsPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useCurrentUser();
  const { bookingsData, loading, refetch } = useFetchBookings(25);
  const [transactions, setTransactions] = useState<Record<string, TransactionState>>({});
  const [financialHold, setFinancialHold] = useState<FinancialHoldState | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const refreshFinancialHold = useCallback(async () => {
    try {
      const result = await getFinancialHoldStatus();
      setFinancialHold(result);
    } catch {
      setFinancialHold(null);
    }
  }, []);

  const refreshTransaction = useCallback(async (bookingId: string) => {
    setTransactions((current) => ({
      ...current,
      [bookingId]: {
        settlement: current[bookingId]?.settlement ?? null,
        payment: current[bookingId]?.payment ?? null,
        loading: true,
      },
    }));

    try {
      const [settlement, payment] = await Promise.all([
        getSettlementByBooking(bookingId).catch(() => null),
        getBookingPaymentStatus(bookingId).catch(() => null),
      ]);

      setTransactions((current) => ({
        ...current,
        [bookingId]: {
          settlement,
          payment,
          loading: false,
        },
      }));
    } catch {
      setTransactions((current) => ({
        ...current,
        [bookingId]: {
          settlement: null,
          payment: null,
          loading: false,
        },
      }));
    }
  }, []);

  useEffect(() => {
    void refreshFinancialHold();
  }, [refreshFinancialHold]);

  useEffect(() => {
    const completedBookings =
      bookingsData?.bookings?.filter((booking) => booking.status === "completed") ?? [];

    completedBookings.forEach((booking) => {
      void refreshTransaction(booking.booking_id);
    });
  }, [bookingsData, refreshTransaction]);

  const completedBookings = useMemo(
    () => bookingsData?.bookings?.filter((booking) => booking.status === "completed") ?? [],
    [bookingsData],
  );

  const withAction = useCallback(
    async (bookingId: string, action: () => Promise<void>) => {
      setActionLoading(bookingId);

      try {
        await action();
        await Promise.all([refreshTransaction(bookingId), refreshFinancialHold(), refetch()]);
      } finally {
        setActionLoading(null);
      }
    },
    [refreshFinancialHold, refreshTransaction, refetch],
  );

  const handleMarkOfflinePaid = useCallback(
    async (bookingId: string, method: "cash" | "upi") => {
      await withAction(bookingId, async () => {
        await markSettlementPassengerPaid(bookingId, {
          payment_method: method,
          note: `Marked ${method.toUpperCase()} payment by passenger`,
        });
        toast.success(`Marked ${method.toUpperCase()} payment`);
      });
    },
    [withAction],
  );

  const handleConfirmOfflineReceipt = useCallback(
    async (bookingId: string, method: "cash" | "upi") => {
      await withAction(bookingId, async () => {
        await confirmOfflineSettlement(bookingId, {
          payment_method: method,
          note: `Confirmed ${method.toUpperCase()} receipt by ride owner`,
        });
        toast.success(`Confirmed ${method.toUpperCase()} receipt`);
      });
    },
    [withAction],
  );

  const handleOnlinePayment = useCallback(
    async (bookingId: string) => {
      await withAction(bookingId, async () => {
        const order = await createPaymentOrder({ bookingId });

        if (!order.key_id) {
          throw new Error("Online payment is not configured for this environment.");
        }

        const scriptLoaded = await loadRazorpay();

        if (!scriptLoaded || !window.Razorpay) {
          throw new Error("Failed to load Razorpay checkout.");
        }

        await new Promise<void>((resolve, reject) => {
          const razorpay = new window.Razorpay({
            key: order.key_id,
            amount: order.amount_paise,
            currency: order.currency,
            name: "Petrol Partner",
            description: "Post-trip ride settlement",
            order_id: order.order_id,
            handler: async (response: {
              razorpay_order_id: string;
              razorpay_payment_id: string;
              razorpay_signature: string;
            }) => {
              try {
                await submitClientPaymentVerification({
                  bookingId,
                  providerOrderId: response.razorpay_order_id,
                  providerPaymentId: response.razorpay_payment_id,
                  providerSignature: response.razorpay_signature,
                });
                toast.success("Payment submitted for verification");
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            modal: {
              ondismiss: () => reject(new Error("Payment cancelled by user")),
            },
            theme: {
              color: "#10b981",
            },
          });

          razorpay.on("payment.failed", () => {
            reject(new Error("Payment failed"));
          });

          razorpay.open();
        });
      });
    },
    [withAction],
  );

  if (authLoading || loading) {
    return (
      <div className="page min-h-screen bg-background container mx-auto p-4">
        <div className="max-w-5xl mx-auto py-12 text-center text-muted-foreground">
          Loading transactions...
        </div>
      </div>
    );
  }

  return (
    <div className="page min-h-screen bg-background container mx-auto p-4 space-y-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Payments & Settlements</h1>
          <p className="text-muted-foreground">
            Track completed ride settlements, outstanding dues, and payment verification.
          </p>
        </div>

        {financialHold?.has_financial_hold ? (
          <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-red-700">
            You currently have a financial hold. Outstanding dues: ₹
            {financialHold.total_outstanding.toFixed(2)}
          </div>
        ) : null}

        {!completedBookings.length ? (
          <div className="border border-border bg-card rounded-xl p-8 text-center text-muted-foreground">
            No completed bookings yet. Settlements will appear here after a ride is completed.
          </div>
        ) : (
          <div className="space-y-4">
            {completedBookings.map((booking) => {
              const bookingRecord = booking as BookingsData & {
                total_payable?: number;
                payment_state?: string;
              };
              const transaction = transactions[booking.booking_id];
              const settlement = transaction?.settlement;
              const payment = transaction?.payment;
              const isPassenger = booking.user_role === "passenger";
              const isDriver = booking.user_role === "driver";

              return (
                <div
                  key={booking.booking_id}
                  className="border border-border bg-card rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        {booking.pickup_location} to {booking.drop_location}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {formatUtcToTodayOrDayMonth(booking.date)} at {formatTimeToAmPm(booking.time)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        With {booking.other_user_name} • {booking.user_role}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-semibold text-primary">
                        ₹{Number(bookingRecord.total_payable ?? booking.total_price ?? 0).toFixed(2)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Booking status: {booking.status}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-muted-foreground">Settlement</p>
                      <p className="font-medium text-foreground">
                        {transaction?.loading ? "Loading..." : settlement?.status ?? "Not opened"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-muted-foreground">Payment state</p>
                      <p className="font-medium text-foreground">
                        {transaction?.loading
                          ? "Loading..."
                          : payment?.booking_payment_state ?? bookingRecord.payment_state ?? "unpaid"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-muted-foreground">Preferred method</p>
                      <p className="font-medium text-foreground">
                        {settlement?.preferred_payment_method ?? "Not selected"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isPassenger && settlement && ["due", "overdue"].includes(settlement.status) ? (
                      <>
                        <Button
                          onClick={() => handleMarkOfflinePaid(booking.booking_id, "cash")}
                          disabled={actionLoading === booking.booking_id}
                          variant="outline"
                        >
                          Mark Cash Paid
                        </Button>
                        <Button
                          onClick={() => handleMarkOfflinePaid(booking.booking_id, "upi")}
                          disabled={actionLoading === booking.booking_id}
                          variant="outline"
                        >
                          Mark UPI Paid
                        </Button>
                        <Button
                          onClick={() => handleOnlinePayment(booking.booking_id)}
                          disabled={actionLoading === booking.booking_id}
                        >
                          Pay Online
                        </Button>
                      </>
                    ) : null}

                    {isDriver &&
                    settlement &&
                    settlement.status === "passenger_marked_paid" ? (
                      <>
                        <Button
                          onClick={() => handleConfirmOfflineReceipt(booking.booking_id, "cash")}
                          disabled={actionLoading === booking.booking_id}
                          variant="outline"
                        >
                          Confirm Cash Receipt
                        </Button>
                        <Button
                          onClick={() => handleConfirmOfflineReceipt(booking.booking_id, "upi")}
                          disabled={actionLoading === booking.booking_id}
                          variant="outline"
                        >
                          Confirm UPI Receipt
                        </Button>
                      </>
                    ) : null}

                    <Button
                      variant="ghost"
                      onClick={() => void refreshTransaction(booking.booking_id)}
                      disabled={actionLoading === booking.booking_id}
                    >
                      Refresh Status
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
