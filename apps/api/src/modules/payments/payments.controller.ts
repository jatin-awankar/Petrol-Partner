import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  clientVerifyPaymentSchema,
  createPaymentOrderSchema,
  paymentBookingIdParamSchema,
} from "./payments.schema";
import * as paymentsService from "./payments.service";

function requireUserId(req: Request) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return req.user.userId;
}

export async function createOrder(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = createPaymentOrderSchema.parse(req.body);
  const order = await paymentsService.createPaymentOrder(userId, input);
  res.status(201).json(order);
}

export async function clientVerify(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = clientVerifyPaymentSchema.parse(req.body);
  const result = await paymentsService.clientVerifyPayment(userId, input);
  res.status(202).json(result);
}

export async function getBookingPaymentStatus(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { bookingId } = paymentBookingIdParamSchema.parse(req.params);
  const status = await paymentsService.getPaymentStatus(userId, bookingId);
  res.status(200).json(status);
}
