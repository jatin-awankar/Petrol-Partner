import { withTransaction } from "../../db/transaction";
import { schedulePaymentReconcile } from "../../queues";
import { AppError } from "../../shared/errors/app-error";
import {
  computePayloadHash,
  getRazorpayClient,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from "../../shared/payments/razorpay";
import { createInAppNotification } from "../notifications/notifications.service";
import { getFinancialHoldStatus } from "../settlements/settlements.service";
import * as settlementsRepo from "../settlements/settlements.repo";
import type {
  ClientVerifyPaymentInput,
  CreatePaymentOrderInput,
} from "./payments.schema";
import * as paymentsRepo from "./payments.repo";

const PROVIDER = "razorpay";
const ORDER_EXPIRY_MINUTES = 30;

function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function getEarlierDate(left: Date, right?: Date | null) {
  if (!right) {
    return left;
  }

  if (right.getTime() <= Date.now()) {
    return left;
  }

  return left.getTime() <= right.getTime() ? left : right;
}

function buildReceipt(bookingId: string) {
  const compactBookingId = bookingId.replace(/-/g, "").slice(0, 20);
  return `stl_${compactBookingId}_${Date.now().toString().slice(-10)}`.slice(0, 40);
}

function buildIdempotencyKey(bookingId: string, amountPaise: number) {
  return `post-trip-online:${bookingId}:${amountPaise}`;
}

function getWebhookIdentifiers(event: Record<string, any>, payloadHash: string) {
  const paymentEntity = event?.payload?.payment?.entity;
  const orderEntity = event?.payload?.order?.entity;

  return {
    providerEventId:
      paymentEntity?.id ??
      orderEntity?.id ??
      (typeof event?.created_at === "number"
        ? `${event.event}:${event.created_at}`
        : payloadHash),
    eventType: typeof event?.event === "string" ? event.event : "unknown",
  };
}

async function notifyPaymentUpdate(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  bookingId: string;
  paymentOrderId?: string | null;
  paymentStatus: string;
}) {
  try {
    await createInAppNotification({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: {
        bookingId: input.bookingId,
        paymentOrderId: input.paymentOrderId ?? null,
        paymentStatus: input.paymentStatus,
      },
      dedupeKey: `${input.type}:${input.bookingId}:${input.paymentStatus}`,
    });
  } catch {
    return;
  }
}

