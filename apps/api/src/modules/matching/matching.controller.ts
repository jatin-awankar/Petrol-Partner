import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  candidateQuerySchema,
  matchRideIdParamSchema,
  storedMatchesQuerySchema,
} from "./matching.schema";
import * as matchingService from "./matching.service";

function requireUserId(req: Request) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return req.user.userId;
}

export async function listMyMatches(req: Request, res: Response) {
  const userId = requireUserId(req);
  const query = storedMatchesQuerySchema.parse(req.query);
  const result = await matchingService.listStoredMatches(userId, query);
  res.status(200).json(result);
}

export async function listOfferCandidates(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { id } = matchRideIdParamSchema.parse(req.params);
  const query = candidateQuerySchema.parse(req.query);
  const matches = await matchingService.listOfferCandidates(userId, id, query);
  res.status(200).json({ matches });
}

export async function listRequestCandidates(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { id } = matchRideIdParamSchema.parse(req.params);
  const query = candidateQuerySchema.parse(req.query);
  const matches = await matchingService.listRequestCandidates(userId, id, query);
  res.status(200).json({ matches });
}

export async function refreshMatches(req: Request, res: Response) {
  const userId = requireUserId(req);
  const summary = await matchingService.refreshMatchesForUser(userId);
  res.status(200).json({
    message: "Matches refreshed successfully",
    summary,
  });
}
