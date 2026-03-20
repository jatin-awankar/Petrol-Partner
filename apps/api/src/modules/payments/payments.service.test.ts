import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/transaction", () => ({
  withTransaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
    callback({}),
  ),
}));

vi.mock("../../queues", () => ({
  schedulePaymentReconcile: vi.fn(async () => undefined),
}));

vi.mock("../../shared/payments/razorpay", () => ({
  getRazorpayClient: vi.fn(() => ({
    orders: {
      create: vi.fn(async () => ({
        id: "order_123",
        amount: 16500,
        currency: "INR",
      })),
    },
  })),
  verifyRazorpayCheckoutSignature: vi.fn(() => true),
  verifyRazorpayWebhookSignature: vi.fn(() => true),
  computePayloadHash: vi.fn(() => "payload-hash-1"),
}));

vi.mock("../notifications/notifications.service", () => ({
  createInAppNotification: vi.fn(async () => undefined),
}));

vi.mock("../settlements/settlements.service", () => ({
  getFinancialHoldStatus: vi.fn(async () => ({
    has_financial_hold: false,
    total_outstanding_paise: 0,
    total_outstanding: 0,
  })),
}));

vi.mock("../settlements/settlements.repo", () => ({
  updateSettlement: vi.fn(async () => undefined),
}));

vi.mock("./payments.repo", () => ({
  findPaymentContextForUpdate: vi.fn(),
  findLatestReusablePaymentOrder: vi.fn(),
  insertPaymentOrder: vi.fn(),
  updatePaymentOrderStatus: vi.fn(async () => undefined),
  updateBookingPaymentProjection: vi.fn(async () => undefined),
  findPaymentOrderByProviderOrderIdForUpdate: vi.fn(),
  upsertPaymentAttemptByProviderPaymentId: vi.fn(async () => undefined),
  findPaymentStatusByBookingIdForUser: vi.fn(),
  insertPaymentWebhookEvent: vi.fn(),
  findPaymentWebhookEventByPayloadHash: vi.fn(),
}));

import { AppError } from "../../shared/errors/app-error";
import * as queues from "../../queues";
import * as razorpayShared from "../../shared/payments/razorpay";
import * as notificationsService from "../notifications/notifications.service";
import * as settlementsRepo from "../settlements/settlements.repo";
import * as settlementsService from "../settlements/settlements.service";
import * as paymentsRepo from "./payments.repo";
import * as paymentsService from "./payments.service";

