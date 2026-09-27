import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { seatRequestsService } from "./seat-requests.service";
import { cancellationsService } from "./cancellations.service";
import { pilotJourneyService } from "./pilot-journey.service";

export const seatRequestsRouter = Router();
seatRequestsRouter.use(requireAuth);
seatRequestsRouter.use((_req,res,next) => {
  res.set("Cache-Control","private, no-store");
  next();
});
function actor(req:{user?:{userId:string}}) {
  if (!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  return req.user.userId;
}
function key(value:string|undefined) {
  if (!value || value.length > 128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  return value;
}
seatRequestsRouter.get("/",asyncHandler(async(req,res) => {
  res.json({requests:await seatRequestsService.list(actor(req))});
}));
seatRequestsRouter.get("/confirmed",asyncHandler(async(req,res) => {
  res.json({bookings:await seatRequestsService.confirmed(actor(req))});
}));
seatRequestsRouter.get("/journey-reviews",asyncHandler(async(req,res) => {
  res.json({cases:await pilotJourneyService.participantReviews(actor(req))});
}));
seatRequestsRouter.get("/confirmed/:offerId",asyncHandler(async(req,res) => {
  const {offerId} = z.strictObject({offerId:z.uuid()}).parse(req.params);
  res.json({trip:await seatRequestsService.confirmedTrip(actor(req),offerId)});
}));
seatRequestsRouter.get("/operations/:id",asyncHandler(async(req,res) => {
  const {id} = z.strictObject({id:z.uuid()}).parse(req.params);
  res.json({operation:await seatRequestsService.operation(actor(req),id)});
}));
seatRequestsRouter.get("/cancellations/:id",asyncHandler(async(req,res) => {
  const {id}=z.strictObject({id:z.uuid()}).parse(req.params);
  res.json({operation:await cancellationsService.operation(actor(req),id)});
}));
seatRequestsRouter.post("/:id/cancel",asyncHandler(async(req,res) => {
  const {id}=z.strictObject({id:z.uuid()}).parse(req.params);
  const {reason}=z.strictObject({reason:z.string().trim().max(500).nullable().optional()}).parse(req.body ?? {});
  const result=await cancellationsService.cancel(actor(req),key(req.get("Idempotency-Key")),"request",id,reason ?? null);
  res.status("kind" in result && result.kind === "review_required" ? 202 : 200).json(result);
}));
seatRequestsRouter.post("/",asyncHandler(async(req,res) => {
  const {offer_id,seats} = z.strictObject({offer_id:z.uuid(),seats:z.literal(1)}).parse(req.body);
  void seats;
  res.status(201).json(await seatRequestsService.mutate(actor(req),key(req.get("Idempotency-Key")),"requested",offer_id));
}));
seatRequestsRouter.post("/:id/reject",asyncHandler(async(req,res) => {
  const {id} = z.strictObject({id:z.uuid()}).parse(req.params);
  z.strictObject({}).parse(req.body ?? {});
  res.json(await seatRequestsService.mutate(actor(req),key(req.get("Idempotency-Key")),"rejected",id));
}));
seatRequestsRouter.post("/:id/accept",asyncHandler(async(req,res) => {
  const {id} = z.strictObject({id:z.uuid()}).parse(req.params);
  z.strictObject({}).parse(req.body ?? {});
  res.json(await seatRequestsService.mutate(actor(req),key(req.get("Idempotency-Key")),"accepted",id));
}));
