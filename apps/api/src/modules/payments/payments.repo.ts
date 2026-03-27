import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

interface PaymentContextRow {
  booking_id: string;
  booking_status: string;
  booking_payment_state: string;
  passenger_id: string;
  driver_id: string;
  settlement_id: string;
  payer_user_id: string;
  payee_user_id: string;
  settlement_status: string;
  preferred_payment_method: string | null;
  total_due_paise: number;
  paid_amount_paise: number;
  due_at: Date | string | null;
}

interface PaymentOrderRow {
  id: string;
  booking_id: string;
  user_id: string;
  provider: string;
  provider_order_id: string;
  amount_paise: number;
  currency: string;
  status: string;
  idempotency_key: string;
  expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PaymentAttemptRow {
  id: string;
  payment_order_id: string;
  provider_payment_id: string | null;
  provider_signature: string | null;
  status: string;
  raw_payload: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PaymentWebhookEventRow {
  id: string;
  provider: string;
  provider_event_id: string | null;
  event_type: string;
  payload_hash: string;
  raw_body: string;
  signature: string | null;
  processing_status: string;
  error_message: string | null;
  created_at: Date | string;
  processed_at: Date | string | null;
}

interface PaymentStatusRow {
  booking_id: string;
  booking_status: string;
  booking_payment_state: string;
  settlement_id: string;
  settlement_status: string;
  preferred_payment_method: string | null;
  total_due_paise: number;
  paid_amount_paise: number;
  due_at: Date | string | null;
  payer_user_id: string;
  payee_user_id: string;
  current_user_role: "payer" | "payee";
  payment_order_id: string | null;
  provider_order_id: string | null;
  payment_order_status: string | null;
  payment_order_amount_paise: number | null;
  payment_order_currency: string | null;
  payment_order_expires_at: Date | string | null;
  payment_attempt_id: string | null;
  provider_payment_id: string | null;
  payment_attempt_status: string | null;
  payment_attempt_updated_at: Date | string | null;
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function paiseToRupees(value: number | null) {
  return value === null ? null : value / 100;
}

function mapPaymentOrder(row: PaymentOrderRow) {
  return {
    id: row.id,
    booking_id: row.booking_id,
    user_id: row.user_id,
    provider: row.provider,
    provider_order_id: row.provider_order_id,
    amount_paise: row.amount_paise,
    amount: paiseToRupees(row.amount_paise),
    currency: row.currency,
    status: row.status,
    idempotency_key: row.idempotency_key,
    expires_at: toIso(row.expires_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapPaymentAttempt(row: PaymentAttemptRow) {
  return {
    id: row.id,
    payment_order_id: row.payment_order_id,
    provider_payment_id: row.provider_payment_id,
    provider_signature: row.provider_signature,
    status: row.status,
    raw_payload: row.raw_payload ?? {},
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapWebhookEvent(row: PaymentWebhookEventRow) {
  return {
    id: row.id,
    provider: row.provider,
    provider_event_id: row.provider_event_id,
    event_type: row.event_type,
    payload_hash: row.payload_hash,
    raw_body: row.raw_body,
    signature: row.signature,
    processing_status: row.processing_status,
    error_message: row.error_message,
    created_at: toIso(row.created_at),
    processed_at: toIso(row.processed_at),
  };
}

export function mapPaymentStatus(row: PaymentStatusRow) {
  return {
    booking_id: row.booking_id,
    booking_status: row.booking_status,
    booking_payment_state: row.booking_payment_state,
    settlement: {
      id: row.settlement_id,
      status: row.settlement_status,
      preferred_payment_method: row.preferred_payment_method,
      total_due_paise: row.total_due_paise,
      total_due: paiseToRupees(row.total_due_paise),
      paid_amount_paise: row.paid_amount_paise,
      paid_amount: paiseToRupees(row.paid_amount_paise),
      due_at: toIso(row.due_at),
      payer_user_id: row.payer_user_id,
      payee_user_id: row.payee_user_id,
      current_user_role: row.current_user_role,
    },
    payment_order: row.payment_order_id
      ? {
          id: row.payment_order_id,
          provider_order_id: row.provider_order_id,
          status: row.payment_order_status,
          amount_paise: row.payment_order_amount_paise,
          amount: paiseToRupees(row.payment_order_amount_paise),
          currency: row.payment_order_currency,
          expires_at: toIso(row.payment_order_expires_at),
        }
      : null,
    latest_attempt: row.payment_attempt_id
      ? {
          id: row.payment_attempt_id,
          provider_payment_id: row.provider_payment_id,
          status: row.payment_attempt_status,
          updated_at: toIso(row.payment_attempt_updated_at),
        }
      : null,
  };
}

export async function findPaymentContextForUpdate(bookingId: string, client: PoolClient) {
  const result = await client.query<PaymentContextRow>(
    `SELECT
       b.id AS booking_id,
       b.status AS booking_status,
       b.payment_state AS booking_payment_state,
       b.passenger_id,
       b.driver_id,
       s.id AS settlement_id,
       s.payer_user_id,
       s.payee_user_id,
       s.status AS settlement_status,
       s.preferred_payment_method,
       s.total_due_paise,
       s.paid_amount_paise,
       s.due_at
     FROM bookings b
     INNER JOIN booking_settlements s ON s.booking_id = b.id
     WHERE b.id = $1
     FOR UPDATE OF b, s`,
    [bookingId],
  );

  return result.rows[0] ?? null;
}

export async function findLatestReusablePaymentOrder(
  input: {
    bookingId: string;
    amountPaise: number;
    userId: string;
    provider: string;
  },
  client: PoolClient,
) {
  const result = await client.query<PaymentOrderRow>(
    `SELECT
       id,
       booking_id,
       user_id,
       provider,
       provider_order_id,
       amount_paise,
       currency,
       status,
       idempotency_key,
       expires_at,
       created_at,
       updated_at
     FROM payment_orders
     WHERE booking_id = $1
       AND user_id = $2
       AND provider = $3
       AND amount_paise = $4
       AND status IN ('created', 'attempted')
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [input.bookingId, input.userId, input.provider, input.amountPaise],
  );

  return result.rows[0] ? mapPaymentOrder(result.rows[0]) : null;
}

export async function insertPaymentOrder(
  input: {
    bookingId: string;
    userId: string;
    provider: string;
    providerOrderId: string;
    amountPaise: number;
    currency: string;
    status: string;
    idempotencyKey: string;
    expiresAt?: Date | null;
  },
  client: PoolClient,
) {
  const result = await client.query<PaymentOrderRow>(
    `INSERT INTO payment_orders (
       booking_id,
       user_id,
       provider,
       provider_order_id,
       amount_paise,
       currency,
       status,
       idempotency_key,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING
       id,
       booking_id,
       user_id,
       provider,
       provider_order_id,
       amount_paise,
       currency,
       status,
       idempotency_key,
       expires_at,
       created_at,
       updated_at`,
    [
      input.bookingId,
      input.userId,
      input.provider,
      input.providerOrderId,
      input.amountPaise,
      input.currency,
      input.status,
      input.idempotencyKey,
      input.expiresAt ?? null,
    ],
  );

  return mapPaymentOrder(result.rows[0]);
}

export async function updatePaymentOrderStatus(
  input: {
    paymentOrderId: string;
    status: string;
    expiresAt?: Date | null;
  },
  client: PoolClient,
) {
  const values: unknown[] = [input.paymentOrderId, input.status];
  const updates = ["status = $2", "updated_at = now()"];
  let parameterIndex = 3;

  if (input.expiresAt !== undefined) {
    updates.push(`expires_at = $${parameterIndex}`);
    values.push(input.expiresAt);
  }

  const result = await client.query<PaymentOrderRow>(
    `UPDATE payment_orders
     SET ${updates.join(", ")}
     WHERE id = $1
     RETURNING
       id,
       booking_id,
       user_id,
       provider,
       provider_order_id,
       amount_paise,
       currency,
       status,
       idempotency_key,
       expires_at,
       created_at,
       updated_at`,
    values,
  );

  return result.rows[0] ? mapPaymentOrder(result.rows[0]) : null;
}

export async function findPaymentOrderByProviderOrderIdForUpdate(
  providerOrderId: string,
  client: PoolClient,
) {
  const result = await client.query<PaymentOrderRow>(
    `SELECT
       id,
       booking_id,
       user_id,
       provider,
       provider_order_id,
       amount_paise,
       currency,
       status,
       idempotency_key,
       expires_at,
       created_at,
       updated_at
     FROM payment_orders
     WHERE provider_order_id = $1
     LIMIT 1
     FOR UPDATE`,
    [providerOrderId],
  );

  return result.rows[0] ? mapPaymentOrder(result.rows[0]) : null;
}

export async function findPaymentOrderByIdForUpdate(paymentOrderId: string, client: PoolClient) {
  const result = await client.query<PaymentOrderRow>(
    `SELECT
       id,
       booking_id,
       user_id,
       provider,
       provider_order_id,
       amount_paise,
       currency,
       status,
       idempotency_key,
       expires_at,
       created_at,
       updated_at
     FROM payment_orders
     WHERE id = $1
     LIMIT 1
     FOR UPDATE`,
    [paymentOrderId],
  );

  return result.rows[0] ? mapPaymentOrder(result.rows[0]) : null;
}

export async function upsertPaymentAttemptByProviderPaymentId(
  input: {
    paymentOrderId: string;
    providerPaymentId: string;
    providerSignature?: string | null;
    status: string;
    rawPayload?: Record<string, unknown>;
  },
  client: PoolClient,
) {
  const result = await client.query<PaymentAttemptRow>(
    `INSERT INTO payment_attempts (
       payment_order_id,
       provider_payment_id,
       provider_signature,
       status,
       raw_payload
     )
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (provider_payment_id)
     DO UPDATE SET
       payment_order_id = EXCLUDED.payment_order_id,
       provider_signature = COALESCE(EXCLUDED.provider_signature, payment_attempts.provider_signature),
       status = EXCLUDED.status,
       raw_payload = EXCLUDED.raw_payload,
       updated_at = now()
     RETURNING
       id,
       payment_order_id,
       provider_payment_id,
       provider_signature,
       status,
       raw_payload,
       created_at,
       updated_at`,
    [
      input.paymentOrderId,
      input.providerPaymentId,
      input.providerSignature ?? null,
      input.status,
      JSON.stringify(input.rawPayload ?? {}),
    ],
  );

  return mapPaymentAttempt(result.rows[0]);
}

export async function findLatestPaymentAttemptByOrderId(
  paymentOrderId: string,
  client?: PoolClient,
) {
  const queryText = `SELECT
       id,
       payment_order_id,
       provider_payment_id,
       provider_signature,
       status,
       raw_payload,
       created_at,
       updated_at
     FROM payment_attempts
     WHERE payment_order_id = $1
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`;
  const result = client
    ? await client.query<PaymentAttemptRow>(queryText, [paymentOrderId])
    : await dbQuery<PaymentAttemptRow>(queryText, [paymentOrderId]);

  return result.rows[0] ? mapPaymentAttempt(result.rows[0]) : null;
}

export async function updateBookingPaymentProjection(
  bookingId: string,
  paymentState: string,
  client: PoolClient,
) {
  await client.query(
    `UPDATE bookings
     SET payment_state = $2,
         updated_at = now(),
         version = version + 1
     WHERE id = $1`,
    [bookingId, paymentState],
  );
}

export async function insertPaymentWebhookEvent(
  input: {
    provider: string;
    providerEventId?: string | null;
    eventType: string;
    payloadHash: string;
    rawBody: string;
    signature?: string | null;
    processingStatus: string;
  },
  client?: PoolClient,
) {
  const queryText = `INSERT INTO payment_webhook_events (
       provider,
       provider_event_id,
       event_type,
       payload_hash,
       raw_body,
       signature,
       processing_status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING
       id,
       provider,
       provider_event_id,
       event_type,
       payload_hash,
       raw_body,
       signature,
       processing_status,
       error_message,
       created_at,
       processed_at`;
  const params = [
    input.provider,
    input.providerEventId ?? null,
    input.eventType,
    input.payloadHash,
    input.rawBody,
    input.signature ?? null,
    input.processingStatus,
  ];
  const result = client
    ? await client.query<PaymentWebhookEventRow>(queryText, params)
    : await dbQuery<PaymentWebhookEventRow>(queryText, params);

  return mapWebhookEvent(result.rows[0]);
}

export async function findPaymentWebhookEventByPayloadHash(provider: string, payloadHash: string) {
  const result = await dbQuery<PaymentWebhookEventRow>(
    `SELECT
       id,
       provider,
       provider_event_id,
       event_type,
       payload_hash,
       raw_body,
       signature,
       processing_status,
       error_message,
       created_at,
       processed_at
     FROM payment_webhook_events
     WHERE provider = $1
       AND payload_hash = $2
     LIMIT 1`,
    [provider, payloadHash],
  );

  return result.rows[0] ? mapWebhookEvent(result.rows[0]) : null;
}

export async function findPaymentStatusByBookingIdForUser(bookingId: string, userId: string) {
  const result = await dbQuery<PaymentStatusRow>(
    `SELECT
       b.id AS booking_id,
       b.status AS booking_status,
       b.payment_state AS booking_payment_state,
       s.id AS settlement_id,
       s.status AS settlement_status,
       s.preferred_payment_method,
       s.total_due_paise,
       s.paid_amount_paise,
       s.due_at,
       s.payer_user_id,
       s.payee_user_id,
       CASE WHEN s.payer_user_id = $2 THEN 'payer' ELSE 'payee' END AS current_user_role,
       po.id AS payment_order_id,
       po.provider_order_id,
       po.status AS payment_order_status,
       po.amount_paise AS payment_order_amount_paise,
       po.currency AS payment_order_currency,
       po.expires_at AS payment_order_expires_at,
       pa.id AS payment_attempt_id,
       pa.provider_payment_id,
       pa.status AS payment_attempt_status,
       pa.updated_at AS payment_attempt_updated_at
     FROM bookings b
     INNER JOIN booking_settlements s ON s.booking_id = b.id
     LEFT JOIN LATERAL (
       SELECT
         id,
         provider_order_id,
         status,
         amount_paise,
         currency,
         expires_at
       FROM payment_orders
       WHERE booking_id = b.id
       ORDER BY created_at DESC
       LIMIT 1
     ) po ON true
     LEFT JOIN LATERAL (
       SELECT
         id,
         provider_payment_id,
         status,
         updated_at
       FROM payment_attempts
       WHERE payment_order_id = po.id
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1
     ) pa ON true
     WHERE b.id = $1
       AND ($2 = s.payer_user_id OR $2 = s.payee_user_id)
     LIMIT 1`,
    [bookingId, userId],
  );

  return result.rows[0] ? mapPaymentStatus(result.rows[0]) : null;
}
