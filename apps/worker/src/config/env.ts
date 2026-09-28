import { config } from "dotenv";
import { assertSafeAutomatedDatabase } from "@petrol-partner/runtime-config";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  // Retained for historical modules; the pilot worker does not start them.
  REDIS_URL: z.string().url().optional(),
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

assertSafeAutomatedDatabase({
  databaseUrl: parsed.data.DATABASE_URL,
  nodeEnv: parsed.data.NODE_ENV,
  ci: process.env.CI === "true",
  disposableDatabaseAcknowledged: process.env.TEST_DATABASE_DISPOSABLE === "true",
});

export const env = parsed.data;
