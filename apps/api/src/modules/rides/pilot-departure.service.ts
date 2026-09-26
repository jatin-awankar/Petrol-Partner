import {createHash} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {pool} from "../../db/pool";
import {AppError} from "../../shared/errors/app-error";
import {recordDurableNotification} from "../notifications/contract.repo";
import {backupStatus} from "../operator/backup-status";
import {operatorQuery} from "../operator/operator.repo";
import {assertCurrentOperator} from "../operator/operator.authorization";
import {pauseService} from "../operator/pause.service";
import {inProtectedTransaction} from "../protected-mutation/protocol";
import {pilotReceiptStore,restrictProtectedWrites} from "../protected-mutation/receipt-evidence";
import {assertCurrentDriverCarEligibility} from "../verification/verification.service";
import {assertCommitmentsEligible,assertWithinSupportWindow} from "./commitment.service";
import * as repo from "./pilot-departure.repo";

type Receipt={operationId:string;offerId:string;actorId:string;driverId:string;key:string;digest:string;
  kind:repo.Operation["kind"];reason:string|null;boardedIds:string[];confirmedIds:string[];startedAt:string};
const store=()=>pilotReceiptStore<Receipt>("pilot-departure","Departure recovery evidence unavailable");
const digest=(offerId:string,boardedIds:string[],kind:string,reason:string|null)=>createHash("sha256")
  .update(JSON.stringify({offerId,boardedIds,kind,reason})).digest("hex");
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,offerId:row.offer_id,
  actorId:row.actor_id,driverId:row.driver_id,key:row.idempotency_key,digest:row.payload_digest,
  kind:row.kind,reason:row.reason,boardedIds:row.boarded_allocation_ids,
  confirmedIds:row.confirmed_allocation_ids,startedAt:row.started_at.toISOString()});
const result=(row:repo.Operation)=>({operation_id:row.id,offer_id:row.offer_id,
  state:row.state,kind:row.kind,boarded_allocation_ids:row.boarded_allocation_ids,
  started_at:row.started_at.toISOString()});
