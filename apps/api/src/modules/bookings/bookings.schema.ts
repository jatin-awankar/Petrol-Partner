import { z } from "zod";

export const bookingStatusValues = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "expired",
] as const;

export const paymentStateValues = [
  "unpaid",
  "order_created",
  "verification_pending",
  "paid_escrow",
  "failed",
  "refund_pending",
  "refunded",
  "cancelled",
] as const;

export const bookingTransitionValues = [
  "confirmed",
  "cancelled",
  "completed",
] as const;

const uuidSchema = z.string().uuid();

export const bookingIdParamSchema = z.object({
  id: uuidSchema,
});

export const createBookingSchema = z
  .object({
    ride_offer_id: uuidSchema.optional(),
    ride_request_id: uuidSchema.optional(),
    seats_booked: z.coerce.number().int().positive().default(1),
  })
  .superRefine((value, ctx) => {
    const sourceCount = [value.ride_offer_id, value.ride_request_id].filter(Boolean).length;

    if (sourceCount !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["ride_offer_id"],
        message: "Exactly one of ride_offer_id or ride_request_id is required",
      });
    }
  });

export const listBookingsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(bookingStatusValues).optional(),
});

export const bookingActionBodySchema = z.object({
  reason: z.string().trim().min(2).max(500).optional(),
});

export const updateBookingStatusLegacySchema = z.object({
  booking_id: uuidSchema,
  new_status: z.enum(bookingTransitionValues),
  reason: z.string().trim().min(2).max(500).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
export type BookingActionBody = z.infer<typeof bookingActionBodySchema>;
export type UpdateBookingStatusLegacyInput = z.infer<typeof updateBookingStatusLegacySchema>;
