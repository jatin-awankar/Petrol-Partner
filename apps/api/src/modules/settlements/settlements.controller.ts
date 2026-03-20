import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  confirmOfflineReceiptSchema,
  createSettlementDisputeSchema,
  listSettlementsQuerySchema,
  passengerMarkedPaidSchema,
  resolveSettlementDisputeSchema,
  settlementBookingIdParamSchema,
} from "./settlements.schema";
import * as settlementsService from "./settlements.service";

function requireUser(req: Request) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return req.user;
}

export async function listSettlements(req: Request, res: Response) {
  const user = requireUser(req);
  const query = listSettlementsQuerySchema.parse(req.query);
  const result = await settlementsService.listSettlements(user.userId, query);
  res.status(200).json({
    settlements: result.settlements,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      count: result.settlements.length,
      total: result.totalCount,
    },
  });
}

export async function getSettlementByBookingId(req: Request, res: Response) {
  const user = requireUser(req);
  const { bookingId } = settlementBookingIdParamSchema.parse(req.params);
  const settlement = await settlementsService.getSettlementByBookingId(user.userId, bookingId);
  res.status(200).json({ settlement });
}

export async function getFinancialHoldStatus(req: Request, res: Response) {
  const user = requireUser(req);
  const status = await settlementsService.getFinancialHoldStatus(user.userId);
  res.status(200).json(status);
}

export async function markPassengerPaid(req: Request, res: Response) {
  const user = requireUser(req);
  const { bookingId } = settlementBookingIdParamSchema.parse(req.params);
  const input = passengerMarkedPaidSchema.parse(req.body);
  const settlement = await settlementsService.markPassengerPaid(bookingId, user.userId, input);
  res.status(200).json({
    message: "Settlement marked as paid by passenger",
    settlement,
  });
}

export async function confirmOfflineReceipt(req: Request, res: Response) {
  const user = requireUser(req);
  const { bookingId } = settlementBookingIdParamSchema.parse(req.params);
  const input = confirmOfflineReceiptSchema.parse(req.body);
  const settlement = await settlementsService.confirmOfflineReceipt(bookingId, user.userId, input);
  res.status(200).json({
    message: "Offline payment confirmed successfully",
    settlement,
  });
}

export async function createDispute(req: Request, res: Response) {
  const user = requireUser(req);
  const { bookingId } = settlementBookingIdParamSchema.parse(req.params);
  const input = createSettlementDisputeSchema.parse(req.body);
  const settlement = await settlementsService.createDispute(bookingId, user.userId, input);
  res.status(200).json({
    message: "Settlement dispute created successfully",
    settlement,
  });
}

export async function resolveDispute(req: Request, res: Response) {
  const user = requireUser(req);
  const { bookingId } = settlementBookingIdParamSchema.parse(req.params);
  const input = resolveSettlementDisputeSchema.parse(req.body);
  const settlement = await settlementsService.resolveDispute(bookingId, user.userId, input);
  res.status(200).json({
    message: "Settlement dispute resolved successfully",
    settlement,
  });
}
