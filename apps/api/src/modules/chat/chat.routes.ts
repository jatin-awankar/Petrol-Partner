import { Router } from "express";

export const chatRouter = Router();

chatRouter.get("/_status", (_req, res) => {
  res.json({
    module: "chat",
    status: "scaffolded",
    next_step: "Add Socket.IO rooms backed by persisted messages in Postgres.",
  });
});
