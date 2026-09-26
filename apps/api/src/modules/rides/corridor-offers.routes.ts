import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { corridorOfferInput,corridorOfferUpdate,corridorOfferSearch } from "./corridor-offers.schema";
import { corridorOffersService } from "./corridor-offers.service";
import { cancellationsService } from "./cancellations.service";
import { pilotDepartureService } from "./pilot-departure.service";
import {pool} from "../../db/pool";

export const corridorOffersRouter = Router();
function key(value: string | undefined) {
  if (!value || value.length > 128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  return value;
}
corridorOffersRouter.get("/policy",requireAuth,asyncHandler(async (_req,res) => {
  if (!_req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  res.json({policy:await corridorOffersService.policy(_req.user.userId)});
}));
corridorOffersRouter.get("/mine",requireAuth,asyncHandler(async(req,res) => {
  if (!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  res.json({offers:await corridorOffersService.mine(req.user.userId)});
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
corridorOffersRouter.get("/cancellations/:id",requireAuth,asyncHandler(async(req,res) => {
  if (!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  const {id}=z.strictObject({id:z.uuid()}).parse(req.params);
  res.json({operation:await cancellationsService.operation(req.user.userId,id)});
}));
corridorOffersRouter.get("/departures/:id",requireAuth,asyncHandler(async(req,res)=>{
  if(!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  const {id}=z.strictObject({id:z.uuid()}).parse(req.params);
  res.json({operation:await pilotDepartureService.operation(req.user.userId,id)});
}));
corridorOffersRouter.post("/:id/depart",requireAuth,asyncHandler(async(req,res)=>{
  if(!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  const {id}=z.strictObject({id:z.uuid()}).parse(req.params);
  const {boarded_allocation_ids}=z.strictObject({boarded_allocation_ids:z.array(z.uuid()).max(30)}).parse(req.body);
  res.json({departure:await pilotDepartureService.start(req.user.userId,key(req.get("Idempotency-Key")),
    id,boarded_allocation_ids)});
}));
corridorOffersRouter.post("/:id/interruption",requireAuth,asyncHandler(async(req,res)=>{
  if(!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  const {id}=z.strictObject({id:z.uuid()}).parse(req.params);
  const {reason}=z.strictObject({reason:z.string().trim().min(8).max(500)}).parse(req.body);
  const state=(await pool.query<{status:string}>("SELECT status FROM ride_offers WHERE id=$1",[id])).rows[0];
  if(state?.status!=="departed") throw new AppError(409,"Only an active trip can be interrupted","TRIP_NOT_STARTED");
  const result=await cancellationsService.cancel(req.user.userId,key(req.get("Idempotency-Key")),
    "offer",id,`Interruption: ${reason}`);
  res.status(202).json(result);
}));
corridorOffersRouter.post("/:id/cancel",requireAuth,asyncHandler(async(req,res) => {
  if (!req.user) throw new AppError(401,"Unauthorized","UNAUTHORIZED");
  const {id}=z.strictObject({id:z.uuid()}).parse(req.params);
  const {reason}=z.strictObject({reason:z.string().trim().max(500).nullable().optional()}).parse(req.body ?? {});
  const result=await cancellationsService.cancel(req.user.userId,key(req.get("Idempotency-Key")),"offer",id,reason ?? null);
  res.status("kind" in result && result.kind === "review_required" ? 202 : 200).json(result);
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
