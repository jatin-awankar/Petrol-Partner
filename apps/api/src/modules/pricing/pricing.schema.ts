import { z } from "zod";

const pricingAreaTypeSchema = z.enum(["metro", "urban", "rural"]);
const vehicleTypeSchema = z.enum(["bike", "car", "suv", "scooter", "van", "other"]);

const dateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime({ local: true }));

export const rateCardIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listRateCardsQuerySchema = z.object({
  area_type: pricingAreaTypeSchema.optional(),
  vehicle_type: vehicleTypeSchema.optional(),
  active_only: z.coerce.boolean().default(true),
});

export const createFareQuoteSchema = z.object({
  area_type: pricingAreaTypeSchema,
  distance_km: z.coerce.number().positive().max(5000),
  seats: z.coerce.number().int().positive().max(12).default(1),
  vehicle_type: vehicleTypeSchema.optional(),
});

const rateCardBaseSchema = z.object({
  slug: z.string().trim().min(3).max(100).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(3).max(120),
  area_type: pricingAreaTypeSchema,
  vehicle_type: vehicleTypeSchema.nullish(),
  base_fare_paise: z.coerce.number().int().min(0).default(0),
  per_km_paise: z.coerce.number().int().min(0),
  minimum_fare_paise: z.coerce.number().int().min(0),
  platform_fee_fixed_paise: z.coerce.number().int().min(0).default(0),
  platform_fee_bps: z.coerce.number().int().min(0).max(10000).default(0),
  is_active: z.boolean().default(true),
  effective_from: dateTimeSchema.optional(),
  effective_until: z.union([dateTimeSchema, z.null()]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createRateCardSchema = rateCardBaseSchema;

export const updateRateCardSchema = rateCardBaseSchema.partial();

export type ListRateCardsQuery = z.infer<typeof listRateCardsQuerySchema>;
export type CreateFareQuoteInput = z.infer<typeof createFareQuoteSchema>;
export type CreateRateCardInput = z.infer<typeof createRateCardSchema>;
export type UpdateRateCardInput = z.infer<typeof updateRateCardSchema>;
