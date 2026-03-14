import { Router } from "express";

export const ridesRouter = Router();

ridesRouter.get("/_status", (_req, res) => {
  res.json({
    module: "rides",
    status: "scaffolded",
    next_step: "Move ride offer and ride request logic out of Next.js route handlers into services and repositories.",
  });
});
