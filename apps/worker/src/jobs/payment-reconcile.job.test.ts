import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  withTransactionMock,
  fetchPaymentMock,
  getJobMock,
  loggerInfoMock,
  workerConstructorMock,
} = vi.hoisted(() => ({
  withTransactionMock: vi.fn(),
  fetchPaymentMock: vi.fn(),
  getJobMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  workerConstructorMock: vi.fn(function WorkerMock(
    _queueName: string,
    processor: (job: { id: string; data: unknown }) => Promise<void>,
  ) {
    return {
      processor,
    };
  }),
}));

vi.mock("bullmq", () => ({
  Worker: workerConstructorMock,
}));

vi.mock("../config/env", () => ({
  env: {
    WORKER_CONCURRENCY: 1,
  },
}));

vi.mock("../config/logger", () => ({
  logger: {
    info: loggerInfoMock,
  },
}));

vi.mock("../db/pool", () => ({
  withTransaction: withTransactionMock,
}));

vi.mock("../shared/payments/razorpay", () => ({
  getRazorpayClient: vi.fn(() => ({
    payments: {
      fetch: fetchPaymentMock,
    },
  })),
}));

vi.mock("../queues", () => ({
  paymentReconcileQueueName: "payment-reconcile",
  redisConnection: {},
  settlementOverdueQueue: {
    getJob: getJobMock,
  },
}));

import { createPaymentReconcileWorker, reconcilePayment } from "./payment-reconcile.job";

type QueryResult = {
  rowCount?: number;
  rows?: Array<Record<string, unknown>>;
};

function createQueryResult(
  rows: Array<Record<string, unknown>> = [],
  rowCount = rows.length,
): QueryResult {
  return {
    rowCount,
    rows,
  };
}

