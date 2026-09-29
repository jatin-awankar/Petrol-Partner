import type {Pool,PoolClient} from 'pg';
type Db=Pool|PoolClient;
export type Action='passenger_cancel'|'driver_cancel'|'hold'|'release_hold'|'depart'|
  'driver_journey'|'passenger_journey'|'payment_claim'|'receipt'|'dispute'|
  'operator_journey'|'operator_settlement';
export type Operation={id:string;actor_id:string;idempotency_key:string;payload_digest:string;
  offer_id:string;allocation_id:string|null;action:Action;payload:Record<string,unknown>;
  result:Record<string,unknown>;state:'committed'|'acknowledged'|'recovered';created_at:Date};
export type Offer={id:string;driver_id:string;vehicle_declaration_id:string;status:string;
  route_version:number;policy_version:string;operating_policy_version:string;departure_at:Date;
  commitment_until:Date;capacity:number;routing_source:string};
export type Seat={id:string;offer_id:string;request_id:string;passenger_id:string;driver_id:string;
  status:string;boarded:boolean|null;accepted_terms:Record<string,unknown>};
export const byKey=async(db:Db,actor:string,key:string)=>(await db.query<Operation>(
  'SELECT * FROM posted_route_outcome_operations WHERE actor_id=$1 AND idempotency_key=$2',[actor,key])).rows[0]??null;
export const byId=async(db:Db,id:string)=>(await db.query<Operation>(
  'SELECT * FROM posted_route_outcome_operations WHERE id=$1',[id])).rows[0]??null;
export const all=async(db:Db)=>(await db.query<Operation>(
  'SELECT * FROM posted_route_outcome_operations ORDER BY created_at,id')).rows;
export const offer=async(db:Db,id:string,lock=false)=>(await db.query<Offer>(
  `SELECT * FROM posted_route_offers WHERE id=$1 ${lock?'FOR UPDATE':''}`,[id])).rows[0]??null;
export const seat=async(db:Db,id:string,lock=false)=>(await db.query<Seat>(
  `SELECT * FROM posted_route_seat_allocations WHERE id=$1 ${lock?'FOR UPDATE':''}`,[id])).rows[0]??null;
export const seats=async(db:Db,id:string,lock=false)=>(await db.query<Seat>(
  `SELECT * FROM posted_route_seat_allocations WHERE offer_id=$1 ORDER BY id ${lock?'FOR UPDATE':''}`,[id])).rows;
export async function write(db:PoolClient,input:{actor:string;key:string;digest:string;offer:string;
  allocation:string|null;action:Action;payload:Record<string,unknown>;result:Record<string,unknown>}){
  return (await db.query<Operation>(`INSERT INTO posted_route_outcome_operations
    (actor_id,idempotency_key,payload_digest,offer_id,allocation_id,action,payload,result,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'committed') RETURNING *`,
    [input.actor,input.key,input.digest,input.offer,input.allocation,input.action,input.payload,input.result])).rows[0];
}
export async function setOfferStatus(db:PoolClient,id:string,status:string){await db.query(
  'UPDATE posted_route_offers SET status=$2 WHERE id=$1',[id,status]);}
export async function setSeatStatus(db:PoolClient,id:string,status:string){await db.query(
  'UPDATE posted_route_seat_allocations SET status=$2 WHERE id=$1',[id,status]);}
export async function setBoarding(db:PoolClient,id:string,boarded:boolean){await db.query(
  'UPDATE posted_route_seat_allocations SET boarded=$2 WHERE id=$1',[id,boarded]);}
export async function cancelRequests(db:PoolClient,id:string){return (await db.query<{
  id:string;passenger_id:string}>(`UPDATE posted_route_seat_requests SET status='withdrawn',decided_at=now()
  WHERE offer_id=$1 AND status='pending' RETURNING id,passenger_id`,[id])).rows;}
export async function journeyClaim(db:Db,allocation:string){return (await db.query<{
  role:string;travelled:boolean;completed:boolean}>(
  'SELECT role,travelled,completed FROM posted_route_journey_claims WHERE allocation_id=$1',[allocation])).rows;}
