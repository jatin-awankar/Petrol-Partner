import crypto from "crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";

function isValidSignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error("Razorpay secret is not configured");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(req: Request) {
  const client = await pool.connect();

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const bookingId = body.booking_id || body.bookingId;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "booking_id, razorpay_order_id, razorpay_payment_id and razorpay_signature are required" },
        { status: 400 },
      );
    }

    if (!isValidSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
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

    if (booking.razorpay_order_id && booking.razorpay_order_id !== razorpay_order_id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Order does not belong to this booking" },
        { status: 400 },
      );
    }

    if (booking.payment_status === "paid_escrow") {
      await client.query("COMMIT");
      return NextResponse.json({ success: true, booking_id: booking.id });
    }

    await client.query(
      `UPDATE bookings
       SET payment_status = 'paid_escrow',
           razorpay_order_id = $1,
           razorpay_payment_id = $2,
           paid_at = NOW(),
           updated_at = now()
       WHERE id = $3`,
      [razorpay_order_id, razorpay_payment_id, booking.id],
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      booking_id: booking.id,
      payment_status: "paid_escrow",
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Payment verification error:", error);

    const message =
      error?.code === "42703"
        ? "Missing payment columns on bookings table. Add payment_status, razorpay_order_id, razorpay_payment_id, paid_at."
        : error?.message || "Verification failed";

    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
