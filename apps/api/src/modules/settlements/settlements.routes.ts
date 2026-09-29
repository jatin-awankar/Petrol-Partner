import { Router } from "express";

import { requireAdmin, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as settlementsController from "./settlements.controller";

export const settlementsRouter = Router();

settlementsRouter.get("/_status", (_req, res) => {
  res.json({
    module: "settlements",
    status: "historical-read-only",
    capabilities: [
      "participant-scoped historical settlement reads",
      "financial hold status reads",
    ],
  });
});

settlementsRouter.use(requireAuth);

settlementsRouter.get("/", asyncHandler(settlementsController.listSettlements));
settlementsRouter.get(
  "/financial-hold",
  asyncHandler(settlementsController.getFinancialHoldStatus),
);
settlementsRouter.get(
  "/bookings/:bookingId",
  asyncHandler(settlementsController.getSettlementByBookingId),
);
settlementsRouter.post(
  "/bookings/:bookingId/passenger-paid",
  asyncHandler(settlementsController.markPassengerPaid),
);
settlementsRouter.post(
  "/bookings/:bookingId/confirm-offline-received",
  asyncHandler(settlementsController.confirmOfflineReceipt),
);
settlementsRouter.post(
  "/bookings/:bookingId/dispute",
  asyncHandler(settlementsController.createDispute),
);
settlementsRouter.post(
  "/bookings/:bookingId/resolve",
  requireAdmin,
  asyncHandler(settlementsController.resolveDispute),
);
