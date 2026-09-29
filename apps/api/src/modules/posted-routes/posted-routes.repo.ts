import type {Pool,PoolClient} from 'pg';
import type {VerifiedRoute} from './routing';
import {ROUTE_OPERATING_POLICY_VERSION} from './policy';
type Db=Pool|PoolClient;
export type Operation={id:string;actor_id:string;idempotency_key:string;payload_digest:string;offer_id:string;result:Record<string,unknown>;offer_snapshot:Record<string,unknown>;state:'committed'|'acknowledged'|'recovered';created_at:Date};
export const byKey=async(db:Db,actor:string,key:string)=>(await db.query<Operation>('SELECT * FROM posted_route_operations WHERE actor_id=$1 AND idempotency_key=$2',[actor,key])).rows[0]??null;
export const byId=async(db:Db,id:string)=>(await db.query<Operation>('SELECT * FROM posted_route_operations WHERE id=$1',[id])).rows[0]??null;
export const pending=async(db:Db)=>(await db.query<Operation>("SELECT * FROM posted_route_operations WHERE state='committed'")).rows;
export const acknowledged=async(db:Db)=>(await db.query<Operation>("SELECT * FROM posted_route_operations WHERE state IN ('acknowledged','recovered')")).rows;
export const mine=async(db:Db,driver:string)=>(await db.query('SELECT * FROM posted_route_offers WHERE driver_id=$1 ORDER BY created_at DESC',[driver])).rows;
export const owned=async(db:Db,driver:string,id:string)=>(await db.query('SELECT * FROM posted_route_offers WHERE driver_id=$1 AND id=$2',[driver,id])).rows[0]??null;
export type QuoteRoute={id:string;route_version:number;policy_version:string;routing_source:string;routing_mode:'bike'|'scooter'|'car';geometry:{type:'LineString';coordinates:[number,number][]};cumulative_meters:number[];distance_meters:number;duration_seconds:number;status:string};
export const ownedForQuote=async(db:Db,driver:string,id:string)=>(await db.query<QuoteRoute>(
  'SELECT id,route_version,policy_version,routing_source,routing_mode,geometry,cumulative_meters,distance_meters,duration_seconds,status FROM posted_route_offers WHERE driver_id=$1 AND id=$2',
  [driver,id])).rows[0]??null;
export async function conflict(db:PoolClient,driver:string,vehicle:string,departure:Date,until:Date){
  const route=(await db.query(`SELECT 1 FROM posted_route_offers WHERE status='prepared' AND (driver_id=$1 OR vehicle_declaration_id=$2)
    AND departure_at<$4::timestamptz AND commitment_until>$3::timestamptz LIMIT 1`,[driver,vehicle,departure,until])).rowCount;
  const legacy=(await db.query(`SELECT 1 FROM ride_offers WHERE status IN ('active','held','departed') AND driver_id=$1
    AND (date+time) AT TIME ZONE 'Asia/Kolkata'<$3::timestamptz
    AND COALESCE(pilot_commitment_until,((date+time) AT TIME ZONE 'Asia/Kolkata')+interval '2 hours')>$2::timestamptz LIMIT 1`,[driver,departure,until])).rowCount;
  const accepted=(await db.query(`SELECT 1 FROM posted_route_seat_allocations
    WHERE passenger_id=$1 AND status IN ('confirmed','held')
      AND departure_at<$3 AND commitment_until>$2 LIMIT 1`,[driver,departure,until])).rowCount;
  const legacyPassenger=(await db.query(`SELECT 1 FROM pilot_seat_allocations
    WHERE passenger_id=$1 AND status IN ('confirmed','held')
      AND departure_at<$3 AND commitment_until>$2 LIMIT 1`,[driver,departure,until])).rowCount;
  return Boolean(route||legacy||accepted||legacyPassenger);
}
export async function save(db:PoolClient,input:{driver:string;vehicle:string;route:VerifiedRoute;departure:Date;until:Date;capacity:number;policy:string}){
  return (await db.query<{id:string}>(`INSERT INTO posted_route_offers(driver_id,vehicle_declaration_id,policy_version,operating_policy_version,routing_source,routing_mode,
    geometry,cumulative_meters,distance_meters,duration_seconds,departure_at,commitment_until,request_cutoff_at,acceptance_cutoff_at,capacity)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12::timestamptz,$11::timestamptz-interval '60 minutes',$11::timestamptz-interval '30 minutes',$13) RETURNING id`,
    [input.driver,input.vehicle,input.policy,ROUTE_OPERATING_POLICY_VERSION,input.route.source,input.route.mode,JSON.stringify(input.route.geometry),
      JSON.stringify(input.route.cumulativeMeters),input.route.distanceMeters,input.route.durationSeconds,input.departure,input.until,input.capacity])).rows[0];
}
export async function snapshot(db:PoolClient,id:string){return (await db.query<{snapshot:Record<string,unknown>}>(
  'SELECT to_jsonb(r) AS snapshot FROM posted_route_offers r WHERE id=$1',[id])).rows[0].snapshot;}
