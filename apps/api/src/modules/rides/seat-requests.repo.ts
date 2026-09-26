import type { Pool, PoolClient } from "pg";

type Database = Pool | PoolClient;
export type SeatRequest = {
  id: string; offer_id: string; passenger_id: string; driver_id: string;
  status: "pending" | "rejected" | "expired" | "accepted" | "withdrawn"; offer_version: number;
  offer_terms: Record<string, unknown>; decision_deadline_at: Date;
  created_at: Date; decided_at: Date | null;
};
export type RequestOperation = {
  id: string; actor_id: string; idempotency_key: string; payload_digest: string;
  request_id: string; action: "requested" | "rejected" | "accepted"; result: Record<string, unknown>;
  request_snapshot: SeatRequest; state: "committed" | "acknowledged" | "recovered";
  created_at: Date;
};
export type OfferForRequest = {
  id: string; driver_id: string; status: string; pilot_version: number;
  pilot_request_cutoff_at: Date; pilot_acceptance_cutoff_at: Date;
  pilot_capacity: number; available_seats: number;
  vehicle_id: string; terms: Record<string, unknown>;
  departure_at: Date; pilot_commitment_until: Date; pilot_policy_snapshot: {version:number};
};

export async function offerForUpdate(db: PoolClient, id: string) {
  return (await db.query<OfferForRequest>(`SELECT id,driver_id,status,pilot_version,
    pilot_request_cutoff_at,pilot_acceptance_cutoff_at,pilot_capacity,available_seats,vehicle_id,
    (date+time) AT TIME ZONE 'Asia/Kolkata' AS departure_at,pilot_commitment_until,pilot_policy_snapshot,
    jsonb_build_object('driver_id',driver_id,'vehicle_id',vehicle_id,
      'origin_code',pilot_origin_code,'destination_code',pilot_destination_code,
      'departure_at',(date+time) AT TIME ZONE 'Asia/Kolkata',
      'contribution_paise',price_per_seat_paise,'currency',pilot_currency,
      'capacity',pilot_capacity,'policy',pilot_policy_snapshot,
      'cancellation_notice',pilot_policy_snapshot->>'cancellation_notice',
      'contact_notice',pilot_policy_snapshot->>'contact_notice',
      'request_cutoff_at',pilot_request_cutoff_at,'acceptance_cutoff_at',pilot_acceptance_cutoff_at) AS terms
    FROM ride_offers WHERE id=$1 AND pilot_policy_id IS NOT NULL FOR UPDATE`,[id])).rows[0] ?? null;
}
export async function requestForUpdate(db: PoolClient,id:string) {
  return (await db.query<SeatRequest>("SELECT * FROM pilot_seat_requests WHERE id=$1 FOR UPDATE",[id])).rows[0] ?? null;
}
export async function requestSnapshot(db:Database,id:string) {
  return (await db.query<SeatRequest>("SELECT * FROM pilot_seat_requests WHERE id=$1",[id])).rows[0];
}
export async function vehicleForOffer(db:PoolClient,id:string) {
  return (await db.query<{vehicle_id:string}>("SELECT vehicle_id FROM ride_offers WHERE id=$1",[id])).rows[0]?.vehicle_id ?? null;
}
export async function insertRequest(db:PoolClient,offer:OfferForRequest,passengerId:string) {
  return (await db.query<{id:string}>(`INSERT INTO pilot_seat_requests
    (offer_id,passenger_id,driver_id,status,offer_version,offer_terms,decision_deadline_at)
    VALUES($1,$2,$3,'pending',$4,$5,$6) RETURNING id`,
    [offer.id,passengerId,offer.driver_id,offer.pilot_version,JSON.stringify(offer.terms),offer.pilot_acceptance_cutoff_at])).rows[0].id;
}
export async function byKey(db:Database,actorId:string,key:string) {
  return (await db.query<RequestOperation>("SELECT * FROM pilot_seat_request_operations WHERE actor_id=$1 AND idempotency_key=$2",[actorId,key])).rows[0] ?? null;
}
export async function byId(db:Database,id:string,actorId:string) {
  return (await db.query<RequestOperation>("SELECT * FROM pilot_seat_request_operations WHERE id=$1 AND actor_id=$2",[id,actorId])).rows[0] ?? null;
}
export async function operationById(db:PoolClient,id:string) {
  return (await db.query<RequestOperation>("SELECT * FROM pilot_seat_request_operations WHERE id=$1 FOR UPDATE",[id])).rows[0] ?? null;
}
export async function insertOperation(db:PoolClient,input:{actorId:string;key:string;digest:string;requestId:string;action:"requested"|"rejected"|"accepted";result:Record<string,unknown>;snapshot:SeatRequest}) {
  return (await db.query<RequestOperation>(`INSERT INTO pilot_seat_request_operations
    (actor_id,idempotency_key,payload_digest,request_id,action,result,request_snapshot,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,'committed') RETURNING *`,
    [input.actorId,input.key,input.digest,input.requestId,input.action,JSON.stringify(input.result),JSON.stringify(input.snapshot)])).rows[0];
}
export async function audit(db:PoolClient,op:RequestOperation) {
  await db.query(`INSERT INTO pilot_seat_request_audit(operation_id,request_id,actor_id,action)
    VALUES($1,$2,$3,$4)`,[op.id,op.request_id,op.actor_id,op.action]);
}
export async function acknowledge(db:PoolClient,id:string) {
  return (await db.query<RequestOperation>(`UPDATE pilot_seat_request_operations SET state='acknowledged',acknowledged_at=now()
    WHERE id=$1 RETURNING *`,[id])).rows[0];
}
export async function readyNotifications(db:PoolClient,id:string) {
  await db.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='seat_request' AND operation_id=$1",[id]);
}
export async function listForParticipant(db:Database,userId:string) {
  return (await db.query<SeatRequest>(`SELECT * FROM pilot_seat_requests
    WHERE passenger_id=$1 OR driver_id=$1 ORDER BY created_at DESC LIMIT 100`,[userId])).rows;
}
export async function allOperations(db:Database) {
  return (await db.query<RequestOperation>("SELECT * FROM pilot_seat_request_operations")).rows;
}
export async function pendingOperations(db:Database) {
  return (await db.query<RequestOperation>("SELECT * FROM pilot_seat_request_operations WHERE state='committed'")).rows;
}
export async function rejectRequest(db:PoolClient,id:string) {
  await db.query("UPDATE pilot_seat_requests SET status='rejected',decided_at=now() WHERE id=$1",[id]);
}
export type Allocation = {id:string;request_id:string;offer_id:string;driver_id:string;passenger_id:string;
  vehicle_id:string;seats:number;contribution_paise:number;currency:string;offer_version:number;
  policy_version:number;departure_at:Date;commitment_until:Date;status:string;accepted_at:Date};
