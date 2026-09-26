import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { recordDurableNotification } from "../notifications/contract.repo";
import { backupStatus } from "../operator/backup-status";
import { operatorQuery } from "../operator/operator.repo";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { pauseService } from "../operator/pause.service";
import { inProtectedTransaction } from "../protected-mutation/protocol";
import { pilotReceiptStore, restrictProtectedWrites } from "../protected-mutation/receipt-evidence";
import { assertCurrentDriverCarEligibility, assertCurrentStudentForSubmission } from "../verification/verification.service";
import * as repo from "./seat-requests.repo";
import { assertCommitmentsEligible } from "./commitment.service";
import { lockCommitmentActors } from "./commitment.repo";

type Receipt = { operationId:string; actorId:string; key:string; digest:string; requestId:string;
  action:string; result:Record<string,unknown>; snapshot:repo.SeatRequest; createdAt:string };
function receipt(row:repo.RequestOperation):Receipt {
  return {operationId:row.id,actorId:row.actor_id,key:row.idempotency_key,digest:row.payload_digest,
    requestId:row.request_id,action:row.action,result:row.result,snapshot:row.request_snapshot,
    createdAt:row.created_at.toISOString()};
}
function store() {
  return pilotReceiptStore<Receipt>("seat-request","Seat request recovery evidence unavailable");
}
function digest(action:string,id:string) {
  return createHash("sha256").update(JSON.stringify({action,id})).digest("hex");
}
function relatedEventId(operationId:string,kind:string,requestId:string) {
  const hash = createHash("sha256").update(`${operationId}:${kind}:${requestId}`).digest("hex");
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
let clock = () => new Date();
export function setSeatRequestClockForTests(next:(() => Date)|null) {
  if (env.NODE_ENV !== "test") throw new Error("Seat request clock override is test-only");
  clock = next ?? (() => new Date());
}
function visibleRequest(row:repo.SeatRequest) {
  const confirmed = row.status === "accepted";
  return {...row,status:row.status === "pending" && row.decision_deadline_at <= clock() ? "expired" : row.status,
    confirmed,seats_reserved:confirmed ? 1 : 0};
}
function notification(row:repo.RequestOperation,snapshot:repo.SeatRequest) {
  return {eventId:row.id,originType:"seat_request",operationId:row.id,
    recipientId:row.action === "requested" ? snapshot.driver_id : snapshot.passenger_id,
    eventType:row.action,relatedEntityType:"seat_request",relatedEntityId:row.request_id,
    title:row.action === "requested" ? "Seat request received" : row.action === "accepted" ? "Seat confirmed" : "Seat request rejected",
    body:row.action === "requested" ? "A passenger requested one seat. No seat is reserved yet."
      : row.action === "accepted" ? "The driver accepted your seat request. One whole-ride seat is confirmed."
      : "The driver rejected your seat request."};
}
type WithdrawnRequest = {id:string;passenger_id:string};
async function recordDecisionNotifications(client:PoolClient,row:repo.RequestOperation,
  snapshot:repo.SeatRequest,withdrawn:WithdrawnRequest[]) {
  await recordDurableNotification(client,notification(row,snapshot));
  if (row.action === "accepted") await recordDurableNotification(client,{
    originType:"seat_request",operationId:row.id,eventId:relatedEventId(row.id,"accepted_driver",row.request_id),
    recipientId:snapshot.driver_id,eventType:"accepted_driver",relatedEntityType:"seat_request",
    relatedEntityId:row.request_id,title:"Seat confirmed",body:"You accepted one whole-ride seat."});
  for (const item of withdrawn) await recordDurableNotification(client,{
    originType:"seat_request",operationId:row.id,eventId:relatedEventId(row.id,"withdrawn",item.id),
    recipientId:item.passenger_id,eventType:`withdrawn:${item.id}`,relatedEntityType:"seat_request",
    relatedEntityId:item.id,title:"Seat request withdrawn",
    body:"This pending request ended because you accepted an overlapping ride."});
}

export class SeatRequestsService {
  constructor(private readonly db:Pool = pool) {}

  async receipts() {return store().list();}
  async pending() {return repo.pendingOperations(this.db);}
  async verifyEvidence(retry?:{actorId:string;key:string}) {
    try {
      const backup = await backupStatus(this.db);
      if (backup.required && !backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      const receipts = new Map((await store().list()).map(item => [item.operationId,item]));
      const rows = await repo.allOperations(this.db);
      const operations = new Map(rows.map(row => [row.id,row]));
      for (const item of receipts.values()) {
        const row = operations.get(item.operationId);
        if (!row || JSON.stringify(receipt(row)) !== JSON.stringify(item))
          throw new AppError(503,"Seat request recovery evidence conflicts with database","RECOVERY_CONFLICT");
        if (item.action === "accepted" &&
            !await repo.acceptedAllocationMatches(this.db,item.result.booking as repo.Allocation))
          throw new AppError(503,"Accepted seat allocation conflicts with recovery evidence","RECOVERY_CONFLICT");
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
        await restrictProtectedWrites(this.db,"seat_request_evidence_unavailable");
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
        const row = await repo.restoreOperation(client,item);
        if (JSON.stringify(receipt(row)) !== JSON.stringify(item))
          throw new AppError(409,"Seat request recovery conflicts with receipt","RECOVERY_CONFLICT");
        if (item.action === "accepted")
          await repo.reconcileAcceptedAllocation(client,item.result.booking as repo.Allocation);
        if (row.state === "committed") await repo.markRecovered(client,row.id);
        await repo.restoreAudit(client,row);
        if (row.action === "accepted") await repo.auditWithdrawals(client,row.id,
          ((row.result.withdrawn_requests as Array<{id:string}>|undefined) ?? []).map(value => value.id));
        await recordDecisionNotifications(client,row,item.snapshot,
          (row.result.withdrawn_requests as WithdrawnRequest[]|undefined) ?? []);
        await repo.readyNotifications(client,row.id);
      });
    }
    const latest = new Map<string,repo.SeatRequest>();
    for (const item of receipts) {
      if (item.action !== "requested" || !latest.has(item.requestId)) latest.set(item.requestId,item.snapshot);
      if (item.action === "accepted") for (const withdrawn of
        ((item.result.withdrawn_requests as Array<{id:string}>|undefined) ?? [])) {
        const prior = latest.get(withdrawn.id);
        if (prior) latest.set(withdrawn.id,{...prior,status:"withdrawn"});
      }
    }
    for (const [id,expected] of latest) {
      const actual = await repo.requestSnapshot(this.db,id);
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
    const state = recovery.rows[0]?.mode === "restricted" && row.state === "acknowledged"
      ? "pending_unknown" : row.state;
    if (row.action === "accepted" && !await repo.acceptedTripVisible(this.db,row.request_id,actorId))
      return {operation_id:row.id,state};
    return {operation_id:row.id,state,...row.result};
  }

  async list(actorId:string) {
    return (await repo.listForParticipant(this.db,actorId)).map(visibleRequest);
  }

  async confirmed(actorId:string) {
    return repo.listConfirmedForParticipant(this.db,actorId);
  }

  async confirmedTrip(actorId:string,offerId:string) {
    const bookings = await repo.listConfirmedForParticipant(this.db,actorId,offerId);
    if (!bookings.length) throw new AppError(404,"Confirmed trip not found","TRIP_NOT_FOUND");
    return {offer_id:offerId,bookings};
  }

  async mutate(actorId:string,key:string,action:"requested"|"rejected"|"accepted",id:string) {
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
      await restrictProtectedWrites(this.db,"seat_request_evidence_unavailable");
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
      if (action === "accepted") {
        const preview = await repo.requestSnapshot(client,id);
        if (!preview) throw new AppError(404,"Request not found","REQUEST_NOT_FOUND");
        const vehicleId = await repo.vehicleForOffer(client,preview.offer_id);
        if (!vehicleId) throw new AppError(404,"Offer not found","RIDE_NOT_FOUND");
        await lockCommitmentActors(client,preview.driver_id,vehicleId,[preview.passenger_id]);
      }
      await assertCurrentStudentForSubmission(client,actorId);
      let requestId:string;
      let allocation:repo.Allocation|undefined;
      let withdrawn:repo.SeatRequest[]=[];
      if (action === "requested") {
        const offer = await repo.offerForUpdate(client,id);
        if (!offer) throw new AppError(404,"Offer not found","RIDE_NOT_FOUND");
        if (offer.status !== "active" || !offer.pilot_request_cutoff_at ||
            offer.pilot_request_cutoff_at <= clock())
          throw new AppError(409,"Requests are closed","REQUEST_WINDOW_CLOSED");
        if (offer.driver_id === actorId) throw new AppError(409,"You cannot request your own offer","SELF_BOOKING_FORBIDDEN");
        if (offer.pilot_capacity <= 0) throw new AppError(409,"Offer has no seats","INSUFFICIENT_SEATS");
        if (await repo.hasConfirmedSeat(client,offer.id,actorId))
          throw new AppError(409,"You already have a confirmed seat","DUPLICATE_ACTIVE_REQUEST");
        await assertCurrentDriverCarEligibility(client,offer.driver_id,offer.vehicle_id);
        try { requestId = await repo.insertRequest(client,offer,actorId); }
        catch (error) {
          if ((error as {code?:string}).code === "23505")
            throw new AppError(409,"An active request already exists","DUPLICATE_ACTIVE_REQUEST");
          throw error;
        }
      } else {
        const initial = await repo.requestForUpdate(client,id);
        if (!initial) throw new AppError(404,"Request not found","REQUEST_NOT_FOUND");
        // Match the offer edit lock order for every decision.
        const offer = await repo.offerForUpdate(client,initial.offer_id);
        if (!offer) throw new AppError(404,"Offer not found","RIDE_NOT_FOUND");
        if (initial.driver_id !== actorId) throw new AppError(403,"Only the driver may decide","FORBIDDEN");
        await assertCurrentDriverCarEligibility(client,actorId,offer.vehicle_id);
        if (initial.status !== "pending" || initial.decision_deadline_at <= clock())
          throw new AppError(409,"Request is no longer pending","REQUEST_NOT_PENDING");
        if (action === "accepted") {
          await assertCurrentStudentForSubmission(client,initial.passenger_id);
          if (offer.status !== "active" || offer.pilot_acceptance_cutoff_at <= clock())
            throw new AppError(409,"Acceptance window is closed","ACCEPTANCE_WINDOW_CLOSED");
          if (initial.offer_version !== offer.pilot_version ||
              JSON.stringify(initial.offer_terms) !== JSON.stringify(offer.terms))
            throw new AppError(409,"Offer terms changed","OFFER_TERMS_CHANGED");
          if (offer.pilot_capacity > (await repo.currentVehicleSeatCapacity(client,offer.vehicle_id) ?? 0))
            throw new AppError(409,"Offer exceeds the car's current seat limit","CAPACITY_INVALID");
          if (await repo.allocatedSeatCount(client,offer.id) >= offer.pilot_capacity)
            throw new AppError(409,"No seat remains","INSUFFICIENT_SEATS");
          await assertCommitmentsEligible(client,{driverId:actorId,vehicleId:offer.vehicle_id,
            passengerIds:[initial.passenger_id],rideId:offer.id,departureAt:offer.departure_at,
            durationMinutes:Math.ceil((offer.pilot_commitment_until.getTime()-offer.departure_at.getTime())/60_000)});
          allocation = await repo.allocate(client,initial,offer);
          await repo.accept(client,id);
          withdrawn = await repo.withdrawIncompatible(client,[initial.passenger_id,actorId],offer.id,
            offer.departure_at,offer.pilot_commitment_until);
        } else await repo.rejectRequest(client,id);
        requestId = id;
      }
      const snapshot = await repo.requestSnapshot(client,requestId);
      const result = {request:visibleRequest(snapshot),...(allocation ? {booking:allocation,
        withdrawn_requests:withdrawn.map(item => ({id:item.id,passenger_id:item.passenger_id,
          reason:"overlapping confirmed ride"}))} : {})};
      const row = await repo.insertOperation(client,{actorId,key,digest:payloadDigest,requestId,action,result,snapshot});
      await repo.audit(client,row);
      if (withdrawn.length) await repo.auditWithdrawals(client,row.id,withdrawn.map(item => item.id));
      await recordDecisionNotifications(client,row,snapshot,withdrawn);
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
      await restrictProtectedWrites(this.db,"seat_request_evidence_pending");
      throw new AppError(503,"Request committed; recovery evidence pending","OPERATION_PENDING",{operationId:operation.id});
    }
  }
}

export const seatRequestsService = new SeatRequestsService();
