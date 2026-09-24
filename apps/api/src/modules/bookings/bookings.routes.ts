import { Router } from "express";

import { requirePilotActivity } from "../operator/pause.middleware";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as bookingsController from "./bookings.controller";

export const bookingsRouter = Router();

bookingsRouter.get("/_status", (_req, res) => {
  res.json({
    module: "bookings",
    status: "active",
    capabilities: [
      "create bookings against ride offers or ride requests",
      "participant-scoped booking reads",
      "owner-gated confirmations",
      "append-only booking status events",
      "best-effort booking expiry queue publishing",
    ],
  });
});

bookingsRouter.use(requireAuth);

bookingsRouter.post("/", requirePilotActivity("acceptance"), asyncHandler(bookingsController.createBooking));
bookingsRouter.get("/", asyncHandler(bookingsController.listBookings));
bookingsRouter.get("/:id", asyncHandler(bookingsController.getBookingById));
bookingsRouter.post("/:id/confirm", requirePilotActivity("acceptance"), asyncHandler(bookingsController.confirmBooking));
bookingsRouter.post("/:id/cancel", requirePilotActivity("booking"), asyncHandler(bookingsController.cancelBooking));
bookingsRouter.post("/:id/complete", requirePilotActivity("booking"), asyncHandler(bookingsController.completeBooking));
bookingsRouter.patch("/status", requirePilotActivity("booking"), asyncHandler(bookingsController.updateBookingStatusLegacy));
