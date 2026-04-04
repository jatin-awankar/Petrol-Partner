import { Worker } from "bullmq";

import { env } from "../config/env";
import { withTransaction } from "../db/pool";
import { logger } from "../config/logger";
import { bookingExpiryQueueName, redisConnection } from "../queues";

interface BookingExpiryJobData {
  bookingId: string;
}

interface LockedBookingRow {
  id: string;
  ride_offer_id: string | null;
  ride_request_id: string | null;
  status: string;
  payment_state: string;
  seats_booked: number;
  expires_at: Date | string | null;
}

async function expireBooking(bookingId: string) {
  return withTransaction(async (client) => {
    const bookingResult = await client.query<LockedBookingRow>(
      `SELECT
         id,
         ride_offer_id,
         ride_request_id,
         status,
         payment_state,
         seats_booked,
         expires_at
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId],
    );

    if (bookingResult.rowCount === 0) {
      return { outcome: "missing" as const };
    }

    const booking = bookingResult.rows[0];

    if (booking.status !== "pending") {
      return { outcome: "already_terminal" as const, status: booking.status };
    }

    if (booking.payment_state === "paid_escrow") {
      return { outcome: "already_paid" as const };
    }

    if (!booking.expires_at || new Date(booking.expires_at) > new Date()) {
      return { outcome: "not_due" as const };
    }

    if (booking.ride_offer_id) {
      await client.query("SELECT id FROM ride_offers WHERE id = $1 FOR UPDATE", [booking.ride_offer_id]);
      await client.query(
        `UPDATE ride_offers
         SET available_seats = available_seats + $1,
             updated_at = now()
         WHERE id = $2`,
        [booking.seats_booked, booking.ride_offer_id],
      );
    }

    if (booking.ride_request_id) {
      await client.query("SELECT id FROM ride_requests WHERE id = $1 FOR UPDATE", [booking.ride_request_id]);
      await client.query(
        `UPDATE ride_requests
         SET seats_required = seats_required + $1,
             status = CASE
               WHEN status IN ('cancelled', 'completed') THEN status
               WHEN seats_required + $1 <= 0 THEN 'matched'
               ELSE 'active'
             END,
             updated_at = now()
         WHERE id = $2`,
        [booking.seats_booked, booking.ride_request_id],
      );
    }

    await client.query(
      `UPDATE bookings
       SET status = 'expired',
           payment_state = CASE
             WHEN payment_state IN ('unpaid', 'order_created', 'verification_pending', 'failed', 'cancelled')
               THEN 'cancelled'
             ELSE payment_state
           END,
           expires_at = null,
           expired_at = now(),
           updated_at = now(),
           version = version + 1
       WHERE id = $1`,
      [bookingId],
    );

    await client.query(
      `INSERT INTO booking_status_events (
         booking_id,
         from_status,
         to_status,
         actor_user_id,
         reason,
         metadata
       )
       VALUES ($1, $2, 'expired', NULL, 'payment_window_elapsed', $3::jsonb)`,
      [
        bookingId,
        booking.status,
        JSON.stringify({
          source: "booking-expiry-worker",
          previousPaymentState: booking.payment_state,
        }),
      ],
    );

    await client.query(
      `UPDATE chat_rooms
       SET status = 'locked',
           locked_at = COALESCE(locked_at, now()),
           delete_after = COALESCE(delete_after, now() + interval '7 days'),
           updated_at = now()
       WHERE booking_id = $1`,
      [bookingId],
    );

    return { outcome: "expired" as const };
  });
}

export function createBookingExpiryWorker() {
  return new Worker(
    bookingExpiryQueueName,
    async (job) => {
      const { bookingId } = job.data as BookingExpiryJobData;
      const result = await expireBooking(bookingId);

      logger.info(
        {
          jobId: job.id,
          bookingId,
          result,
        },
        "Processed booking expiry job",
      );
    },
    {
      connection: redisConnection as any,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
}
