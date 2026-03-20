import { Worker } from "bullmq";

import { env } from "../config/env";
import { withTransaction } from "../db/pool";
import { logger } from "../config/logger";
import { getRazorpayClient } from "../shared/payments/razorpay";
import {
  paymentReconcileQueueName,
  redisConnection,
  settlementOverdueQueue,
} from "../queues";

interface PaymentReconcileJobData {
  paymentOrderId?: string;
  webhookEventId?: string;
}

interface LockedWebhookEventRow {
  id: string;
  event_type: string;
  raw_body: string;
  processing_status: string;
}

interface LockedPaymentOrderRow {
  id: string;
  booking_id: string;
  user_id: string;
  provider_order_id: string;
  status: string;
}

interface LatestPaymentAttemptRow {
  id: string;
  provider_payment_id: string | null;
  status: string;
}

interface LockedSettlementContextRow {
  settlement_id: string;
  settlement_status: string;
  total_due_paise: number;
  payer_user_id: string;
  payee_user_id: string;
  booking_id: string;
  booking_payment_state: string;
}

interface ReconcileResolution {
  kind: "captured" | "failed" | "pending" | "ignored";
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  attemptStatus?: string;
  webhookStatus?: "processed" | "ignored";
  rawPayload?: Record<string, unknown>;
}

function buildDedupeKey(type: string, paymentOrderId: string) {
  return `${type}:${paymentOrderId}`;
}

