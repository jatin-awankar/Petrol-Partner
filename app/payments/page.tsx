"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import PaymentActionSheet from "@/components/payments/PaymentActionSheet";
import PaymentBookingCard from "@/components/payments/PaymentBookingCard";
import PaymentsFilterBar from "@/components/payments/PaymentsFilterBar";
import {
  PaymentsFilterSkeleton,
  PaymentsListSkeleton,
  PaymentsSummarySkeleton,
} from "@/components/payments/PaymentsSkeletons";
import PaymentsSummaryStrip from "@/components/payments/PaymentsSummaryStrip";
import { Button } from "@/components/ui/button";
import { useFetchBookings } from "@/hooks/bookings/useFetchBookings";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
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
import {
  buildPaymentCardViewModel,
  buildPaymentSummary,
  filterPaymentCards,
  FinancialHoldView,
  PaymentCardViewModel,
  PaymentFilter,
  sortPaymentCards,
} from "@/lib/payments/view-model";

type SettlementRecord = {
  status?: string;
  preferred_payment_method?: string | null;
  due_at?: string | null;
};

type PaymentRecord = {
  booking_payment_state?: string;
};

type TransactionState = {
  settlement: SettlementRecord | null;
  payment: PaymentRecord | null;
  loading: boolean;
};

type SortBy = "latest" | "amount_desc" | "amount_asc" | "due_first";

