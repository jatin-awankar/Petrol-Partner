import crypto from "crypto";

import Razorpay from "razorpay";

import { env } from "../../config/env";
import { AppError } from "../errors/app-error";

let razorpayClient: Razorpay | null = null;

function ensureRazorpayConfigured() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError(
      503,
      "Razorpay is not configured for this environment",
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
    );
  }
}

function timingSafeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function getRazorpayClient() {
  ensureRazorpayConfigured();

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID!,
      key_secret: env.RAZORPAY_KEY_SECRET!,
    });
  }

  return razorpayClient;
}

export function verifyRazorpayCheckoutSignature(input: {
  providerOrderId: string;
  providerPaymentId: string;
  providerSignature: string;
}) {
  ensureRazorpayConfigured();

  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
    .update(`${input.providerOrderId}|${input.providerPaymentId}`)
    .digest("hex");

  return timingSafeEqualHex(expected, input.providerSignature);
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature?: string | null) {
  if (!signature || !env.RAZORPAY_WEBHOOK_SECRET) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return timingSafeEqualHex(expected, signature);
}

export function computePayloadHash(rawBody: string) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}
