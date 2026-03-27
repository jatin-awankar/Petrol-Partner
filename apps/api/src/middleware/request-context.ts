import { randomUUID } from "crypto";
import type { RequestHandler } from "express";

import { logger } from "../config/logger";

export const requestContext: RequestHandler = (req, res, next) => {
  const requestId = req.headers["x-request-id"];
  const normalizedRequestId =
    typeof requestId === "string" && requestId.trim().length > 0
      ? requestId
      : randomUUID();

  req.requestId = normalizedRequestId;
  req.log = logger.child({ requestId: normalizedRequestId });

  res.setHeader("x-request-id", normalizedRequestId);

  const startedAt = Date.now();

  res.on("finish", () => {
    req.log.info(
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      "HTTP request completed",
    );
  });

  next();
};
