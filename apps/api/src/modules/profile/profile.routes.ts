import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as profileController from "./profile.controller";
import { accountClosureService } from "./account-closure.service";

export const profileRouter = Router();

profileRouter.get("/_status", (_req, res) => {
  res.json({
    module: "profile",
    status: "active",
    capabilities: [
      "profile me read/write",
      "user preferences read/write",
      "user safety settings read/write",
      "login activity security reads",
    ],
  });
});

profileRouter.use(requireAuth);

profileRouter.get("/me", asyncHandler(profileController.getMe));
profileRouter.patch("/me", asyncHandler(profileController.patchMe));
profileRouter.get("/preferences", asyncHandler(profileController.getPreferences));
profileRouter.patch("/preferences", asyncHandler(profileController.patchPreferences));
profileRouter.get("/safety", asyncHandler(profileController.getSafety));
profileRouter.patch("/safety", asyncHandler(profileController.patchSafety));
profileRouter.get("/security", asyncHandler(profileController.getSecurity));
profileRouter.post("/closure", asyncHandler(async(req,res)=>{
  res.set("Cache-Control","private, no-store").json({closure:await accountClosureService.request(req.user!.userId)});
}));
profileRouter.get("/closure", asyncHandler(async(req,res)=>{
  res.set("Cache-Control","private, no-store").json({closure:await accountClosureService.mine(req.user!.userId)});
}));
