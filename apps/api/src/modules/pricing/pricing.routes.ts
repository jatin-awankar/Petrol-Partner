import { Router } from "express";

import { requireAdmin, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as pricingController from "./pricing.controller";

export const pricingRouter = Router();

pricingRouter.get("/_status", (_req, res) => {
  res.json({
    module: "pricing",
    status: "active",
    capabilities: [
      "active rate-card lookup by area type",
      "server-side fare quote calculation",
      "platform fee calculation and freezing",
      "admin rate-card management",
    ],
  });
});

pricingRouter.use(requireAuth);

pricingRouter.get("/rate-cards", asyncHandler(pricingController.listRateCards));
pricingRouter.post("/quotes", asyncHandler(pricingController.createQuote));
pricingRouter.post(
  "/rate-cards",
  requireAdmin,
  asyncHandler(pricingController.createRateCard),
);
pricingRouter.patch(
  "/rate-cards/:id",
  requireAdmin,
  asyncHandler(pricingController.updateRateCard),
);
