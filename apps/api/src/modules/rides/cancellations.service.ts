import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { recordDurableNotification } from "../notifications/contract.repo";
import { backupStatus } from "../operator/backup-status";
import { operatorQuery } from "../operator/operator.repo";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { pauseService } from "../operator/pause.service";
import { inProtectedTransaction } from "../protected-mutation/protocol";
import { pilotReceiptStore, restrictProtectedWrites } from "../protected-mutation/receipt-evidence";
import * as repo from "./cancellations.repo";

type Target = "request"|"offer";
type Receipt = {operationId:string;actorId:string;key:string;digest:string;targetType:Target;
  targetId:string;reason:string|null;result:repo.CancellationOperation["result"];createdAt:string};
function receipt(row:repo.CancellationOperation):Receipt {
  return {operationId:row.id,actorId:row.actor_id,key:row.idempotency_key,digest:row.payload_digest,
    targetType:row.target_type,targetId:row.target_id,reason:row.reason,result:row.result,
    createdAt:row.created_at.toISOString()};
}
function store() {return pilotReceiptStore<Receipt>("pilot-cancellation","Cancellation recovery evidence unavailable");}
function digest(targetType:Target,targetId:string,reason:string|null) {
  return createHash("sha256").update(JSON.stringify({targetType,targetId,reason})).digest("hex");
}
function publicResult(row:repo.CancellationOperation) {
  return {operation_id:row.id,state:row.state,target_type:row.target_type,target_id:row.target_id,
    actor_id:row.actor_id,reason:row.reason,...row.result};
}
async function notifications(client:PoolClient,row:repo.CancellationOperation) {
  const recipients=new Set(row.result.requests.map(item => item.passenger_id));
  if (row.target_type === "request") {
    const driver=(await client.query<{driver_id:string}>(
      "SELECT driver_id FROM ride_offers WHERE id=$1",[row.result.offer_id])).rows[0]?.driver_id;
    if (driver) recipients.add(driver);
  } else recipients.add(row.actor_id);
  for (const recipientId of recipients) await recordDurableNotification(client,{
    originType:"pilot_cancellation",operationId:row.id,recipientId,eventType:"cancelled",
    relatedEntityType:row.target_type === "offer" ? "ride_offer" : "seat_request",
    relatedEntityId:row.target_id,title:row.target_type === "offer" ? "Ride cancelled" : "Seat cancelled",
    body:row.target_type === "offer"
      ? "The driver cancelled this ride. Confirmed seats and pending requests have ended."
      : "This seat request or booking was cancelled. Any confirmed seat has been released."});
}

