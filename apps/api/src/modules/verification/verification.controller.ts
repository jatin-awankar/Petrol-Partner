import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  adminReviewUserParamSchema,
  createVehicleSchema,
  evidencePurposeSchema,
  pendingVerificationReviewsQuerySchema,
  reviewStudentVerificationSchema,
  upsertDriverEligibilitySchema,
  upsertStudentVerificationSchema,
  updateVehicleSchema,
  vehicleIdParamSchema,
  classifyPilotVehicleSchema,
  submitDriverVehicleAssociationSchema,
  driverCarEvidenceParamsSchema,
  driverCarReviewParamsSchema,
  driverCarReviewSchema,
} from "./verification.schema";
import * as verificationService from "./verification.service";
import * as driverCarService from "./driver-car.service";
import { driverCarReviewService } from "./driver-car-review.service";
import { studentReviewService } from "./student-review.service";

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
  if (process.env.NODE_ENV === "production" &&
      (process.env.PILOT_EVIDENCE_BACKEND !== "supabase" || process.env.PILOT_EVIDENCE_PROVIDER_VERIFIED !== "true" ||
       process.env.PILOT_STUDENT_REVIEW_RECEIPT_RETENTION_VERIFIED !== "true")) {
    throw new AppError(503, "Student evidence intake is closed", "EVIDENCE_STORAGE_UNAVAILABLE");
  }
  const userId = requireUserId(req);
  const input = upsertStudentVerificationSchema.parse(req.body);
  const studentVerification = await verificationService.upsertStudentVerification(userId, input);
  res.status(200).json({
    message: "Student verification submitted for review",
    student_verification: studentVerification,
  });
}

export async function uploadStudentEvidence(req: Request, res: Response) {
  if ((process.env.PILOT_EVIDENCE_BACKEND ?? "synthetic") === "synthetic" && req.get("X-Synthetic-Evidence") !== "true") {
    throw new AppError(400, "This adapter accepts synthetic demonstration evidence only", "SYNTHETIC_EVIDENCE_REQUIRED");
  }
  if (process.env.PILOT_EVIDENCE_BACKEND === "supabase" && req.get("X-Synthetic-Evidence") === "true") {
    throw new AppError(400, "Synthetic evidence is unavailable for real intake", "EVIDENCE_INVALID");
  }
  if (!Buffer.isBuffer(req.body)) throw new AppError(400, "Evidence body is required", "EVIDENCE_INVALID");
  const { purpose } = evidencePurposeSchema.parse(req.query);
  const result = await verificationService.uploadStudentEvidence(requireUserId(req), purpose, req.body, req.get("content-type") ?? "");
  res.status(201).json(result);
}

export function evidenceCapability(_req: Request, res: Response) {
  const real = process.env.PILOT_EVIDENCE_BACKEND === "supabase" &&
    process.env.PILOT_EVIDENCE_PROVIDER_VERIFIED === "true" &&
    process.env.PILOT_STUDENT_REVIEW_RECEIPT_RETENTION_VERIFIED === "true" &&
    process.env.PILOT_EVIDENCE_SUPABASE_BUCKET === "pilot-student-evidence" &&
    Boolean(process.env.PILOT_EVIDENCE_SUPABASE_SERVICE_KEY && process.env.PILOT_EVIDENCE_SUPABASE_URL?.startsWith("https://"));
  res.status(200).json({ mode: real ? "real" : process.env.NODE_ENV === "production" ? "closed" : "synthetic" });
}

export async function getStudentEvidence(req: Request, res: Response) {
  const { userId } = adminReviewUserParamSchema.parse(req.params);
  const { purpose } = evidencePurposeSchema.parse(req.query);
  const token = req.get("X-Evidence-Token") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new AppError(403, "Evidence link is required", "EVIDENCE_ACCESS_EXPIRED");
  const result = await verificationService.readStudentEvidence(requireUserId(req), userId, purpose, token);
  res.set("Cache-Control", "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Disposition", "attachment");
  res.type(result.contentType).status(200).send(result.bytes);
}

export async function grantStudentEvidenceAccess(req: Request, res: Response) {
  const { userId } = adminReviewUserParamSchema.parse(req.params);
  const { purpose } = evidencePurposeSchema.parse(req.query);
  res.status(201).json(await verificationService.grantStudentEvidenceAccess(requireUserId(req), userId, purpose));
}

export async function studentEvidenceRetentionHealth(req: Request, res: Response) {
  res.status(200).json(await verificationService.studentEvidenceRetentionHealth(requireUserId(req)));
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
  const key = req.get("Idempotency-Key");
  if (!key || key.length > 128) throw new AppError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
  const operation = await studentReviewService.decide(adminUserId, key, userId, input);
  res.status(200).json({ operation });
}

