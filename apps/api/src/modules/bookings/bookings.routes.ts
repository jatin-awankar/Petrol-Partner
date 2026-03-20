import { Router } from "express";

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

bookingsRouter.post("/", asyncHandler(bookingsController.createBooking));
bookingsRouter.get("/", asyncHandler(bookingsController.listBookings));
bookingsRouter.get("/:id", asyncHandler(bookingsController.getBookingById));
bookingsRouter.post("/:id/confirm", asyncHandler(bookingsController.confirmBooking));
bookingsRouter.post("/:id/cancel", asyncHandler(bookingsController.cancelBooking));
bookingsRouter.post("/:id/complete", asyncHandler(bookingsController.completeBooking));
bookingsRouter.patch("/status", asyncHandler(bookingsController.updateBookingStatusLegacy));
