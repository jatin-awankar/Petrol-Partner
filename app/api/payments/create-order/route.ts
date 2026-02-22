import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getRazorpayInstance } from "@/lib/razorpay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const client = await pool.connect();

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const bookingId = body.booking_id || body.bookingId;

    if (!bookingId) {
      return NextResponse.json({ error: "booking_id is required" }, { status: 400 });
    }

    await client.query("BEGIN");

    const bookingRes = await client.query(
      `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId],
    );

    if (bookingRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const booking = bookingRes.rows[0];

    if (booking.passenger_id !== userId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (booking.status === "cancelled" || booking.status === "completed") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Cannot create payment order for this booking status" },
        { status: 409 },
      );
    }

    if (booking.payment_status === "paid_escrow") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Booking already paid" }, { status: 409 });
    }

    if (
      booking.razorpay_order_id &&
      (booking.payment_status === "order_created" ||
        booking.payment_status === "payment_pending")
    ) {
      await client.query("COMMIT");
      return NextResponse.json({
        key_id: process.env.RAZORPAY_KEY_ID,
        order_id: booking.razorpay_order_id,
        amount: Math.round(Number(booking.total_price) * 100),
        currency: "INR",
        booking_id: booking.id,
      });
    }

    const amountInPaise = Math.round(Number(booking.total_price) * 100);
    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Invalid booking amount" }, { status: 400 });
    }

    const razorpay = getRazorpayInstance();
    const compactBookingId = String(bookingId).replace(/-/g, "").slice(0, 20);
    const receipt = `bk_${compactBookingId}_${Date.now().toString().slice(-10)}`.slice(0, 40);
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        booking_id: String(bookingId),
        passenger_id: String(userId),
      },
    });

    await client.query(
      `UPDATE bookings
       SET razorpay_order_id = $1,
           payment_status = 'order_created',
           updated_at = now()
       WHERE id = $2`,
      [order.id, bookingId],
    );

    await client.query("COMMIT");

    return NextResponse.json({
      key_id: process.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      booking_id: booking.id,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Create order error:", error);

    const message =
      error?.code === "42703"
        ? "Missing payment columns on bookings table. Add payment_status, razorpay_order_id, razorpay_payment_id, paid_at."
        : error?.message || "Payment initialization failed";

    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
