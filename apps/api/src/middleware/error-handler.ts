import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { env } from "../config/env";
import { AppError } from "../shared/errors/app-error";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (error instanceof ZodError) {
    req.log.warn({ issues: error.flatten() }, "Validation failed");
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    req.log.warn({ code: error.code, details: error.details }, error.message);
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  req.log.error({ error }, "Unhandled request error");

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      details: env.NODE_ENV === "development" ? String(error) : undefined,
    },
  });
};
