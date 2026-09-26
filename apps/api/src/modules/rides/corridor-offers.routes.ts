import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { corridorOfferInput,corridorOfferUpdate,corridorOfferSearch } from "./corridor-offers.schema";
import { corridorOffersService } from "./corridor-offers.service";

export const corridorOffersRouter = Router();
function key(value: string | undefined) {
  if (!value || value.length > 128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  return value;
}
corridorOffersRouter.get("/policy",requireAuth,asyncHandler(async (_req,res) => {
  if (!_req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  res.json({policy:await corridorOffersService.policy(_req.user.userId)});
}));
corridorOffersRouter.get("/",requireAuth,asyncHandler(async (req,res) => {
  if (!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  const query = corridorOfferSearch.parse(req.query);
  res.json({offers:await corridorOffersService.discover(req.user.userId,query.origin_code,query.destination_code,query.date)});
}));
corridorOffersRouter.get("/operations/:id",requireAuth,asyncHandler(async (req,res) => {
  if (!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  const {id} = z.strictObject({id:z.uuid()}).parse(req.params);
  res.json({operation:await corridorOffersService.operation(req.user.userId,id)});
}));
corridorOffersRouter.post("/",requireAuth,asyncHandler(async (req,res) => {
  if (!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  const offer = await corridorOffersService.publish(req.user.userId,key(req.get("Idempotency-Key")),
    {kind:"publish",input:corridorOfferInput.parse(req.body)});
  res.status(201).json({offer});
}));
corridorOffersRouter.patch("/:id",requireAuth,asyncHandler(async (req,res) => {
  if (!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  const {id} = z.strictObject({id:z.uuid()}).parse(req.params);
  const {version,...input} = corridorOfferUpdate.parse(req.body);
  const offer = await corridorOffersService.publish(req.user.userId,key(req.get("Idempotency-Key")),
    {kind:"update",input,offerId:id,version});
  res.json({offer});
}));
