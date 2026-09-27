import type {Pool,PoolClient} from "pg";

type Db=Pool|PoolClient;
export type Claim={allocation_id:string;travelled:boolean;completed:boolean};
export type Operation={id:string;offer_id:string;allocation_id:string|null;actor_id:string;
  idempotency_key:string;payload_digest:string;kind:"driver_completion"|"passenger_confirmation";
  claims:Claim[];recorded_at:Date;state:"committed"|"acknowledged"|"recovered"};
export const byKey=async(db:Db,actor:string,key:string)=>(await db.query<Operation>(
  "SELECT * FROM pilot_journey_operations WHERE actor_id=$1 AND idempotency_key=$2",[actor,key])).rows[0]??null;
export const byId=async(db:Db,id:string,lock=false)=>(await db.query<Operation>(
  `SELECT * FROM pilot_journey_operations WHERE id=$1 ${lock?"FOR UPDATE":""}`,[id])).rows[0]??null;
export const acknowledged=async(db:Db)=>(await db.query<Operation>(
  "SELECT * FROM pilot_journey_operations WHERE state IN ('acknowledged','recovered') ORDER BY recorded_at,id")).rows;
export const pending=async(db:Db)=>(await db.query<Operation>(
  "SELECT * FROM pilot_journey_operations WHERE state='committed' ORDER BY recorded_at,id")).rows;
export const offer=async(db:PoolClient,id:string)=>(await db.query<{id:string;driver_id:string;status:string}>(
  "SELECT id,driver_id,status FROM ride_offers WHERE id=$1 AND pilot_policy_id IS NOT NULL FOR UPDATE",[id])).rows[0]??null;
export const seats=async(db:Db,id:string)=>(await db.query<{id:string;passenger_id:string;
  contribution_paise:number;currency:string;policy_version:number;boarded:boolean}>(`
  SELECT a.id,a.passenger_id,a.contribution_paise,a.currency,a.policy_version,b.boarded
  FROM pilot_seat_allocations a JOIN pilot_departure_boarding b ON b.allocation_id=a.id
  JOIN pilot_departure_operations d ON d.id=b.operation_id
  WHERE a.offer_id=$1 AND d.state IN ('acknowledged','recovered') AND a.status IN ('confirmed','held')
  ORDER BY a.id`,[id])).rows;
export const driverCompletion=async(db:Db,id:string)=>(await db.query<Operation>(
  "SELECT * FROM pilot_journey_operations WHERE offer_id=$1 AND kind='driver_completion'",[id])).rows[0]??null;
export const passengerConfirmation=async(db:Db,id:string)=>(await db.query<Operation>(
  "SELECT * FROM pilot_journey_operations WHERE allocation_id=$1 AND kind='passenger_confirmation'",[id])).rows[0]??null;
