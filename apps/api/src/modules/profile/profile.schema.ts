import { z } from "zod";

const optionalNullableText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  });

export const updateProfileSchema = z.object({
  full_name: optionalNullableText
    .pipe(z.union([z.string().min(2).max(120), z.null(), z.undefined()]))
    .optional(),
  phone: optionalNullableText
    .pipe(z.union([z.string().min(8).max(20), z.null(), z.undefined()]))
    .optional(),
  college: optionalNullableText
    .pipe(z.union([z.string().min(2).max(120), z.null(), z.undefined()]))
    .optional(),
  avatar_url: optionalNullableText
    .pipe(
      z.union([
        z
          .string()
          .refine(
            (value) =>
              /^https?:\/\//i.test(value) ||
              /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value),
            "avatar_url must be an http(s) URL or a data URL",
          )
          .max(4_000_000),
        z.null(),
        z.undefined(),
      ]),
    )
    .optional(),
  date_of_birth: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      if (value === null) {
        return null;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      return trimmed;
    })
    .pipe(
      z
        .union([
          z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "date_of_birth must be in YYYY-MM-DD format"),
          z.null(),
          z.undefined(),
        ])
        .optional(),
    ),
  gender_for_matching: z.enum(["female", "male"]).nullable().optional(),
  emergency_contact_name: optionalNullableText
    .pipe(z.union([z.string().min(2).max(120), z.null(), z.undefined()]))
    .optional(),
  emergency_contact_phone: optionalNullableText
    .pipe(z.union([z.string().min(8).max(20), z.null(), z.undefined()]))
    .optional(),
  address: optionalNullableText
    .pipe(z.union([z.string().min(4).max(500), z.null(), z.undefined()]))
    .optional(),
});

const booleanRecordSchema = z.record(z.string(), z.boolean());
const trustedContactSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  relationship: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(255).optional(),
});

export const updatePreferencesSchema = z.object({
  musicPreference: z.string().trim().min(1).max(64).optional(),
  smokingPolicy: z.string().trim().min(1).max(64).optional(),
  chattiness: z.string().trim().min(1).max(64).optional(),
  notifications: booleanRecordSchema.optional(),
  privacy: booleanRecordSchema.optional(),
  autoAccept: booleanRecordSchema.optional(),
});

export const updateSafetySchema = z.object({
  trustedContacts: z.array(trustedContactSchema).max(10).optional(),
  settings: booleanRecordSchema.optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type UpdateSafetyInput = z.infer<typeof updateSafetySchema>;
