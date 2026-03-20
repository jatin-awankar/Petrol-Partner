import { z } from "zod";

export const settlementStatusValues = [
  "not_due",
  "due",
  "passenger_marked_paid",
  "settled",
  "overdue",
  "disputed",
  "waived",
] as const;

export const settlementBookingIdParamSchema = z.object({
  bookingId: z.string().uuid(),
});

export const listSettlementsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(settlementStatusValues).optional(),
});

export const passengerMarkedPaidSchema = z.object({
  payment_method: z.enum(["cash", "upi", "online"]),
  note: z.string().trim().min(2).max(500).optional(),
});

export const confirmOfflineReceiptSchema = z.object({
  payment_method: z.enum(["cash", "upi"]).optional(),
  note: z.string().trim().min(2).max(500).optional(),
});

export const createSettlementDisputeSchema = z.object({
  reason: z.string().trim().min(4).max(1000),
});

export const resolveSettlementDisputeSchema = z.object({
  outcome: z.enum(["settled", "waived", "reopen_due"]),
  reason: z.string().trim().min(4).max(1000).optional(),
});

export type ListSettlementsQuery = z.infer<typeof listSettlementsQuerySchema>;
export type PassengerMarkedPaidInput = z.infer<typeof passengerMarkedPaidSchema>;
export type ConfirmOfflineReceiptInput = z.infer<typeof confirmOfflineReceiptSchema>;
export type CreateSettlementDisputeInput = z.infer<typeof createSettlementDisputeSchema>;
export type ResolveSettlementDisputeInput = z.infer<typeof resolveSettlementDisputeSchema>;
