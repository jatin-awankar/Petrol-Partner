import type { PoolClient } from "pg";

import { withTransaction } from "../../db/transaction";
import { cancelSettlementOverdue, scheduleSettlementOverdue } from "../../queues";
import { insertAuditLog } from "../../shared/audit/logs";
import { AppError } from "../../shared/errors/app-error";
import { createInAppNotification } from "../notifications/notifications.service";
import * as verificationService from "../verification/verification.service";
import type {
  ConfirmOfflineReceiptInput,
  CreateSettlementDisputeInput,
  ListSettlementsQuery,
  PassengerMarkedPaidInput,
  ResolveSettlementDisputeInput,
} from "./settlements.schema";
import * as settlementsRepo from "./settlements.repo";

const SETTLEMENT_DUE_HOURS = 12;
const REOPENED_SETTLEMENT_DUE_HOURS = 6;

function addHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function mergeMetadata(
  current: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
) {
  return {
    ...(current ?? {}),
    ...patch,
  };
}

async function notifySettlementEvent(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  bookingId: string;
  status: string;
}) {
  try {
    await createInAppNotification({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: {
        bookingId: input.bookingId,
        settlementStatus: input.status,
      },
      dedupeKey: `${input.type}:${input.bookingId}:${input.status}`,
    });
  } catch {
    return;
  }
}

export async function assertUserCanTransact(userId: string) {
  await verificationService.assertVerifiedStudentCanTransact(userId);

  const holdSummary = await settlementsRepo.getFinancialHoldSummary(userId);

  if (!holdSummary.hasHold) {
    return;
  }

  throw new AppError(
    403,
    "You have overdue settlement dues and cannot create new bookings or ride posts",
    "FINANCIAL_HOLD_ACTIVE",
    {
      outstanding_balance_paise: holdSummary.totalOutstandingPaise,
      outstanding_balance: holdSummary.totalOutstandingPaise / 100,
      balances: holdSummary.balances,
    },
  );
}

export async function listSettlements(userId: string, query: ListSettlementsQuery) {
  return settlementsRepo.listSettlementsForUser({
    userId,
    limit: query.limit,
    offset: query.offset,
    status: query.status,
  });
}

export async function getSettlementByBookingId(userId: string, bookingId: string) {
  const settlement = await settlementsRepo.findSettlementByBookingIdForUser(bookingId, userId);

  if (!settlement) {
    throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  }

  return settlement;
}

export async function getFinancialHoldStatus(userId: string) {
  const summary = await settlementsRepo.getFinancialHoldSummary(userId);

  return {
    has_financial_hold: summary.hasHold,
    total_outstanding_paise: summary.totalOutstandingPaise,
    total_outstanding: summary.totalOutstandingPaise / 100,
    balances: summary.balances,
  };
}

export async function openSettlementForCompletedBooking(
  booking: {
    id: string;
    passenger_id: string;
    driver_id: string;
    total_amount_paise: number;
    platform_fee_paise?: number;
    completed_at?: Date | string | null;
  },
  client: PoolClient,
) {
  const existing = await settlementsRepo.findSettlementByBookingIdForUpdate(booking.id, client);

  if (existing) {
    return {
      settlementId: existing.id,
      bookingId: existing.booking_id,
      payerUserId: existing.payer_user_id,
      payeeUserId: existing.payee_user_id,
      dueAt: existing.due_at ? new Date(existing.due_at) : null,
      status: existing.status,
    };
  }

  const dueAt = new Date(
    (booking.completed_at ? new Date(booking.completed_at).getTime() : Date.now()) +
      SETTLEMENT_DUE_HOURS * 60 * 60 * 1000,
  );
  const platformFeePaise = booking.platform_fee_paise ?? 0;
  const created = await settlementsRepo.insertSettlement(
    {
      bookingId: booking.id,
      payerUserId: booking.passenger_id,
      payeeUserId: booking.driver_id,
      rideFarePaise: booking.total_amount_paise,
      platformFeePaise,
      totalDuePaise: booking.total_amount_paise + platformFeePaise,
      status: "due",
      dueAt,
      metadata: {
        source: "booking-complete",
      },
    },
    client,
  );

  await settlementsRepo.insertSettlementEvent(
    {
      settlementId: created.id,
      bookingId: booking.id,
      actorUserId: booking.driver_id,
      eventType: "settlement_due",
      previousStatus: null,
      nextStatus: "due",
      metadata: {
        dueAt: dueAt.toISOString(),
        rideFarePaise: booking.total_amount_paise,
        platformFeePaise,
      },
    },
    client,
  );

  return {
    settlementId: created.id,
    bookingId: created.booking_id,
    payerUserId: created.payer_user_id,
    payeeUserId: created.payee_user_id,
    dueAt,
    status: created.status,
  };
}

