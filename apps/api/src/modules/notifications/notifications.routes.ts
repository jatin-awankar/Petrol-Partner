import { Router } from "express";
import { AppError } from "../../shared/errors/app-error";

import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as notificationsController from "./notifications.controller";
import { recipientNotifications } from "./durable.service";

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
notificationsRouter.get("/durable", asyncHandler(async (req, res) => {
  res.set("Cache-Control", "private, no-store").json({ notifications: await recipientNotifications(req.user!.userId) });
}));

notificationsRouter.get("/", asyncHandler(notificationsController.listNotifications));
notificationsRouter.post("/read-all", asyncHandler(notificationsController.markAllRead));
notificationsRouter.post("/:id/read", asyncHandler(notificationsController.markRead));
notificationsRouter.get("/preferences", asyncHandler(notificationsController.getPreferences));
notificationsRouter.put("/preferences", asyncHandler(notificationsController.updatePreferences));
notificationsRouter.use("/devices", (_req, _res, next) => next(new AppError(410,
  "Push notifications are unavailable", "PILOT_SCOPE_DISABLED")));
