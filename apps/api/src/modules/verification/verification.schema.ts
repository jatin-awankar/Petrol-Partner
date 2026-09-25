import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const vehicleIdParamSchema = z.object({
  id: z.uuid(),
});

export const adminReviewUserParamSchema = z.object({
  userId: z.uuid(),
});

export const evidencePurposeSchema = z.object({ purpose: z.enum(["enrollment", "age"]) });

export const pendingVerificationReviewsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const upsertStudentVerificationSchema = z
  .strictObject({
    provider: z.enum(["digilocker", "abc_id", "manual_review"]),
    enrolled_name: z.string().trim().min(2).max(150),
    evidence_category: z.enum(["enrollment_letter", "student_card", "college_email", "other_enrollment"]),
    age_evidence_category: z.enum(["redacted_government_id", "redacted_birth_certificate", "institution_age_record", "other_age_record"]),
    institution_name: z.string().trim().min(2).max(255),
    program_name: z.string().trim().max(255).optional(),
    admission_year: z.coerce.number().int().min(2000).max(2100),
    graduation_year: z.coerce.number().int().min(2000).max(2100),
    // A date of birth and identity number must never enter the normal database.
  })
  .refine((value) => value.graduation_year >= value.admission_year, {
    path: ["graduation_year"],
    message: "Graduation year must be greater than or equal to admission year",
  });

export const upsertDriverEligibilitySchema = z.object({
  license_number_last4: z.string().trim().min(4).max(4),
  license_expires_at: dateSchema,
  insurance_expires_at: dateSchema.optional(),
  puc_expires_at: dateSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const vehicleBaseSchema = z.object({
  vehicle_type: z.enum(["bike", "car", "suv", "scooter", "van", "other"]),
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  color: z.string().trim().max(50).optional(),
  registration_number_last4: z.string().trim().min(4).max(4),
  seat_capacity: z.coerce.number().int().positive().max(12),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createVehicleSchema = vehicleBaseSchema;

export const updateVehicleSchema = vehicleBaseSchema.partial();

export const reviewStudentVerificationSchema = z.object({
  outcome: z.enum(["verified", "rejected"]),
  adult_eligible: z.boolean(),
  reason: z.string().trim().min(8).max(1000),
}).refine((value) => value.outcome !== "verified" || value.adult_eligible, {
  path: ["adult_eligible"], message: "Adult eligibility is required for approval",
});

export const reviewDriverEligibilitySchema = z.object({
  outcome: z.enum(["approved", "rejected", "suspended"]),
  reason: z.string().trim().max(1000).optional(),
});

export const reviewVehicleSchema = z.object({
  outcome: z.enum(["approved", "rejected", "suspended"]),
  reason: z.string().trim().max(1000).optional(),
});

export type UpsertStudentVerificationInput = z.infer<typeof upsertStudentVerificationSchema>;
export type UpsertDriverEligibilityInput = z.infer<typeof upsertDriverEligibilitySchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type PendingVerificationReviewsQuery = z.infer<typeof pendingVerificationReviewsQuerySchema>;
export type ReviewStudentVerificationInput = z.infer<typeof reviewStudentVerificationSchema>;
export type ReviewDriverEligibilityInput = z.infer<typeof reviewDriverEligibilitySchema>;
export type ReviewVehicleInput = z.infer<typeof reviewVehicleSchema>;
