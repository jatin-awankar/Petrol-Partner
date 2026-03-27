import type { CorsOptions } from "cors";

import { env } from "./env";

export const corsOptions: CorsOptions = {
  origin: env.APP_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
};
