import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { recordDurableNotification } from "../notifications/contract.repo";
import { backupStatus } from "../operator/backup-status";
import { B2ReceiptStore } from "../operator/b2-receipt-store";
import { operatorQuery } from "../operator/operator.repo";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { pauseService } from "../operator/pause.service";
import { SignedReceiptStore } from "../operator/receipt-store";
import { inProtectedTransaction } from "../protected-mutation/protocol";
import { assertCurrentDriverCarEligibility, assertCurrentStudentForSubmission } from "../verification/verification.service";
import * as repo from "./seat-requests.repo";

type Receipt = { operationId:string; actorId:string; key:string; digest:string; requestId:string;
  action:string; result:Record<string,unknown>; snapshot:repo.SeatRequest; createdAt:string };
function receipt(row:repo.RequestOperation):Receipt {
  return {operationId:row.id,actorId:row.actor_id,key:row.idempotency_key,digest:row.payload_digest,
    requestId:row.request_id,action:row.action,result:row.result,snapshot:row.request_snapshot,
    createdAt:row.created_at.toISOString()};
}
function store() {
  const secret = process.env.PILOT_RECEIPT_SECRET ?? env.PILOT_RECEIPT_SECRET;
  if (!secret || secret.length < 32) throw new AppError(503,"Seat request recovery evidence unavailable","RECOVERY_UNAVAILABLE");
  if (env.PILOT_RECEIPT_BACKEND === "b2") {
    const { PILOT_B2_BUCKET:bucket,PILOT_B2_ENDPOINT:endpoint,PILOT_B2_WRITER_KEY_ID:keyId,
      PILOT_B2_WRITER_KEY:applicationKey,PILOT_B2_PREFIX:prefix,PILOT_B2_RETENTION_DAYS:retentionDays } = env;
    if (!bucket || !endpoint || !keyId || !applicationKey || !prefix || !retentionDays)
      throw new AppError(503,"Seat request recovery evidence unavailable","RECOVERY_UNAVAILABLE");
    return new B2ReceiptStore<Receipt>({bucket,endpoint,keyId,applicationKey,prefix,retentionDays,secret},"seat-request");
  }
  const path = process.env.PILOT_RECEIPT_PATH ?? env.PILOT_RECEIPT_PATH;
  if (env.NODE_ENV === "production" || !path)
    throw new AppError(503,"Seat request recovery evidence unavailable","RECOVERY_UNAVAILABLE");
  return new SignedReceiptStore<Receipt>(`${path}.seat-request`,secret);
}
async function restrict(db:Pool,cause:string) {
  await inProtectedTransaction(db,async client => {
    await operatorQuery(client,"recoveryModeForUpdate");
    await operatorQuery(client,"enterRestrictedMode",[cause]);
    await operatorQuery(client,"recordRestriction",[cause]);
  });
}
function digest(action:string,id:string) {
  return createHash("sha256").update(JSON.stringify({action,id})).digest("hex");
}
function visibleRequest(row:repo.SeatRequest) {
  return {...row,status:row.status === "pending" && row.decision_deadline_at <= new Date() ? "expired" : row.status,
    confirmed:false,seats_reserved:0};
}

export class SeatRequestsService {
  constructor(private readonly db:Pool = pool) {}

