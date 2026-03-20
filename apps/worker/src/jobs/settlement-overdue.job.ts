import { Worker } from "bullmq";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { withTransaction } from "../db/pool";
import { redisConnection, settlementOverdueQueueName } from "../queues";

interface SettlementOverdueJobData {
  settlementId: string;
}

interface LockedSettlementRow {
  id: string;
  booking_id: string;
  payer_user_id: string;
  payee_user_id: string;
  total_due_paise: number;
  status: string;
  due_at: Date | string | null;
}

async function markSettlementOverdue(settlementId: string) {
  return withTransaction(async (client) => {
    const settlementResult = await client.query<LockedSettlementRow>(
      `SELECT
         id,
         booking_id,
         payer_user_id,
         payee_user_id,
         total_due_paise,
         status,
         due_at
       FROM booking_settlements
       WHERE id = $1
       FOR UPDATE`,
      [settlementId],
    );

    if (settlementResult.rowCount === 0) {
      return { outcome: "missing" as const };
    }

    const settlement = settlementResult.rows[0];

    if (settlement.status !== "due") {
      return { outcome: "status_not_due" as const, status: settlement.status };
    }

    if (!settlement.due_at || new Date(settlement.due_at) > new Date()) {
      return { outcome: "not_due_yet" as const };
    }

    await client.query(
      `UPDATE booking_settlements
       SET status = 'overdue',
           overdue_at = COALESCE(overdue_at, now()),
           updated_at = now()
       WHERE id = $1`,
      [settlementId],
    );

    await client.query(
      `INSERT INTO outstanding_balances (
         user_id,
         settlement_id,
         booking_id,
         amount_paise,
         status,
         reason,
         metadata
       )
       VALUES ($1, $2, $3, $4, 'open', 'settlement_overdue', $5::jsonb)
       ON CONFLICT (settlement_id)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         booking_id = EXCLUDED.booking_id,
         amount_paise = EXCLUDED.amount_paise,
         status = 'open',
         reason = EXCLUDED.reason,
         metadata = EXCLUDED.metadata,
         cleared_at = NULL,
         updated_at = now()`,
      [
        settlement.payer_user_id,
        settlement.id,
        settlement.booking_id,
        settlement.total_due_paise,
        JSON.stringify({
          source: "settlement-overdue-worker",
        }),
      ],
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
       VALUES ($1, $2, NULL, 'settlement_overdue', 'due', 'overdue', 'payment_due_window_elapsed', $3::jsonb)`,
      [
        settlement.id,
        settlement.booking_id,
        JSON.stringify({
          source: "settlement-overdue-worker",
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
         ($1, 'settlement_overdue', 'in_app', 'Ride payment is overdue', 'Clear this payment before creating a new ride or booking.', $3::jsonb, 'sent', $4, now()),
         ($2, 'settlement_overdue_driver', 'in_app', 'Passenger payment is overdue', 'The passenger has not settled the completed ride within the due window.', $3::jsonb, 'sent', $5, now())
       ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
      [
        settlement.payer_user_id,
        settlement.payee_user_id,
        JSON.stringify({
          bookingId: settlement.booking_id,
          settlementId: settlement.id,
          settlementStatus: "overdue",
        }),
        `settlement_overdue:${settlement.id}:payer`,
        `settlement_overdue:${settlement.id}:payee`,
      ],
    );

    return { outcome: "overdue" as const, bookingId: settlement.booking_id };
  });
}

export function createSettlementOverdueWorker() {
  return new Worker(
    settlementOverdueQueueName,
    async (job) => {
      const { settlementId } = job.data as SettlementOverdueJobData;
      const result = await markSettlementOverdue(settlementId);

      logger.info(
        {
          jobId: job.id,
          settlementId,
          result,
        },
        "Processed settlement overdue job",
      );
    },
    {
      connection: redisConnection as any,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
}