export class CancellationsService {
  constructor(private readonly db:Pool=pool) {}
  async receipts() {return store().list();}
  async pending() {return (await repo.all(this.db)).filter(row => row.state === "committed");}
  async verifyEvidence(retry?:{actorId:string;key:string}) {
    try {
      const backup=await backupStatus(this.db);
      if (backup.required && !backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      const receipts=new Map((await this.receipts()).map(item => [item.operationId,item]));
      for (const row of await repo.all(this.db)) {
        if (row.state !== "committed" && JSON.stringify(receipts.get(row.id)) !== JSON.stringify(receipt(row)))
          throw new AppError(503,"Cancellation recovery evidence missing","RECOVERY_MISSING");
        if (row.state === "committed" && (!retry || row.actor_id !== retry.actorId || row.idempotency_key !== retry.key))
          throw new AppError(503,"Cancellation recovery pending","OPERATION_PENDING",{operationId:row.id});
        if (!await repo.stateMatches(this.db,row))
          throw new AppError(503,"Cancellation state conflicts with recovery evidence","RECOVERY_CONFLICT");
      }
      for (const item of receipts.values()) {
        const row=await repo.byId(this.db,item.operationId);
        if (!row || JSON.stringify(receipt(row)) !== JSON.stringify(item))
          throw new AppError(503,"Cancellation recovery evidence conflicts","RECOVERY_CONFLICT");
      }
    } catch(error) {
      if (!(error instanceof AppError && error.code === "OPERATION_PENDING"))
        await restrictProtectedWrites(this.db,"pilot_cancellation_evidence_unavailable");
      throw error;
    }
  }
  async reconcileReceipts(operatorId:string) {
    await inProtectedTransaction(this.db,client => assertCurrentOperator(client,operatorId));
    for (const row of await this.pending()) await store().append(receipt(row));
    const items=(await this.receipts()).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
    for (const item of items) await inProtectedTransaction(this.db,async client => {
      await assertCurrentOperator(client,operatorId);
      await repo.restore(client,item);
      const row=await repo.byId(client,item.operationId);
      if (!row || JSON.stringify(receipt(row)) !== JSON.stringify(item))
        throw new AppError(409,"Cancellation recovery conflicts","RECOVERY_CONFLICT");
      if (!await repo.stateMatches(client,row))
        throw new AppError(409,"Cancellation state conflicts with recovery receipt","RECOVERY_CONFLICT");
      await notifications(client,row);
      await repo.readyNotifications(client,row.id);
      await client.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
        last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
        WHERE event_id IN (SELECT id FROM pilot_notification_events
          WHERE origin_type='pilot_cancellation' AND operation_id=$1)`,[row.id]);
    });
    return items.length;
  }
  async operation(actorId:string,id:string) {
    const row=await repo.byId(this.db,id,actorId);
    if (!row) throw new AppError(404,"Operation not found","OPERATION_NOT_FOUND");
    const recovery=await operatorQuery<{mode:string}>(this.db,"recoveryMode");
    return {...publicResult(row),state:recovery.rows[0]?.mode === "restricted" && row.state === "acknowledged"
      ? "pending_unknown" : row.state};
  }
  async cancel(actorId:string,key:string,targetType:Target,targetId:string,reason:string|null) {
    const payloadDigest=digest(targetType,targetId,reason);
    const existing=await repo.byKey(this.db,actorId,key);
    if (existing && existing.payload_digest !== payloadDigest)
      throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
    if (existing) return this.operation(actorId,existing.id);
    await pauseService.assertAvailable(targetType === "offer" ? "offers" : "booking");
    await this.verifyEvidence({actorId,key});
    try {await store().probe();} catch(error) {
      await restrictProtectedWrites(this.db,"pilot_cancellation_evidence_unavailable");throw error;
    }
    const operation=await inProtectedTransaction(this.db,async client => {
      const recovery=await operatorQuery<{mode:string}>(client,"recoveryModeForUpdate");
      await operatorQuery(client,"lockIdempotencyKey",[`pilot-cancellation:${actorId}:${key}`]);
      const prior=await repo.byKey(client,actorId,key);
      if (prior) {
        if (prior.payload_digest !== payloadDigest)
          throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
        return prior;
      }
      if (recovery.rows[0]?.mode !== "open")
        throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
      const user=(await client.query<{status:string}>("SELECT status FROM users WHERE id=$1 FOR SHARE",[actorId])).rows[0];
      if (!user || user.status !== "active") throw new AppError(403,"Account is not active","FORBIDDEN");
      const offerId=targetType === "offer" ? targetId : await repo.requestOfferId(client,targetId);
      if (!offerId) throw new AppError(404,"Request not found","REQUEST_NOT_FOUND");
      // Acceptance locks its request and then its offer; use the same order for cancellation.
      const requests=await repo.requestsForOffer(client,offerId);
      const offer=await repo.offerForUpdate(client,offerId);
      if (!offer) throw new AppError(404,"Offer not found","RIDE_NOT_FOUND");
      const now=new Date();
      if (targetType === "offer" ? offer.driver_id !== actorId
        : requests.find(item => item.id === targetId)?.passenger_id !== actorId)
        throw new AppError(403,"Only the participant may cancel","FORBIDDEN");
      if (offer.status === "departed" || offer.departure_at <= now)
        throw new AppError(409,"Trip has started or reached departure; operator review required","REVIEW_REQUIRED");
      if (offer.status !== "active") throw new AppError(409,"Offer is not active","OFFER_NOT_ACTIVE");
      const affected=targetType === "offer"
        ? requests.filter(item => item.status === "pending" || item.status === "accepted")
        : requests.filter(item => item.id === targetId && (item.status === "pending" || item.status === "accepted"));
      if (targetType === "request" && !affected.length)
        throw new AppError(409,"Request is not active","REQUEST_NOT_ACTIVE");
      const row=await repo.cancel(client,{actorId,key,digest:payloadDigest,targetType,targetId,
        offerId,reason,requests:affected,at:now});
      await notifications(client,row);
      return row;
    });
    if (operation.state !== "committed") return publicResult(operation);
    try {
      const saved=await inProtectedTransaction(this.db,async client => {
        const row=await repo.byId(client,operation.id);
        if (!row) throw new AppError(503,"Cancellation operation missing","RECOVERY_MISSING");
        if (row.state !== "committed") return row;
        await store().append(receipt(row));
        const backup=await backupStatus(client);
        if (backup.required && !backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
        const acknowledged=await repo.acknowledge(client,row.id);
        await repo.readyNotifications(client,row.id);
        return acknowledged;
      });
      return publicResult(saved);
    } catch {
      await restrictProtectedWrites(this.db,"pilot_cancellation_evidence_pending");
      throw new AppError(503,"Cancellation committed; recovery evidence pending","OPERATION_PENDING",
        {operationId:operation.id});
    }
  }
}
export const cancellationsService=new CancellationsService();
