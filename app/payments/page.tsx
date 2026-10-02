"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

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
  getBookingPaymentStatus,
  getFinancialHoldStatus,
  getSettlementByBooking,
} from "@/lib/api/backend";
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
  reconcile?: {
    payment_order_updated_at?: string | null;
    payment_attempt_count?: number;
  };
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
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("latest");
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

  useEffect(() => {
    const pendingBookingIds = Object.entries(transactions)
      .filter(([, state]) => {
        const paymentState = state?.payment?.booking_payment_state;
        return paymentState === "order_created" || paymentState === "verification_pending";
      })
      .map(([bookingId]) => bookingId);

    if (!pendingBookingIds.length) {
      return;
    }

    const interval = setInterval(() => {
      pendingBookingIds.forEach((bookingId) => {
        void refreshTransaction(bookingId);
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [refreshTransaction, transactions]);

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
            Historical platform-payment records
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only records from the former platform-payment flow. New contributions are handled directly between participants.
          </p>
        </section>
        <a href="/direct-settlements" className="inline-block underline">Open direct Contributions →</a>

        <PaymentsSummaryStrip summary={summary} hold={financialHold} />

        {financialHold?.hasFinancialHold ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4" />
              <p className="text-sm">
                A historical financial hold is recorded. Review the related records and any operator decision. This read-only screen cannot clear the hold.
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
              const cardLoading = transactions[card.bookingId]?.loading;

              return (
                <PaymentBookingCard
                  key={card.bookingId}
                  card={card}
                  loading={Boolean(cardLoading)}
                  onRefresh={() => void refreshTransaction(card.bookingId)}
                />
              );
            })}
          </section>
        )}

      </div>
    </div>
  );
}
