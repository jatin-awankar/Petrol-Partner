import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middleware/auth";
import { asyncHandler } from "../../shared/http/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { pauseService } from "./pause.service";
import { deliveryStatus, retryDelivery } from "../notifications/durable.service";
import { cancellationsService } from "../rides/cancellations.service";
import { pilotDepartureService } from "../rides/pilot-departure.service";
import { journeyReviewService } from "../rides/journey-review.service";
import { directSettlementService } from "../rides/direct-settlement.service";
import { settlementCasesService } from "../rides/settlement-cases.service";
import { studentRevocationService } from "../verification/student-revocation.service";
import { revocationCasesService } from "./revocation-cases.service";
import { recordUrgentOutreach, urgentOutreachHistory } from "./urgent-outreach.service";
import {accountRestrictionsService} from "./account-restrictions.service";
import outreachValues from "./outreach-values.json";
import type {OutreachInput} from "./urgent-outreach.repo";
import {accountClosureService} from "../profile/account-closure.service";

export const operatorRouter = Router();
const decision = z.object({ capability: z.enum(["offers", "requests", "acceptance", "booking"]), paused: z.boolean(), reason: z.string().trim().min(8).max(500) });
const reopen = z.object({ reason: z.string().trim().min(8).max(500) });
const operationId = z.uuid();