describe("payments.service", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_123";
    vi.clearAllMocks();
  });

  it("creates a new post-trip payment order", async () => {
    vi.mocked(paymentsRepo.findPaymentContextForUpdate).mockResolvedValue({
      booking_id: "booking-1",
      booking_status: "completed",
      booking_payment_state: "unpaid",
      passenger_id: "user-1",
      driver_id: "user-2",
      settlement_id: "settlement-1",
      payer_user_id: "user-1",
      payee_user_id: "user-2",
      settlement_status: "due",
      preferred_payment_method: null,
      total_due_paise: 16500,
      paid_amount_paise: 0,
      due_at: null,
    });
    vi.mocked(paymentsRepo.findLatestReusablePaymentOrder).mockResolvedValue(null);
    vi.mocked(paymentsRepo.insertPaymentOrder).mockResolvedValue({
      id: "payment-order-1",
      booking_id: "booking-1",
      user_id: "user-1",
      provider: "razorpay",
      provider_order_id: "order_123",
      amount_paise: 16500,
      amount: 165,
      currency: "INR",
      status: "created",
      idempotency_key: "post-trip-online:booking-1:16500",
      expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await paymentsService.createPaymentOrder("user-1", {
      bookingId: "booking-1",
    });

    expect(result).toMatchObject({
      reused: false,
      order_id: "order_123",
      amount_paise: 16500,
      booking_id: "booking-1",
      payment_order_id: "payment-order-1",
    });
    expect(paymentsRepo.insertPaymentOrder).toHaveBeenCalledOnce();
    expect(settlementsRepo.updateSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        settlementId: "settlement-1",
        preferredPaymentMethod: "online",
      }),
      expect.anything(),
    );
    expect(paymentsRepo.updateBookingPaymentProjection).toHaveBeenCalledWith(
      "booking-1",
      "order_created",
      expect.anything(),
    );
    expect(notificationsService.createInAppNotification).toHaveBeenCalledTimes(2);
  });

  it("reuses an active compatible payment order", async () => {
    vi.mocked(paymentsRepo.findPaymentContextForUpdate).mockResolvedValue({
      booking_id: "booking-2",
      booking_status: "completed",
      booking_payment_state: "order_created",
      passenger_id: "user-1",
      driver_id: "user-2",
      settlement_id: "settlement-2",
      payer_user_id: "user-1",
      payee_user_id: "user-2",
      settlement_status: "due",
      preferred_payment_method: "online",
      total_due_paise: 9900,
      paid_amount_paise: 0,
      due_at: null,
    });
    vi.mocked(paymentsRepo.findLatestReusablePaymentOrder).mockResolvedValue({
      id: "payment-order-2",
      booking_id: "booking-2",
      user_id: "user-1",
      provider: "razorpay",
      provider_order_id: "order_existing",
      amount_paise: 9900,
      amount: 99,
      currency: "INR",
      status: "created",
      idempotency_key: "post-trip-online:booking-2:9900",
      expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await paymentsService.createPaymentOrder("user-1", {
      bookingId: "booking-2",
    });

    expect(result).toMatchObject({
      reused: true,
      order_id: "order_existing",
      payment_order_id: "payment-order-2",
    });
    expect(paymentsRepo.insertPaymentOrder).not.toHaveBeenCalled();
  });

  it("rejects payment order creation for invalid settlement state", async () => {
    vi.mocked(paymentsRepo.findPaymentContextForUpdate).mockResolvedValue({
      booking_id: "booking-3",
      booking_status: "completed",
      booking_payment_state: "unpaid",
      passenger_id: "user-1",
      driver_id: "user-2",
      settlement_id: "settlement-3",
      payer_user_id: "user-1",
      payee_user_id: "user-2",
      settlement_status: "disputed",
      preferred_payment_method: null,
      total_due_paise: 5000,
      paid_amount_paise: 0,
      due_at: null,
    });

    await expect(
      paymentsService.createPaymentOrder("user-1", { bookingId: "booking-3" }),
    ).rejects.toMatchObject({
      code: "PAYMENT_ORDER_INVALID_SETTLEMENT_STATUS",
    } satisfies Partial<AppError>);
  });

  it("records client verification and schedules reconcile", async () => {
    vi.mocked(paymentsRepo.findPaymentContextForUpdate).mockResolvedValue({
      booking_id: "booking-4",
      booking_status: "completed",
      booking_payment_state: "order_created",
      passenger_id: "user-1",
      driver_id: "user-2",
      settlement_id: "settlement-4",
      payer_user_id: "user-1",
      payee_user_id: "user-2",
      settlement_status: "due",
      preferred_payment_method: "online",
      total_due_paise: 7500,
      paid_amount_paise: 0,
      due_at: null,
    });
    vi.mocked(paymentsRepo.findPaymentOrderByProviderOrderIdForUpdate).mockResolvedValue({
      id: "payment-order-4",
      booking_id: "booking-4",
      user_id: "user-1",
      provider: "razorpay",
      provider_order_id: "order_verify",
      amount_paise: 7500,
      amount: 75,
      currency: "INR",
      status: "created",
      idempotency_key: "post-trip-online:booking-4:7500",
      expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await paymentsService.clientVerifyPayment("user-1", {
      bookingId: "booking-4",
      providerOrderId: "order_verify",
      providerPaymentId: "pay_verify",
      providerSignature: "sig_verify",
    });

    expect(result).toMatchObject({
      accepted: true,
      booking_id: "booking-4",
      payment_order_id: "payment-order-4",
      payment_state: "verification_pending",
    });
    expect(paymentsRepo.upsertPaymentAttemptByProviderPaymentId).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentOrderId: "payment-order-4",
        providerPaymentId: "pay_verify",
        status: "client_verified",
      }),
      expect.anything(),
    );
    expect(queues.schedulePaymentReconcile).toHaveBeenCalledWith({
      paymentOrderId: "payment-order-4",
    });
  });

  it("rejects invalid checkout signatures", async () => {
    vi.mocked(razorpayShared.verifyRazorpayCheckoutSignature).mockReturnValue(false);

    await expect(
      paymentsService.clientVerifyPayment("user-1", {
        bookingId: "booking-5",
        providerOrderId: "order_bad",
        providerPaymentId: "pay_bad",
        providerSignature: "sig_bad",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_PAYMENT_SIGNATURE",
    } satisfies Partial<AppError>);

    expect(paymentsRepo.upsertPaymentAttemptByProviderPaymentId).not.toHaveBeenCalled();
  });

  it("persists webhook intake and enqueues reconcile", async () => {
    vi.mocked(paymentsRepo.insertPaymentWebhookEvent).mockResolvedValue({
      id: "webhook-1",
      provider: "razorpay",
      provider_event_id: "pay_123",
      event_type: "payment.captured",
      payload_hash: "payload-hash-1",
      raw_body: "{\"event\":\"payment.captured\"}",
      signature: "signature",
      processing_status: "received",
      error_message: null,
      created_at: new Date().toISOString(),
      processed_at: null,
    });

    const result = await paymentsService.ingestRazorpayWebhook(
      JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_123", order_id: "order_123" } } },
      }),
      "signature",
    );

    expect(result).toEqual({
      accepted: true,
      duplicate: false,
      webhook_event_id: "webhook-1",
      event_type: "payment.captured",
    });
    expect(paymentsRepo.insertPaymentWebhookEvent).toHaveBeenCalledOnce();
    expect(queues.schedulePaymentReconcile).toHaveBeenCalledWith({
      webhookEventId: "webhook-1",
    });
  });

  it("treats duplicate webhook payloads idempotently", async () => {
    vi.mocked(paymentsRepo.insertPaymentWebhookEvent).mockRejectedValue({
      code: "23505",
    });
    vi.mocked(paymentsRepo.findPaymentWebhookEventByPayloadHash).mockResolvedValue({
      id: "webhook-duplicate",
      provider: "razorpay",
      provider_event_id: "pay_dup",
      event_type: "payment.failed",
      payload_hash: "payload-hash-1",
      raw_body: "{}",
      signature: "signature",
      processing_status: "received",
      error_message: null,
      created_at: new Date().toISOString(),
      processed_at: null,
    });

    const result = await paymentsService.ingestRazorpayWebhook(
      JSON.stringify({
        event: "payment.failed",
        payload: { payment: { entity: { id: "pay_dup", order_id: "order_dup" } } },
      }),
      "signature",
    );

    expect(result).toEqual({
      accepted: true,
      duplicate: true,
      webhook_event_id: "webhook-duplicate",
      event_type: "payment.failed",
    });
    expect(queues.schedulePaymentReconcile).not.toHaveBeenCalled();
  });

  it("returns booking-scoped payment status with financial hold snapshot", async () => {
    vi.mocked(paymentsRepo.findPaymentStatusByBookingIdForUser).mockResolvedValue({
      booking_id: "booking-6",
      booking_status: "completed",
      booking_payment_state: "failed",
      settlement: {
        id: "settlement-6",
        status: "overdue",
        preferred_payment_method: "online",
        total_due_paise: 8800,
        total_due: 88,
        paid_amount_paise: 0,
        paid_amount: 0,
        due_at: new Date().toISOString(),
        payer_user_id: "user-1",
        payee_user_id: "user-2",
        current_user_role: "payer",
      },
      payment_order: {
        id: "payment-order-6",
        provider_order_id: "order_6",
        status: "failed",
        amount_paise: 8800,
        amount: 88,
        currency: "INR",
        expires_at: null,
      },
      latest_attempt: {
        id: "attempt-6",
        provider_payment_id: "pay_6",
        status: "failed",
        updated_at: new Date().toISOString(),
      },
    });
    vi.mocked(settlementsService.getFinancialHoldStatus).mockResolvedValue({
      has_financial_hold: true,
      total_outstanding_paise: 8800,
      total_outstanding: 88,
      balances: [],
    });

    const result = await paymentsService.getPaymentStatus("user-1", "booking-6");

    expect(result.financial_hold).toEqual({
      has_financial_hold: true,
      total_outstanding_paise: 8800,
      total_outstanding: 88,
    });
    expect(result.booking_payment_state).toBe("failed");
  });
});