export async function insert(db:PoolClient,input:{offerId:string;allocationId:string|null;actorId:string;
  key:string;digest:string;kind:Operation['kind'];claims:Claim[];at:Date;id?:string;
  state?:Operation['state']}) {
  const row=(await db.query<Operation>(`INSERT INTO pilot_journey_operations
    (id,offer_id,allocation_id,actor_id,idempotency_key,payload_digest,kind,claims,recorded_at,state)
    VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [input.id??null,input.offerId,input.allocationId,input.actorId,input.key,input.digest,input.kind,
      JSON.stringify(input.claims),input.at,input.state??'committed'])).rows[0];
  for(const claim of input.claims) await db.query(`INSERT INTO pilot_journey_claims
    (operation_id,allocation_id,actor_role,travelled,completed,recorded_at)
    VALUES($1,$2,$3,$4,$5,$6)`,[row.id,claim.allocation_id,
      input.kind==='driver_completion'?'driver':'passenger',claim.travelled,claim.completed,input.at]);
  if(input.kind==='driver_completion') for(const claim of input.claims)
    await db.query(`INSERT INTO pilot_journey_review_work(allocation_id,driver_operation_id,due_at)
      VALUES($1,$2,$3::timestamptz+interval '24 hours') ON CONFLICT(allocation_id) DO NOTHING`,
      [claim.allocation_id,row.id,input.at]);
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    VALUES($1,$2,'ride_offer',$3,jsonb_build_object('operationId',$4::text,'allocationId',$5::text))`,
    [input.actorId,input.kind==='driver_completion'?'pilot_driver_completion':'pilot_passenger_journey',
      input.offerId,row.id,input.allocationId]);
  return row;
}
export async function settle(db:PoolClient,allocationId:string,at:Date) {
  if((await db.query("SELECT 1 FROM pilot_journey_reviews WHERE allocation_id=$1",[allocationId])).rowCount)
    return 'review' as const;
  const pair=(await db.query<{driver_id:string;passenger_id:string;driver_travelled:boolean;
    driver_completed:boolean;passenger_travelled:boolean;passenger_completed:boolean;
    amount_paise:number;currency:string;policy_version:number;driver_at:Date;passenger_at:Date}>(`
    SELECT d.operation_id AS driver_id,p.operation_id AS passenger_id,
      d.travelled AS driver_travelled,d.completed AS driver_completed,
      p.travelled AS passenger_travelled,p.completed AS passenger_completed,
      a.contribution_paise AS amount_paise,a.currency,a.policy_version,
      d.recorded_at AS driver_at,p.recorded_at AS passenger_at
    FROM pilot_seat_allocations a JOIN pilot_journey_claims d ON d.allocation_id=a.id AND d.actor_role='driver'
    JOIN pilot_journey_claims p ON p.allocation_id=a.id AND p.actor_role='passenger'
    WHERE a.id=$1`,[allocationId])).rows[0];
  if(!pair) return null;
  const confirmedAt=new Date(Math.max(pair.driver_at.getTime(),pair.passenger_at.getTime()));
  if(pair.passenger_at.getTime()>=pair.driver_at.getTime()+86_400_000){
    await db.query(`INSERT INTO pilot_journey_reviews
      (allocation_id,reason,created_at,driver_claim_operation_id,passenger_claim_operation_id)
      VALUES($1,'silence',$2,$3,$4) ON CONFLICT(allocation_id) DO NOTHING`,
      [allocationId,confirmedAt,pair.driver_id,pair.passenger_id]);
    return 'review' as const;
  }
  if(pair.driver_travelled&&pair.driver_completed&&pair.passenger_travelled&&pair.passenger_completed) {
    await db.query(`INSERT INTO pilot_contribution_obligations
      (allocation_id,driver_claim_operation_id,passenger_claim_operation_id,amount_paise,currency,
       policy_version,confirmed_at,due_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$7::timestamptz+interval '24 hours') ON CONFLICT(allocation_id) DO NOTHING`,
      [allocationId,pair.driver_id,pair.passenger_id,pair.amount_paise,pair.currency,pair.policy_version,confirmedAt]);
    return 'obligation' as const;
  }
  if(pair.driver_travelled!==pair.passenger_travelled||pair.driver_completed!==pair.passenger_completed||
    (pair.driver_travelled&&!pair.driver_completed)||!pair.driver_travelled) {
    await db.query(`INSERT INTO pilot_journey_reviews
      (allocation_id,reason,created_at,driver_claim_operation_id,passenger_claim_operation_id)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(allocation_id) DO NOTHING`,
      [allocationId,pair.driver_travelled!==pair.passenger_travelled?'disagreement':
        pair.driver_travelled?'interruption':'absence',
        confirmedAt,pair.driver_id,pair.passenger_id]);
    return 'review' as const;
  }
  return 'no_obligation' as const;
}
export const acknowledge=async(db:PoolClient,id:string)=>(await db.query<Operation>(`
  UPDATE pilot_journey_operations SET state='acknowledged',acknowledged_at=now()
  WHERE id=$1 AND state='committed' RETURNING *`,[id])).rows[0]??null;
export const ready=async(db:PoolClient,id:string)=>{await db.query(
  "UPDATE pilot_notification_events SET ready_at=now() WHERE origin_type='pilot_journey' AND operation_id=$1",[id]);};
export async function stateMatches(db:Db,row:Operation) {
  const claims=(await db.query<Claim>(`SELECT allocation_id,travelled,completed FROM pilot_journey_claims
    WHERE operation_id=$1 ORDER BY allocation_id`,[row.id])).rows;
  const expected=[...row.claims].sort((a,b)=>a.allocation_id.localeCompare(b.allocation_id))
    .map(c=>({allocation_id:c.allocation_id,travelled:c.travelled,completed:c.completed}));
  if(JSON.stringify(claims)!==JSON.stringify(expected)) return false;
  for(const claim of claims){
    const facts=(await db.query<{driver_travelled:boolean|null;driver_completed:boolean|null;
      passenger_travelled:boolean;passenger_completed:boolean;amount_paise:number;
      currency:string;policy_version:number;frozen_paise:number;frozen_currency:string;
      frozen_policy_version:number;confirmed_at:Date|null;due_at:Date|null;
      review_reason:string|null}>(`SELECT d.travelled AS driver_travelled,d.completed AS driver_completed,
      p.travelled AS passenger_travelled,p.completed AS passenger_completed,
      o.amount_paise,o.currency,o.policy_version,o.confirmed_at,o.due_at,
      a.contribution_paise AS frozen_paise,a.currency AS frozen_currency,
      a.policy_version AS frozen_policy_version,
      r.reason AS review_reason
      FROM pilot_seat_allocations a
      LEFT JOIN pilot_journey_claims d ON d.allocation_id=a.id AND d.actor_role='driver'
      LEFT JOIN pilot_journey_claims p ON p.allocation_id=a.id AND p.actor_role='passenger'
      LEFT JOIN pilot_contribution_obligations o ON o.allocation_id=a.id
      LEFT JOIN pilot_journey_reviews r ON r.allocation_id=a.id WHERE a.id=$1`,
      [claim.allocation_id])).rows[0];
    if(!facts) return false;
    if(facts.driver_travelled!==null&&facts.passenger_travelled!==null){
      const mutual=facts.driver_travelled&&facts.driver_completed&&facts.passenger_travelled&&facts.passenger_completed;
      const disagreement=facts.driver_travelled!==facts.passenger_travelled||
        facts.driver_completed!==facts.passenger_completed||
        (facts.driver_travelled&&!facts.driver_completed)||!facts.driver_travelled;
      if(mutual&&!facts.confirmed_at&&!facts.review_reason) return false;
      if(disagreement&&!facts.review_reason) return false;
      if(!mutual&&facts.confirmed_at) return false;
    }
    if(facts.confirmed_at&&(facts.amount_paise!==facts.frozen_paise||
      facts.currency!==facts.frozen_currency||facts.policy_version!==facts.frozen_policy_version||
      !facts.due_at||facts.due_at.getTime()-facts.confirmed_at.getTime()!==86_400_000)) return false;
  }
  const recipients=(await db.query<{id:string}>(`SELECT driver_id AS id FROM ride_offers WHERE id=$1
    UNION SELECT passenger_id AS id FROM pilot_seat_allocations WHERE offer_id=$1
      AND status IN ('confirmed','held')`,[row.offer_id])).rows.map(item=>item.id);
  const notified=(await db.query<{recipient_id:string}>(`SELECT recipient_id FROM pilot_notification_events
    WHERE origin_type='pilot_journey' AND operation_id=$1 AND event_type=$2
      AND ready_at IS NOT NULL`,[row.id,row.kind])).rows.map(item=>item.recipient_id);
  if(recipients.some(id=>!notified.includes(id))) return false;
  return Boolean((await db.query("SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$1",[row.id])).rowCount);
}
export async function visible(db:Db,userId:string,offerId?:string) {
  return (await db.query(`SELECT a.id AS allocation_id,a.offer_id,a.driver_id,a.passenger_id,
    d.travelled AS driver_travelled,d.completed AS driver_completed,d.recorded_at AS driver_recorded_at,
    p.travelled AS passenger_travelled,p.completed AS passenger_completed,p.recorded_at AS passenger_recorded_at,
    o.amount_paise,o.currency,o.confirmed_at,o.due_at,r.reason AS review_reason,r.status AS review_status
    FROM pilot_seat_allocations a LEFT JOIN pilot_journey_claims d ON d.allocation_id=a.id AND d.actor_role='driver'
    LEFT JOIN pilot_journey_claims p ON p.allocation_id=a.id AND p.actor_role='passenger'
    LEFT JOIN pilot_contribution_obligations o ON o.allocation_id=a.id
    LEFT JOIN pilot_journey_reviews r ON r.allocation_id=a.id
    WHERE (a.driver_id=$1 OR a.passenger_id=$1) AND ($2::uuid IS NULL OR a.offer_id=$2)
      AND EXISTS(SELECT 1 FROM pilot_departure_boarding b WHERE b.allocation_id=a.id)
      AND NOT EXISTS(SELECT 1 FROM pilot_journey_operations j WHERE j.offer_id=a.offer_id
        AND j.kind='driver_completion' AND j.recorded_at<=now()-interval '24 hours')
    ORDER BY a.accepted_at DESC`,[userId,offerId??null])).rows;
}
export async function reviewRequiredForOperation(db:Db,id:string){
  return Boolean((await db.query(`SELECT 1 FROM pilot_journey_reviews
    WHERE driver_claim_operation_id=$1 OR passenger_claim_operation_id=$1 LIMIT 1`,[id])).rowCount);
}
export async function openReviews(db:Db){
  return (await db.query(`SELECT r.*,a.offer_id,a.passenger_id,a.driver_id
    FROM pilot_journey_reviews r JOIN pilot_seat_allocations a ON a.id=r.allocation_id
    WHERE r.status='open' ORDER BY r.created_at,r.id LIMIT 100`)).rows;
}
export async function participantReviews(db:Db,userId:string){
  return (await db.query<{allocation_id:string;offer_id:string;reason:string;status:string;
    created_at:Date}>(`SELECT r.allocation_id,a.offer_id,r.reason,r.status,r.created_at
    FROM pilot_journey_reviews r JOIN pilot_seat_allocations a ON a.id=r.allocation_id
    WHERE a.driver_id=$1 OR a.passenger_id=$1 ORDER BY r.created_at DESC LIMIT 100`,[userId])).rows;
}
