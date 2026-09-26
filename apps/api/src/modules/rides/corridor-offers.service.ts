import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { inProtectedTransaction } from "../protected-mutation/protocol";
import { B2ReceiptStore } from "../operator/b2-receipt-store";
import { SignedReceiptStore } from "../operator/receipt-store";
import { backupStatus } from "../operator/backup-status";
import { operatorQuery } from "../operator/operator.repo";
import { assertCurrentOperator } from "../operator/operator.authorization";
import { pauseService } from "../operator/pause.service";
import { recordDurableNotification } from "../notifications/contract.repo";
import { assertCurrentDriverCarEligibility, assertCurrentStudentForSubmission } from "../verification/verification.service";
import { assertCommitmentsEligible, assertWithinSupportWindow } from "./commitment.service";
import type { CorridorOfferInput } from "./corridor-offers.schema";
import * as repo from "./corridor-offers.repo";

type Receipt = { operationId: string; actorId: string; key: string; digest: string;
  offerId: string; action: string; result: Record<string, unknown>;
  offerSnapshot: Record<string, unknown>; createdAt: string };
type OfferCommand = { kind: "publish"; input: CorridorOfferInput } |
  { kind: "update"; offerId: string; version: number; input: CorridorOfferInput };
function digest(action: string, offerId: string | null, input: CorridorOfferInput & { version?: number }) {
  return createHash("sha256").update(JSON.stringify({ action, offerId, input })).digest("hex");
}
function receipt(row: repo.Operation): Receipt {
  return { operationId: row.id, actorId: row.actor_id, key: row.idempotency_key,
    digest: row.payload_digest, offerId: row.offer_id, action: row.action,
    result: row.result, offerSnapshot: row.offer_snapshot, createdAt: row.created_at.toISOString() };
}
function store() {
  const secret = process.env.PILOT_RECEIPT_SECRET ?? env.PILOT_RECEIPT_SECRET;
  if (!secret || secret.length < 32) throw new AppError(503,"Offer recovery evidence unavailable","RECOVERY_UNAVAILABLE");
  if (env.PILOT_RECEIPT_BACKEND === "b2") {
    const { PILOT_B2_BUCKET: bucket, PILOT_B2_ENDPOINT: endpoint, PILOT_B2_WRITER_KEY_ID: keyId,
      PILOT_B2_WRITER_KEY: applicationKey, PILOT_B2_PREFIX: prefix,
      PILOT_B2_RETENTION_DAYS: retentionDays } = env;
    if (!bucket || !endpoint || !keyId || !applicationKey || !prefix || !retentionDays)
      throw new AppError(503,"Offer recovery evidence unavailable","RECOVERY_UNAVAILABLE");
    return new B2ReceiptStore<Receipt>({ bucket,endpoint,keyId,applicationKey,prefix,retentionDays,secret },"corridor-offer");
  }
  const path = process.env.PILOT_RECEIPT_PATH ?? env.PILOT_RECEIPT_PATH;
  if (env.NODE_ENV === "production" || !path)
    throw new AppError(503,"Offer recovery evidence unavailable","RECOVERY_UNAVAILABLE");
  return new SignedReceiptStore<Receipt>(`${path}.corridor-offer`,secret);
}
async function restrict(db: Pool, cause: string) {
  await inProtectedTransaction(db, async client => {
    await operatorQuery(client,"recoveryModeForUpdate");
    await operatorQuery(client,"enterRestrictedMode",[cause]);
    await operatorQuery(client,"recordRestriction",[cause]);
  });
}
async function policySnapshot(db: PoolClient, input: CorridorOfferInput, now: Date) {
  const policy = await repo.currentPolicy(db);
  if (!policy) throw new AppError(503,"Corridor policy unavailable","PILOT_POLICY_UNAVAILABLE");
  if (env.NODE_ENV === "production" && !policy.approved_for_real_trips)
    throw new AppError(503,"Corridor policy is provisional","PILOT_POLICY_UNAVAILABLE");
  const departure = new Date(input.departure_at);
  assertWithinSupportWindow(now);
  if (departure.getTime() <= now.getTime() + 60 * 60_000)
    throw new AppError(409,"Departure must allow the request cutoff","OFFER_WINDOW_CLOSED");
  const local = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(departure);
  const part = (name: string) => local.find(item => item.type === name)?.value ?? "";
  const day = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(part("weekday"))+1;
  const clock = `${part("hour")}:${part("minute")}`;
  if (!policy.weekdays.includes(day) || clock < policy.schedule_start.slice(0,5) || clock >= policy.schedule_end.slice(0,5))
    throw new AppError(409,"Departure is outside the corridor schedule","OFFER_WINDOW_CLOSED");
  assertWithinSupportWindow(departure);
  const selectedPair = await repo.pair(db,policy.id,input.origin_code,input.destination_code);
  if (!selectedPair) throw new AppError(400,"Stop pair is not permitted","STOP_PAIR_INVALID");
  const stops = await repo.stops(db,policy.id);
  const origin = stops.find(item => item.code === input.origin_code)!;
  const destination = stops.find(item => item.code === input.destination_code)!;
  const snapshot = { version:policy.version, currency:policy.currency,
    expected_minutes:policy.expected_minutes, buffer_minutes:policy.buffer_minutes,
    cancellation_notice:policy.cancellation_notice, contact_notice:policy.contact_notice,
    contribution_paise:selectedPair.amount_paise,
    origin:{ code:origin.code,label:origin.label }, destination:{ code:destination.code,label:destination.label } };
  return { policy,origin,destination,departure,snapshot };
}
export class CorridorOffersService {
  constructor(private readonly db: Pool = pool) {}
  async receipts() { return store().list(); }
  async pending() { return repo.pending(this.db); }
  async operation(actorId: string,id: string) {
    try { await this.verifyEvidence(); } catch { /* An uncertain operation stays pending. */ }
    const row = await repo.operationForActor(this.db,id,actorId);
    if (!row) throw new AppError(404,"Operation not found","OPERATION_NOT_FOUND");
    const recovery = await operatorQuery<{mode:string}>(this.db,"recoveryMode");
    return {operation_id:row.id,state:recovery.rows[0]?.mode === "restricted" && row.state === "acknowledged"
      ? "pending_unknown" : row.state,...row.result};
  }
  async policy(userId: string) {
    await inProtectedTransaction(this.db, client => assertCurrentStudentForSubmission(client,userId));
    const policy = await repo.currentPolicy(this.db);
    if (!policy) throw new AppError(503,"Corridor policy unavailable","PILOT_POLICY_UNAVAILABLE");
    return { version:policy.version,currency:policy.currency,expected_minutes:policy.expected_minutes,
      buffer_minutes:policy.buffer_minutes,schedule_start:policy.schedule_start,schedule_end:policy.schedule_end,
      weekdays:policy.weekdays,cancellation_notice:policy.cancellation_notice,contact_notice:policy.contact_notice,
      provisional:!policy.approved_for_real_trips,stops:await repo.stops(this.db,policy.id),
      permitted_pairs:await repo.pairs(this.db,policy.id) };
  }
  async discover(userId: string,origin: string,destination: string,date?: string) {
    await pauseService.assertAvailable("offers");
    await pauseService.assertAvailable("booking");
    assertWithinSupportWindow(new Date());
    await inProtectedTransaction(this.db, client => assertCurrentStudentForSubmission(client,userId));
    const policy = await repo.currentPolicy(this.db);
    if (!policy || !await repo.pair(this.db,policy.id,origin,destination))
      throw new AppError(400,"Stop pair is not permitted","STOP_PAIR_INVALID");
    const offers = await repo.discover(this.db,origin,destination,date);
    return offers.filter((offer: {departure_at: Date}) => {
      try { assertWithinSupportWindow(new Date(offer.departure_at)); return true; }
      catch { return false; }
    });
  }
  async verifyEvidence(retry?: { actorId: string; key: string }) {
    try {
      const backup = await backupStatus(this.db);
      if (backup.required && !backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      const receipts = new Map((await store().list()).map(item => [item.operationId,item]));
      const operations = new Map((await repo.allOperations(this.db)).map(row => [row.id,row]));
      for (const item of receipts.values()) {
        const row = operations.get(item.operationId);
        if (!row || JSON.stringify(receipt(row)) !== JSON.stringify(item))
          throw new AppError(503,"Offer recovery evidence conflicts with database","RECOVERY_CONFLICT");
      }
      for (const row of await repo.acknowledged(this.db)) {
        if (JSON.stringify(receipts.get(row.id)) !== JSON.stringify(receipt(row)))
          throw new AppError(503,"Offer recovery evidence missing","RECOVERY_MISSING");
      }
      const pending = await repo.pending(this.db);
      if (pending.length && (!retry || pending.some(row => row.actor_id !== retry.actorId || row.idempotency_key !== retry.key))) {
        const recent = pending.every(row => Date.now()-row.created_at.getTime() < 5000);
        throw new AppError(503,"Offer operation awaits recovery evidence",
          recent ? "OPERATION_PENDING" : "RECOVERY_PENDING_STALE",{operationId:pending[0].id});
      }
    } catch (error) {
      if (!(error instanceof AppError && error.code === "OPERATION_PENDING"))
        await restrict(this.db,"corridor_offer_evidence_unavailable");
      throw error;
    }
  }
  async reconcileReceipts(operatorId: string) {
    const receipts = (await store().list()).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
    for (const item of receipts) {
      await inProtectedTransaction(this.db,async client => {
        await assertCurrentOperator(client,operatorId);
        await repo.restoreOperation(client,item);
        const row = await repo.byId(client,item.operationId);
        if (!row || JSON.stringify(receipt(row)) !== JSON.stringify(item))
          throw new AppError(409,"Offer recovery receipt conflicts with database","RECOVERY_CONFLICT");
        const snapshotVersion = Number(item.offerSnapshot.pilot_version);
        const current = await repo.offerForUpdate(client,item.offerId);
        if (!current && item.action === "published") {
          await repo.insertOfferSnapshot(client,item.offerSnapshot);
        } else if (!current) {
          throw new AppError(409,"Offer update needs its publication receipt","RECOVERY_INCOMPLETE");
        } else if (current.pilot_version === snapshotVersion) {
          const live = await repo.offerSnapshot(client,item.offerId);
          for (const field of ["driver_id","vehicle_id","date","time","price_per_seat_paise",
            "pilot_policy_id","pilot_policy_snapshot","pilot_origin_code","pilot_destination_code",
            "pilot_capacity","pilot_currency","pilot_request_cutoff_at","pilot_acceptance_cutoff_at",
            "pilot_commitment_until"]) {
            if (JSON.stringify(live[field]) !== JSON.stringify(item.offerSnapshot[field]))
              throw new AppError(409,"Offer recovery state conflicts with receipt","RECOVERY_CONFLICT");
          }
        } else if (current.pilot_version < snapshotVersion && item.action === "updated") {
          await repo.updateOfferSnapshot(client,item.offerId,item.offerSnapshot);
        }
        await repo.auditOperation(client,item.operationId,item.offerId,item.actorId,item.action);
        await recordDurableNotification(client,{originType:"corridor_offer",operationId:item.operationId,
          recipientId:item.actorId,eventType:item.action,relatedEntityType:"ride_offer",relatedEntityId:item.offerId,
          title:item.action === "published" ? "Offer published" : "Offer updated",
          body:"Your corridor offer terms are available in trip details."});
        await repo.readyNotification(client,item.operationId);
        await repo.suppressRestoredEmail(client,item.operationId);
      });
    }
    return receipts.length;
  }
  async publish(actorId: string,key: string,command: OfferCommand) {
    const {input} = command;
    const offerId = command.kind === "update" ? command.offerId : undefined;
    const version = command.kind === "update" ? command.version : undefined;
    const action = command.kind === "update" ? "updated" : "published";
    const payloadDigest = digest(action,offerId ?? null,{...input,version});
    const existing = await repo.byKey(this.db,actorId,key);
    if (existing && existing.payload_digest !== payloadDigest)
      throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
    const recovery = await operatorQuery<{mode:string}>(this.db,"recoveryMode");
    if (existing && recovery.rows[0]?.mode !== "open") return this.operation(actorId,existing.id);
    if (!existing) await pauseService.assertAvailable("offers");
    await this.verifyEvidence({ actorId,key });
    const operation = await inProtectedTransaction(this.db,async client => {
      const recovery = await operatorQuery<{mode:string}>(client,"recoveryModeForUpdate");
      await operatorQuery(client,"lockIdempotencyKey",[`corridor-offer:${actorId}:${key}`]);
      const prior = await repo.byKey(client,actorId,key);
      if (prior) {
        if (prior.payload_digest !== payloadDigest) throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
        return prior;
      }
      if (recovery.rows[0]?.mode !== "open") throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
      store();
      const current = offerId ? await repo.offerForUpdate(client,offerId) : null;
      if (offerId && !current) throw new AppError(404,"Offer not found","RIDE_NOT_FOUND");
      if (current && current.driver_id !== actorId) throw new AppError(403,"Only the driver may edit this offer","FORBIDDEN");
      if (current && (current.status !== "active" || current.pilot_version !== version || await repo.requestCount(client,offerId!)))
        throw new AppError(409,"Offer terms are frozen or version is stale","OFFER_FROZEN");
      const { policy,origin,destination,departure,snapshot } = await policySnapshot(client,input,new Date());
      await assertCurrentDriverCarEligibility(client,actorId,input.vehicle_id);
      const capacity = await repo.vehicleCapacity(client,input.vehicle_id);
      if (capacity === null || input.capacity > capacity) throw new AppError(400,"Capacity exceeds approved car limit","CAPACITY_INVALID");
      await assertCommitmentsEligible(client,{ driverId:actorId,vehicleId:input.vehicle_id,
        passengerIds:[],rideId:offerId ?? null,departureAt:departure,
        durationMinutes:policy.expected_minutes+policy.buffer_minutes });
      const requestCutoff = new Date(departure.getTime()-60*60_000);
      const acceptanceCutoff = new Date(departure.getTime()-30*60_000);
      const commitmentUntil = new Date(departure.getTime()+(policy.expected_minutes+policy.buffer_minutes)*60_000);
      const saved = await repo.saveOffer(client,{actorId,vehicleId:input.vehicle_id,origin,destination,
        departure,contributionPaise:snapshot.contribution_paise,capacity:input.capacity,policyId:policy.id,
        snapshot,requestCutoff,acceptanceCutoff,commitmentUntil},offerId);
      const offerSnapshot = await repo.offerSnapshot(client,saved.id);
      const result = { id:saved.id,version:saved.pilot_version,policy_version:policy.version,
        origin_code:origin.code,destination_code:destination.code,departure_at:departure.toISOString(),
        capacity:input.capacity,contribution_paise:snapshot.contribution_paise,currency:"INR",
        request_cutoff_at:requestCutoff,acceptance_cutoff_at:acceptanceCutoff,commitment_until:commitmentUntil,
        cancellation_notice:policy.cancellation_notice,contact_notice:policy.contact_notice };
      const row = await repo.createOperation(client,{actorId,key,digest:payloadDigest,offerId:saved.id,
        action,result,snapshot:offerSnapshot});
      await repo.auditOperation(client,row.id,saved.id,actorId,action);
      await recordDurableNotification(client,{originType:"corridor_offer",operationId:row.id,
        recipientId:actorId,eventType:action,relatedEntityType:"ride_offer",relatedEntityId:saved.id,
        title:action === "published" ? "Offer published" : "Offer updated",body:"Your corridor offer terms are available in trip details."});
      return row;
    });
    if (operation.state !== "committed") return {operation_id:operation.id,state:operation.state,...operation.result};
    try {
      const saved = await inProtectedTransaction(this.db,async client => {
        const row = await repo.byId(client,operation.id);
        if (!row) throw new AppError(503,"Offer operation missing","RECOVERY_MISSING");
        if (row.state !== "committed") return row;
        await store().append(receipt(row));
        const backup = await backupStatus(client);
        if (backup.required && !backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
        const acknowledged = await repo.acknowledgeOperation(client,row.id);
        await repo.readyNotification(client,row.id);
        return acknowledged;
      });
      return {operation_id:saved.id,state:saved.state,...saved.result};
    } catch {
      await restrict(this.db,"corridor_offer_evidence_pending");
      throw new AppError(503,"Offer committed; recovery evidence pending","OPERATION_PENDING",{operationId:operation.id});
    }
  }
}
export const corridorOffersService = new CorridorOffersService();
