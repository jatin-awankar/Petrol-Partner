import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { errorHandler } from "./middleware/error-handler";
import { optionalAuth } from "./middleware/auth";
import { notFoundHandler } from "./middleware/not-found";
import { requestContext } from "./middleware/request-context";
import { apiRouter } from "./modules";

function parseTrustProxySetting(value?: string) {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase().trim();

  if (["false", "0", "off", "no"].includes(normalized)) {
    return false;
  }

  if (["true", "1", "on", "yes"].includes(normalized)) {
    return true;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  return normalized;
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", parseTrustProxySetting(env.TRUST_PROXY));
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use("/v1/webhooks/razorpay", express.raw({ type: "*/*", limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestContext);
  app.use(optionalAuth);

  app.get("/", (_req, res) => {
    res.json({
      service: "petrol-partner-api",
      environment: env.NODE_ENV,
      docs_hint: "Use /v1/health and /v1/auth/* while the rest of the modules are scaffolded.",
    });
  });

  app.use("/v1", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info(
    {
      environment: env.NODE_ENV,
      appOrigin: env.APP_ORIGIN,
      trustProxy: app.get("trust proxy"),
    },
    "Express API app configured",
  );

  return app;
}