export async function insertClaim(db:PoolClient,allocation:string,operation:string,role:string,
  travelled:boolean,completed:boolean){await db.query(`INSERT INTO posted_route_journey_claims
  (allocation_id,operation_id,role,travelled,completed) VALUES($1,$2,$3,$4,$5)`,
  [allocation,operation,role,travelled,completed]);}
export async function reviewJourney(db:PoolClient,allocation:string,reason:string){await db.query(`INSERT INTO
  posted_route_journey_reviews(allocation_id,reason) VALUES($1,$2)
  ON CONFLICT(allocation_id) DO NOTHING`,[allocation,reason]);}
export async function obligation(db:Db,allocation:string){return (await db.query<{
  id:string;allocation_id:string;amount_paise:number;currency:string;policy_version:string}>(
  'SELECT * FROM posted_route_obligations WHERE allocation_id=$1',[allocation])).rows[0]??null;}
export async function insertObligation(db:PoolClient,seat:Seat){const t=seat.accepted_terms;
  return (await db.query<{id:string}>(`INSERT INTO posted_route_obligations
    (allocation_id,amount_paise,currency,policy_version,accepted_route_version,accepted_segment)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(allocation_id) DO NOTHING RETURNING id`,
    [seat.id,t.total_paise,t.currency,t.policy_version,t.route_version,
      {pickup:t.pickup,dropoff:t.dropoff,segment_meters:t.segment_meters}])).rows[0]??null;}
export async function paymentClaim(db:Db,obligation:string){return (await db.query<{
  id:string;method:string}>(
  'SELECT * FROM posted_route_payment_claims WHERE obligation_id=$1',[obligation])).rows[0]??null;}
export async function insertPaymentClaim(db:PoolClient,obligation:string,operation:string,method:string){await db.query(
  'INSERT INTO posted_route_payment_claims(obligation_id,operation_id,method) VALUES($1,$2,$3)',
  [obligation,operation,method]);}
export async function receipt(db:Db,claim:string){return (await db.query<{id:string;kind:string}>(
  'SELECT * FROM posted_route_receipt_decisions WHERE claim_id=$1',[claim])).rows[0]??null;}
export async function insertReceipt(db:PoolClient,claim:string,operation:string,kind:string){await db.query(
  'INSERT INTO posted_route_receipt_decisions(claim_id,operation_id,kind) VALUES($1,$2,$3)',
  [claim,operation,kind]);}
export async function reviewSettlement(db:PoolClient,obligation:string,reason:string){await db.query(`INSERT INTO
  posted_route_settlement_reviews(obligation_id,reason) VALUES($1,$2)
  ON CONFLICT(obligation_id) DO NOTHING`,[obligation,reason]);}
export async function resolveJourney(db:PoolClient,allocation:string,actor:string,outcome:string,reason:string){return (await db.query(`UPDATE posted_route_journey_reviews SET status='resolved',outcome=$3,
  resolution_reason=$4,resolved_by=$2,resolved_at=now() WHERE allocation_id=$1 AND status='open' RETURNING id`,
  [allocation,actor,outcome,reason])).rowCount;}
export async function resolveSettlement(db:PoolClient,obligation:string,actor:string,receipt:boolean,reason:string){return (await db.query(`UPDATE posted_route_settlement_reviews SET status='resolved',receipt_established=$3,
  resolution_reason=$4,resolved_by=$2,resolved_at=now() WHERE obligation_id=$1 AND status='open' RETURNING id`,
  [obligation,actor,receipt,reason])).rowCount;}
export async function audit(db:PoolClient,row:Operation){await db.query(`INSERT INTO audit_logs
  (actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'posted_route_offer',$3,
  jsonb_build_object('operationId',$4::text,'allocationId',$5::text))`,
  [row.actor_id,`posted_route_${row.action}`,row.offer_id,row.id,row.allocation_id]);}
export async function acknowledge(db:PoolClient,id:string){await db.query(`UPDATE posted_route_outcome_operations
  SET state='acknowledged',acknowledged_at=now() WHERE id=$1 AND state='committed'`,[id]);
  await db.query("UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='posted_route_outcome' AND operation_id=$1",[id]);}
