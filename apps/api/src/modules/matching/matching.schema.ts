import { z } from "zod";

export const matchRideIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const candidateQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(25).default(10),
  max_pickup_distance_km: z.coerce.number().positive().max(50).default(5),
  max_drop_distance_km: z.coerce.number().positive().max(100).default(10),
  max_time_gap_minutes: z.coerce.number().int().positive().max(720).default(90),
  min_score: z.coerce.number().min(0).max(100).default(10),
});

export const storedMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["open", "notified", "dismissed", "converted", "expired"]).optional(),
});

export type CandidateQuery = z.infer<typeof candidateQuerySchema>;
export type StoredMatchesQuery = z.infer<typeof storedMatchesQuerySchema>;
