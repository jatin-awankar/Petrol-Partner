import { Router } from "express";

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

ridesRouter.get("/offers", asyncHandler(ridesController.listOffers));
ridesRouter.post("/offers", requireAuth, asyncHandler(ridesController.createOffer));
ridesRouter.get("/offers/:id", asyncHandler(ridesController.getOfferById));
ridesRouter.patch("/offers/:id", requireAuth, asyncHandler(ridesController.updateOffer));

ridesRouter.get("/requests", asyncHandler(ridesController.listRequests));
ridesRouter.post("/requests", requireAuth, asyncHandler(ridesController.createRequest));
ridesRouter.get("/requests/:id", asyncHandler(ridesController.getRequestById));
ridesRouter.patch("/requests/:id", requireAuth, asyncHandler(ridesController.updateRequest));