operatorRouter.get("/pilot-status", asyncHandler(async (_req, res) => { res.json(await pauseService.publicStatus()); }));
operatorRouter.use(requireAdmin);
operatorRouter.get("/account-closures",asyncHandler(async(req,res)=>{
  const {limit,offset}=z.strictObject({limit:z.coerce.number().int().min(1).max(100).default(100),
    offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
  res.set("Cache-Control","private, no-store").json({closures:await accountClosureService.queue(req.user!.userId,limit,offset)});
}));
operatorRouter.get("/account-retention/status",asyncHandler(async(req,res)=>{
  res.set("Cache-Control","private, no-store").json(await accountClosureService.status(req.user!.userId));
}));
operatorRouter.post("/account-closures/:id/holds",asyncHandler(async(req,res)=>{
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  const {scope,reason,review_at}=z.strictObject({
    scope:z.enum(["journey_case","settlement_case","incident","commitment","legal_review"]),
    reason:z.string().trim().min(8).max(500),review_at:z.iso.datetime({offset:true})}).parse(req.body);
  res.set("Cache-Control","private, no-store").json({hold:await accountClosureService.hold(
    req.user!.userId,key,z.uuid().parse(req.params.id),scope,reason,new Date(review_at))});
}));
operatorRouter.post("/account-closure-holds/:id/release",asyncHandler(async(req,res)=>{
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  const {reason}=z.strictObject({reason:z.string().trim().min(8).max(500)}).parse(req.body);
  res.json(await accountClosureService.release(req.user!.userId,key,z.uuid().parse(req.params.id),reason));
}));
const restrictionInput=z.strictObject({target_user_id:z.uuid(),scope:z.enum(["driver","passenger","all"]),
  source_type:z.enum(["incident","settlement"]),source_id:z.uuid(),
  reason:z.string().trim().min(8).max(500),
  reviewed_evidence:z.string().trim().min(8).max(1000)});
operatorRouter.get("/account-restrictions/:userId",asyncHandler(async(req,res)=>{
  res.set("Cache-Control","private, no-store").json({history:await accountRestrictionsService.history(
    req.user!.userId,z.uuid().parse(req.params.userId),true)});
}));
operatorRouter.get("/account-restriction-operations/:id",asyncHandler(async(req,res)=>{
  res.json({operation:await accountRestrictionsService.operation(req.user!.userId,
    z.uuid().parse(req.params.id))});
}));
operatorRouter.post("/account-restrictions",asyncHandler(async(req,res)=>{
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  const input=restrictionInput.parse(req.body);
  res.json({operation:await accountRestrictionsService.restrict(req.user!.userId,key,{
    targetUserId:input.target_user_id,scope:input.scope,sourceType:input.source_type,
    sourceId:input.source_id,reason:input.reason,reviewedEvidence:input.reviewed_evidence})});
}));
operatorRouter.post("/account-restrictions/:id/reverse",asyncHandler(async(req,res)=>{
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  const input=z.strictObject({reason:z.string().trim().min(8).max(500),
    reviewed_evidence:z.string().trim().min(8).max(1000)}).parse(req.body);
  res.json({operation:await accountRestrictionsService.reverse(req.user!.userId,key,
    z.uuid().parse(req.params.id),input.reason,input.reviewed_evidence)});
}));
operatorRouter.get("/status", asyncHandler(async (_req, res) => { res.json(await pauseService.status()); }));
const outreachInput = z.strictObject({participantId:z.uuid(),
  method:z.enum(outreachValues.methods as [OutreachInput["method"],...OutreachInput["method"][]]),
  occurredAt:z.iso.datetime({offset:true}),
  reason:z.enum(outreachValues.reasons as [string,...string[]]),
  outcome:z.enum(outreachValues.outcomes as [string,...string[]])});
operatorRouter.get("/urgent-outreach",asyncHandler(async(req,res)=>{
  res.set("Cache-Control","private, no-store").json(await urgentOutreachHistory(req.user!.userId));
}));
operatorRouter.post("/urgent-outreach",asyncHandler(async(req,res)=>{
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  res.set("Cache-Control","private, no-store").json(await recordUrgentOutreach(req.user!.userId,key,outreachInput.parse(req.body)));
}));
operatorRouter.get("/notifications/delivery", asyncHandler(async (_req, res) => { res.json(await deliveryStatus()); }));
operatorRouter.get("/cancellation-reviews", asyncHandler(async (req,res) => {
  res.json({cases:await cancellationsService.openReviews(req.user!.userId)});
}));
operatorRouter.get("/departure-reviews",asyncHandler(async(req,res)=>{
  res.json({signals:await pilotDepartureService.openSignals(req.user!.userId)});
}));
operatorRouter.get("/journey-reviews",asyncHandler(async(req,res)=>{
  res.set("Cache-Control","private, no-store").json({cases:await journeyReviewService.queue(req.user!.userId)});
}));
operatorRouter.get("/settlement-reviews",asyncHandler(async(req,res)=>{
  res.set("Cache-Control","private, no-store").json({...(await directSettlementService.openReviews(req.user!.userId)),
    queue:await settlementCasesService.queue(req.user!.userId)});
}));
operatorRouter.get('/settlement-reviews/:id',asyncHandler(async(req,res)=>{
  res.set('Cache-Control','private, no-store').json(await settlementCasesService.detail(req.user!.userId,
    operationId.parse(req.params.id),true));
}));
operatorRouter.get('/settlement-case-operations/:id',asyncHandler(async(req,res)=>{
  res.json({operation:await settlementCasesService.operation(req.user!.userId,
    operationId.parse(req.params.id),true)});
}));
operatorRouter.post('/settlement-reviews/:id/decide',asyncHandler(async(req,res)=>{
  const key=req.header('Idempotency-Key');
  if(!key||key.length>128) throw new AppError(400,'Idempotency-Key is required','IDEMPOTENCY_KEY_REQUIRED');
  const input=z.strictObject({contribution_owed:z.boolean().nullable(),receipt_established:z.boolean().nullable(),
    case_resolution:z.enum(['resolved','unresolved']),reason:z.string().trim().min(8).max(500),
    evidence_refs:z.array(z.string().trim().min(1).max(200)).max(20),
    participant_confirmation_id:z.uuid().nullable(),
    receipt_basis:z.enum(['participant_confirmation','reviewed_evidence']).nullable().optional(),
    reviewed_evidence_summary:z.string().trim().min(8).max(500).nullable().optional()}).parse(req.body);
  res.json({operation:await settlementCasesService.mutate(req.user!.userId,key,
    operationId.parse(req.params.id),{kind:'decision',...input})});
}));
operatorRouter.get("/journey-reviews/:id",asyncHandler(async(req,res)=>{
  res.set("Cache-Control","private, no-store").json(await journeyReviewService.detail(req.user!.userId,operationId.parse(req.params.id)));
}));
operatorRouter.get("/journey-review-decisions/:id",asyncHandler(async(req,res)=>{
  res.json({operation:await journeyReviewService.operation(req.user!.userId,operationId.parse(req.params.id))});
}));
operatorRouter.post("/journey-reviews/:id/decide",asyncHandler(async(req,res)=>{
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  const input=z.strictObject({outcome:z.enum(["travelled_completed","did_not_travel","interrupted","insufficient_evidence"]),
    contribution_owed:z.boolean().nullable(),reason:z.string().trim().min(8).max(500),
    evidence_refs:z.array(z.string().trim().min(1).max(200)).max(20)}).refine(value=>
      value.outcome==='insufficient_evidence'?value.contribution_owed===null:
      value.outcome==='did_not_travel'?value.contribution_owed===false:value.contribution_owed!==null,
      {message:"Contribution decision conflicts with journey outcome"}).parse(req.body);
  res.json({operation:await journeyReviewService.decide(req.user!.userId,key,operationId.parse(req.params.id),input)});
}));
operatorRouter.get("/revocation-cases",asyncHandler(async(req,res)=>{
  res.set("Cache-Control","private, no-store").json(await revocationCasesService.list(req.user!.userId));
}));
operatorRouter.post("/students/:id/revoke",asyncHandler(async(req,res)=>{
  const id=operationId.parse(req.params.id);
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  const {reason}=z.strictObject({reason:z.string().trim().min(8).max(500)}).parse(req.body);
  res.json({operation:await studentRevocationService.revoke(req.user!.userId,key,id,reason)});
}));
operatorRouter.get("/students/revocations/:id",asyncHandler(async(req,res)=>{
  res.json({operation:await studentRevocationService.operation(req.user!.userId,
    operationId.parse(req.params.id))});
}));
operatorRouter.post("/revocation-cases/:type/:id/outreach",asyncHandler(async(req,res)=>{
  const {type,id}=z.strictObject({type:z.enum(["hold","incident"]),id:z.uuid()}).parse(req.params);
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  const {recipient_ids,reason}=z.strictObject({recipient_ids:z.array(z.uuid()).min(1).max(30),
    reason:z.string().trim().min(8).max(500)}).parse(req.body);
  res.json({operation:await revocationCasesService.decide(req.user!.userId,key,{
    caseType:type,caseId:id,action:"outreach",outcome:null,reason,recipientIds:recipient_ids})});
}));
operatorRouter.post("/revocation-cases/:type/:id/resolve",asyncHandler(async(req,res)=>{
  const {type,id}=z.strictObject({type:z.enum(["hold","incident"]),id:z.uuid()}).parse(req.params);
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  const {outcome,reason}=z.strictObject({outcome:z.enum(["cancelled","safe_completion","interrupted"]),
    reason:z.string().trim().min(8).max(500)}).parse(req.body);
  res.json({operation:await revocationCasesService.decide(req.user!.userId,key,{
    caseType:type,caseId:id,action:"resolve",outcome,reason,recipientIds:[]})});
}));
operatorRouter.get("/revocation-cases/operations/:id",asyncHandler(async(req,res)=>{
  res.json({operation:await revocationCasesService.operation(req.user!.userId,
    operationId.parse(req.params.id))});
}));
operatorRouter.post("/rides/:id/late-departure",asyncHandler(async(req,res)=>{
  const id=operationId.parse(req.params.id);
  const key=req.header("Idempotency-Key");
  if(!key||key.length>128) throw new AppError(400,"Idempotency-Key is required","IDEMPOTENCY_KEY_REQUIRED");
  const {boarded_allocation_ids,reason}=z.strictObject({boarded_allocation_ids:z.array(z.uuid()).max(30),
    reason:z.string().trim().min(8).max(500)}).parse(req.body);
  res.json({departure:await pilotDepartureService.start(req.user!.userId,key,id,
    boarded_allocation_ids,"late_departure",reason)});
}));
operatorRouter.post("/notifications/email/:id/retry", asyncHandler(async (req, res) => {
  const key = req.header("Idempotency-Key");
  if (!key || key.length > 128) throw new AppError(400, "A stable Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
  await retryDelivery(req.user!.userId, operationId.parse(req.params.id), key);
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
