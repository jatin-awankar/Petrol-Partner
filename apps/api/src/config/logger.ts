import pino from "pino";

import { env } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "petrol-partner-api",
  },
});