export async function createPaymentOrder(userId: string, input: CreatePaymentOrderInput) {
  let notificationContext:
    | {
        payerUserId: string;
        payeeUserId: string;
        bookingId: string;
        paymentOrderId: string;
      }
    | undefined;

  const response = await withTransaction(async (client) => {
    const context = await paymentsRepo.findPaymentContextForUpdate(input.bookingId, client);

    if (!context) {
      throw new AppError(404, "Payment context not found", "PAYMENT_CONTEXT_NOT_FOUND");
    }

    if (context.payer_user_id !== userId) {
      throw new AppError(403, "Only the passenger can create an online payment order", "FORBIDDEN");
    }

    if (context.booking_status !== "completed") {
      throw new AppError(
        409,
        "Online payment order can only be created after ride completion",
        "PAYMENT_ORDER_INVALID_BOOKING_STATUS",
      );
    }

    if (!["due", "overdue"].includes(context.settlement_status)) {
      throw new AppError(
        409,
        "Online payment order can only be created for due or overdue settlements",
        "PAYMENT_ORDER_INVALID_SETTLEMENT_STATUS",
      );
    }

    if (context.total_due_paise <= 0) {
      throw new AppError(409, "Settlement has no payable amount", "PAYMENT_ORDER_INVALID_AMOUNT");
    }

    const reusableOrder = await paymentsRepo.findLatestReusablePaymentOrder(
      {
        bookingId: context.booking_id,
        amountPaise: context.total_due_paise,
        userId,
        provider: PROVIDER,
      },
      client,
    );

    if (reusableOrder) {
      await settlementsRepo.updateSettlement(
        {
          settlementId: context.settlement_id,
          preferredPaymentMethod: "online",
        },
        client,
      );

      await paymentsRepo.updateBookingPaymentProjection(context.booking_id, "order_created", client);

      notificationContext = {
        payerUserId: context.payer_user_id,
        payeeUserId: context.payee_user_id,
        bookingId: context.booking_id,
        paymentOrderId: reusableOrder.id,
      };

      return {
        reused: true,
        key_id: process.env.RAZORPAY_KEY_ID ?? null,
        order_id: reusableOrder.provider_order_id,
        amount_paise: reusableOrder.amount_paise,
        amount: reusableOrder.amount,
        currency: reusableOrder.currency,
        booking_id: context.booking_id,
        payment_order_id: reusableOrder.id,
        expires_at: reusableOrder.expires_at,
      };
    }

    const razorpay = getRazorpayClient();
    const expiresAt = getEarlierDate(
      addMinutes(ORDER_EXPIRY_MINUTES),
      context.due_at ? new Date(context.due_at) : null,
    );
    const providerOrder = await razorpay.orders.create({
      amount: context.total_due_paise,
      currency: "INR",
      receipt: buildReceipt(context.booking_id),
      notes: {
        booking_id: context.booking_id,
        settlement_id: context.settlement_id,
        payer_user_id: context.payer_user_id,
      },
    });
    const providerOrderAmount = Number(providerOrder.amount);

    const paymentOrder = await paymentsRepo.insertPaymentOrder(
      {
        bookingId: context.booking_id,
        userId,
        provider: PROVIDER,
        providerOrderId: providerOrder.id,
        amountPaise: providerOrderAmount,
        currency: providerOrder.currency,
        status: "created",
        idempotencyKey: buildIdempotencyKey(context.booking_id, providerOrderAmount),
        expiresAt,
      },
      client,
    );

    await settlementsRepo.updateSettlement(
      {
        settlementId: context.settlement_id,
        preferredPaymentMethod: "online",
      },
      client,
    );

    await paymentsRepo.updateBookingPaymentProjection(context.booking_id, "order_created", client);

    notificationContext = {
      payerUserId: context.payer_user_id,
      payeeUserId: context.payee_user_id,
      bookingId: context.booking_id,
      paymentOrderId: paymentOrder.id,
    };

    return {
      reused: false,
      key_id: process.env.RAZORPAY_KEY_ID ?? null,
      order_id: paymentOrder.provider_order_id,
      amount_paise: paymentOrder.amount_paise,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      booking_id: context.booking_id,
      payment_order_id: paymentOrder.id,
      expires_at: paymentOrder.expires_at,
    };
  });

  if (notificationContext) {
    await Promise.all([
      notifyPaymentUpdate({
        userId: notificationContext.payerUserId,
        type: "payment_order_created",
        title: "Online payment ready",
        body: "Your post-trip online payment order is ready to complete.",
        bookingId: notificationContext.bookingId,
        paymentOrderId: notificationContext.paymentOrderId,
        paymentStatus: "order_created",
      }),
      notifyPaymentUpdate({
        userId: notificationContext.payeeUserId,
        type: "payment_order_created_driver",
        title: "Passenger started online payment",
        body: "The passenger has started an online payment for this completed ride.",
        bookingId: notificationContext.bookingId,
        paymentOrderId: notificationContext.paymentOrderId,
        paymentStatus: "order_created",
      }),
    ]);
  }

  return response;
}

