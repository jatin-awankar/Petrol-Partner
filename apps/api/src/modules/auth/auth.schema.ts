import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20).optional(),
  college: z.string().trim().min(2).max(120).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