export async function studentReviewOperation(req: Request, res: Response) {
  const operation = await studentReviewService.operation(requireUserId(req), String(req.params.operationId));
  res.status(200).json({ operation });
}

export async function studentReviewOperationByKey(req: Request, res: Response) {
  const operation = await studentReviewService.operationByKey(requireUserId(req), String(req.params.key));
  res.status(200).json({ operation });
}

export async function classifyPilotVehicle(req: Request, res: Response) {
  const { id } = vehicleIdParamSchema.parse(req.params);
  const input = classifyPilotVehicleSchema.parse(req.body);
  res.status(200).json({ vehicle: await driverCarService.classifyVehicle(requireUserId(req), id, input) });
}

export async function submitDriverVehicleAssociation(req: Request, res: Response) {
  const input = submitDriverVehicleAssociationSchema.parse(req.body);
  res.status(201).json({ association: await driverCarService.submitAssociation(
    requireUserId(req), input.vehicle_id, input.permission_category) });
}

export async function uploadDriverCarEvidence(req: Request, res: Response) {
  if (process.env.NODE_ENV === "production" &&
      (process.env.PILOT_EVIDENCE_BACKEND !== "supabase" ||
       process.env.PILOT_EVIDENCE_PROVIDER_VERIFIED !== "true" ||
       process.env.PILOT_DRIVER_CAR_REVIEW_RECEIPT_RETENTION_VERIFIED !== "true")) {
    throw new AppError(503, "Driver and car evidence intake is closed", "EVIDENCE_STORAGE_UNAVAILABLE");
  }
  if ((process.env.PILOT_EVIDENCE_BACKEND ?? "synthetic") === "synthetic" && req.get("X-Synthetic-Evidence") !== "true") {
    throw new AppError(400, "Synthetic demonstration evidence only", "SYNTHETIC_EVIDENCE_REQUIRED");
  }
  if (process.env.PILOT_EVIDENCE_BACKEND === "supabase" && req.get("X-Synthetic-Evidence") === "true") {
    throw new AppError(400, "Synthetic evidence is unavailable for real intake", "EVIDENCE_INVALID");
  }
  if (!Buffer.isBuffer(req.body)) throw new AppError(400, "Evidence body is required", "EVIDENCE_INVALID");
  const { subjectType, subjectId, purpose } = driverCarEvidenceParamsSchema.parse(req.params);
  res.status(201).json(await driverCarService.uploadEvidence(requireUserId(req), subjectType,
    subjectId, purpose, req.body, req.get("content-type") ?? ""));
}

export async function grantDriverCarEvidenceAccess(req: Request, res: Response) {
  const { subjectType, subjectId, purpose } = driverCarEvidenceParamsSchema.parse(req.params);
  res.status(201).json(await driverCarService.grantEvidenceAccess(requireUserId(req), subjectType, subjectId, purpose));
}

export async function getDriverCarEvidence(req: Request, res: Response) {
  const { subjectType, subjectId, purpose } = driverCarEvidenceParamsSchema.parse(req.params);
  const token = req.get("X-Evidence-Token") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new AppError(403, "Evidence link is required", "EVIDENCE_ACCESS_EXPIRED");
  const result = await driverCarService.readPrivateEvidence(requireUserId(req), subjectType, subjectId, purpose, token);
  res.set("Cache-Control", "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Disposition", "attachment");
  res.type(result.contentType).status(200).send(result.bytes);
}

export async function reviewDriverCar(req: Request, res: Response) {
  const { subjectType, subjectId } = driverCarReviewParamsSchema.parse(req.params);
  const decision = driverCarReviewSchema.parse(req.body);
  const key = req.get("Idempotency-Key");
  if (!key || key.length > 128) throw new AppError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
  res.status(200).json({ operation: await driverCarReviewService.decide(
    requireUserId(req), key, subjectType, subjectId, decision) });
}

export async function driverCarReviewOperation(req: Request, res: Response) {
  res.status(200).json({ operation: await driverCarReviewService.operation(
    requireUserId(req), String(req.params.operationId)) });
}

export async function driverCarReviewOperationByKey(req: Request, res: Response) {
  res.status(200).json({ operation: await driverCarReviewService.operationByKey(
    requireUserId(req), String(req.params.key)) });
}

export async function driverCarEvidenceRetentionHealth(req: Request, res: Response) {
  res.status(200).json(await driverCarService.evidenceRetentionHealth(requireUserId(req)));
}
