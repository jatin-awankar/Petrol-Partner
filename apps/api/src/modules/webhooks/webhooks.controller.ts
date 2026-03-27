import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import * as paymentsService from "../payments/payments.service";

function readRawBody(req: Request) {
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }

  if (typeof req.body === "string") {
    return req.body;
  }

  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }

  throw new AppError(400, "Webhook request body is empty", "EMPTY_WEBHOOK_BODY");
}

export async function handleRazorpayWebhook(req: Request, res: Response) {
  const signatureHeader = req.headers["x-razorpay-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const result = await paymentsService.ingestRazorpayWebhook(readRawBody(req), signature ?? null);
  res.status(202).json(result);
}
