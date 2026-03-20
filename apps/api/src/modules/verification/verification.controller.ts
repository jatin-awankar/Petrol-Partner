import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  adminReviewUserParamSchema,
  createVehicleSchema,
  pendingVerificationReviewsQuerySchema,
  reviewDriverEligibilitySchema,
  reviewStudentVerificationSchema,
  reviewVehicleSchema,
  upsertDriverEligibilitySchema,
  upsertStudentVerificationSchema,
  updateVehicleSchema,
  vehicleIdParamSchema,
} from "./verification.schema";
import * as verificationService from "./verification.service";

function requireUserId(req: Request) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return req.user.userId;
}

export async function getOverview(req: Request, res: Response) {
  const userId = requireUserId(req);
  const overview = await verificationService.getOverview(userId);
  res.status(200).json(overview);
}

export async function getStudentVerification(req: Request, res: Response) {
  const userId = requireUserId(req);
  const studentVerification = await verificationService.getStudentVerification(userId);
  res.status(200).json({ student_verification: studentVerification });
}

export async function upsertStudentVerification(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = upsertStudentVerificationSchema.parse(req.body);
  const studentVerification = await verificationService.upsertStudentVerification(userId, input);
  res.status(200).json({
    message: "Student verification submitted for review",
    student_verification: studentVerification,
  });
}

export async function getDriverEligibility(req: Request, res: Response) {
  const userId = requireUserId(req);
  const driverEligibility = await verificationService.getDriverEligibility(userId);
  res.status(200).json({ driver_eligibility: driverEligibility });
}

export async function upsertDriverEligibility(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = upsertDriverEligibilitySchema.parse(req.body);
  const driverEligibility = await verificationService.upsertDriverEligibility(userId, input);
  res.status(200).json({
    message: "Driver eligibility submitted for review",
    driver_eligibility: driverEligibility,
  });
}

export async function listVehicles(req: Request, res: Response) {
  const userId = requireUserId(req);
  const vehicles = await verificationService.listVehicles(userId);
  res.status(200).json({ vehicles });
}

export async function createVehicle(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = createVehicleSchema.parse(req.body);
  const vehicle = await verificationService.createVehicle(userId, input);
  res.status(201).json({
    message: "Vehicle created successfully",
    vehicle,
  });
}

export async function updateVehicle(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { id } = vehicleIdParamSchema.parse(req.params);
  const input = updateVehicleSchema.parse(req.body);
  const vehicle = await verificationService.updateVehicle(userId, id, input);
  res.status(200).json({
    message: "Vehicle updated successfully",
    vehicle,
  });
}

export async function listPendingReviews(req: Request, res: Response) {
  const query = pendingVerificationReviewsQuerySchema.parse(req.query);
  const reviews = await verificationService.listPendingReviews(query);
  res.status(200).json(reviews);
}

export async function reviewStudentVerification(req: Request, res: Response) {
  const adminUserId = requireUserId(req);
  const { userId } = adminReviewUserParamSchema.parse(req.params);
  const input = reviewStudentVerificationSchema.parse(req.body);
  const studentVerification = await verificationService.reviewStudentVerification(
    adminUserId,
    userId,
    input,
  );

  res.status(200).json({
    message: "Student verification reviewed successfully",
    student_verification: studentVerification,
  });
}

export async function reviewDriverEligibility(req: Request, res: Response) {
  const adminUserId = requireUserId(req);
  const { userId } = adminReviewUserParamSchema.parse(req.params);
  const input = reviewDriverEligibilitySchema.parse(req.body);
  const driverEligibility = await verificationService.reviewDriverEligibility(
    adminUserId,
    userId,
    input,
  );

  res.status(200).json({
    message: "Driver eligibility reviewed successfully",
    driver_eligibility: driverEligibility,
  });
}

export async function reviewVehicle(req: Request, res: Response) {
  const adminUserId = requireUserId(req);
  const { id } = vehicleIdParamSchema.parse(req.params);
  const input = reviewVehicleSchema.parse(req.body);
  const vehicle = await verificationService.reviewVehicle(adminUserId, id, input);

  res.status(200).json({
    message: "Vehicle reviewed successfully",
    vehicle,
  });
}