export async function insertOperation(db:PoolClient,input:{actor:string;key:string;digest:string;offerId:string;result:Record<string,unknown>;snapshot:Record<string,unknown>}){
  return (await db.query<Operation>(`INSERT INTO posted_route_operations(actor_id,idempotency_key,payload_digest,offer_id,result,offer_snapshot,state)
    VALUES($1,$2,$3,$4,$5,$6,'committed') RETURNING *`,[input.actor,input.key,input.digest,input.offerId,input.result,input.snapshot])).rows[0];}
export async function audit(db:PoolClient,row:Operation){await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
  VALUES($1,'posted_route_prepared','posted_route_offer',$2,jsonb_build_object('operationId',$3::text,'policyVersion',$4::text))`,[row.actor_id,row.offer_id,row.id,row.offer_snapshot.policy_version]);}
export async function acknowledge(db:PoolClient,id:string){await db.query("UPDATE posted_route_operations SET state='acknowledged',acknowledged_at=now() WHERE id=$1 AND state='committed'",[id]);
  await db.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='posted_route' AND operation_id=$1",[id]);}
export async function restore(db:PoolClient,item:{operationId:string;actorId:string;key:string;digest:string;offerId:string;
  result:Record<string,unknown>;snapshot:Record<string,unknown>;createdAt:string}){
  await db.query(`INSERT INTO posted_route_offers SELECT (jsonb_populate_record(NULL::posted_route_offers,$1::jsonb)).*
    ON CONFLICT(id) DO NOTHING`,[item.snapshot]);
  await db.query(`INSERT INTO posted_route_operations(id,actor_id,idempotency_key,payload_digest,offer_id,result,offer_snapshot,state,created_at,acknowledged_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,'recovered',$8,now()) ON CONFLICT(id) DO NOTHING`,
    [item.operationId,item.actorId,item.key,item.digest,item.offerId,item.result,item.snapshot,item.createdAt]);
}
export async function restoreAudit(db:PoolClient,row:Operation){await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
  SELECT $1,'posted_route_prepared','posted_route_offer',$2,jsonb_build_object('operationId',$3::text,'policyVersion',$4::text)
  WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$3)`,[row.actor_id,row.offer_id,row.id,row.offer_snapshot.policy_version]);}
export async function suppressRestoredNotification(db:PoolClient,id:string){await db.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
  last_error='Suppressed after snapshot restore; delivery requires review',updated_at=now()
  WHERE event_id IN (SELECT id FROM pilot_notification_events WHERE origin_type='posted_route' AND operation_id=$1)
  AND status<>'sent'`,[id]);}

export async function pendingStateMatches(db:PoolClient,row:Operation){
  const live=await owned(db,row.actor_id,row.offer_id);
  return Boolean(live)&&JSON.stringify(await snapshot(db,row.offer_id))===JSON.stringify(row.offer_snapshot);
}
