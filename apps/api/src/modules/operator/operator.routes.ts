import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { pauseService } from "./pause.service";
import { deliveryStatus, retryDelivery } from "../notifications/durable.service";

export const operatorRouter = Router();
const decision = z.object({ capability: z.enum(["offers", "requests", "acceptance", "booking"]), paused: z.boolean(), reason: z.string().trim().min(8).max(500) });
const reopen = z.object({ reason: z.string().trim().min(8).max(500) });
const operationId = z.uuid();

operatorRouter.get("/pilot-status", asyncHandler(async (_req, res) => { res.json(await pauseService.publicStatus()); }));
operatorRouter.use(requireAdmin);
operatorRouter.get("/status", asyncHandler(async (_req, res) => { res.json(await pauseService.status()); }));
operatorRouter.get("/notifications/delivery", asyncHandler(async (_req, res) => { res.json(await deliveryStatus()); }));
operatorRouter.post("/notifications/email/:id/retry", asyncHandler(async (req, res) => {
  await retryDelivery(req.user!.userId, operationId.parse(req.params.id));
  res.json({ status: "pending" });
}));
operatorRouter.get("/pending", asyncHandler(async (_req, res) => { res.json({ operations: await pauseService.pending() }); }));
operatorRouter.get("/operations/by-key/:key", asyncHandler(async (req, res) => { res.json(await pauseService.operationByKey(req.user!.userId, z.string().min(1).max(128).parse(req.params.key))); }));
operatorRouter.get("/operations/:id", asyncHandler(async (req, res) => { res.json(await pauseService.operation(req.user!.userId, operationId.parse(req.params.id))); }));
operatorRouter.get("/pending/:id", asyncHandler(async (req, res) => { res.json(await pauseService.operatorOperation(operationId.parse(req.params.id))); }));
operatorRouter.post("/operations/:id/resume", asyncHandler(async (req, res) => {
  res.json(await pauseService.resumePending(req.user!.userId, operationId.parse(req.params.id), reopen.parse(req.body).reason));
}));
operatorRouter.post("/pause", asyncHandler(async (req, res) => {
  const key = req.header("Idempotency-Key");
  if (!key || key.length > 128) throw new AppError(400, "A stable Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
  res.json(await pauseService.decide(req.user!.userId, key, decision.parse(req.body)));
}));
operatorRouter.post("/reconcile", asyncHandler(async (req, res) => { res.json(await pauseService.reconcile(req.user!.userId)); }));
operatorRouter.post("/reopen", asyncHandler(async (req, res) => {
  const key = req.header("Idempotency-Key");
  if (!key || key.length > 128) throw new AppError(400, "A stable Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
  res.json(await pauseService.reopen(req.user!.userId, key, reopen.parse(req.body).reason));
}));
