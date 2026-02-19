import { NextResponse } from "next/server";
import crypto from "crypto";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

function isWebhookSignatureValid(body: string, signature: string | null) {
  if (!signature || !process.env.RAZORPAY_WEBHOOK_SECRET) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!isWebhookSignatureValid(body, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const event = JSON.parse(body);

  if (event.event === "payment.captured") {
    const payment = event.payload.payment.entity;

    await pool.query(
      `UPDATE bookings
       SET payment_status = 'paid_escrow',
           razorpay_payment_id = $1,
           paid_at = COALESCE(paid_at, now()),
           updated_at = now()
       WHERE razorpay_order_id = $2`,
      [payment.id, payment.order_id],
    );
  }

  if (event.event === "payment.failed") {
    const payment = event.payload.payment.entity;

    await pool.query(
      `UPDATE bookings
       SET payment_status = 'payment_failed',
           updated_at = now()
       WHERE razorpay_order_id = $1`,
      [payment.order_id],
    );
  }

  return NextResponse.json({ status: "ok" });
}
