import { z } from "zod";

export const corridorOfferInput = z.strictObject({
  vehicle_id: z.uuid(),
  origin_code: z.string().min(1).max(40),
  destination_code: z.string().min(1).max(40),
  departure_at: z.iso.datetime({ offset: true }),
  capacity: z.number().int().min(1).max(12),
});
export const corridorOfferUpdate = corridorOfferInput.extend({ version: z.number().int().positive() });
export const corridorOfferSearch = z.strictObject({
  origin_code: z.string().min(1).max(40),
  destination_code: z.string().min(1).max(40),
  date: z.iso.date().optional(),
});
export type CorridorOfferInput = z.infer<typeof corridorOfferInput>;
