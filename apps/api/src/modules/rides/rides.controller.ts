import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  createRideOfferSchema,
  createRideRequestSchema,
  listRideOffersQuerySchema,
  listRideRequestsQuerySchema,
  rideIdParamSchema,
  updateRideOfferSchema,
  updateRideRequestSchema,
} from "./rides.schema";
import * as ridesService from "./rides.service";

export async function createOffer(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  const input = createRideOfferSchema.parse(req.body);
  const rideOffer = await ridesService.createRideOffer(req.user.userId, input);

  res.status(201).json({
    ride_offer: rideOffer,
  });
}

export async function listOffers(req: Request, res: Response) {
  const query = listRideOffersQuerySchema.parse(req.query);
  const result = await ridesService.listRideOffers(query);
  res.status(200).json(result);
}

export async function getOfferById(req: Request, res: Response) {
  const { id } = rideIdParamSchema.parse(req.params);
  const ride = await ridesService.getRideOfferById(id);
  res.status(200).json({ ride });
}

export async function updateOffer(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  const { id } = rideIdParamSchema.parse(req.params);
  const input = updateRideOfferSchema.parse(req.body);
  const ride = await ridesService.updateRideOffer(id, req.user.userId, input);

  res.status(200).json({
    message: "Ride updated successfully",
    ride,
  });
}

export async function createRequest(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  const input = createRideRequestSchema.parse(req.body);
  const rideRequest = await ridesService.createRideRequest(req.user.userId, input);

  res.status(201).json({
    ride_request: rideRequest,
  });
}

export async function listRequests(req: Request, res: Response) {
  const query = listRideRequestsQuerySchema.parse(req.query);
  const result = await ridesService.listRideRequests(query);
  res.status(200).json(result);
}

export async function getRequestById(req: Request, res: Response) {
  const { id } = rideIdParamSchema.parse(req.params);
  const ride = await ridesService.getRideRequestById(id);
  res.status(200).json({ ride });
}

export async function updateRequest(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  const { id } = rideIdParamSchema.parse(req.params);
  const input = updateRideRequestSchema.parse(req.body);
  const rideRequest = await ridesService.updateRideRequest(id, req.user.userId, input);

  res.status(200).json({
    message: "Ride request updated successfully",
    ride_request: rideRequest,
  });
}
