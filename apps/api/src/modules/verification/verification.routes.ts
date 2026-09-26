import { Router, raw } from "express";

import { requireAdmin, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as verificationController from "./verification.controller";

export const verificationRouter = Router();

verificationRouter.get("/_status", (_req, res) => {
  res.json({
    module: "verification",
    status: "active",
    smsVerification: "suspended",
    capabilities: [
      "student verification submission and admin review",
      "driver eligibility submission and admin review",
      "private vehicle records and approval workflow",
      "transactional eligibility enforcement inputs",
    ],
  });
});

verificationRouter.use(requireAuth);

verificationRouter.get("/overview", asyncHandler(verificationController.getOverview));
verificationRouter.get("/student", asyncHandler(verificationController.getStudentVerification));
verificationRouter.get("/evidence-capability", verificationController.evidenceCapability);
verificationRouter.put("/student", asyncHandler(verificationController.upsertStudentVerification));
verificationRouter.post("/student/evidence", raw({ type: ["image/jpeg", "image/png", "application/pdf"], limit: "512kb" }), asyncHandler(verificationController.uploadStudentEvidence));
verificationRouter.get("/driver-eligibility", asyncHandler(verificationController.getDriverEligibility));
verificationRouter.put("/driver-eligibility", asyncHandler(verificationController.upsertDriverEligibility));
verificationRouter.get("/vehicles", asyncHandler(verificationController.listVehicles));
verificationRouter.post("/vehicles", asyncHandler(verificationController.createVehicle));
verificationRouter.patch("/vehicles/:id", asyncHandler(verificationController.updateVehicle));
verificationRouter.put("/vehicles/:id/pilot-documents", asyncHandler(verificationController.classifyPilotVehicle));
verificationRouter.post("/driver-vehicle-associations", asyncHandler(verificationController.submitDriverVehicleAssociation));
verificationRouter.post("/driver-car-evidence/:subjectType/:subjectId/:purpose",
  raw({ type: ["image/jpeg", "image/png", "application/pdf"], limit: "512kb" }),
  asyncHandler(verificationController.uploadDriverCarEvidence));

verificationRouter.get(
  "/admin/pending",
  requireAdmin,
  asyncHandler(verificationController.listPendingReviews),
);
verificationRouter.post(
  "/admin/student/:userId/review",
  requireAdmin,
  asyncHandler(verificationController.reviewStudentVerification),
);
verificationRouter.get("/admin/student/review-operations/:operationId", requireAdmin,
  asyncHandler(verificationController.studentReviewOperation));
verificationRouter.get("/admin/student/review-operations/by-key/:key", requireAdmin,
  asyncHandler(verificationController.studentReviewOperationByKey));
verificationRouter.get("/admin/student/:userId/evidence", requireAdmin, asyncHandler(verificationController.getStudentEvidence));
verificationRouter.post("/admin/student/:userId/evidence-access", requireAdmin,
  asyncHandler(verificationController.grantStudentEvidenceAccess));
verificationRouter.get("/admin/student-evidence-retention", requireAdmin,
  asyncHandler(verificationController.studentEvidenceRetentionHealth));
verificationRouter.post("/admin/driver-car-evidence/:subjectType/:subjectId/:purpose/access", requireAdmin,
  asyncHandler(verificationController.grantDriverCarEvidenceAccess));
verificationRouter.get("/admin/driver-car-evidence/:subjectType/:subjectId/:purpose", requireAdmin,
  asyncHandler(verificationController.getDriverCarEvidence));
verificationRouter.get("/admin/driver-car-evidence-retention", requireAdmin,
  asyncHandler(verificationController.driverCarEvidenceRetentionHealth));
verificationRouter.post("/admin/driver-car/:subjectType/:subjectId/review", requireAdmin,
  asyncHandler(verificationController.reviewDriverCar));
verificationRouter.get("/admin/driver-car/review-operations/:operationId", requireAdmin,
  asyncHandler(verificationController.driverCarReviewOperation));
verificationRouter.get("/admin/driver-car/review-operations/by-key/:key", requireAdmin,
  asyncHandler(verificationController.driverCarReviewOperationByKey));
