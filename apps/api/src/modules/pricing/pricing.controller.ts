import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  createFareQuoteSchema,
  createRateCardSchema,
  listRateCardsQuerySchema,
  rateCardIdParamSchema,
  updateRateCardSchema,
} from "./pricing.schema";
import * as pricingService from "./pricing.service";

function requireUserId(req: Request) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return req.user.userId;
}

export async function listRateCards(req: Request, res: Response) {
  const query = listRateCardsQuerySchema.parse(req.query);
  const result = await pricingService.listRateCards(query);
  res.status(200).json(result);
}

export async function createQuote(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = createFareQuoteSchema.parse(req.body);
  const quote = await pricingService.createFareQuote(userId, input);
  res.status(201).json({ quote });
}

export async function createRateCard(req: Request, res: Response) {
  const input = createRateCardSchema.parse(req.body);
  const rateCard = await pricingService.createRateCard(input);
  res.status(201).json({
    message: "Rate card created successfully",
    rate_card: rateCard,
  });
}

export async function updateRateCard(req: Request, res: Response) {
  const { id } = rateCardIdParamSchema.parse(req.params);
  const input = updateRateCardSchema.parse(req.body);
  const rateCard = await pricingService.updateRateCard(id, input);
  res.status(200).json({
    message: "Rate card updated successfully",
    rate_card: rateCard,
  });
}