export async function clientVerifyPayment(userId: string, input: ClientVerifyPaymentInput) {
  const bookingId = input.bookingId!;
  const providerOrderId = input.providerOrderId!;
  const providerPaymentId = input.providerPaymentId!;
  const providerSignature = input.providerSignature!;

  if (
    !verifyRazorpayCheckoutSignature({
      providerOrderId,
      providerPaymentId,
      providerSignature,
    })
  ) {
    throw new AppError(400, "Invalid payment signature", "INVALID_PAYMENT_SIGNATURE");
  }

  let reconcilePaymentOrderId: string | undefined;
  let notificationContext:
    | {
        payerUserId: string;
        payeeUserId: string;
        bookingId: string;
        paymentOrderId: string;
      }
    | undefined;

  const response = await withTransaction(async (client) => {
    const context = await paymentsRepo.findPaymentContextForUpdate(bookingId, client);

    if (!context) {
      throw new AppError(404, "Payment context not found", "PAYMENT_CONTEXT_NOT_FOUND");
    }

    if (context.payer_user_id !== userId) {
      throw new AppError(403, "Only the passenger can verify an online payment", "FORBIDDEN");
    }

    const paymentOrder = await paymentsRepo.findPaymentOrderByProviderOrderIdForUpdate(
      providerOrderId,
      client,
    );

    if (!paymentOrder || paymentOrder.booking_id !== context.booking_id) {
      throw new AppError(404, "Payment order not found for this booking", "PAYMENT_ORDER_NOT_FOUND");
    }

    await paymentsRepo.upsertPaymentAttemptByProviderPaymentId(
      {
        paymentOrderId: paymentOrder.id,
        providerPaymentId,
        providerSignature,
        status: paymentOrder.status === "captured" ? "webhook_verified" : "client_verified",
        rawPayload: {
          source: "client-verify",
          bookingId: context.booking_id,
          providerOrderId,
          providerPaymentId,
        },
      },
      client,
    );

    if (paymentOrder.status !== "captured") {
      await paymentsRepo.updatePaymentOrderStatus(
        {
          paymentOrderId: paymentOrder.id,
          status: "attempted",
        },
        client,
      );

      if (context.booking_payment_state !== "paid_escrow") {
        await paymentsRepo.updateBookingPaymentProjection(
          context.booking_id,
          "verification_pending",
          client,
        );
      }
    }

    await settlementsRepo.updateSettlement(
      {
        settlementId: context.settlement_id,
        preferredPaymentMethod: "online",
      },
      client,
    );

    reconcilePaymentOrderId = paymentOrder.id;
    notificationContext = {
      payerUserId: context.payer_user_id,
      payeeUserId: context.payee_user_id,
      bookingId: context.booking_id,
      paymentOrderId: paymentOrder.id,
    };

    return {
      accepted: true,
      booking_id: context.booking_id,
      payment_order_id: paymentOrder.id,
      payment_state:
        paymentOrder.status === "captured" ? context.booking_payment_state : "verification_pending",
    };
  });

  if (reconcilePaymentOrderId) {
    await schedulePaymentReconcile({ paymentOrderId: reconcilePaymentOrderId });
  }

  if (notificationContext) {
    await Promise.all([
      notifyPaymentUpdate({
        userId: notificationContext.payerUserId,
        type: "payment_verification_pending",
        title: "Payment verification in progress",
        body: "Your online payment is being verified with Razorpay.",
        bookingId: notificationContext.bookingId,
        paymentOrderId: notificationContext.paymentOrderId,
        paymentStatus: "verification_pending",
      }),
      notifyPaymentUpdate({
        userId: notificationContext.payeeUserId,
        type: "payment_verification_pending_driver",
        title: "Passenger payment verification in progress",
        body: "The passenger completed payment initiation. Final confirmation is pending.",
        bookingId: notificationContext.bookingId,
        paymentOrderId: notificationContext.paymentOrderId,
        paymentStatus: "verification_pending",
      }),
    ]);
  }

  return response;
}

export async function getPaymentStatus(userId: string, bookingId: string) {
  const paymentStatus = await paymentsRepo.findPaymentStatusByBookingIdForUser(bookingId, userId);

  if (!paymentStatus) {
    throw new AppError(404, "Payment status not found", "PAYMENT_STATUS_NOT_FOUND");
  }

  const financialHold = await getFinancialHoldStatus(userId);

  return {
    ...paymentStatus,
    financial_hold: {
      has_financial_hold: financialHold.has_financial_hold,
      total_outstanding_paise: financialHold.total_outstanding_paise,
      total_outstanding: financialHold.total_outstanding,
    },
  };
}

export async function ingestRazorpayWebhook(rawBody: string, signature?: string | null) {
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    throw new AppError(400, "Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE");
  }

  let event: Record<string, any>;

  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new AppError(400, "Webhook payload is not valid JSON", "INVALID_WEBHOOK_PAYLOAD");
  }

  const payloadHash = computePayloadHash(rawBody);
  const { providerEventId, eventType } = getWebhookIdentifiers(event, payloadHash);

  try {
    const webhookEvent = await paymentsRepo.insertPaymentWebhookEvent({
      provider: PROVIDER,
      providerEventId,
      eventType,
      payloadHash,
      rawBody,
      signature: signature ?? null,
      processingStatus: "received",
    });

    await schedulePaymentReconcile({ webhookEventId: webhookEvent.id });

    return {
      accepted: true,
      duplicate: false,
      webhook_event_id: webhookEvent.id,
      event_type: webhookEvent.event_type,
    };
  } catch (error: any) {
    if (error?.code !== "23505") {
      throw error;
    }

    const existing = await paymentsRepo.findPaymentWebhookEventByPayloadHash(PROVIDER, payloadHash);

    return {
      accepted: true,
      duplicate: true,
      webhook_event_id: existing?.id ?? null,
      event_type: existing?.event_type ?? eventType,
    };
  }
}
