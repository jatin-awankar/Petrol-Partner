import type { Pool, PoolClient } from "pg";

type Database = Pool | PoolClient;
export type SeatRequest = {
  id: string; offer_id: string; passenger_id: string; driver_id: string;
  status: "pending" | "rejected" | "expired"; offer_version: number;
  offer_terms: Record<string, unknown>; decision_deadline_at: Date;
  created_at: Date; decided_at: Date | null;
};
export type RequestOperation = {
  id: string; actor_id: string; idempotency_key: string; payload_digest: string;
  request_id: string; action: "requested" | "rejected"; result: Record<string, unknown>;
  request_snapshot: SeatRequest; state: "committed" | "acknowledged" | "recovered";
  created_at: Date;
};
export type OfferForRequest = {
  id: string; driver_id: string; status: string; pilot_version: number;
  pilot_request_cutoff_at: Date; pilot_acceptance_cutoff_at: Date;
  pilot_capacity: number; available_seats: number;
  vehicle_id: string; terms: Record<string, unknown>;
};

export async function offerForUpdate(db: PoolClient, id: string) {
  return (await db.query<OfferForRequest>(`SELECT id,driver_id,status,pilot_version,
    pilot_request_cutoff_at,pilot_acceptance_cutoff_at,pilot_capacity,available_seats,vehicle_id,
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
export async function requestSnapshot(db:PoolClient,id:string) {
  return (await db.query<SeatRequest>("SELECT * FROM pilot_seat_requests WHERE id=$1",[id])).rows[0];
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
export async function insertOperation(db:PoolClient,input:{actorId:string;key:string;digest:string;requestId:string;action:"requested"|"rejected";result:Record<string,unknown>;snapshot:SeatRequest}) {
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
