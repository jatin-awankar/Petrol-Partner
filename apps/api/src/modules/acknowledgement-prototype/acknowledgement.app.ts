import express from "express";
import { Pool } from "pg";
import { z } from "zod";

import { errorHandler } from "../../middleware/error-handler";
import { requestContext } from "../../middleware/request-context";
import { AppError } from "../../shared/errors/app-error";
import { asyncHandler } from "../../shared/http/async-handler";
import { AcknowledgementService, type CrashPoint } from "./acknowledgement.service";
import { FileReceiptStore } from "./receipt-store";

const payloadSchema = z.object({ subject: z.string().min(1).max(100), delta: z.number().int().min(-1000).max(1000) });

export function createAcknowledgementPrototypeApp(options: {
  databaseUrl: string;
  receiptPath: string;
  receiptSecret: string;
  operatorToken: string;
  crash?: (point: CrashPoint, operationId?: string) => void;
}) {
  const app = express();
  const pool = new Pool({ connectionString: options.databaseUrl, max: 4 });
  const service = new AcknowledgementService(
    pool,
    new FileReceiptStore(options.receiptPath, options.receiptSecret),
    options.crash,
  );
  const requireOperator = (req: express.Request) => {
    if (req.header("Recovery-Operator-Token") !== options.operatorToken) {
      throw new AppError(403, "Recovery operator authorization required", "RECOVERY_FORBIDDEN");
    }
  };
  app.use(express.json());
  app.use(requestContext);
  app.post("/prototype/actions", asyncHandler(async (req, res) => {
    const key = req.header("Idempotency-Key");
    const scope = req.header("Idempotency-Scope");
    if (!key || !scope) throw new AppError(400, "Idempotency-Key and Idempotency-Scope are required", "IDEMPOTENCY_REQUIRED");
    const result = await service.perform(scope, key, payloadSchema.parse(req.body));
    res.status(result.status).json({ operation: result.operation });
  }));
  app.get("/prototype/operations/:operationId", asyncHandler(async (req, res) => {
    const operationId = z.string().uuid().parse(req.params.operationId);
    res.json({ operation: await service.operationStatus(operationId) });
  }));
  app.get("/prototype/subjects/:subject", asyncHandler(async (req, res) => {
    const subject = z.string().min(1).max(100).parse(req.params.subject);
    res.json(await service.readSubject(subject));
  }));
  app.get("/prototype/system-status", asyncHandler(async (_req, res) => {
    res.json(await service.systemStatus());
  }));
  app.post("/prototype/recovery/reconcile", asyncHandler(async (req, res) => {
    requireOperator(req);
    res.json(await service.reconcile());
  }));
  app.post("/prototype/recovery/reopen", asyncHandler(async (req, res) => {
    requireOperator(req);
    const operatorId = z.string().min(1).max(100).parse(req.header("Recovery-Operator-Id"));
    const input = z.object({ decision: z.string().min(1).max(500) }).parse(req.body);
    res.json(await service.reopen(operatorId, input.decision));
  }));
  app.use(errorHandler);
  app.locals.close = () => pool.end();
  return app;
}