function mockTransactionResponses(responses: QueryResult[]) {
  const queryMock = vi.fn();

  for (const response of responses) {
    queryMock.mockResolvedValueOnce(response);
  }

  withTransactionMock.mockImplementation(async (callback: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    callback({
      query: queryMock,
    }),
  );

  return queryMock;
}

function hasSqlCall(queryMock: ReturnType<typeof vi.fn>, snippet: string) {
  return queryMock.mock.calls.some(([sql]: [unknown, ...unknown[]]) =>
    String(sql).includes(snippet),
  );
}

describe("payment-reconcile.job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures a webhook-confirmed payment and settles the booking", async () => {
    const queryMock = mockTransactionResponses([
      createQueryResult([
        {
          id: "webhook-1",
          event_type: "payment.captured",
          raw_body: JSON.stringify({
            event: "payment.captured",
            payload: {
              payment: {
                entity: {
                  id: "pay_123",
                  order_id: "order_123",
                },
              },
            },
          }),
          processing_status: "received",
        },
      ]),
      createQueryResult([
        {
          id: "payment-order-1",
          booking_id: "booking-1",
          user_id: "user-1",
          provider_order_id: "order_123",
          status: "created",
        },
      ]),
      createQueryResult([
        {
          settlement_id: "settlement-1",
          settlement_status: "overdue",
          total_due_paise: 16500,
          payer_user_id: "user-1",
          payee_user_id: "user-2",
          booking_id: "booking-1",
          booking_payment_state: "verification_pending",
        },
      ]),
      createQueryResult([]),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
    ]);

    const result = await reconcilePayment({
      webhookEventId: "webhook-1",
    });

    expect(result).toEqual({
      outcome: "captured",
      paymentOrderId: "payment-order-1",
      settlementId: "settlement-1",
    });
    expect(fetchPaymentMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(12);
    expect(hasSqlCall(queryMock, "UPDATE payment_orders")).toBe(true);
    expect(hasSqlCall(queryMock, "UPDATE booking_settlements")).toBe(true);
    expect(hasSqlCall(queryMock, "UPDATE outstanding_balances")).toBe(true);
    expect(hasSqlCall(queryMock, "UPDATE bookings")).toBe(true);
    expect(hasSqlCall(queryMock, "INSERT INTO notifications")).toBe(true);
    expect(hasSqlCall(queryMock, "UPDATE payment_webhook_events")).toBe(true);
  });

  it("marks provider-reconciled failures without clearing outstanding balances", async () => {
    const queryMock = mockTransactionResponses([
      createQueryResult([
        {
          id: "payment-order-2",
          booking_id: "booking-2",
          user_id: "user-1",
          provider_order_id: "order_provider_2",
          status: "verification_pending",
        },
      ]),
      createQueryResult([
        {
          settlement_id: "settlement-2",
          settlement_status: "due",
          total_due_paise: 8200,
          payer_user_id: "user-1",
          payee_user_id: "user-2",
          booking_id: "booking-2",
          booking_payment_state: "verification_pending",
        },
      ]),
      createQueryResult([
        {
          id: "attempt-2",
          provider_payment_id: "pay_failed_2",
          status: "client_verified",
        },
      ]),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
    ]);

    fetchPaymentMock.mockResolvedValue({
      id: "pay_failed_2",
      order_id: "order_provider_2",
      status: "failed",
    });

    const result = await reconcilePayment({
      paymentOrderId: "payment-order-2",
    });

    expect(result).toEqual({
      outcome: "failed",
      paymentOrderId: "payment-order-2",
      settlementId: "settlement-2",
    });
    expect(fetchPaymentMock).toHaveBeenCalledWith("pay_failed_2");
    expect(queryMock).toHaveBeenCalledTimes(9);
    expect(hasSqlCall(queryMock, "UPDATE payment_orders")).toBe(true);
    expect(hasSqlCall(queryMock, "UPDATE booking_settlements")).toBe(true);
    expect(hasSqlCall(queryMock, "UPDATE bookings")).toBe(true);
    expect(hasSqlCall(queryMock, "INSERT INTO notifications")).toBe(true);
    expect(hasSqlCall(queryMock, "UPDATE outstanding_balances")).toBe(false);
  });

  it("removes the overdue job after a captured reconcile in the worker callback", async () => {
    const removeMock = vi.fn(async () => undefined);
    getJobMock.mockResolvedValue({
      remove: removeMock,
    });

    mockTransactionResponses([
      createQueryResult([
        {
          id: "payment-order-3",
          booking_id: "booking-3",
          user_id: "user-1",
          provider_order_id: "order_provider_3",
          status: "verification_pending",
        },
      ]),
      createQueryResult([
        {
          settlement_id: "settlement-3",
          settlement_status: "overdue",
          total_due_paise: 9100,
          payer_user_id: "user-1",
          payee_user_id: "user-2",
          booking_id: "booking-3",
          booking_payment_state: "verification_pending",
        },
      ]),
      createQueryResult([
        {
          id: "attempt-3",
          provider_payment_id: "pay_captured_3",
          status: "client_verified",
        },
      ]),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
    ]);

    fetchPaymentMock.mockResolvedValue({
      id: "pay_captured_3",
      order_id: "order_provider_3",
      status: "captured",
    });

    const worker = createPaymentReconcileWorker() as unknown as {
      processor: (job: { id: string; data: { paymentOrderId: string } }) => Promise<void>;
    };

    await worker.processor({
      id: "job-1",
      data: {
        paymentOrderId: "payment-order-3",
      },
    });

    expect(getJobMock).toHaveBeenCalledWith("settlement-3");
    expect(removeMock).toHaveBeenCalledOnce();
    expect(loggerInfoMock).toHaveBeenCalledOnce();
  });

  it("recovers a previously failed payment order when provider later reports captured", async () => {
    const queryMock = mockTransactionResponses([
      createQueryResult([
        {
          id: "payment-order-4",
          booking_id: "booking-4",
          user_id: "user-1",
          provider_order_id: "order_provider_4",
          status: "failed",
        },
      ]),
      createQueryResult([
        {
          settlement_id: "settlement-4",
          settlement_status: "overdue",
          total_due_paise: 10400,
          payer_user_id: "user-1",
          payee_user_id: "user-2",
          booking_id: "booking-4",
          booking_payment_state: "failed",
        },
      ]),
      createQueryResult([
        {
          id: "attempt-4",
          provider_payment_id: "pay_captured_4",
          status: "failed",
        },
      ]),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
      createQueryResult(),
    ]);

    fetchPaymentMock.mockResolvedValue({
      id: "pay_captured_4",
      order_id: "order_provider_4",
      status: "captured",
    });

    const result = await reconcilePayment({
      paymentOrderId: "payment-order-4",
    });

    expect(result).toEqual({
      outcome: "captured",
      paymentOrderId: "payment-order-4",
      settlementId: "settlement-4",
    });
    expect(fetchPaymentMock).toHaveBeenCalledWith("pay_captured_4");
    expect(queryMock).toHaveBeenCalledTimes(10);
    expect(hasSqlCall(queryMock, "UPDATE payment_orders")).toBe(true);
    expect(hasSqlCall(queryMock, "SET status = 'settled'")).toBe(true);
    expect(hasSqlCall(queryMock, "UPDATE outstanding_balances")).toBe(true);
    expect(hasSqlCall(queryMock, "SET payment_state = 'paid_escrow'")).toBe(true);
  });
});
