import { Router } from "express";

import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import * as chatController from "./chat.controller";

export const chatRouter = Router();

chatRouter.get("/_status", (_req, res) => {
  res.status(env.ENABLE_CHAT ? 200 : 503).json({
    module: "chat",
    status: env.ENABLE_CHAT ? "enabled" : "disabled",
    capabilities: env.ENABLE_CHAT
      ? [
          "booking-scoped chat rooms",
          "participant-scoped room and message reads",
          "read receipts",
          "locked-room read-only enforcement",
        ]
      : [],
    next_step: env.ENABLE_CHAT ? undefined : "Chat is disabled until the realtime service is enabled.",
  });
});

chatRouter.use((req, res, next) => {
  if (env.ENABLE_CHAT) {
    return next();
  }

  res.status(503).json({
    error: {
      code: "CHAT_DISABLED",
      message: "Chat is disabled in this environment",
    },
  });
});

chatRouter.use(requireAuth);

chatRouter.get("/rooms", asyncHandler(chatController.listRooms));
chatRouter.get("/rooms/:roomId/messages", asyncHandler(chatController.listMessages));
chatRouter.post("/rooms/:roomId/messages", asyncHandler(chatController.sendMessage));
chatRouter.post("/rooms/:roomId/read", asyncHandler(chatController.markRead));
