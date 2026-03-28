export type PaymentFilter = "all" | "action_required" | "in_verification" | "settled" | "failed";

export type PaymentSummary = {
  dueCount: number;
  dueAmountPaise: number;
  overdueCount: number;
  overdueAmountPaise: number;
  settledCount: number;
};

export type FinancialHoldView = {
  hasFinancialHold: boolean;
  totalOutstandingPaise: number;
};

export type PaymentCardViewModel = {
  bookingId: string;
  routeLabel: string;
  scheduleLabel: string;
  counterpartLabel: string;
  amountPaise: number;
  settlementStatus: string;
  paymentState: string;
  preferredPaymentMethod: string | null;
  isPassenger: boolean;
  isDriver: boolean;
  dueAt: string | null;
  statusHint: string;
  canPayOnline: boolean;
  canMarkOfflinePaid: boolean;
  canConfirmOffline: boolean;
  canRefresh: boolean;
  isActionRequired: boolean;
};

type TransactionState = {
  settlement: {
    status?: string;
    preferred_payment_method?: string | null;
    total_due_paise?: number;
    due_at?: string | null;
  } | null;
  payment: {
    booking_payment_state?: string;
  } | null;
};

function deriveStatusHint(input: {
  settlementStatus: string;
  paymentState: string;
  dueAt: string | null;
}) {
  if (input.paymentState === "verification_pending" || input.paymentState === "order_created") {
    return "Online payment verification in progress";
  }

  if (input.paymentState === "paid_escrow" || input.settlementStatus === "settled") {
    return "Settlement completed successfully";
  }

  if (input.paymentState === "failed") {
    return "Last online payment attempt failed";
  }

  if (input.settlementStatus === "passenger_marked_paid") {
    return "Waiting for ride owner confirmation";
  }

  if (input.settlementStatus === "overdue") {
    return "Payment is overdue. Settle to clear financial restrictions";
  }

  if (input.settlementStatus === "due") {
    if (!input.dueAt) {
      return "Payment is due for this completed ride";
    }

    const dueAtMs = new Date(input.dueAt).getTime();
    const now = Date.now();
    const minutesRemaining = Math.floor((dueAtMs - now) / 60000);

    if (minutesRemaining <= 0) {
      return "Payment due window has ended";
    }

    if (minutesRemaining < 60) {
      return `Due in ${minutesRemaining} min`;
    }

    return `Due in ${Math.ceil(minutesRemaining / 60)} hr`;
  }

  if (input.settlementStatus === "waived") {
    return "Settlement waived";
  }

  if (input.settlementStatus === "disputed") {
    return "Settlement under dispute review";
  }

  return "Settlement status updated";
}

export function formatInrFromPaise(amountPaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amountPaise / 100);
}

export function buildPaymentCardViewModel(input: {
  booking: BookingsData & { total_payable?: number; payment_state?: string };
  transaction: TransactionState | undefined;
}) {
  const { booking, transaction } = input;
  const settlementStatus = transaction?.settlement?.status ?? "not_due";
  const paymentState =
    transaction?.payment?.booking_payment_state ?? booking.payment_state ?? "unpaid";
  const amountPaise = Math.round(
    Number(booking.total_payable ?? booking.total_price ?? 0) * 100,
  );
  const dueAt = transaction?.settlement?.due_at ?? null;
  const isPassenger = booking.user_role === "passenger";
  const isDriver = booking.user_role === "driver";

  return {
    bookingId: booking.booking_id,
    routeLabel: `${booking.pickup_location} to ${booking.drop_location}`,
    scheduleLabel: `${booking.date} ${booking.time}`,
    counterpartLabel: `With ${booking.other_user_name}`,
    amountPaise,
    settlementStatus,
    paymentState,
    preferredPaymentMethod: transaction?.settlement?.preferred_payment_method ?? null,
    isPassenger,
    isDriver,
    dueAt,
    statusHint: deriveStatusHint({
      settlementStatus,
      paymentState,
      dueAt,
    }),
    canPayOnline:
      isPassenger && (settlementStatus === "due" || settlementStatus === "overdue"),
    canMarkOfflinePaid:
      isPassenger && (settlementStatus === "due" || settlementStatus === "overdue"),
    canConfirmOffline: isDriver && settlementStatus === "passenger_marked_paid",
    canRefresh: true,
    isActionRequired:
      settlementStatus === "due" ||
      settlementStatus === "overdue" ||
      settlementStatus === "passenger_marked_paid" ||
      paymentState === "failed",
  } satisfies PaymentCardViewModel;
}

export function filterPaymentCards(cards: PaymentCardViewModel[], filter: PaymentFilter) {
  if (filter === "all") {
    return cards;
  }

  if (filter === "action_required") {
    return cards.filter((card) => card.isActionRequired);
  }

  if (filter === "in_verification") {
    return cards.filter(
      (card) => card.paymentState === "order_created" || card.paymentState === "verification_pending",
    );
  }

  if (filter === "settled") {
    return cards.filter(
      (card) => card.settlementStatus === "settled" || card.paymentState === "paid_escrow",
    );
  }

  return cards.filter((card) => card.paymentState === "failed");
}

export function sortPaymentCards(
  cards: PaymentCardViewModel[],
  sortBy: "latest" | "amount_desc" | "amount_asc" | "due_first",
) {
  const next = [...cards];

  if (sortBy === "amount_desc") {
    return next.sort((a, b) => b.amountPaise - a.amountPaise);
  }

  if (sortBy === "amount_asc") {
    return next.sort((a, b) => a.amountPaise - b.amountPaise);
  }

  if (sortBy === "due_first") {
    return next.sort((a, b) => {
      const aScore = a.settlementStatus === "overdue" ? 0 : a.settlementStatus === "due" ? 1 : 2;
      const bScore = b.settlementStatus === "overdue" ? 0 : b.settlementStatus === "due" ? 1 : 2;

      if (aScore !== bScore) {
        return aScore - bScore;
      }

      return b.amountPaise - a.amountPaise;
    });
  }

  return next;
}

export function buildPaymentSummary(cards: PaymentCardViewModel[]): PaymentSummary {
  return cards.reduce<PaymentSummary>(
    (acc, card) => {
      if (card.settlementStatus === "due") {
        acc.dueCount += 1;
        acc.dueAmountPaise += card.amountPaise;
      }

      if (card.settlementStatus === "overdue") {
        acc.overdueCount += 1;
        acc.overdueAmountPaise += card.amountPaise;
      }

      if (card.settlementStatus === "settled" || card.paymentState === "paid_escrow") {
        acc.settledCount += 1;
      }

      return acc;
    },
    {
      dueCount: 0,
      dueAmountPaise: 0,
      overdueCount: 0,
      overdueAmountPaise: 0,
      settledCount: 0,
    },
  );
}