export async function afterSettlementOpened(input: {
  settlementId: string;
  bookingId: string;
  payerUserId: string;
  payeeUserId: string;
  dueAt: Date | null;
  status: string;
}) {
  if (input.dueAt) {
    await scheduleSettlementOverdue({
      settlementId: input.settlementId,
      dueAt: input.dueAt,
    });
  }

  await Promise.all([
    notifySettlementEvent({
      userId: input.payerUserId,
      type: "settlement_due",
      title: "Payment due for completed ride",
      body: "Your ride is complete. Settle the fare before the due window ends.",
      bookingId: input.bookingId,
      status: input.status,
    }),
    notifySettlementEvent({
      userId: input.payeeUserId,
      type: "settlement_opened",
      title: "Settlement opened for completed ride",
      body: "Wait for the passenger to settle the fare or confirm offline payment.",
      bookingId: input.bookingId,
      status: input.status,
    }),
  ]);
}

export async function markPassengerPaid(
  bookingId: string,
  actorUserId: string,
  input: PassengerMarkedPaidInput,
) {
  let settlementSummary: {
    bookingId: string;
    payerUserId: string;
    payeeUserId: string;
    status: string;
  };

  await withTransaction(async (client) => {
    const settlement = await settlementsRepo.findSettlementByBookingIdForUpdate(bookingId, client);

    if (!settlement) {
      throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
    }

    if (settlement.payer_user_id !== actorUserId) {
      throw new AppError(403, "Only the passenger can mark payment", "FORBIDDEN");
    }

    if (!["due", "overdue", "passenger_marked_paid"].includes(settlement.status)) {
      throw new AppError(
        409,
        "Settlement cannot be marked paid in its current state",
        "SETTLEMENT_STATUS_INVALID",
      );
    }

    const now = new Date();
    const nextStatus = "passenger_marked_paid";
    await settlementsRepo.updateSettlement(
      {
        settlementId: settlement.id,
        status: nextStatus,
        preferredPaymentMethod: input.payment_method,
        passengerMarkedPaidAt: settlement.passenger_marked_paid_at ? undefined : now,
        metadata: mergeMetadata(settlement.metadata, {
          lastPassengerNote: input.note ?? null,
        }),
      },
      client,
    );

    await settlementsRepo.insertSettlementEvent(
      {
        settlementId: settlement.id,
        bookingId: settlement.booking_id,
        actorUserId,
        eventType: "passenger_marked_paid",
        previousStatus: settlement.status,
        nextStatus,
        reason: input.note ?? null,
        metadata: {
          paymentMethod: input.payment_method,
        },
      },
      client,
    );

    settlementSummary = {
      bookingId: settlement.booking_id,
      payerUserId: settlement.payer_user_id,
      payeeUserId: settlement.payee_user_id,
      status: nextStatus,
    };
  });

  await notifySettlementEvent({
    userId: settlementSummary!.payeeUserId,
    type: "settlement_passenger_marked_paid",
    title: "Passenger marked the ride as paid",
    body: "Review the payment and confirm receipt if it was settled offline.",
    bookingId: settlementSummary!.bookingId,
    status: settlementSummary!.status,
  });

  return getSettlementByBookingId(actorUserId, bookingId);
}

