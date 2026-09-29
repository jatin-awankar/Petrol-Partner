import type {Pool,PoolClient} from 'pg';
import type {Point} from './routing';
type Db=Pool|PoolClient;
export type Selection={route_version:number;pickup:Point;dropoff:Point};
export type Offer={id:string;driver_id:string;vehicle_declaration_id:string;route_version:number;
  policy_version:string;operating_policy_version:string;routing_source:string;
  routing_mode:'bike'|'scooter'|'car';geometry:{type:'LineString';coordinates:Point[]};
  cumulative_meters:number[];distance_meters:number;duration_seconds:number;
  departure_at:Date;commitment_until:Date;request_cutoff_at:Date;acceptance_cutoff_at:Date;
  capacity:number;status:string};
export type SeatRequest={id:string;offer_id:string;passenger_id:string;driver_id:string;
  status:string;route_version:number;selection:Selection;proposed_terms:Record<string,unknown>;
  decision_deadline_at:Date;created_at:Date;decided_at:Date|null};
export type Allocation={id:string;request_id:string;offer_id:string;passenger_id:string;
  driver_id:string;vehicle_declaration_id:string;seats:number;status:string;
  accepted_terms:Record<string,unknown>;departure_at:Date;commitment_until:Date;accepted_at:Date};
export type Operation={id:string;actor_id:string;idempotency_key:string;payload_digest:string;
  request_id:string;action:'requested'|'accepted'|'rejected';result:Record<string,unknown>;
  request_snapshot:SeatRequest;allocation_snapshot:Allocation|null;
  state:'committed'|'acknowledged'|'recovered';created_at:Date};
export const byKey=async(db:Db,actor:string,key:string)=>(await db.query<Operation>(
  'SELECT * FROM posted_route_seat_operations WHERE actor_id=$1 AND idempotency_key=$2',[actor,key])).rows[0]??null;
export const byId=async(db:Db,id:string)=>(await db.query<Operation>(
  'SELECT * FROM posted_route_seat_operations WHERE id=$1',[id])).rows[0]??null;
export const allOperations=async(db:Db)=>(await db.query<Operation>('SELECT * FROM posted_route_seat_operations')).rows;
export const pending=async(db:Db)=>(await db.query<Operation>(
  "SELECT * FROM posted_route_seat_operations WHERE state='committed'")).rows;
export const offer=async(db:PoolClient,id:string)=>(await db.query<Offer>(
  'SELECT * FROM posted_route_offers WHERE id=$1 FOR UPDATE',[id])).rows[0]??null;
export const request=async(db:PoolClient,id:string)=>(await db.query<SeatRequest>(
  'SELECT * FROM posted_route_seat_requests WHERE id=$1 FOR UPDATE',[id])).rows[0]??null;
export const requestSnapshot=async(db:Db,id:string)=>(await db.query<SeatRequest>(
  'SELECT * FROM posted_route_seat_requests WHERE id=$1',[id])).rows[0]??null;
