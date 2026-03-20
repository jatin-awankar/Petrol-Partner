import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as matchingController from "./matching.controller";

export const matchingRouter = Router();

matchingRouter.get("/_status", (_req, res) => {
  res.json({
    module: "matching",
    status: "active",
    capabilities: [
      "offer-request route candidate scoring",
      "stored match persistence",
      "deduped match notifications",
      "manual recompute endpoint for active rides",
    ],
  });
});

matchingRouter.use(requireAuth);

matchingRouter.get("/me", asyncHandler(matchingController.listMyMatches));
matchingRouter.get("/offers/:id/candidates", asyncHandler(matchingController.listOfferCandidates));
matchingRouter.get("/requests/:id/candidates", asyncHandler(matchingController.listRequestCandidates));
matchingRouter.post("/recompute", asyncHandler(matchingController.refreshMatches));