export async function confirmOfflineReceipt(
  bookingId: string,
  actorUserId: string,
  input: ConfirmOfflineReceiptInput,
) {
  let settlementSummary: {
    bookingId: string;
    payerUserId: string;
    status: string;
    settlementId: string;
  };

  await withTransaction(async (client) => {
    const settlement = await settlementsRepo.findSettlementByBookingIdForUpdate(bookingId, client);

    if (!settlement) {
      throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
    }

    if (settlement.payee_user_id !== actorUserId) {
      throw new AppError(403, "Only the ride owner can confirm receipt", "FORBIDDEN");
    }

    if (!["due", "overdue", "passenger_marked_paid"].includes(settlement.status)) {
      throw new AppError(
        409,
        "Settlement cannot be confirmed in its current state",
        "SETTLEMENT_STATUS_INVALID",
      );
    }

    const paymentMethod = input.payment_method ?? settlement.preferred_payment_method ?? "cash";

    if (paymentMethod === "online") {
      throw new AppError(
        409,
        "Manual receipt confirmation is only valid for offline payments",
        "SETTLEMENT_PAYMENT_METHOD_INVALID",
      );
    }

    const now = new Date();
    const nextStatus = "settled";
    await settlementsRepo.updateSettlement(
      {
        settlementId: settlement.id,
        status: nextStatus,
        paidAmountPaise: settlement.total_due_paise,
        preferredPaymentMethod: paymentMethod,
        ownerConfirmedReceivedAt: settlement.owner_confirmed_received_at
          ? undefined
          : now,
        settledAt: settlement.settled_at ? undefined : now,
        metadata: mergeMetadata(settlement.metadata, {
          lastOwnerNote: input.note ?? null,
        }),
      },
      client,
    );

    await settlementsRepo.updateOutstandingBalanceStatus(
      settlement.id,
      "cleared",
      client,
      { resolvedBy: "owner_confirmation" },
    );

    await settlementsRepo.insertSettlementEvent(
      {
        settlementId: settlement.id,
        bookingId: settlement.booking_id,
        actorUserId,
        eventType: "owner_confirmed_received",
        previousStatus: settlement.status,
        nextStatus,
        reason: input.note ?? null,
        metadata: {
          paymentMethod,
        },
      },
      client,
    );

    settlementSummary = {
      bookingId: settlement.booking_id,
      payerUserId: settlement.payer_user_id,
      status: nextStatus,
      settlementId: settlement.id,
    };
  });

  await cancelSettlementOverdue(settlementSummary!.settlementId).catch(() => undefined);
  await notifySettlementEvent({
    userId: settlementSummary!.payerUserId,
    type: "settlement_settled",
    title: "Ride payment confirmed",
    body: "The ride owner confirmed your payment. Your settlement is now closed.",
    bookingId: settlementSummary!.bookingId,
    status: settlementSummary!.status,
  });

  return getSettlementByBookingId(actorUserId, bookingId);
}

export async function createDispute(
  bookingId: string,
  actorUserId: string,
  input: CreateSettlementDisputeInput,
) {
  let settlementSummary: {
    bookingId: string;
    payerUserId: string;
    payeeUserId: string;
    status: string;
    settlementId: string;
  };

  await withTransaction(async (client) => {
    const settlement = await settlementsRepo.findSettlementByBookingIdForUpdate(bookingId, client);

    if (!settlement) {
      throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
    }

    if (![settlement.payer_user_id, settlement.payee_user_id].includes(actorUserId)) {
      throw new AppError(403, "Only booking participants can dispute a settlement", "FORBIDDEN");
    }

    if (["settled", "waived"].includes(settlement.status)) {
      throw new AppError(409, "Completed settlements cannot be disputed", "SETTLEMENT_STATUS_INVALID");
    }

    const now = new Date();
    const nextStatus = "disputed";
    await settlementsRepo.updateSettlement(
      {
        settlementId: settlement.id,
        status: nextStatus,
        disputeOpenedAt: settlement.dispute_opened_at ? undefined : now,
        metadata: mergeMetadata(settlement.metadata, {
          disputeReason: input.reason,
          disputeOpenedBy: actorUserId,
        }),
      },
      client,
    );

    await settlementsRepo.updateOutstandingBalanceStatus(
      settlement.id,
      "under_review",
      client,
      { disputeOpenedBy: actorUserId },
    );

    await settlementsRepo.insertSettlementEvent(
      {
        settlementId: settlement.id,
        bookingId: settlement.booking_id,
        actorUserId,
        eventType: "settlement_disputed",
        previousStatus: settlement.status,
        nextStatus,
        reason: input.reason,
      },
      client,
    );

    settlementSummary = {
      bookingId: settlement.booking_id,
      payerUserId: settlement.payer_user_id,
      payeeUserId: settlement.payee_user_id,
      status: nextStatus,
      settlementId: settlement.id,
    };
  });

  await cancelSettlementOverdue(settlementSummary!.settlementId).catch(() => undefined);
  const otherUserId =
    settlementSummary!.payerUserId === actorUserId
      ? settlementSummary!.payeeUserId
      : settlementSummary!.payerUserId;
  await notifySettlementEvent({
    userId: otherUserId,
    type: "settlement_disputed",
    title: "A settlement dispute was opened",
    body: "One of the participants disputed this ride settlement. Booking restrictions are paused while it is under review.",
    bookingId: settlementSummary!.bookingId,
    status: settlementSummary!.status,
  });

  return getSettlementByBookingId(actorUserId, bookingId);
}