export async function insertRequest(db:PoolClient,offer:Offer,passenger:string,selection:Selection,terms:Record<string,unknown>){
  return (await db.query<SeatRequest>(`INSERT INTO posted_route_seat_requests
    (offer_id,passenger_id,driver_id,route_version,selection,proposed_terms,decision_deadline_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[offer.id,passenger,offer.driver_id,
      offer.route_version,selection,terms,offer.acceptance_cutoff_at])).rows[0];
}
export async function decide(db:PoolClient,id:string,action:'accepted'|'rejected'){
  return (await db.query<SeatRequest>(`UPDATE posted_route_seat_requests
    SET status=$2,decided_at=now() WHERE id=$1 RETURNING *`,[id,action])).rows[0];
}
export async function countSeats(db:PoolClient,id:string){return (await db.query<{n:number}>(
  "SELECT count(*)::int AS n FROM posted_route_seat_allocations WHERE offer_id=$1 AND status IN ('confirmed','held')",[id])).rows[0].n;}
export async function overlapping(db:PoolClient,offer:Offer,passenger:string){
  const current=(await db.query(`SELECT 1 FROM posted_route_seat_allocations
    WHERE status IN ('confirmed','held') AND
      (passenger_id=$1 OR driver_id=$1 OR
        (offer_id<>$6 AND (passenger_id=$2 OR driver_id=$2 OR vehicle_declaration_id=$3)))
      AND departure_at<$5 AND commitment_until>$4 LIMIT 1`,
    [passenger,offer.driver_id,offer.vehicle_declaration_id,offer.departure_at,offer.commitment_until,offer.id])).rowCount;
  const legacy=(await db.query(`SELECT 1 FROM ride_offers o
    LEFT JOIN pilot_seat_allocations a ON a.offer_id=o.id AND a.status IN ('confirmed','held')
    LEFT JOIN bookings b ON b.ride_offer_id=o.id AND b.status='confirmed'
    WHERE o.status IN ('active','held','departed') AND
      (o.driver_id=$1 OR o.driver_id=$2 OR a.passenger_id=$1 OR a.passenger_id=$2
       OR b.passenger_id=$1 OR b.passenger_id=$2)
      AND (o.date+o.time) AT TIME ZONE 'Asia/Kolkata'<$4
      AND COALESCE(o.pilot_commitment_until,((o.date+o.time) AT TIME ZONE 'Asia/Kolkata')+interval '2 hours')>$3
    LIMIT 1`,[passenger,offer.driver_id,offer.departure_at,offer.commitment_until])).rowCount;
  const offered=(await db.query(`SELECT 1 FROM posted_route_offers WHERE id<>$3 AND status='prepared'
    AND driver_id=$1 AND departure_at<$4 AND commitment_until>$2 LIMIT 1`,
    [passenger,offer.departure_at,offer.id,offer.commitment_until])).rowCount;
  return Boolean(current||legacy||offered);
}
export async function allocate(db:PoolClient,offer:Offer,row:SeatRequest,terms:Record<string,unknown>){
  return (await db.query<Allocation>(`INSERT INTO posted_route_seat_allocations
    (request_id,offer_id,passenger_id,driver_id,vehicle_declaration_id,accepted_terms,departure_at,commitment_until)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[row.id,offer.id,row.passenger_id,offer.driver_id,
      offer.vehicle_declaration_id,terms,offer.departure_at,offer.commitment_until])).rows[0];
}
export async function withdrawIncompatible(db:PoolClient,accepted:Offer,participants:string[]){
  return (await db.query<SeatRequest>(`UPDATE posted_route_seat_requests r
    SET status='withdrawn',decided_at=now()
    FROM posted_route_offers o WHERE r.offer_id=o.id AND r.status='pending'
      AND r.passenger_id=ANY($1::uuid[]) AND r.offer_id<>$2
      AND o.departure_at<$4 AND o.commitment_until>$3 RETURNING r.*`,
    [participants,accepted.id,accepted.departure_at,accepted.commitment_until])).rows;
}
export async function insertOperation(db:PoolClient,actor:string,key:string,digest:string,
  action:Operation['action'],row:SeatRequest,allocation:Allocation|null,withdrawn:SeatRequest[]){
  const result={request:row,...(allocation?{booking:allocation,withdrawn_requests:withdrawn}:{})};
  return (await db.query<Operation>(`INSERT INTO posted_route_seat_operations
    (actor_id,idempotency_key,payload_digest,request_id,action,result,request_snapshot,allocation_snapshot,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'committed') RETURNING *`,
    [actor,key,digest,row.id,action,result,row,allocation])).rows[0];
}
export async function audit(db:PoolClient,row:Operation){await db.query(`INSERT INTO audit_logs
  (actor_user_id,action,entity_type,entity_id,metadata) VALUES
  ($1,$2,'posted_route_seat_request',$3,jsonb_build_object('operationId',$4::text,'routeId',$5::text))`,
  [row.actor_id,`posted_route_seat_${row.action}`,row.request_id,row.id,row.request_snapshot.offer_id]);}
export async function auditWithdrawals(db:PoolClient,row:Operation,withdrawn:SeatRequest[]){
  for(const request of withdrawn)await db.query(`INSERT INTO audit_logs
    (actor_user_id,action,entity_type,entity_id,metadata)
    VALUES($1,'posted_route_seat_withdrawn','posted_route_seat_request',$2,
      jsonb_build_object('operationId',$3::text,'routeId',$4::text))`,
    [row.actor_id,request.id,row.id,request.offer_id]);
}
export async function acknowledge(db:PoolClient,id:string){await db.query(`UPDATE posted_route_seat_operations
  SET state='acknowledged',acknowledged_at=now() WHERE id=$1 AND state='committed'`,[id]);
  await db.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='posted_route_seat' AND operation_id=$1",[id]);}
export async function restore(db:PoolClient,item:{operationId:string;actorId:string;key:string;digest:string;
  action:Operation['action'];requestId:string;result:Record<string,unknown>;
  requestSnapshot:SeatRequest;allocationSnapshot:Allocation|null;createdAt:string}){
  await db.query(`INSERT INTO posted_route_seat_requests SELECT
    (jsonb_populate_record(NULL::posted_route_seat_requests,$1::jsonb)).* ON CONFLICT(id) DO NOTHING`,[item.requestSnapshot]);
  if(item.action!=='requested')await db.query(`UPDATE posted_route_seat_requests
    SET status=$2,decided_at=$3 WHERE id=$1`,[item.requestId,item.requestSnapshot.status,
      item.requestSnapshot.decided_at]);
  for(const withdrawn of (item.result.withdrawn_requests as SeatRequest[]|undefined)??[]){
    await db.query(`INSERT INTO posted_route_seat_requests SELECT
      (jsonb_populate_record(NULL::posted_route_seat_requests,$1::jsonb)).* ON CONFLICT(id) DO NOTHING`,[withdrawn]);
    await db.query(`UPDATE posted_route_seat_requests SET status='withdrawn',decided_at=$2 WHERE id=$1`,
      [withdrawn.id,withdrawn.decided_at]);
  }
  if(item.allocationSnapshot)await db.query(`INSERT INTO posted_route_seat_allocations SELECT
    (jsonb_populate_record(NULL::posted_route_seat_allocations,$1::jsonb)).* ON CONFLICT(id) DO NOTHING`,[item.allocationSnapshot]);
  await db.query(`INSERT INTO posted_route_seat_operations
    (id,actor_id,idempotency_key,payload_digest,request_id,action,result,request_snapshot,allocation_snapshot,state,created_at,acknowledged_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'recovered',$10,now()) ON CONFLICT(id) DO NOTHING`,
    [item.operationId,item.actorId,item.key,item.digest,item.requestId,item.action,item.result,
      item.requestSnapshot,item.allocationSnapshot,item.createdAt]);
}