async function updateWebhookProcessingStatus(input: {
  webhookEventId: string;
  status: string;
  errorMessage?: string | null;
}) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE payment_webhook_events
       SET processing_status = $2,
           error_message = $3,
           processed_at = CASE
             WHEN $2 IN ('processed', 'ignored') THEN now()
             ELSE processed_at
           END
       WHERE id = $1`,
      [input.webhookEventId, input.status, input.errorMessage ?? null],
    );
  });
}

function deriveResolutionFromWebhook(webhookEvent: LockedWebhookEventRow): ReconcileResolution {
  const payload = JSON.parse(webhookEvent.raw_body) as Record<string, any>;
  const paymentEntity = payload?.payload?.payment?.entity;
  const providerOrderId = paymentEntity?.order_id ?? null;
  const providerPaymentId = paymentEntity?.id ?? null;

  switch (webhookEvent.event_type) {
    case "payment.captured":
      return {
        kind: "captured",
        providerOrderId,
        providerPaymentId,
        attemptStatus: "webhook_verified",
        webhookStatus: "processed",
        rawPayload: payload,
      };
    case "payment.failed":
      return {
        kind: "failed",
        providerOrderId,
        providerPaymentId,
        attemptStatus: "failed",
        webhookStatus: "processed",
        rawPayload: payload,
      };
    default:
      return {
        kind: "ignored",
        providerOrderId,
        providerPaymentId,
        webhookStatus: "ignored",
        rawPayload: payload,
      };
  }
}

async function deriveResolutionFromProvider(
  attempt: LatestPaymentAttemptRow,
  paymentOrder: LockedPaymentOrderRow,
): Promise<ReconcileResolution> {
  if (!attempt.provider_payment_id) {
    return { kind: "pending" };
  }

  const razorpay = getRazorpayClient();
  const payment = (await razorpay.payments.fetch(attempt.provider_payment_id)) as any;

  if (payment.order_id && payment.order_id !== paymentOrder.provider_order_id) {
    throw new Error("Razorpay payment belongs to a different provider order");
  }

  switch (payment.status) {
    case "captured":
      return {
        kind: "captured",
        providerOrderId: payment.order_id,
        providerPaymentId: payment.id,
        attemptStatus: "webhook_verified",
        rawPayload: payment,
      };
    case "failed":
      return {
        kind: "failed",
        providerOrderId: payment.order_id,
        providerPaymentId: payment.id,
        attemptStatus: "failed",
        rawPayload: payment,
      };
    default:
      return {
        kind: "pending",
        providerOrderId: payment.order_id,
        providerPaymentId: payment.id,
        attemptStatus: attempt.status,
        rawPayload: payment,
      };
  }
}

async function clearSettlementOverdueJob(settlementId: string) {
  const job = await settlementOverdueQueue.getJob(settlementId);

  if (job) {
    await job.remove();
  }
}

export async function reconcilePayment(data: PaymentReconcileJobData) {
  return withTransaction(async (client) => {
    let webhookEvent: LockedWebhookEventRow | null = null;
    let resolution: ReconcileResolution | null = null;

    if (data.webhookEventId) {
      const webhookResult = await client.query<LockedWebhookEventRow>(
        `SELECT id, event_type, raw_body, processing_status
         FROM payment_webhook_events
         WHERE id = $1
         FOR UPDATE`,
        [data.webhookEventId],
      );

      if (webhookResult.rowCount === 0) {
        return { outcome: "webhook_missing" as const };
      }

      webhookEvent = webhookResult.rows[0];

      if (webhookEvent.processing_status !== "received") {
        return {
          outcome: "webhook_already_handled" as const,
          status: webhookEvent.processing_status,
        };
      }

      resolution = deriveResolutionFromWebhook(webhookEvent);

      if (resolution.kind === "ignored") {
        await client.query(
          `UPDATE payment_webhook_events
           SET processing_status = 'ignored',
               processed_at = now()
           WHERE id = $1`,
          [webhookEvent.id],
        );

        return { outcome: "webhook_ignored" as const, eventType: webhookEvent.event_type };
      }
    }

    const paymentOrderResult = resolution?.providerOrderId
      ? await client.query<LockedPaymentOrderRow>(
          `SELECT id, booking_id, user_id, provider_order_id, status
           FROM payment_orders
           WHERE provider_order_id = $1
           LIMIT 1
           FOR UPDATE`,
          [resolution.providerOrderId],
        )
      : data.paymentOrderId
        ? await client.query<LockedPaymentOrderRow>(
            `SELECT id, booking_id, user_id, provider_order_id, status
             FROM payment_orders
             WHERE id = $1
             LIMIT 1
             FOR UPDATE`,
            [data.paymentOrderId],
          )
        : { rowCount: 0, rows: [] as LockedPaymentOrderRow[] };

    if (paymentOrderResult.rowCount === 0) {
      if (webhookEvent) {
        await client.query(
          `UPDATE payment_webhook_events
           SET processing_status = 'ignored',
               error_message = 'payment_order_not_found',
               processed_at = now()
           WHERE id = $1`,
          [webhookEvent.id],
        );
      }

      return { outcome: "payment_order_missing" as const };
    }

    const paymentOrder = paymentOrderResult.rows[0];
    const settlementResult = await client.query<LockedSettlementContextRow>(
      `SELECT
         s.id AS settlement_id,
         s.status AS settlement_status,
         s.total_due_paise,
         s.payer_user_id,
         s.payee_user_id,
         b.id AS booking_id,
         b.payment_state AS booking_payment_state
       FROM booking_settlements s
       INNER JOIN bookings b ON b.id = s.booking_id
       WHERE s.booking_id = $1
       FOR UPDATE OF s, b`,
      [paymentOrder.booking_id],
    );

    if (settlementResult.rowCount === 0) {
      if (webhookEvent) {
        await client.query(
          `UPDATE payment_webhook_events
           SET processing_status = 'failed',
               error_message = 'settlement_not_found'
           WHERE id = $1`,
          [webhookEvent.id],
        );
      }

      throw new Error("Settlement not found for payment order");
    }

    const settlement = settlementResult.rows[0];
    const latestAttemptResult = await client.query<LatestPaymentAttemptRow>(
      `SELECT id, provider_payment_id, status
       FROM payment_attempts
       WHERE payment_order_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [paymentOrder.id],
    );
    const latestAttempt = latestAttemptResult.rows[0] ?? null;

    if (!resolution) {
      if (!latestAttempt) {
        return { outcome: "attempt_missing" as const, paymentOrderId: paymentOrder.id };
      }

      resolution = await deriveResolutionFromProvider(latestAttempt, paymentOrder);
    }

    if (resolution.providerPaymentId) {
      await client.query(
        `INSERT INTO payment_attempts (
           payment_order_id,
           provider_payment_id,
           status,
           raw_payload
         )
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (provider_payment_id)
         DO UPDATE SET
           payment_order_id = EXCLUDED.payment_order_id,
           status = EXCLUDED.status,
           raw_payload = EXCLUDED.raw_payload,
           updated_at = now()`,
        [
          paymentOrder.id,
          resolution.providerPaymentId,
          resolution.attemptStatus ?? "client_verified",
          JSON.stringify(resolution.rawPayload ?? {}),
        ],
      );
    }

    if (resolution.kind === "captured") {
      await client.query(
        `UPDATE payment_orders
         SET status = 'captured',
             updated_at = now()
         WHERE id = $1`,
        [paymentOrder.id],
      );

      await client.query(
        `UPDATE booking_settlements
         SET status = 'settled',
             paid_amount_paise = total_due_paise,
             preferred_payment_method = 'online',
             settled_at = COALESCE(settled_at, now()),
             owner_confirmed_received_at = COALESCE(owner_confirmed_received_at, now()),
             updated_at = now()
         WHERE id = $1`,
        [settlement.settlement_id],
      );

      await client.query(
        `UPDATE outstanding_balances
         SET status = 'cleared',
             cleared_at = COALESCE(cleared_at, now()),
             updated_at = now()
         WHERE settlement_id = $1
           AND status NOT IN ('cleared', 'waived')`,
        [settlement.settlement_id],
      );

      await client.query(
        `UPDATE bookings
         SET payment_state = 'paid_escrow',
             updated_at = now(),
             version = version + 1
         WHERE id = $1`,
        [settlement.booking_id],
      );

      await client.query(
        `INSERT INTO settlement_events (
           settlement_id,
           booking_id,
           actor_user_id,
           event_type,
           previous_status,
           next_status,
           reason,
           metadata
         )
         VALUES ($1, $2, NULL, 'online_payment_captured', $3, 'settled', 'razorpay_payment_captured', $4::jsonb)`,
        [
          settlement.settlement_id,
          settlement.booking_id,
          settlement.settlement_status,
          JSON.stringify({
            paymentOrderId: paymentOrder.id,
            providerOrderId: paymentOrder.provider_order_id,
            providerPaymentId: resolution.providerPaymentId ?? null,
            source: webhookEvent ? "webhook" : "provider_fetch",
          }),
        ],
      );

      await client.query(
        `INSERT INTO notifications (
           user_id,
           type,
           channel,
           title,
           body,
           data,
           status,
           dedupe_key,
           sent_at
         )
         VALUES
           ($1, 'payment_captured', 'in_app', 'Online payment completed', 'Your post-trip online payment was captured successfully.', $3::jsonb, 'sent', $4, now()),
           ($2, 'payment_captured_driver', 'in_app', 'Passenger payment received', 'The passenger paid online and the settlement is now closed.', $3::jsonb, 'sent', $5, now())
         ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        [
          settlement.payer_user_id,
          settlement.payee_user_id,
          JSON.stringify({
            bookingId: settlement.booking_id,
            paymentOrderId: paymentOrder.id,
            paymentStatus: "captured",
          }),
          buildDedupeKey("payment_captured", paymentOrder.id),
          buildDedupeKey("payment_captured_driver", paymentOrder.id),
        ],
      );

      if (webhookEvent) {
        await client.query(
          `UPDATE payment_webhook_events
           SET processing_status = 'processed',
               processed_at = now()
           WHERE id = $1`,
          [webhookEvent.id],
        );
      }

      return {
        outcome: "captured" as const,
        paymentOrderId: paymentOrder.id,
        settlementId: settlement.settlement_id,
      };
    }

    if (resolution.kind === "failed") {
      await client.query(
        `UPDATE payment_orders
         SET status = 'failed',
             updated_at = now()
         WHERE id = $1`,
        [paymentOrder.id],
      );

      if (settlement.settlement_status !== "overdue") {
        await client.query(
          `UPDATE booking_settlements
           SET status = 'due',
               preferred_payment_method = 'online',
               updated_at = now()
           WHERE id = $1
             AND status NOT IN ('settled', 'waived')`,
          [settlement.settlement_id],
        );
      } else {
        await client.query(
          `UPDATE booking_settlements
           SET preferred_payment_method = 'online',
               updated_at = now()
           WHERE id = $1`,
          [settlement.settlement_id],
        );
      }

      if (settlement.booking_payment_state !== "paid_escrow") {
        await client.query(
          `UPDATE bookings
           SET payment_state = 'failed',
               updated_at = now(),
               version = version + 1
           WHERE id = $1`,
          [settlement.booking_id],
        );
      }

      await client.query(
        `INSERT INTO settlement_events (
           settlement_id,
           booking_id,
           actor_user_id,
           event_type,
           previous_status,
           next_status,
           reason,
           metadata
         )
         VALUES ($1, $2, NULL, 'online_payment_failed', $3, $4, 'razorpay_payment_failed', $5::jsonb)`,
        [
          settlement.settlement_id,
          settlement.booking_id,
          settlement.settlement_status,
          settlement.settlement_status === "overdue" ? "overdue" : "due",
          JSON.stringify({
            paymentOrderId: paymentOrder.id,
            providerOrderId: paymentOrder.provider_order_id,
            providerPaymentId: resolution.providerPaymentId ?? null,
            source: webhookEvent ? "webhook" : "provider_fetch",
          }),
        ],
      );

      await client.query(
        `INSERT INTO notifications (
           user_id,
           type,
           channel,
           title,
           body,
           data,
           status,
           dedupe_key,
           sent_at
         )
         VALUES
           ($1, 'payment_failed', 'in_app', 'Online payment failed', 'Your online payment failed. You can retry the payment for this completed ride.', $3::jsonb, 'sent', $4, now()),
           ($2, 'payment_failed_driver', 'in_app', 'Passenger payment failed', 'The passenger''s online payment failed. The settlement remains unpaid.', $3::jsonb, 'sent', $5, now())
         ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        [
          settlement.payer_user_id,
          settlement.payee_user_id,
          JSON.stringify({
            bookingId: settlement.booking_id,
            paymentOrderId: paymentOrder.id,
            paymentStatus: "failed",
          }),
          buildDedupeKey("payment_failed", paymentOrder.id),
          buildDedupeKey("payment_failed_driver", paymentOrder.id),
        ],
      );

      if (webhookEvent) {
        await client.query(
          `UPDATE payment_webhook_events
           SET processing_status = 'processed',
               processed_at = now()
           WHERE id = $1`,
          [webhookEvent.id],
        );
      }

      return {
        outcome: "failed" as const,
        paymentOrderId: paymentOrder.id,
        settlementId: settlement.settlement_id,
      };
    }

    if (webhookEvent) {
      await client.query(
        `UPDATE payment_webhook_events
         SET processing_status = 'ignored',
             processed_at = now()
         WHERE id = $1`,
        [webhookEvent.id],
      );
    }

    return {
      outcome: "pending" as const,
      paymentOrderId: paymentOrder.id,
      resolution: resolution.kind,
    };
  });
}

export function createPaymentReconcileWorker() {
  return new Worker(
    paymentReconcileQueueName,
    async (job) => {
      const data = job.data as PaymentReconcileJobData;

      try {
        const result = await reconcilePayment(data);

        if ("settlementId" in result && result.settlementId && result.outcome === "captured") {
          await clearSettlementOverdueJob(result.settlementId);
        }

        logger.info(
          { jobId: job.id, data, result },
          "Processed payment reconcile job",
        );
      } catch (error: any) {
        if (data.webhookEventId) {
          await updateWebhookProcessingStatus({
            webhookEventId: data.webhookEventId,
            status: "failed",
            errorMessage: error?.message ?? "payment_reconcile_failed",
          }).catch(() => undefined);
        }

        throw error;
      }
    },
    {
      connection: redisConnection as any,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
}