export async function allocatedSeatCount(db:PoolClient,offerId:string) {
  return (await db.query<{count:number}>(`SELECT count(*)::int AS count FROM pilot_seat_allocations
    WHERE offer_id=$1 AND status IN ('confirmed','held')`,[offerId])).rows[0].count;
}
export async function currentVehicleSeatCapacity(db:PoolClient,vehicleId:string) {
  return (await db.query<{seat_capacity:number}>(
    "SELECT seat_capacity FROM vehicles WHERE id=$1 FOR SHARE",[vehicleId])).rows[0]?.seat_capacity ?? null;
}
export async function hasConfirmedSeat(db:PoolClient,offerId:string,passengerId:string) {
  return Boolean((await db.query(`SELECT 1 FROM pilot_seat_allocations
    WHERE offer_id=$1 AND passenger_id=$2 AND status IN ('confirmed','held') LIMIT 1`,
    [offerId,passengerId])).rowCount);
}
export async function allocate(db:PoolClient,request:SeatRequest,offer:OfferForRequest) {
  return (await db.query<Allocation>(`INSERT INTO pilot_seat_allocations
    (request_id,offer_id,driver_id,passenger_id,vehicle_id,contribution_paise,currency,
      offer_version,policy_version,departure_at,commitment_until)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [request.id,offer.id,offer.driver_id,request.passenger_id,offer.vehicle_id,
      offer.terms.contribution_paise,offer.terms.currency,offer.pilot_version,
      offer.pilot_policy_snapshot.version,offer.departure_at,offer.pilot_commitment_until])).rows[0];
}
export async function accept(db:PoolClient,id:string) {
  await db.query("UPDATE pilot_seat_requests SET status='accepted',decided_at=now() WHERE id=$1",[id]);
}
export async function withdrawIncompatible(db:PoolClient,passengerId:string,acceptedOfferId:string,
  departure:Date,until:Date) {
  return (await db.query<SeatRequest>(`UPDATE pilot_seat_requests r SET status='withdrawn',decided_at=now()
    FROM ride_offers o WHERE r.offer_id=o.id AND r.passenger_id=$1 AND r.status='pending'
      AND r.offer_id<>$2 AND (o.date+o.time) AT TIME ZONE 'Asia/Kolkata' < $4
      AND o.pilot_commitment_until > $3 RETURNING r.*`,[passengerId,acceptedOfferId,departure,until])).rows;
}
export async function auditWithdrawals(db:PoolClient,operationId:string,requestIds:string[]) {
  for (const requestId of requestIds) await db.query(`INSERT INTO pilot_seat_withdrawal_audit
    (operation_id,request_id,reason) VALUES($1,$2,'overlapping confirmed ride')
    ON CONFLICT (operation_id,request_id) DO NOTHING`,[operationId,requestId]);
}
export async function listConfirmedForParticipant(db:Database,userId:string) {
  return (await db.query<Allocation & {origin_code:string;destination_code:string;
    car_registration_last4:string;driver_verified_name:string|null;passenger_verified_name:string|null}>(
    `SELECT a.*,r.offer_terms->>'origin_code' AS origin_code,
      r.offer_terms->>'destination_code' AS destination_code,
      v.registration_number_last4 AS car_registration_last4,
      ds.enrolled_name AS driver_verified_name,ps.enrolled_name AS passenger_verified_name
      FROM pilot_seat_allocations a JOIN pilot_seat_requests r ON r.id=a.request_id
      JOIN vehicles v ON v.id=a.vehicle_id
      LEFT JOIN student_verifications ds ON ds.user_id=a.driver_id
      LEFT JOIN student_verifications ps ON ps.user_id=a.passenger_id
      WHERE a.driver_id=$1 OR a.passenger_id=$1 ORDER BY a.accepted_at DESC LIMIT 100`,[userId])).rows;
}
export async function restoreOperation(db:PoolClient,item:{operationId:string;actorId:string;key:string;
  digest:string;requestId:string;action:string;result:Record<string,unknown>;
  snapshot:SeatRequest;createdAt:string}) {
  const prior = await db.query<RequestOperation>("SELECT * FROM pilot_seat_request_operations WHERE id=$1",[item.operationId]);
  if (!prior.rowCount) {
    if (item.action === "requested") {
      await db.query(`INSERT INTO pilot_seat_requests
        (id,offer_id,passenger_id,driver_id,status,offer_version,offer_terms,decision_deadline_at,created_at,decided_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
        [item.snapshot.id,item.snapshot.offer_id,item.snapshot.passenger_id,item.snapshot.driver_id,
          item.snapshot.status,item.snapshot.offer_version,JSON.stringify(item.snapshot.offer_terms),
          item.snapshot.decision_deadline_at,item.snapshot.created_at,item.snapshot.decided_at]);
    } else {
      await db.query(`UPDATE pilot_seat_requests SET status=$2,decided_at=$3
        WHERE id=$1 AND status IN ('pending','rejected','accepted')`,
        [item.requestId,item.snapshot.status,item.snapshot.decided_at]);
      if (item.action === "accepted") {
        const allocation = item.result.booking as Allocation;
        await db.query(`INSERT INTO pilot_seat_allocations
          (id,request_id,offer_id,driver_id,passenger_id,vehicle_id,seats,contribution_paise,
            currency,offer_version,policy_version,departure_at,commitment_until,status,accepted_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (id) DO NOTHING`,[allocation.id,allocation.request_id,allocation.offer_id,
            allocation.driver_id,allocation.passenger_id,allocation.vehicle_id,allocation.seats,
            allocation.contribution_paise,allocation.currency,allocation.offer_version,
            allocation.policy_version,allocation.departure_at,allocation.commitment_until,
            allocation.status,allocation.accepted_at]);
        for (const withdrawn of (item.result.withdrawn_requests as Array<{id:string}> ?? [])) {
          await db.query("UPDATE pilot_seat_requests SET status='withdrawn' WHERE id=$1 AND status IN ('pending','withdrawn')",[withdrawn.id]);
        }
      }
    }
    await db.query(`INSERT INTO pilot_seat_request_operations
      (id,actor_id,idempotency_key,payload_digest,request_id,action,result,request_snapshot,state,created_at,acknowledged_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'recovered',$9,now())`,
      [item.operationId,item.actorId,item.key,item.digest,item.requestId,item.action,
        JSON.stringify(item.result),JSON.stringify(item.snapshot),item.createdAt]);
  }
  return (await db.query<RequestOperation>("SELECT * FROM pilot_seat_request_operations WHERE id=$1",[item.operationId])).rows[0];
}
export async function markRecovered(db:PoolClient,id:string) {
  await db.query("UPDATE pilot_seat_request_operations SET state='recovered',acknowledged_at=now() WHERE id=$1",[id]);
}
export async function restoreAudit(db:PoolClient,row:RequestOperation) {
  await db.query(`INSERT INTO pilot_seat_request_audit(operation_id,request_id,actor_id,action)
    VALUES($1,$2,$3,$4) ON CONFLICT (operation_id) DO NOTHING`,[row.id,row.request_id,row.actor_id,row.action]);
}
