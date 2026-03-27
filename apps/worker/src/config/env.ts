import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  MAINTENANCE_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid worker environment configuration: ${parsed.error.message}`);
}

if (
  parsed.data.NODE_ENV === "production" &&
  (!parsed.data.RAZORPAY_KEY_ID || !parsed.data.RAZORPAY_KEY_SECRET)
) {
  throw new Error(
    "Invalid worker environment configuration: Razorpay credentials are required in production",
  );
}

export const env = parsed.data;
