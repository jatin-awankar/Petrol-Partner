import { z } from "zod";

const uuidSchema = z.string().uuid();

export const paymentBookingIdParamSchema = z.object({
  bookingId: uuidSchema,
});

export const createPaymentOrderSchema = z.object({
  bookingId: uuidSchema,
});

export const clientVerifyPaymentSchema = z
  .object({
    bookingId: uuidSchema.optional(),
    booking_id: uuidSchema.optional(),
    providerOrderId: z.string().trim().min(6).optional(),
    providerPaymentId: z.string().trim().min(6).optional(),
    providerSignature: z.string().trim().min(10).optional(),
    razorpay_order_id: z.string().trim().min(6).optional(),
    razorpay_payment_id: z.string().trim().min(6).optional(),
    razorpay_signature: z.string().trim().min(10).optional(),
  })
  .transform((input) => ({
    bookingId: input.bookingId ?? input.booking_id,
    providerOrderId: input.providerOrderId ?? input.razorpay_order_id,
    providerPaymentId: input.providerPaymentId ?? input.razorpay_payment_id,
    providerSignature: input.providerSignature ?? input.razorpay_signature,
  }))
  .refine(
    (input) =>
      Boolean(
        input.bookingId &&
          input.providerOrderId &&
          input.providerPaymentId &&
          input.providerSignature,
      ),
    {
      message:
        "bookingId/providerOrderId/providerPaymentId/providerSignature are required",
    },
  );

export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;
export type ClientVerifyPaymentInput = z.infer<typeof clientVerifyPaymentSchema>;
