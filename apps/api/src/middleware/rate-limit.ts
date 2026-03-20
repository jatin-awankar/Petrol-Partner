import type { RequestHandler } from "express";

interface RateLimitState {
  count: number;
  resetAt: number;
}

interface CreateRateLimitInput {
  name: string;
  windowMs: number;
  max: number;
}

const rateLimitStore = new Map<string, RateLimitState>();

function getClientKey(ip: string | undefined, requestId: string, name: string) {
  return `${name}:${ip ?? requestId}`;
}

export function createRateLimitMiddleware(input: CreateRateLimitInput): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = getClientKey(req.ip, req.requestId, input.name);
    const current = rateLimitStore.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + input.windowMs,
      });
      return next();
    }

    current.count += 1;
    rateLimitStore.set(key, current);

    if (current.count <= input.max) {
      return next();
    }

    const retryAfterSeconds = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
    res.setHeader("Retry-After", String(retryAfterSeconds));

    req.log.warn(
      {
        limiter: input.name,
        ip: req.ip,
        max: input.max,
        windowMs: input.windowMs,
      },
      "Rate limit exceeded",
    );

    res.status(429).json({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please retry later.",
        details: {
          limiter: input.name,
          retry_after_seconds: retryAfterSeconds,
        },
      },
    });
  };
}
