import type { PoolClient } from "pg";

import { dbQuery } from "../../db/pool";

interface SettlementRow {
  id: string;
  booking_id: string;
  payer_user_id: string;
  payee_user_id: string;
  ride_fare_paise: number;
  platform_fee_paise: number;
  total_due_paise: number;
  paid_amount_paise: number;
  preferred_payment_method: string | null;
  status: string;
  due_at: Date | string | null;
  passenger_marked_paid_at: Date | string | null;
  owner_confirmed_received_at: Date | string | null;
  settled_at: Date | string | null;
  overdue_at: Date | string | null;
  dispute_opened_at: Date | string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SettlementViewRow extends SettlementRow {
  booking_status: string;
  pickup_location: string | null;
  drop_location: string | null;
  date: string | null;
  time: string | null;
  current_user_role: "payer" | "payee";
  other_user_id: string;
  other_user_email: string;
  other_user_name: string | null;
  other_user_avatar_url: string | null;
}

interface OutstandingBalanceRow {
  id: string;
  user_id: string;
  settlement_id: string;
  booking_id: string;
  amount_paise: number;
  status: string;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
  cleared_at: Date | string | null;
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function paiseToRupees(value: number) {
  return value / 100;
}

function mapOutstandingBalance(row: OutstandingBalanceRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    settlement_id: row.settlement_id,
    booking_id: row.booking_id,
    amount_paise: row.amount_paise,
    amount: paiseToRupees(row.amount_paise),
    status: row.status,
    reason: row.reason,
    metadata: row.metadata ?? {},
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    cleared_at: toIso(row.cleared_at),
  };
}

function mapSettlement(row: SettlementRow | SettlementViewRow) {
  const base = {
    id: row.id,
    booking_id: row.booking_id,
    payer_user_id: row.payer_user_id,
    payee_user_id: row.payee_user_id,
    ride_fare_paise: row.ride_fare_paise,
    ride_fare: paiseToRupees(row.ride_fare_paise),
    platform_fee_paise: row.platform_fee_paise,
    platform_fee: paiseToRupees(row.platform_fee_paise),
    total_due_paise: row.total_due_paise,
    total_due: paiseToRupees(row.total_due_paise),
    paid_amount_paise: row.paid_amount_paise,
    paid_amount: paiseToRupees(row.paid_amount_paise),
    preferred_payment_method: row.preferred_payment_method,
    status: row.status,
    due_at: toIso(row.due_at),
    passenger_marked_paid_at: toIso(row.passenger_marked_paid_at),
    owner_confirmed_received_at: toIso(row.owner_confirmed_received_at),
    settled_at: toIso(row.settled_at),
    overdue_at: toIso(row.overdue_at),
    dispute_opened_at: toIso(row.dispute_opened_at),
    metadata: row.metadata ?? {},
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };

  if (!("booking_status" in row)) {
    return base;
  }

  return {
    ...base,
    booking_status: row.booking_status,
    pickup_location: row.pickup_location,
    drop_location: row.drop_location,
    date: row.date,
    time: row.time,
    current_user_role: row.current_user_role,
    other_user_id: row.other_user_id,
    other_user_email: row.other_user_email,
    other_user_name: row.other_user_name,
    other_user_avatar_url: row.other_user_avatar_url,
  };
}

function settlementSelectColumns(currentUserParam: string) {
  return `
    s.id,
    s.booking_id,
    s.payer_user_id,
    s.payee_user_id,
    s.ride_fare_paise,
    s.platform_fee_paise,
    s.total_due_paise,
    s.paid_amount_paise,
    s.preferred_payment_method,
    s.status,
    s.due_at,
    s.passenger_marked_paid_at,
    s.owner_confirmed_received_at,
    s.settled_at,
    s.overdue_at,
    s.dispute_opened_at,
    s.metadata,
    s.created_at,
    s.updated_at,
    b.status AS booking_status,
    COALESCE(ro.pickup_location, rr.pickup_location) AS pickup_location,
    COALESCE(ro.drop_location, rr.drop_location) AS drop_location,
    COALESCE(ro.date, rr.date) AS date,
    COALESCE(ro.time, rr.time) AS time,
    CASE WHEN s.payer_user_id = ${currentUserParam} THEN 'payer' ELSE 'payee' END AS current_user_role,
    other_user.id AS other_user_id,
    other_user.email AS other_user_email,
    other_profile.full_name AS other_user_name,
    other_profile.avatar_url AS other_user_avatar_url
  `;
}

function settlementFromClause(currentUserParam: string) {
  return `
    FROM booking_settlements s
    INNER JOIN bookings b ON b.id = s.booking_id
    LEFT JOIN ride_offers ro ON b.ride_offer_id = ro.id
    LEFT JOIN ride_requests rr ON b.ride_request_id = rr.id
    INNER JOIN users other_user
      ON other_user.id = CASE
        WHEN s.payer_user_id = ${currentUserParam} THEN s.payee_user_id
        ELSE s.payer_user_id
      END
    LEFT JOIN user_profiles other_profile ON other_profile.user_id = other_user.id
  `;
}

export async function listSettlementsForUser(input: {
  userId: string;
  limit: number;
  offset: number;
  status?: string;
}) {
  const filters = ["(s.payer_user_id = $1 OR s.payee_user_id = $1)"];
  const params: unknown[] = [input.userId];
  let parameterIndex = 2;

  if (input.status) {
    filters.push(`s.status = $${parameterIndex}`);
    params.push(input.status);
    parameterIndex += 1;
  }

  const countResult = await dbQuery<{ total_count: string }>(
    `SELECT COUNT(*)::text AS total_count
     FROM booking_settlements s
     WHERE ${filters.join(" AND ")}`,
    params,
  );

  params.push(input.limit, input.offset);
  const limitParam = parameterIndex;
  const offsetParam = parameterIndex + 1;

  const result = await dbQuery<SettlementViewRow>(
    `SELECT
       ${settlementSelectColumns("$1")}
     ${settlementFromClause("$1")}
     WHERE ${filters.join(" AND ")}
     ORDER BY s.created_at DESC
     LIMIT $${limitParam}
     OFFSET $${offsetParam}`,
    params,
  );

  return {
    settlements: result.rows.map(mapSettlement),
    totalCount: Number(countResult.rows[0]?.total_count ?? 0),
  };
}

export async function findSettlementByBookingIdForUser(bookingId: string, userId: string) {
  const result = await dbQuery<SettlementViewRow>(
    `SELECT
       ${settlementSelectColumns("$2")}
     ${settlementFromClause("$2")}
     WHERE s.booking_id = $1
       AND (s.payer_user_id = $2 OR s.payee_user_id = $2)
     LIMIT 1`,
    [bookingId, userId],
  );

  return result.rows[0] ? mapSettlement(result.rows[0]) : null;
}

export async function findSettlementByBookingIdForUpdate(bookingId: string, client: PoolClient) {
  const result = await client.query<SettlementRow>(
    `SELECT
       id,
       booking_id,
       payer_user_id,
       payee_user_id,
       ride_fare_paise,
       platform_fee_paise,
       total_due_paise,
       paid_amount_paise,
       preferred_payment_method,
       status,
       due_at,
       passenger_marked_paid_at,
       owner_confirmed_received_at,
       settled_at,
       overdue_at,
       dispute_opened_at,
       metadata,
       created_at,
       updated_at
     FROM booking_settlements
     WHERE booking_id = $1
     FOR UPDATE`,
    [bookingId],
  );

  return result.rows[0] ?? null;
}

export async function insertSettlement(
  input: {
    bookingId: string;
    payerUserId: string;
    payeeUserId: string;
    rideFarePaise: number;
    platformFeePaise: number;
    totalDuePaise: number;
    paidAmountPaise?: number;
    preferredPaymentMethod?: string | null;
    status: string;
    dueAt?: Date | null;
    metadata?: Record<string, unknown>;
  },
  client: PoolClient,
) {
  const result = await client.query<SettlementRow>(
    `INSERT INTO booking_settlements (
       booking_id,
       payer_user_id,
       payee_user_id,
       ride_fare_paise,
       platform_fee_paise,
       total_due_paise,
       paid_amount_paise,
       preferred_payment_method,
       status,
       due_at,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     RETURNING
       id,
       booking_id,
       payer_user_id,
       payee_user_id,
       ride_fare_paise,
       platform_fee_paise,
       total_due_paise,
       paid_amount_paise,
       preferred_payment_method,
       status,
       due_at,
       passenger_marked_paid_at,
       owner_confirmed_received_at,
       settled_at,
       overdue_at,
       dispute_opened_at,
       metadata,
       created_at,
       updated_at`,
    [
      input.bookingId,
      input.payerUserId,
      input.payeeUserId,
      input.rideFarePaise,
      input.platformFeePaise,
      input.totalDuePaise,
      input.paidAmountPaise ?? 0,
      input.preferredPaymentMethod ?? null,
      input.status,
      input.dueAt ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  return mapSettlement(result.rows[0]);
}

export async function insertSettlementEvent(
  input: {
    settlementId: string;
    bookingId: string;
    actorUserId?: string | null;
    eventType: string;
    previousStatus?: string | null;
    nextStatus?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
  client: PoolClient,
) {
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.settlementId,
      input.bookingId,
      input.actorUserId ?? null,
      input.eventType,
      input.previousStatus ?? null,
      input.nextStatus ?? null,
      input.reason ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function updateSettlement(
  input: {
    settlementId: string;
    status?: string;
    paidAmountPaise?: number;
    preferredPaymentMethod?: string | null;
    dueAt?: Date | null;
    passengerMarkedPaidAt?: Date | null;
    ownerConfirmedReceivedAt?: Date | null;
    settledAt?: Date | null;
    overdueAt?: Date | null;
    disputeOpenedAt?: Date | null;
    metadata?: Record<string, unknown>;
  },
  client: PoolClient,
) {
  const values: unknown[] = [input.settlementId];
  const updates = ["updated_at = now()"];
  let parameterIndex = 2;

  if (input.status !== undefined) {
    updates.push(`status = $${parameterIndex}`);
    values.push(input.status);
    parameterIndex += 1;
  }

  if (input.paidAmountPaise !== undefined) {
    updates.push(`paid_amount_paise = $${parameterIndex}`);
    values.push(input.paidAmountPaise);
    parameterIndex += 1;
  }

  if (input.preferredPaymentMethod !== undefined) {
    updates.push(`preferred_payment_method = $${parameterIndex}`);
    values.push(input.preferredPaymentMethod);
    parameterIndex += 1;
  }

  if (input.dueAt !== undefined) {
    updates.push(`due_at = $${parameterIndex}`);
    values.push(input.dueAt);
    parameterIndex += 1;
  }

  if (input.passengerMarkedPaidAt !== undefined) {
    updates.push(`passenger_marked_paid_at = $${parameterIndex}`);
    values.push(input.passengerMarkedPaidAt);
    parameterIndex += 1;
  }

  if (input.ownerConfirmedReceivedAt !== undefined) {
    updates.push(`owner_confirmed_received_at = $${parameterIndex}`);
    values.push(input.ownerConfirmedReceivedAt);
    parameterIndex += 1;
  }

  if (input.settledAt !== undefined) {
    updates.push(`settled_at = $${parameterIndex}`);
    values.push(input.settledAt);
    parameterIndex += 1;
  }

  if (input.overdueAt !== undefined) {
    updates.push(`overdue_at = $${parameterIndex}`);
    values.push(input.overdueAt);
    parameterIndex += 1;
  }

  if (input.disputeOpenedAt !== undefined) {
    updates.push(`dispute_opened_at = $${parameterIndex}`);
    values.push(input.disputeOpenedAt);
    parameterIndex += 1;
  }

  if (input.metadata !== undefined) {
    updates.push(`metadata = $${parameterIndex}::jsonb`);
    values.push(JSON.stringify(input.metadata));
    parameterIndex += 1;
  }

  const result = await client.query<SettlementRow>(
    `UPDATE booking_settlements
     SET ${updates.join(", ")}
     WHERE id = $1
     RETURNING
       id,
       booking_id,
       payer_user_id,
       payee_user_id,
       ride_fare_paise,
       platform_fee_paise,
       total_due_paise,
       paid_amount_paise,
       preferred_payment_method,
       status,
       due_at,
       passenger_marked_paid_at,
       owner_confirmed_received_at,
       settled_at,
       overdue_at,
       dispute_opened_at,
       metadata,
       created_at,
       updated_at`,
    values,
  );

  return result.rows[0] ? mapSettlement(result.rows[0]) : null;
}

export async function findOutstandingBalanceBySettlementId(
  settlementId: string,
  client?: PoolClient,
) {
  const queryText = `SELECT
       id,
       user_id,
       settlement_id,
       booking_id,
       amount_paise,
       status,
       reason,
       metadata,
       created_at,
       updated_at,
       cleared_at
     FROM outstanding_balances
     WHERE settlement_id = $1
     LIMIT 1`;
  const result = client
    ? await client.query<OutstandingBalanceRow>(queryText, [settlementId])
    : await dbQuery<OutstandingBalanceRow>(queryText, [settlementId]);

  return result.rows[0] ? mapOutstandingBalance(result.rows[0]) : null;
}

export async function upsertOutstandingBalance(
  input: {
    userId: string;
    settlementId: string;
    bookingId: string;
    amountPaise: number;
    status: string;
    reason: string;
    metadata?: Record<string, unknown>;
    clearedAt?: Date | null;
  },
  client: PoolClient,
) {
  const result = await client.query<OutstandingBalanceRow>(
    `INSERT INTO outstanding_balances (
       user_id,
       settlement_id,
       booking_id,
       amount_paise,
       status,
       reason,
       metadata,
       cleared_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (settlement_id)
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       booking_id = EXCLUDED.booking_id,
       amount_paise = EXCLUDED.amount_paise,
       status = EXCLUDED.status,
       reason = EXCLUDED.reason,
       metadata = EXCLUDED.metadata,
       cleared_at = EXCLUDED.cleared_at,
       updated_at = now()
     RETURNING
       id,
       user_id,
       settlement_id,
       booking_id,
       amount_paise,
       status,
       reason,
       metadata,
       created_at,
       updated_at,
       cleared_at`,
    [
      input.userId,
      input.settlementId,
      input.bookingId,
      input.amountPaise,
      input.status,
      input.reason,
      JSON.stringify(input.metadata ?? {}),
      input.clearedAt ?? null,
    ],
  );

  return mapOutstandingBalance(result.rows[0]);
}

export async function updateOutstandingBalanceStatus(
  settlementId: string,
  status: string,
  client: PoolClient,
  metadata?: Record<string, unknown>,
) {
  const result = await client.query<OutstandingBalanceRow>(
    `UPDATE outstanding_balances
     SET status = $2,
         metadata = COALESCE($3::jsonb, metadata),
         cleared_at = CASE
           WHEN $2 IN ('cleared', 'waived') THEN COALESCE(cleared_at, now())
           ELSE NULL
         END,
         updated_at = now()
     WHERE settlement_id = $1
     RETURNING
       id,
       user_id,
       settlement_id,
       booking_id,
       amount_paise,
       status,
       reason,
       metadata,
       created_at,
       updated_at,
       cleared_at`,
    [settlementId, status, metadata ? JSON.stringify(metadata) : null],
  );

  return result.rows[0] ? mapOutstandingBalance(result.rows[0]) : null;
}

export async function getFinancialHoldSummary(userId: string) {
  const result = await dbQuery<OutstandingBalanceRow>(
    `SELECT
       id,
       user_id,
       settlement_id,
       booking_id,
       amount_paise,
       status,
       reason,
       metadata,
       created_at,
       updated_at,
       cleared_at
     FROM outstanding_balances
     WHERE user_id = $1
       AND status = 'open'
     ORDER BY created_at DESC`,
    [userId],
  );

  const balances = result.rows.map(mapOutstandingBalance);

  return {
    hasHold: balances.length > 0,
    totalOutstandingPaise: balances.reduce((sum, balance) => sum + balance.amount_paise, 0),
    balances,
  };
}
