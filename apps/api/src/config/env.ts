import { config } from "dotenv";
import { z } from "zod";

config();

const booleanStringSchema = z.enum(["true", "false"]).default("false");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  TRUST_PROXY: z.string().optional(),
  APP_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_DOMAIN: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  REDIS_URL: z.string().url().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  ENABLE_CHAT: booleanStringSchema,
  ENABLE_TRACKING: booleanStringSchema,
  ENABLE_MATCH_REFRESH_PROCESSOR: booleanStringSchema.default("true"),
  MATCH_REFRESH_PROCESSOR_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PAYMENT_WINDOW_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  RATE_LIMIT_PAYMENT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WEBHOOK_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().positive().default(180),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid API environment configuration: ${parsed.error.message}`);
}

if (parsed.data.NODE_ENV === "production" && !parsed.data.REDIS_URL) {
  throw new Error("Invalid API environment configuration: REDIS_URL is required in production");
}

export const env = {
  ...parsed.data,
  ENABLE_CHAT: parsed.data.ENABLE_CHAT === "true",
  ENABLE_TRACKING: parsed.data.ENABLE_TRACKING === "true",
  ENABLE_MATCH_REFRESH_PROCESSOR: parsed.data.ENABLE_MATCH_REFRESH_PROCESSOR === "true",
};
export const isProduction = env.NODE_ENV === "production";
