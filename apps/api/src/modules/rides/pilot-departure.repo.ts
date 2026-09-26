import type {Pool,PoolClient} from "pg";

export type Operation={id:string;offer_id:string;actor_id:string;driver_id:string;
  idempotency_key:string;payload_digest:string;kind:"departure"|"late_departure";reason:string|null;
  boarded_allocation_ids:string[];confirmed_allocation_ids:string[];started_at:Date;
  state:"committed"|"acknowledged"|"recovered"};
type Database=Pool|PoolClient;
export const preview=async(db:PoolClient,id:string)=>(await db.query<{driver_id:string;vehicle_id:string}>(
  "SELECT driver_id,vehicle_id FROM ride_offers WHERE id=$1 AND pilot_policy_id IS NOT NULL",[id])).rows[0]??null;
export const requestPassengers=async(db:PoolClient,id:string)=>(await db.query<{passenger_id:string}>(
  `SELECT DISTINCT passenger_id FROM pilot_seat_requests WHERE offer_id=$1
    AND status IN ('pending','accepted')`,[id])).rows.map(row=>row.passenger_id);
export const currentPassengers=async(db:PoolClient,id:string)=>(await db.query<{passenger_id:string}>(
  `SELECT passenger_id FROM pilot_seat_allocations WHERE offer_id=$1
    AND status IN ('confirmed','held')`,[id])).rows.map(row=>row.passenger_id);
export async function lockRequests(db:PoolClient,id:string) {
  await db.query("SELECT id FROM pilot_seat_requests WHERE offer_id=$1 ORDER BY id FOR UPDATE",[id]);
}
export const byKey=async(db:Database,actor:string,key:string)=>(await db.query<Operation>(
  "SELECT * FROM pilot_departure_operations WHERE actor_id=$1 AND idempotency_key=$2",[actor,key])).rows[0]??null;
export const byId=async(db:Database,id:string,lock=false)=>(await db.query<Operation>(
  `SELECT * FROM pilot_departure_operations WHERE id=$1 ${lock?"FOR UPDATE":""}`,[id])).rows[0]??null;
export const acknowledged=async(db:Database)=>(await db.query<Operation>(
  "SELECT * FROM pilot_departure_operations WHERE state IN ('acknowledged','recovered')")).rows;
export const pending=async(db:Database)=>(await db.query<Operation>(
  "SELECT * FROM pilot_departure_operations WHERE state='committed'")).rows;
export async function stateMatches(db:Database,row:Operation) {
  const ride=(await db.query<{status:string}>(
    "SELECT status FROM ride_offers WHERE id=$1",[row.offer_id])).rows[0];
  if(!ride||!['departed','completed'].includes(ride.status)) return false;
  const boarding=(await db.query<{allocation_id:string;boarded:boolean}>(`
    SELECT allocation_id,boarded FROM pilot_departure_boarding WHERE operation_id=$1 ORDER BY allocation_id`,
    [row.id])).rows;
  if(JSON.stringify(boarding.map(item=>item.allocation_id))!==JSON.stringify(row.confirmed_allocation_ids)) return false;
  if(JSON.stringify(boarding.filter(item=>item.boarded).map(item=>item.allocation_id))!==
    JSON.stringify(row.boarded_allocation_ids)) return false;
  const signals=(await db.query<{allocation_id:string}>(`SELECT allocation_id FROM pilot_departure_review_signals
    WHERE operation_id=$1 ORDER BY allocation_id`,[row.id])).rows.map(item=>item.allocation_id);
  if(JSON.stringify(signals)!==JSON.stringify(boarding.filter(item=>!item.boarded).map(item=>item.allocation_id)))
    return false;
  return Boolean((await db.query(`SELECT 1 FROM audit_logs
    WHERE metadata->>'operationId'=$1 LIMIT 1`,[row.id])).rowCount);
}
export const offer=async(db:PoolClient,id:string)=>(await db.query<{id:string;driver_id:string;vehicle_id:string;
  status:string;departure_at:Date;pilot_commitment_until:Date}>(`
  SELECT id,driver_id,vehicle_id,status,(date+time) AT TIME ZONE 'Asia/Kolkata' AS departure_at,
    pilot_commitment_until FROM ride_offers WHERE id=$1 AND pilot_policy_id IS NOT NULL FOR UPDATE`,[id])).rows[0]??null;
