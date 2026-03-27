import { Router } from "express";

import { requireAdmin, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as verificationController from "./verification.controller";

export const verificationRouter = Router();

verificationRouter.get("/_status", (_req, res) => {
  res.json({
    module: "verification",
    status: "active",
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
verificationRouter.put("/student", asyncHandler(verificationController.upsertStudentVerification));
verificationRouter.get("/driver-eligibility", asyncHandler(verificationController.getDriverEligibility));
verificationRouter.put("/driver-eligibility", asyncHandler(verificationController.upsertDriverEligibility));
verificationRouter.get("/vehicles", asyncHandler(verificationController.listVehicles));
verificationRouter.post("/vehicles", asyncHandler(verificationController.createVehicle));
verificationRouter.patch("/vehicles/:id", asyncHandler(verificationController.updateVehicle));

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
verificationRouter.post(
  "/admin/driver-eligibility/:userId/review",
  requireAdmin,
  asyncHandler(verificationController.reviewDriverEligibility),
);
verificationRouter.post(
  "/admin/vehicles/:id/review",
  requireAdmin,
  asyncHandler(verificationController.reviewVehicle),
);
