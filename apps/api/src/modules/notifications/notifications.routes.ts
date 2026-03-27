import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as notificationsController from "./notifications.controller";

export const notificationsRouter = Router();

notificationsRouter.get("/_status", (_req, res) => {
  res.json({
    module: "notifications",
    status: "active",
    capabilities: [
      "in-app notification persistence",
      "device token registration",
      "notification preference storage",
      "mark read operations",
    ],
  });
});

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", asyncHandler(notificationsController.listNotifications));
notificationsRouter.post("/read-all", asyncHandler(notificationsController.markAllRead));
notificationsRouter.post("/:id/read", asyncHandler(notificationsController.markRead));
notificationsRouter.get("/preferences", asyncHandler(notificationsController.getPreferences));
notificationsRouter.put("/preferences", asyncHandler(notificationsController.updatePreferences));
notificationsRouter.get("/devices", asyncHandler(notificationsController.listDevices));
notificationsRouter.post("/devices", asyncHandler(notificationsController.registerDevice));
notificationsRouter.delete("/devices/:id", asyncHandler(notificationsController.revokeDevice));