async function notifications(db:PoolClient,row:repo.Operation,passengers:string[]) {
  for(const recipientId of new Set([row.driver_id,...passengers])) await recordDurableNotification(db,{
    originType:"pilot_departure",operationId:row.id,recipientId,eventType:"ride_departed",
    relatedEntityType:"ride_offer",relatedEntityId:row.offer_id,title:"Ride departed",
    body:"The ride has started. Boarding is recorded in the confirmed trip details."});
  if(row.confirmed_allocation_ids.length>row.boarded_allocation_ids.length)
    for(const recipientId of await repo.operatorRecipients(db)) await recordDurableNotification(db,{
      originType:"pilot_departure",operationId:row.id,recipientId,eventType:"boarding_absence_review",
      relatedEntityType:"ride_offer",relatedEntityId:row.offer_id,title:"Boarding absence needs review",
      body:"One or more confirmed passengers were recorded as not boarded. Review the trip before any journey decision."});
}
export class PilotDepartureService {
  constructor(private readonly db:Pool=pool){}
  async receipts() {return store().list();}
  async openSignals(operatorId:string) {
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    return repo.openSignals(this.db);
  }
  async verifyEvidence(retry?:{actorId:string;key:string}) {
    try {
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      const receipts=new Map((await store().list()).map(item=>[item.operationId,item]));
      for(const item of receipts.values()) if(item.digest!==digest(item.offerId,item.boardedIds,item.kind,item.reason))
        throw new AppError(503,"Departure receipt is inconsistent","RECOVERY_CONFLICT");
      for(const row of await repo.acknowledged(this.db))
        if(JSON.stringify(receipts.get(row.id))!==JSON.stringify(receipt(row))||
          !await repo.stateMatches(this.db,row))
          throw new AppError(503,"Departure recovery evidence is missing","RECOVERY_MISSING");
      const pending=await repo.pending(this.db);
      if(pending.length&&(!retry||pending.some(row=>row.actor_id!==retry.actorId||row.idempotency_key!==retry.key)))
        throw new AppError(503,"Departure awaits recovery evidence","OPERATION_PENDING",{operationId:pending[0].id});
    } catch(error) {await restrictProtectedWrites(this.db,"pilot_departure_evidence_unavailable");throw error;}
  }
  async operation(actorId:string,id:string) {
    const row=await repo.byId(this.db,id);
    if(!row||row.actor_id!==actorId) throw new AppError(404,"Operation not found","OPERATION_NOT_FOUND");
    const recovery=await operatorQuery<{mode:string}>(this.db,"recoveryMode");
    return row.state==='committed'||recovery.rows[0]?.mode==='restricted'
      ? {operation_id:id,state:"pending_unknown"} : result(row);
  }
  async start(actorId:string,key:string,offerId:string,boardedIds:string[],
    kind:repo.Operation["kind"]="departure",reason:string|null=null,now?:Date) {
    const sorted=[...boardedIds].sort();
    if(new Set(sorted).size!==sorted.length) throw new AppError(400,"Duplicate boarding IDs","BOARDING_INVALID");
    if(kind==='late_departure'&&(!reason||reason.trim().length<8))
      throw new AppError(400,"Late departure requires an operator reason","REASON_REQUIRED");
    const payloadDigest=digest(offerId,sorted,kind,reason);
    const prior=await repo.byKey(this.db,actorId,key);
    if(prior&&prior.payload_digest!==payloadDigest) throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
    if(prior) return this.operation(actorId,prior.id);
    await pauseService.assertAvailable("booking");
    await this.verifyEvidence({actorId,key});
    try {await store().probe();} catch(error) {
      await restrictProtectedWrites(this.db,"pilot_departure_evidence_unavailable");throw error;
    }
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,"recoveryModeForUpdate");
      await operatorQuery(client,"lockIdempotencyKey",[`pilot-departure:${actorId}:${key}`]);
      const existing=await repo.byKey(client,actorId,key);
      if(existing) {
        if(existing.payload_digest!==payloadDigest) throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      if(recovery.rows[0]?.mode!=="open") throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
      // Cancellation locks request rows before its offer; departure follows that order.
      await client.query("SELECT id FROM pilot_seat_requests WHERE offer_id=$1 ORDER BY id FOR UPDATE",[offerId]);
      const ride=await repo.offer(client,offerId);
      if(!ride) throw new AppError(404,"Pilot offer not found","RIDE_NOT_FOUND");
      if(kind==='departure'&&ride.driver_id!==actorId) throw new AppError(403,"Only the driver may depart","FORBIDDEN");
      if(kind==='late_departure') await assertCurrentOperator(client,actorId);
      if(ride.status!=="active") throw new AppError(409,"Offer is not active","DEPARTURE_INVALID");
      await assertCurrentDriverCarEligibility(client,ride.driver_id,ride.vehicle_id);
      const allocations=await repo.allocations(client,offerId);
      if(allocations.some(row=>row.status!=='confirmed')) throw new AppError(409,"A booking is held","BOOKING_HELD");
      const commitment={driverId:ride.driver_id,vehicleId:ride.vehicle_id,
        passengerIds:allocations.map(row=>row.passenger_id),rideId:offerId,
        durationMinutes:Math.ceil((ride.pilot_commitment_until.getTime()-ride.departure_at.getTime())/60_000)};
      await assertCommitmentsEligible(client,{...commitment,departureAt:ride.departure_at});
      const decisionAt=now??new Date();
      const delta=decisionAt.getTime()-ride.departure_at.getTime();
      if(kind==='departure'&&(delta< -15*60_000||delta>30*60_000))
        throw new AppError(409,"Departure is outside the allowed window","DEPARTURE_WINDOW_CLOSED");
      if(kind==='late_departure'&&delta<=30*60_000)
        throw new AppError(409,"Late resolution requires a delayed ride","RIDE_NOT_DELAYED");
      assertWithinSupportWindow(decisionAt);
      await assertCommitmentsEligible(client,{...commitment,departureAt:decisionAt});
      if(await repo.stillActiveTrip(client,offerId,ride.driver_id,ride.vehicle_id,
        allocations.map(row=>row.passenger_id)))
        throw new AppError(409,"A participant or car still has an active trip","ACTIVE_TRIP_CONFLICT");
      const confirmedIds=allocations.map(row=>row.id).sort();
      if(sorted.some(id=>!confirmedIds.includes(id))) throw new AppError(409,"Boarding requires confirmed seats","BOARDING_INVALID");
      const row=await repo.record(client,{offerId,actorId,driverId:ride.driver_id,key,digest:payloadDigest,
        kind,reason,boardedIds:sorted,confirmedIds,at:decisionAt});
      await notifications(client,row,allocations.map(item=>item.passenger_id));
      return row;
    });
    if(operation.state!=="committed") return result(operation);
    try {
      const saved=await inProtectedTransaction(this.db,async client=>{
        const row=await repo.byId(client,operation.id,true);
        if(!row) throw new AppError(503,"Departure operation missing","RECOVERY_MISSING");
        if(row.state!=="committed") return row;
        await store().append(receipt(row));
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
        const acknowledged=await repo.acknowledge(client,row.id);
        if(!acknowledged) throw new AppError(503,"Departure acknowledgement failed","RECOVERY_INCOMPLETE");
        await repo.ready(client,row.id);
        return acknowledged;
      });
      return result(saved);
    } catch {
      await restrictProtectedWrites(this.db,"pilot_departure_evidence_pending");
      throw new AppError(503,"Departure committed; recovery evidence pending","OPERATION_PENDING",{operationId:operation.id});
    }
  }
  async reconcileReceipts(operatorId:string) {
    const items=await store().list();
    for(const item of items) {
      if(item.digest!==digest(item.offerId,item.boardedIds,item.kind,item.reason))
        throw new AppError(409,"Departure receipt is inconsistent","RECOVERY_CONFLICT");
      await inProtectedTransaction(this.db,async client=>{
        await assertCurrentOperator(client,operatorId);
        try {await repo.restore(client,item);} catch {
          throw new AppError(409,"Departure needs manual recovery","RECOVERY_INCOMPLETE");
        }
        const rows=await repo.allocations(client,item.offerId);
        await notifications(client,(await repo.byId(client,item.operationId))!,rows.map(row=>row.passenger_id));
        await repo.ready(client,item.operationId);
        await client.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
          last_error='Suppressed after snapshot restore; delivery outcome requires review',updated_at=now()
          WHERE event_id IN (SELECT id FROM pilot_notification_events
            WHERE origin_type='pilot_departure' AND operation_id=$1) AND status<>'sent'`,[item.operationId]);
      });
    }
    return items.length;
  }
}
export const pilotDepartureService=new PilotDepartureService();
