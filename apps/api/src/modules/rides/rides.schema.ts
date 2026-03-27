import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM or HH:MM:SS");
const counterpartyGenderPreferenceSchema = z.enum(["any", "female_only", "male_only"]);
const pricingAreaTypeSchema = z.enum(["metro", "urban", "rural"]);

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(5),
  pickup_lat: z.coerce.number().optional(),
  pickup_lng: z.coerce.number().optional(),
  date: dateSchema.optional(),
});

function applyPricingRefinement<T extends z.ZodObject<any>>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const hasManualPrice = value.price_per_seat !== undefined;
    const hasPricingInputs =
      value.pricing_area_type !== undefined && value.distance_km !== undefined;

    if (!hasManualPrice && !hasPricingInputs) {
      ctx.addIssue({
        code: "custom",
        path: ["price_per_seat"],
        message: "Provide price_per_seat or provide pricing_area_type with distance_km",
      });
    }
  });
}

const rideOfferSchemaFields = {
  pickup_location: z.string().trim().min(2),
  drop_location: z.string().trim().min(2),
  pickup_lat: z.coerce.number(),
  pickup_lng: z.coerce.number(),
  drop_lat: z.coerce.number(),
  drop_lng: z.coerce.number(),
  available_seats: z.coerce.number().int().positive(),
  price_per_seat: z.coerce.number().positive().optional(),
  pricing_area_type: pricingAreaTypeSchema.optional(),
  distance_km: z.coerce.number().positive().max(5000).optional(),
  date: dateSchema,
  time: timeSchema,
  vehicle_id: z.string().uuid(),
  vehicle_details: z.unknown().optional(),
  counterparty_gender_preference: counterpartyGenderPreferenceSchema.default("any"),
  notification_enabled: z.boolean().optional().default(true),
  max_detour_km: z.coerce.number().positive().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
} satisfies z.ZodRawShape;

const rideRequestSchemaFields = {
  pickup_location: z.string().trim().min(2),
  drop_location: z.string().trim().min(2),
  pickup_lat: z.coerce.number(),
  pickup_lng: z.coerce.number(),
  drop_lat: z.coerce.number(),
  drop_lng: z.coerce.number(),
  seats_required: z.coerce.number().int().positive(),
  price_per_seat: z.coerce.number().positive().optional(),
  pricing_area_type: pricingAreaTypeSchema.optional(),
  distance_km: z.coerce.number().positive().max(5000).optional(),
  date: dateSchema,
  time: timeSchema,
  counterparty_gender_preference: counterpartyGenderPreferenceSchema.default("any"),
  notification_enabled: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).optional(),
} satisfies z.ZodRawShape;

const rideOfferBaseSchema = z.object(rideOfferSchemaFields);
const rideRequestBaseSchema = z.object(rideRequestSchemaFields);

export const listRideOffersQuerySchema = paginationSchema;
export const listRideRequestsQuerySchema = paginationSchema;

export const rideIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createRideOfferSchema = applyPricingRefinement(rideOfferBaseSchema);

export const updateRideOfferSchema = applyPricingRefinement(
  rideOfferBaseSchema.partial().extend({
    status: z.enum(["active", "cancelled", "completed"]).optional(),
  }),
);

export const createRideRequestSchema = applyPricingRefinement(rideRequestBaseSchema);

export const updateRideRequestSchema = applyPricingRefinement(
  rideRequestBaseSchema.partial().extend({
    status: z.enum(["active", "matched", "cancelled", "completed"]).optional(),
  }),
);

export type CreateRideOfferInput = z.infer<typeof createRideOfferSchema>;
export type UpdateRideOfferInput = z.infer<typeof updateRideOfferSchema>;
export type CreateRideRequestInput = z.infer<typeof createRideRequestSchema>;
export type UpdateRideRequestInput = z.infer<typeof updateRideRequestSchema>;
export type ListRideOffersQuery = z.infer<typeof listRideOffersQuerySchema>;
export type ListRideRequestsQuery = z.infer<typeof listRideRequestsQuerySchema>;
