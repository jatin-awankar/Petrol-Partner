import type {Pool,PoolClient} from 'pg';
type Db=Pool|PoolClient;
export async function acquireMutationGuard(db:Pool){
  const client=await db.connect();
  try{await client.query('SELECT pg_advisory_lock(93113, 13)');return client;}
  catch(error){client.release();throw error;}
}
export async function releaseMutationGuard(client:PoolClient){
  try{await client.query('SELECT pg_advisory_unlock(93113, 13)');}
  finally{client.release();}
}
export type Action='passenger_cancel'|'driver_cancel'|'hold'|'release_hold'|'depart'|
  'driver_journey'|'passenger_journey'|'payment_claim'|'receipt'|'dispute'|
  'operator_journey'|'operator_settlement'|'incident_report'|'operator_incident';
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
export async function departureConflicts(db:PoolClient,route:Offer){
  const result=await db.query<{conflict:boolean}>(`SELECT EXISTS(
    SELECT 1 FROM posted_route_seat_allocations s WHERE s.offer_id=$1 AND s.status='confirmed'
      AND (s.driver_id<>$2 OR s.vehicle_declaration_id<>$3
        OR s.accepted_terms->>'route_id' IS DISTINCT FROM $1::text
        OR s.accepted_terms->>'route_version' IS DISTINCT FROM $6::text)
    UNION ALL
    SELECT 1 FROM posted_route_seat_allocations s
    JOIN posted_route_seat_allocations other ON other.offer_id<>s.offer_id
      AND other.status IN ('confirmed','held') AND other.departure_at<$5
      AND other.commitment_until>$4
    WHERE s.offer_id=$1 AND s.status='confirmed' AND (
      other.passenger_id=s.passenger_id OR other.driver_id=s.passenger_id OR
      other.passenger_id=$2 OR other.driver_id=$2 OR
      other.vehicle_declaration_id IN (SELECT v.id FROM unrestricted_vehicle_declarations v
        JOIN unrestricted_vehicle_declarations chosen ON chosen.id=$3
        WHERE lower(v.registration_identifier)=lower(chosen.registration_identifier)))
    LIMIT 1) AS conflict`,[route.id,route.driver_id,route.vehicle_declaration_id,
      route.departure_at,route.commitment_until,route.route_version]);
  return result.rows[0].conflict;
}
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
export async function insertIncident(db:PoolClient,input:{offer:string;allocation:string|null;actor:string;
  operation:string;kind:string;reason:string;priority:string}){return (await db.query<{id:string}>(`
  INSERT INTO posted_route_incidents(offer_id,allocation_id,reported_by,operation_id,kind,reason,priority)
  VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[input.offer,input.allocation,input.actor,
    input.operation,input.kind,input.reason,input.priority])).rows[0];}
export async function openIncidents(db:Db){return (await db.query(`SELECT id,offer_id,allocation_id,
  reported_by,kind,reason,priority,status,created_at FROM posted_route_incidents
  WHERE status='open' ORDER BY created_at,id LIMIT 100`)).rows;}
export async function incident(db:Db,id:string){return (await db.query<{
  id:string;offer_id:string;allocation_id:string|null;status:string}>(
  'SELECT id,offer_id,allocation_id,status FROM posted_route_incidents WHERE id=$1',[id])).rows[0]??null;}
export async function resolveIncident(db:PoolClient,id:string,actor:string,operation:string,
  reason:string,evidenceRefs:string[]){return (await db.query(`UPDATE posted_route_incidents
  SET status='resolved',resolved_by=$2,resolution_operation_id=$3,resolution_reason=$4,
    evidence_refs=$5,resolved_at=now() WHERE id=$1 AND status='open' RETURNING id`,
  [id,actor,operation,reason,evidenceRefs])).rowCount;}
export const hasAudit=async(db:Db,id:string)=>Boolean((await db.query(
  "SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$1",[id])).rowCount);
export const notifiedRecipients=async(db:Db,row:Operation,pending:boolean)=>(await db.query<{
  recipient_id:string}>(`SELECT DISTINCT e.recipient_id FROM pilot_notification_events e
  JOIN pilot_email_jobs j ON j.event_id=e.id WHERE e.origin_type='posted_route_outcome'
  AND e.operation_id=$1 AND e.event_type=$2 AND ($3::boolean OR e.ready_at IS NOT NULL)`,
  [row.id,row.action,pending])).rows.map(item=>item.recipient_id).sort();
export const requestsForOffer=async(db:Db,id:string)=>(await db.query<{id:string;status:string}>(
  'SELECT id,status FROM posted_route_seat_requests WHERE offer_id=$1',[id])).rows;
export const incidentForOperation=async(db:Db,id:string,kind:string)=>Boolean((await db.query(`
  SELECT 1 FROM posted_route_incidents WHERE operation_id=$1 AND kind=$2
  AND status IN ('open','resolved')`,[id,kind])).rowCount);
export const hasIncidentForAllocation=async(db:Db,id:string)=>Boolean((await db.query(
  'SELECT 1 FROM posted_route_incidents WHERE allocation_id=$1 LIMIT 1',[id])).rowCount);
export const resolvedIncidentForOperation=async(db:Db,id:string,operation:string)=>Boolean((await db.query(`
  SELECT 1 FROM posted_route_incidents WHERE id=$1 AND resolution_operation_id=$2
  AND status='resolved'`,[id,operation])).rowCount);
export const latestRouteAction=async(db:Db,id:string)=>(await db.query<{action:string}>(`
  SELECT action FROM posted_route_outcome_operations WHERE offer_id=$1
  AND action IN ('hold','release_hold','driver_cancel','depart')
  ORDER BY created_at DESC,id DESC LIMIT 1`,[id])).rows[0]?.action??null;
export const claimsForOperation=async(db:Db,id:string)=>(await db.query<{
  role:string;travelled:boolean;completed:boolean}>(
  'SELECT role,travelled,completed FROM posted_route_journey_claims WHERE operation_id=$1',[id])).rows;
export const hasPaymentClaim=async(db:Db,obligation:string,operation:string,method:unknown)=>Boolean((await db.query(`
  SELECT 1 FROM posted_route_payment_claims WHERE obligation_id=$1 AND operation_id=$2 AND method=$3`,
  [obligation,operation,method])).rowCount);
export const hasReceiptDecision=async(db:Db,operation:string,kind:string)=>Boolean((await db.query(`
  SELECT 1 FROM posted_route_receipt_decisions WHERE operation_id=$1 AND kind=$2`,
  [operation,kind])).rowCount);
export const hasJourneyDecision=async(db:Db,row:Operation)=>Boolean((await db.query(`
  SELECT 1 FROM posted_route_journey_reviews WHERE allocation_id=$1 AND resolved_by=$2
  AND outcome=$3 AND resolution_reason=$4 AND status='resolved'`,
  [row.allocation_id,row.actor_id,row.payload.outcome,row.payload.reason])).rowCount);
export const hasSettlementDecision=async(db:Db,row:Operation)=>Boolean((await db.query(`
  SELECT 1 FROM posted_route_settlement_reviews r JOIN posted_route_obligations o ON o.id=r.obligation_id
  WHERE o.allocation_id=$1 AND r.resolved_by=$2 AND r.receipt_established=$3
  AND r.resolution_reason=$4 AND r.status='resolved'`,
  [row.allocation_id,row.actor_id,row.payload.receipt_established,row.payload.reason])).rowCount);
export async function updateOperationResult(db:PoolClient,id:string,result:Record<string,unknown>){
  await db.query('UPDATE posted_route_outcome_operations SET result=$2 WHERE id=$1',[id,result]);}
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