  async receipts() {return store().list();}
  async pending() {
    return (await this.db.query<repo.RequestOperation>("SELECT * FROM pilot_seat_request_operations WHERE state='committed'")).rows;
  }
  async verifyEvidence(retry?:{actorId:string;key:string}) {
    try {
      const backup = await backupStatus(this.db);
      if (backup.required && !backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      const receipts = new Map((await store().list()).map(item => [item.operationId,item]));
      const rows = (await this.db.query<repo.RequestOperation>("SELECT * FROM pilot_seat_request_operations")).rows;
      const operations = new Map(rows.map(row => [row.id,row]));
      for (const item of receipts.values()) {
        const row = operations.get(item.operationId);
        if (!row || JSON.stringify(receipt(row)) !== JSON.stringify(item))
          throw new AppError(503,"Seat request recovery evidence conflicts with database","RECOVERY_CONFLICT");
      }
      for (const row of rows.filter(item => item.state !== "committed")) {
        if (JSON.stringify(receipts.get(row.id)) !== JSON.stringify(receipt(row)))
          throw new AppError(503,"Seat request recovery evidence is missing","RECOVERY_MISSING");
      }
      const pending = rows.filter(item => item.state === "committed");
      if (pending.length && (!retry || pending.some(item => item.actor_id !== retry.actorId || item.idempotency_key !== retry.key)))
        throw new AppError(503,"Seat request recovery is pending","OPERATION_PENDING",{operationId:pending[0].id});
    } catch (error) {
      if (!(error instanceof AppError && error.code === "OPERATION_PENDING"))
        await restrict(this.db,"seat_request_evidence_unavailable");
      throw error;
    }
  }

  async reconcileReceipts(operatorId:string) {
    await inProtectedTransaction(this.db,client => assertCurrentOperator(client,operatorId));
    for (const row of await this.pending()) await store().append(receipt(row));
    const receipts = (await store().list()).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
    for (const item of receipts) {
      await inProtectedTransaction(this.db,async client => {
        await assertCurrentOperator(client,operatorId);
        const prior = await client.query<repo.RequestOperation>("SELECT * FROM pilot_seat_request_operations WHERE id=$1",[item.operationId]);
        if (!prior.rowCount) {
          if (item.action === "requested") {
            await client.query(`INSERT INTO pilot_seat_requests
              (id,offer_id,passenger_id,driver_id,status,offer_version,offer_terms,decision_deadline_at,created_at,decided_at)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
              [item.snapshot.id,item.snapshot.offer_id,item.snapshot.passenger_id,item.snapshot.driver_id,
                item.snapshot.status,item.snapshot.offer_version,JSON.stringify(item.snapshot.offer_terms),
                item.snapshot.decision_deadline_at,item.snapshot.created_at,item.snapshot.decided_at]);
          } else {
            await client.query(`UPDATE pilot_seat_requests SET status='rejected',decided_at=$2
              WHERE id=$1 AND status IN ('pending','rejected')`,[item.requestId,item.snapshot.decided_at]);
          }
          await client.query(`INSERT INTO pilot_seat_request_operations
            (id,actor_id,idempotency_key,payload_digest,request_id,action,result,request_snapshot,state,created_at,acknowledged_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,'recovered',$9,now())`,
            [item.operationId,item.actorId,item.key,item.digest,item.requestId,item.action,
              JSON.stringify(item.result),JSON.stringify(item.snapshot),item.createdAt]);
        }
        const row = (await client.query<repo.RequestOperation>("SELECT * FROM pilot_seat_request_operations WHERE id=$1",[item.operationId])).rows[0];
        if (JSON.stringify(receipt(row)) !== JSON.stringify(item))
          throw new AppError(409,"Seat request recovery conflicts with receipt","RECOVERY_CONFLICT");
        if (row.state === "committed")
          await client.query("UPDATE pilot_seat_request_operations SET state='recovered',acknowledged_at=now() WHERE id=$1",[row.id]);
        await client.query(`INSERT INTO pilot_seat_request_audit(operation_id,request_id,actor_id,action)
          VALUES($1,$2,$3,$4) ON CONFLICT (operation_id) DO NOTHING`,[row.id,row.request_id,row.actor_id,row.action]);
        await recordDurableNotification(client,{originType:"seat_request",operationId:row.id,
          recipientId:item.action === "requested" ? item.snapshot.driver_id : item.snapshot.passenger_id,
          eventType:item.action,relatedEntityType:"seat_request",relatedEntityId:item.requestId,
          title:item.action === "requested" ? "Seat request received" : "Seat request rejected",
          body:item.action === "requested" ? "A passenger requested one seat. No seat is reserved yet."
            : "The driver rejected your seat request."});
        await repo.readyNotifications(client,row.id);
        await client.query(`UPDATE pilot_email_jobs SET status='exhausted',attempts=5,
          last_error='Restored from recovery receipt; delivery suppressed'
          WHERE event_id IN (SELECT id FROM pilot_notification_events
            WHERE origin_type='seat_request' AND operation_id=$1) AND status='pending'`,[row.id]);
      });
    }
    const latest = new Map<string,repo.SeatRequest>();
    for (const item of receipts) {
      if (item.action === "rejected" || !latest.has(item.requestId)) latest.set(item.requestId,item.snapshot);
    }
    for (const [id,expected] of latest) {
      const actual = (await this.db.query<repo.SeatRequest>("SELECT * FROM pilot_seat_requests WHERE id=$1",[id])).rows[0];
      for (const field of ["offer_id","passenger_id","driver_id","status","offer_version","offer_terms","decision_deadline_at"] as const) {
        if (!actual || JSON.stringify(actual[field]) !== JSON.stringify(expected[field]))
          throw new AppError(409,"Seat request recovery state conflicts with receipt","RECOVERY_CONFLICT");
      }
    }
    return receipts.length;
  }

  async operation(actorId:string,id:string) {
    const row = await repo.byId(this.db,id,actorId);
    if (!row) throw new AppError(404,"Operation not found","OPERATION_NOT_FOUND");
    const recovery = await operatorQuery<{mode:string}>(this.db,"recoveryMode");
    return {operation_id:row.id,state:recovery.rows[0]?.mode === "restricted" && row.state === "acknowledged"
      ? "pending_unknown" : row.state,...row.result};
  }

  async list(actorId:string) {
    await inProtectedTransaction(this.db,client => assertCurrentStudentForSubmission(client,actorId));
    return (await repo.listForParticipant(this.db,actorId)).map(visibleRequest);
  }

  async mutate(actorId:string,key:string,action:"requested"|"rejected",id:string) {
    const payloadDigest = digest(action,id);
    const existing = await repo.byKey(this.db,actorId,key);
    if (existing && existing.payload_digest !== payloadDigest)
      throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
    if (existing) return this.operation(actorId,existing.id);
    await pauseService.assertAvailable("requests");
    await this.verifyEvidence({actorId,key});
    const recovery = await operatorQuery<{mode:string}>(this.db,"recoveryMode");
    if (recovery.rows[0]?.mode !== "open") throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
    const evidence = store();
    try {
      await evidence.probe();
      const backup = await backupStatus(this.db);
      if (backup.required && !backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
    } catch (error) {
      await restrict(this.db,"seat_request_evidence_unavailable");
      throw error;
    }
    const operation = await inProtectedTransaction(this.db,async client => {
      const currentRecovery = await operatorQuery<{mode:string}>(client,"recoveryModeForUpdate");
      await operatorQuery(client,"lockIdempotencyKey",[`seat-request:${actorId}:${key}`]);
      const prior = await repo.byKey(client,actorId,key);
      if (prior) {
        if (prior.payload_digest !== payloadDigest)
          throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
        return prior;
      }
      if (currentRecovery.rows[0]?.mode !== "open") throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
      await assertCurrentStudentForSubmission(client,actorId);
      let requestId:string;
      let recipientId:string;
      if (action === "requested") {
        const offer = await repo.offerForUpdate(client,id);
        if (!offer) throw new AppError(404,"Offer not found","RIDE_NOT_FOUND");
        if (offer.status !== "active" || !offer.pilot_request_cutoff_at ||
            offer.pilot_request_cutoff_at <= new Date())
          throw new AppError(409,"Requests are closed","REQUEST_WINDOW_CLOSED");
        if (offer.driver_id === actorId) throw new AppError(409,"You cannot request your own offer","SELF_BOOKING_FORBIDDEN");
        if (offer.pilot_capacity <= 0) throw new AppError(409,"Offer has no seats","INSUFFICIENT_SEATS");
        await assertCurrentDriverCarEligibility(client,offer.driver_id,offer.vehicle_id);
        try { requestId = await repo.insertRequest(client,offer,actorId); }
        catch (error) {
          if ((error as {code?:string}).code === "23505")
            throw new AppError(409,"An active request already exists","DUPLICATE_ACTIVE_REQUEST");
          throw error;
        }
        recipientId = offer.driver_id;
      } else {
        const initial = await repo.requestForUpdate(client,id);
        if (!initial) throw new AppError(404,"Request not found","REQUEST_NOT_FOUND");
        // Match the offer edit lock order for every decision.
        const offer = await repo.offerForUpdate(client,initial.offer_id);
        if (!offer) throw new AppError(404,"Offer not found","RIDE_NOT_FOUND");
        if (initial.driver_id !== actorId) throw new AppError(403,"Only the driver may reject","FORBIDDEN");
        if (initial.status !== "pending" || initial.decision_deadline_at <= new Date())
          throw new AppError(409,"Request is no longer pending","REQUEST_NOT_PENDING");
        await client.query("UPDATE pilot_seat_requests SET status='rejected',decided_at=now() WHERE id=$1",[id]);
        requestId = id;
        recipientId = initial.passenger_id;
      }
      const snapshot = await repo.requestSnapshot(client,requestId);
      const result = {request:visibleRequest(snapshot)};
      const row = await repo.insertOperation(client,{actorId,key,digest:payloadDigest,requestId,action,result,snapshot});
      await repo.audit(client,row);
      await recordDurableNotification(client,{originType:"seat_request",operationId:row.id,
        recipientId,eventType:action,relatedEntityType:"seat_request",relatedEntityId:requestId,
        title:action === "requested" ? "Seat request received" : "Seat request rejected",
        body:action === "requested" ? "A passenger requested one seat. No seat is reserved yet."
          : "The driver rejected your seat request."});
      return row;
    });
    if (operation.state !== "committed") return this.operation(actorId,operation.id);
    try {
      const acknowledged = await inProtectedTransaction(this.db,async client => {
        const row = await repo.operationById(client,operation.id);
        if (!row) throw new AppError(503,"Request operation missing","RECOVERY_MISSING");
        if (row.state !== "committed") return row;
        await evidence.append(receipt(row));
        const backup = await backupStatus(client);
        if (backup.required && !backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
        const result = await repo.acknowledge(client,row.id);
        await repo.readyNotifications(client,row.id);
        return result;
      });
      return {operation_id:acknowledged.id,state:acknowledged.state,...acknowledged.result};
    } catch {
      await restrict(this.db,"seat_request_evidence_pending");
      throw new AppError(503,"Request committed; recovery evidence pending","OPERATION_PENDING",{operationId:operation.id});
    }
  }
}

export const seatRequestsService = new SeatRequestsService();
