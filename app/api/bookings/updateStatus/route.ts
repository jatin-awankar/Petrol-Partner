import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function PATCH(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { booking_id, new_status } = body;

    if (!booking_id || !["pending", "confirmed", "cancelled", "completed"].includes(new_status)) {
      return NextResponse.json({ error: "Invalid booking ID or status" }, { status: 400 });
    }

    const bookingRes = await query(
      "SELECT driver_id, passenger_id, status, ride_offer_id, ride_request_id, seats_booked, total_price, payment_status FROM bookings WHERE id = $1",
      [booking_id],
    );

    if (bookingRes.rowCount === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const booking = bookingRes.rows[0];

    if (booking.driver_id !== userId && booking.passenger_id !== userId) {
      return NextResponse.json({ error: "Not authorized to update this booking" }, { status: 403 });
    }

    if (booking.status === "completed" || booking.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot change a completed or cancelled booking" },
        { status: 400 },
      );
    }

    await query("UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2", [new_status, booking_id]);

    // Optional payment status alignment for installations with payment columns.
    if (new_status === "cancelled") {
      try {
        await query(
          `UPDATE bookings
           SET payment_status = CASE
             WHEN payment_status = 'paid_escrow' THEN 'refund_pending'
             WHEN payment_status IN ('order_created', 'payment_failed', 'pending', 'payment_pending') THEN 'cancelled'
             ELSE payment_status
           END,
           updated_at = now()
           WHERE id = $1`,
          [booking_id],
        );
      } catch (paymentStatusError: any) {
        if (paymentStatusError?.code !== "42703") {
          throw paymentStatusError;
        }
      }
    }

    if (new_status === "confirmed") {
      const existingChat = await query("SELECT id FROM chat_rooms WHERE booking_id = $1", [booking_id]);

      if (existingChat.rowCount === 0) {
        await query(
          `INSERT INTO chat_rooms (booking_id, driver_id, passenger_id, created_at)
           VALUES ($1, $2, $3, now())`,
          [booking_id, booking.driver_id, booking.passenger_id],
        );
      }
    }

    if (new_status === "cancelled") {
      if (booking.ride_offer_id) {
        await query(
          "UPDATE ride_offers SET available_seats = available_seats + $1 WHERE id = $2",
          [booking.seats_booked, booking.ride_offer_id],
        );
      }

      if (booking.ride_request_id) {
        await query(
          "UPDATE ride_requests SET seats_required = seats_required + $1 WHERE id = $2",
          [booking.seats_booked, booking.ride_request_id],
        );
      }
    }

    if (new_status === "completed" || new_status === "cancelled") {
      await query("UPDATE chat_rooms SET is_archived = true WHERE booking_id = $1", [booking_id]);
    }

    // Create payout row for paid bookings when ride completes.
    if (new_status === "completed" && booking.payment_status === "paid_escrow") {
      const amountInPaise = Math.round(Number(booking.total_price || 0) * 100);
      if (amountInPaise > 0) {
        await query(
          `INSERT INTO payouts (booking_id, driver_id, amount, status, created_at)
           SELECT $1, $2, $3, 'pending', now()
           WHERE NOT EXISTS (SELECT 1 FROM payouts WHERE booking_id = $1)`,
          [booking_id, booking.driver_id, amountInPaise],
        );
      }
    }

    return NextResponse.json({ message: "Booking status updated successfully", new_status });
  } catch (error: any) {
    console.error("Update booking status error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