export const allocations=async(db:PoolClient,id:string)=>(await db.query<{id:string;passenger_id:string;
  status:string;contribution_paise:number;currency:string}>(`
  SELECT id,passenger_id,status,contribution_paise,currency FROM pilot_seat_allocations
  WHERE offer_id=$1 AND status IN ('confirmed','held') ORDER BY id FOR UPDATE`,[id])).rows;
export const operatorRecipients=async(db:PoolClient)=>(await db.query<{user_id:string}>(`
  SELECT a.user_id FROM operator_allowlist a JOIN users u ON u.id=a.user_id
  WHERE a.active=true AND u.status='active' ORDER BY a.user_id`)).rows.map(row=>row.user_id);
export const openSignals=async(db:Database)=>(await db.query<{operation_id:string;allocation_id:string;
  offer_id:string;signal_type:string;created_at:Date}>(`SELECT s.operation_id,s.allocation_id,
  o.offer_id,s.signal_type,s.created_at FROM pilot_departure_review_signals s
  JOIN pilot_departure_operations o ON o.id=s.operation_id WHERE s.status='open'
  ORDER BY s.created_at,s.allocation_id LIMIT 100`)).rows;
export async function stillActiveTrip(db:PoolClient,offerId:string,driverId:string,vehicleId:string,
  passengerIds:string[]) {
  return Boolean((await db.query(`SELECT 1 FROM ride_offers o
    LEFT JOIN pilot_seat_allocations a ON a.offer_id=o.id AND a.status IN ('confirmed','held')
    LEFT JOIN bookings b ON b.ride_offer_id=o.id AND b.status='confirmed'
    WHERE o.id<>$1 AND o.status='departed'
      AND (o.driver_id=$2 OR o.vehicle_id=$3 OR o.driver_id=ANY($4::uuid[])
        OR a.passenger_id=ANY($4::uuid[]) OR b.passenger_id=ANY($4::uuid[]))
    LIMIT 1`,[offerId,driverId,vehicleId,passengerIds])).rowCount);
}
export async function record(db:PoolClient,input:{offerId:string;actorId:string;driverId:string;key:string;
  digest:string;kind:Operation["kind"];reason:string|null;boardedIds:string[];confirmedIds:string[];at:Date}) {
  const row=(await db.query<Operation>(`INSERT INTO pilot_departure_operations
    (offer_id,actor_id,driver_id,idempotency_key,payload_digest,kind,reason,
     boarded_allocation_ids,confirmed_allocation_ids,started_at,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,'committed') RETURNING *`,
    [input.offerId,input.actorId,input.driverId,input.key,input.digest,input.kind,input.reason,
      JSON.stringify(input.boardedIds),JSON.stringify(input.confirmedIds),input.at])).rows[0];
  await db.query("UPDATE ride_offers SET status='departed',updated_at=$2 WHERE id=$1",[input.offerId,input.at]);
  await db.query(`INSERT INTO pilot_departure_boarding(operation_id,allocation_id,boarded,recorded_at)
    SELECT $1,id,id=ANY($2::uuid[]),$3 FROM pilot_seat_allocations
    WHERE id=ANY($4::uuid[])`,[row.id,input.boardedIds,input.at,input.confirmedIds]);
  await db.query(`INSERT INTO pilot_departure_review_signals(operation_id,allocation_id,signal_type,created_at)
    SELECT $1,id,'absence',$3 FROM pilot_seat_allocations
    WHERE id=ANY($4::uuid[]) AND NOT(id=ANY($2::uuid[]))`,
    [row.id,input.boardedIds,input.at,input.confirmedIds]);
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    VALUES($1,$2,'ride_offer',$3,jsonb_build_object('operationId',$4::text,
      'boardedCount',$5::int,'reason',$6::text))`,
    [input.actorId,input.kind==='late_departure'?'pilot_late_departure':'pilot_departure',
      input.offerId,row.id,input.boardedIds.length,input.reason]);
  return row;
}
export const acknowledge=async(db:PoolClient,id:string)=>(await db.query<Operation>(`
  UPDATE pilot_departure_operations SET state='acknowledged',acknowledged_at=now()
  WHERE id=$1 AND state='committed' RETURNING *`,[id])).rows[0]??null;
export async function ready(db:PoolClient,id:string) {
  await db.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='pilot_departure' AND operation_id=$1",[id]);
}
export async function restore(db:PoolClient,item:{operationId:string;offerId:string;actorId:string;driverId:string;
  key:string;digest:string;kind:Operation["kind"];reason:string|null;boardedIds:string[];
  confirmedIds:string[];startedAt:string}) {
  const current=await byId(db,item.operationId,true);
  if(current && (current.offer_id!==item.offerId||current.actor_id!==item.actorId||
    current.driver_id!==item.driverId||current.idempotency_key!==item.key||
    current.kind!==item.kind||current.reason!==item.reason||
    current.started_at.toISOString()!==item.startedAt||
    current.payload_digest!==item.digest||
    JSON.stringify(current.boarded_allocation_ids)!==JSON.stringify(item.boardedIds)||
    JSON.stringify(current.confirmed_allocation_ids)!==JSON.stringify(item.confirmedIds)))
    throw new Error("Pilot departure recovery conflict");
  if(!current) await db.query(`INSERT INTO pilot_departure_operations
    (id,offer_id,actor_id,driver_id,idempotency_key,payload_digest,kind,reason,
     boarded_allocation_ids,confirmed_allocation_ids,started_at,state,acknowledged_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,'recovered',now())`,
    [item.operationId,item.offerId,item.actorId,item.driverId,item.key,item.digest,item.kind,item.reason,
      JSON.stringify(item.boardedIds),JSON.stringify(item.confirmedIds),item.startedAt]);
  else if(current.state==='committed') await db.query(`UPDATE pilot_departure_operations
    SET state='recovered',acknowledged_at=now() WHERE id=$1`,[item.operationId]);
  const ride=await offer(db,item.offerId);
  if(!ride||ride.driver_id!==item.driverId||!['active','departed','completed'].includes(ride.status))
    throw new Error("Pilot offer requires manual recovery");
  const ids=(await allocations(db,item.offerId)).map(row=>row.id).sort();
  if(JSON.stringify(ids)!==JSON.stringify(item.confirmedIds)) throw new Error("Pilot allocations require manual recovery");
  if(ride.status==='active') await db.query("UPDATE ride_offers SET status='departed',updated_at=$2 WHERE id=$1",
    [item.offerId,item.startedAt]);
  await db.query(`INSERT INTO pilot_departure_boarding(operation_id,allocation_id,boarded,recorded_at)
    SELECT $1,id,id=ANY($2::uuid[]),$4 FROM pilot_seat_allocations WHERE id=ANY($3::uuid[])
    ON CONFLICT (operation_id,allocation_id) DO NOTHING`,
    [item.operationId,item.boardedIds,item.confirmedIds,item.startedAt]);
  await db.query(`INSERT INTO pilot_departure_review_signals(operation_id,allocation_id,signal_type,created_at)
    SELECT $1,id,'absence',$4 FROM pilot_seat_allocations
    WHERE id=ANY($3::uuid[]) AND NOT(id=ANY($2::uuid[]))
    ON CONFLICT(operation_id,allocation_id) DO NOTHING`,
    [item.operationId,item.boardedIds,item.confirmedIds,item.startedAt]);
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    SELECT $1,$2,'ride_offer',$3,jsonb_build_object('operationId',$4::text,'reason',$5::text)
    WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$4)`,
    [item.actorId,item.kind==='late_departure'?'pilot_late_departure':'pilot_departure',
      item.offerId,item.operationId,item.reason]);
}