export async function resolveDispute(
  bookingId: string,
  actorUserId: string,
  input: ResolveSettlementDisputeInput,
) {
  let settlementSummary: {
    bookingId: string;
    payerUserId: string;
    payeeUserId: string;
    status: string;
    settlementId: string;
    dueAt: Date | null;
  };

  await withTransaction(async (client) => {
    const settlement = await settlementsRepo.findSettlementByBookingIdForUpdate(bookingId, client);

    if (!settlement) {
      throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
    }

    if (settlement.status !== "disputed") {
      throw new AppError(409, "Only disputed settlements can be resolved", "SETTLEMENT_STATUS_INVALID");
    }

    const now = new Date();
    let nextStatus = settlement.status;
    let dueAt: Date | null = null;

    switch (input.outcome) {
      case "settled":
        nextStatus = "settled";
        await settlementsRepo.updateSettlement(
          {
            settlementId: settlement.id,
            status: nextStatus,
            paidAmountPaise: settlement.total_due_paise,
            settledAt: settlement.settled_at ? undefined : now,
            ownerConfirmedReceivedAt: settlement.owner_confirmed_received_at ? undefined : now,
            metadata: mergeMetadata(settlement.metadata, {
              disputeResolution: "settled",
              disputeResolutionReason: input.reason ?? null,
            }),
          },
          client,
        );
        await settlementsRepo.updateOutstandingBalanceStatus(
          settlement.id,
          "cleared",
          client,
          { resolvedBy: actorUserId, resolution: "settled" },
        );
        break;
      case "waived":
        nextStatus = "waived";
        await settlementsRepo.updateSettlement(
          {
            settlementId: settlement.id,
            status: nextStatus,
            settledAt: settlement.settled_at ? undefined : now,
            metadata: mergeMetadata(settlement.metadata, {
              disputeResolution: "waived",
              disputeResolutionReason: input.reason ?? null,
            }),
          },
          client,
        );
        await settlementsRepo.updateOutstandingBalanceStatus(
          settlement.id,
          "waived",
          client,
          { resolvedBy: actorUserId, resolution: "waived" },
        );
        break;
      case "reopen_due":
        nextStatus = "due";
        dueAt = addHours(REOPENED_SETTLEMENT_DUE_HOURS);
        await settlementsRepo.updateSettlement(
          {
            settlementId: settlement.id,
            status: nextStatus,
            dueAt,
            metadata: mergeMetadata(settlement.metadata, {
              disputeResolution: "reopen_due",
              disputeResolutionReason: input.reason ?? null,
            }),
          },
          client,
        );
        await settlementsRepo.updateOutstandingBalanceStatus(
          settlement.id,
          "waived",
          client,
          { resolvedBy: actorUserId, resolution: "reopen_due" },
        );
        break;
    }

    await insertAuditLog(
      {
        actorUserId: actorUserId,
        action: "settlement_dispute_resolved",
        entityType: "booking_settlement",
        entityId: settlement.id,
        metadata: {
          bookingId: settlement.booking_id,
          previousStatus: settlement.status,
          outcome: input.outcome,
          reason: input.reason ?? null,
        },
      },
      client,
    );

    await settlementsRepo.insertSettlementEvent(
      {
        settlementId: settlement.id,
        bookingId: settlement.booking_id,
        actorUserId,
        eventType: "settlement_dispute_resolved",
        previousStatus: settlement.status,
        nextStatus,
        reason: input.reason ?? null,
        metadata: {
          outcome: input.outcome,
          dueAt: dueAt?.toISOString() ?? null,
        },
      },
      client,
    );

    settlementSummary = {
      bookingId: settlement.booking_id,
      payerUserId: settlement.payer_user_id,
      payeeUserId: settlement.payee_user_id,
      status: nextStatus,
      settlementId: settlement.id,
      dueAt,
    };
  });

  if (settlementSummary!.status === "due" && settlementSummary!.dueAt) {
    await scheduleSettlementOverdue({
      settlementId: settlementSummary!.settlementId,
      dueAt: settlementSummary!.dueAt,
    });
  } else {
    await cancelSettlementOverdue(settlementSummary!.settlementId).catch(() => undefined);
  }

  await Promise.all([
    notifySettlementEvent({
      userId: settlementSummary!.payerUserId,
      type: "settlement_dispute_resolved",
      title: "Settlement dispute resolved",
      body: "Your settlement dispute has been resolved.",
      bookingId: settlementSummary!.bookingId,
      status: settlementSummary!.status,
    }),
    notifySettlementEvent({
      userId: settlementSummary!.payeeUserId,
      type: "settlement_dispute_resolved",
      title: "Settlement dispute resolved",
      body: "Your settlement dispute has been resolved.",
      bookingId: settlementSummary!.bookingId,
      status: settlementSummary!.status,
    }),
  ]);

  return getSettlementByBookingId(actorUserId, bookingId);
}
