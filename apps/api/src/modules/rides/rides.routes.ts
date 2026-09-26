import { Router } from "express";
import { AppError } from "../../shared/errors/app-error";

import { requirePilotActivity } from "../operator/pause.middleware";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as ridesController from "./rides.controller";

export const ridesRouter = Router();

ridesRouter.get("/_status", (_req, res) => {
  res.json({
    module: "rides",
    status: "active",
    next_step: "Bookings should be migrated next, using these ride offer/request endpoints as the source of truth.",
  });
});

const legacyRideUnavailable = () => { throw new AppError(410,
  "This ride flow is unavailable in the corridor pilot", "PILOT_SCOPE_DISABLED"); };
ridesRouter.get("/offers", legacyRideUnavailable);
ridesRouter.post("/offers", legacyRideUnavailable);
ridesRouter.get("/offers/:id", legacyRideUnavailable);
ridesRouter.patch("/offers/:id", legacyRideUnavailable);
ridesRouter.post("/offers/:id/depart", requireAuth, requirePilotActivity("booking"), asyncHandler(ridesController.departOffer));

ridesRouter.get("/requests", legacyRideUnavailable);
ridesRouter.post("/requests", legacyRideUnavailable);
ridesRouter.get("/requests/:id", legacyRideUnavailable);
ridesRouter.patch("/requests/:id", legacyRideUnavailable);