export default function PaymentsPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useCurrentUser();
  const {
    bookingsData,
    loading: bookingsLoading,
    refetch,
  } = useFetchBookings(30);

  const [transactions, setTransactions] = useState<
    Record<string, TransactionState>
  >({});
  const [financialHold, setFinancialHold] = useState<FinancialHoldView | null>(
    null,
  );
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [sheetState, setSheetState] = useState<{
    type: "mark_paid" | "confirm_receipt" | null;
    bookingId: string | null;
  }>({
    type: null,
    bookingId: null,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const refreshFinancialHold = useCallback(async () => {
    try {
      const result = await getFinancialHoldStatus();
      setFinancialHold({
        hasFinancialHold: Boolean(result?.has_financial_hold),
        totalOutstandingPaise: Number(result?.total_outstanding_paise ?? 0),
      });
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

  const completedBookings = useMemo(
    () =>
      bookingsData?.bookings?.filter(
        (booking) => booking.status === "completed",
      ) ?? [],
    [bookingsData],
  );

  useEffect(() => {
    void refreshFinancialHold();
  }, [refreshFinancialHold]);

  useEffect(() => {
    completedBookings.forEach((booking) => {
      void refreshTransaction(booking.booking_id);
    });
  }, [completedBookings, refreshTransaction]);

  const refreshAll = useCallback(async () => {
    setRefreshingAll(true);

    try {
      await refetch();
      await refreshFinancialHold();
      await Promise.all(
        completedBookings.map((booking) =>
          refreshTransaction(booking.booking_id),
        ),
      );
    } finally {
      setRefreshingAll(false);
    }
  }, [completedBookings, refetch, refreshFinancialHold, refreshTransaction]);

  const withAction = useCallback(
    async (bookingId: string, action: () => Promise<void>) => {
      setActionLoadingId(bookingId);

      try {
        await action();
        await Promise.all([
          refreshTransaction(bookingId),
          refreshFinancialHold(),
          refetch(),
        ]);
      } finally {
        setActionLoadingId(null);
      }
    },
    [refreshFinancialHold, refreshTransaction, refetch],
  );

  const handlePayOnline = useCallback(
    async (bookingId: string) => {
      await withAction(bookingId, async () => {
        const order = await createPaymentOrder({ bookingId });

        if (!order.key_id) {
          throw new Error(
            "Online payment is not configured in this environment.",
          );
        }

        const loaded = await loadRazorpay();

        if (!loaded || !window.Razorpay) {
          throw new Error("Unable to load Razorpay checkout.");
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

                toast.success("Payment submitted. Verification in progress.");
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            modal: {
              ondismiss: () => reject(new Error("Payment was cancelled.")),
            },
            theme: {
              color: "#0ea5e9",
            },
          });

          razorpay.on("payment.failed", () => {
            reject(new Error("Payment failed. Please retry."));
          });

          razorpay.open();
        });
      });
    },
    [withAction],
  );

  const handleMarkPaid = useCallback(
    async (bookingId: string, method: "cash" | "upi") => {
      await withAction(bookingId, async () => {
        await markSettlementPassengerPaid(bookingId, {
          payment_method: method,
          note: `Marked ${method.toUpperCase()} payment by passenger`,
        });
        toast.success(`Marked ${method.toUpperCase()} payment.`);
      });
    },
    [withAction],
  );

  const handleConfirmReceipt = useCallback(
    async (bookingId: string, method: "cash" | "upi") => {
      await withAction(bookingId, async () => {
        await confirmOfflineSettlement(bookingId, {
          payment_method: method,
          note: `Confirmed ${method.toUpperCase()} receipt by ride owner`,
        });
        toast.success(`${method.toUpperCase()} receipt confirmed.`);
      });
    },
    [withAction],
  );

  const paymentCards = useMemo<PaymentCardViewModel[]>(
    () =>
      completedBookings.map((booking) =>
        buildPaymentCardViewModel({
          booking: booking as BookingsData & {
            total_payable?: number;
            payment_state?: string;
          },
          transaction: transactions[booking.booking_id],
        }),
      ),
    [completedBookings, transactions],
  );

  const filteredAndSortedCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const byFilter = filterPaymentCards(paymentCards, filter);
    const bySearch = normalizedQuery
      ? byFilter.filter(
          (card) =>
            card.routeLabel.toLowerCase().includes(normalizedQuery) ||
            card.counterpartLabel.toLowerCase().includes(normalizedQuery),
        )
      : byFilter;

    return sortPaymentCards(bySearch, sortBy);
  }, [filter, paymentCards, query, sortBy]);

  const summary = useMemo(
    () => buildPaymentSummary(paymentCards),
    [paymentCards],
  );

  const handleApiError = useCallback((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong. Please retry.";

    if (message.includes("FINANCIAL_HOLD_ACTIVE")) {
      toast.error(
        "Financial hold is active. Clear dues before creating new payments.",
      );
      return;
    }

    if (message.includes("VERIFICATION") || message.includes("ELIGIBILITY")) {
      toast.error("Verification or eligibility requirement is pending.");
      return;
    }

    toast.error(message);
  }, []);

  if (authLoading || bookingsLoading) {
    return (
      <div className="min-h-screen pb-16 md:pb-8 bg-gradient-hero">
        <div className="page space-y-5">
          <section className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded-md bg-muted/60 dark:bg-muted/40" />
            <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted/60 dark:bg-muted/40" />
          </section>
          <PaymentsSummarySkeleton />
          <PaymentsFilterSkeleton />
          <PaymentsListSkeleton rows={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 md:pb-8 bg-gradient-hero">
      <div className="page space-y-5">
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Payments Hub
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage post-trip settlements with live status, verification
            progress, and overdue control.
          </p>
        </section>

        <PaymentsSummaryStrip summary={summary} hold={financialHold} />

        {financialHold?.hasFinancialHold ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4" />
              <p className="text-sm">
                Financial hold is active due to overdue dues. Settle pending
                payments to restore full platform access.
              </p>
            </div>
          </section>
        ) : null}

        <PaymentsFilterBar
          filter={filter}
          onFilterChange={setFilter}
          query={query}
          onQueryChange={setQuery}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          onRefreshAll={() => void refreshAll()}
          refreshing={refreshingAll}
        />

        {!filteredAndSortedCards.length ? (
          <section className="rounded-2xl border border-border/70 bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No transactions found for the selected filters.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
            >
              Reset filters
            </Button>
          </section>
        ) : (
          <section className="space-y-4">
            {filteredAndSortedCards.map((card) => {
              const cardLoading =
                actionLoadingId === card.bookingId ||
                transactions[card.bookingId]?.loading;

              return (
                <PaymentBookingCard
                  key={card.bookingId}
                  card={card}
                  loading={Boolean(cardLoading)}
                  onPayOnline={() =>
                    void handlePayOnline(card.bookingId).catch(handleApiError)
                  }
                  onOpenMarkPaidSheet={() =>
                    setSheetState({
                      type: "mark_paid",
                      bookingId: card.bookingId,
                    })
                  }
                  onOpenConfirmReceiptSheet={() =>
                    setSheetState({
                      type: "confirm_receipt",
                      bookingId: card.bookingId,
                    })
                  }
                  onRefresh={() => void refreshTransaction(card.bookingId)}
                />
              );
            })}
          </section>
        )}

        <PaymentActionSheet
          open={Boolean(sheetState.type && sheetState.bookingId)}
          onOpenChange={(open) => {
            if (!open) {
              setSheetState({ type: null, bookingId: null });
            }
          }}
          title={
            sheetState.type === "confirm_receipt"
              ? "Confirm Offline Receipt"
              : "Mark Offline Payment"
          }
          description={
            sheetState.type === "confirm_receipt"
              ? "Select how payment was received by the ride owner."
              : "Select how payment was completed offline by the passenger."
          }
          options={[
            {
              label: "Cash",
              value: "cash",
              description: "Pay or confirm using cash.",
            },
            {
              label: "UPI",
              value: "upi",
              description: "Pay or confirm through UPI.",
            },
          ]}
          confirmLabel={
            sheetState.type === "confirm_receipt"
              ? "Confirm Receipt"
              : "Mark Paid"
          }
          loading={Boolean(
            actionLoadingId && actionLoadingId === sheetState.bookingId,
          )}
          onConfirm={async (value) => {
            const bookingId = sheetState.bookingId;

            if (!bookingId || (value !== "cash" && value !== "upi")) {
              return;
            }

            try {
              if (sheetState.type === "confirm_receipt") {
                await handleConfirmReceipt(bookingId, value);
              } else {
                await handleMarkPaid(bookingId, value);
              }

              setSheetState({ type: null, bookingId: null });
            } catch (error) {
              handleApiError(error);
            }
          }}
        />
      </div>
    </div>
  );
}
