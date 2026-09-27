import type { Pool, PoolClient } from "pg";
import {createHash} from "node:crypto";
import { lockCommitmentActors } from "../rides/commitment.repo";

export type RevocationSubject = "student" | "driver" | "vehicle" | "association" | "restriction";
export type RestrictionScope = "driver" | "passenger" | "all";
type Database = Pool | PoolClient;
function caseId(operationId:string,offerId:string,allocationId:string|null) {
  const hex=createHash("sha256").update(`${operationId}:${offerId}:${allocationId ?? "ride"}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export type Effect = { id: string; offer_id: string; allocation_id: string | null;
  driver_id: string; passenger_ids: string[]; kind: "hold" | "incident" };

function predicate(subject: RevocationSubject, scope:RestrictionScope="all") {
  if (subject === "restriction") {
    if(scope==="driver") return "o.driver_id=$1";
    if(scope==="passenger") return "a.passenger_id=$1";
    return "(a.passenger_id=$1 OR o.driver_id=$1)";
  }
  if (subject === "student") return "(a.passenger_id=$1 OR o.driver_id=$1)";
  if (subject === "driver") return "o.driver_id=$1";
  if (subject === "vehicle") return "o.vehicle_id=$1";
  return `EXISTS (SELECT 1 FROM driver_vehicle_approvals v
    WHERE v.id=$1 AND v.driver_user_id=o.driver_id AND v.vehicle_id=o.vehicle_id)`;
}

// The same advisory keys are taken before request/offer rows in acceptance and departure.
export async function lockActors(client: PoolClient, subject: RevocationSubject, id: string) {
  if (subject === "student" || subject === "restriction") {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`student:${id}`]);
    return;
  }
  if (subject === "driver") {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`student:${id}`]);
    return;
  }
  if (subject === "vehicle") {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`vehicle:${id}`]);
    return;
  }
  const association = (await client.query<{driver_user_id:string;vehicle_id:string}>(
    "SELECT driver_user_id,vehicle_id FROM driver_vehicle_approvals WHERE id=$1",[id])).rows[0];
  if (association) await lockCommitmentActors(client,association.driver_user_id,association.vehicle_id,[]);
}

export async function lockAffectedTrips(client: PoolClient, subject: RevocationSubject, id: string,
  scope:RestrictionScope="all") {
  const rides = await client.query<{id:string}>(`SELECT DISTINCT o.id FROM ride_offers o
    LEFT JOIN pilot_seat_allocations a ON a.offer_id=o.id AND a.status IN ('confirmed','held')
    WHERE o.pilot_policy_id IS NOT NULL AND o.status IN ('active','held','departed')
      AND ${predicate(subject,scope)} ORDER BY o.id`,[id]);
  for (const ride of rides.rows) {
    await client.query("SELECT id FROM pilot_seat_requests WHERE offer_id=$1 ORDER BY id FOR UPDATE",[ride.id]);
    await client.query("SELECT id FROM ride_offers WHERE id=$1 FOR UPDATE",[ride.id]);
  }
}

export async function apply(client: PoolClient, subject: RevocationSubject, id: string,
  operationId: string, reason: string,scope:RestrictionScope="all"): Promise<Effect[]> {
  const rides = await client.query<{id:string;driver_id:string;status:string}>(`SELECT DISTINCT o.id,o.driver_id,o.status
    FROM ride_offers o LEFT JOIN pilot_seat_allocations a ON a.offer_id=o.id
      AND a.status IN ('confirmed','held')
    WHERE o.pilot_policy_id IS NOT NULL AND o.status IN ('active','held','departed')
      AND ${predicate(subject,scope)} ORDER BY o.id`,[id]);
  const effects: Effect[]=[];
  for (const ride of rides.rows) {
    const passengers=(await client.query<{passenger_id:string}>(`SELECT passenger_id
      FROM pilot_seat_allocations WHERE offer_id=$1 AND status IN ('confirmed','held')
      ORDER BY passenger_id`,[ride.id])).rows.map(row=>row.passenger_id);
    if (ride.status === "departed") {
      const incident=(await client.query<{id:string}>(`INSERT INTO pilot_revocation_incidents
        (id,source_operation_id,subject_type,subject_id,offer_id,reason)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_operation_id,offer_id)
        DO UPDATE SET reason=EXCLUDED.reason RETURNING id`,
        [caseId(operationId,ride.id,null),operationId,subject,id,ride.id,reason])).rows[0];
      effects.push({id:incident.id,offer_id:ride.id,allocation_id:null,driver_id:ride.driver_id,
        passenger_ids:passengers,kind:"incident"});
      continue;
    }
    if((subject === "student" || subject === "restriction") && ride.driver_id!==id) {
      const allocations=await client.query<{id:string}>(`UPDATE pilot_seat_allocations
        SET status='held' WHERE offer_id=$1 AND passenger_id=$2 AND status IN ('confirmed','held')
        RETURNING id`,[ride.id,id]);
      for(const allocation of allocations.rows) {
        const hold=(await client.query<{id:string}>(`INSERT INTO pilot_revocation_holds
          (id,source_operation_id,subject_type,subject_id,offer_id,allocation_id,reason)
          VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(source_operation_id,offer_id,allocation_id)
          DO UPDATE SET reason=EXCLUDED.reason RETURNING id`,
          [caseId(operationId,ride.id,allocation.id),operationId,subject,id,ride.id,allocation.id,reason])).rows[0];
        effects.push({id:hold.id,offer_id:ride.id,allocation_id:allocation.id,
          driver_id:ride.driver_id,passenger_ids:[id],kind:"hold"});
      }
    } else {
      const hold=(await client.query<{id:string}>(`INSERT INTO pilot_revocation_holds
        (id,source_operation_id,subject_type,subject_id,offer_id,reason)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(source_operation_id,offer_id) WHERE allocation_id IS NULL
        DO UPDATE SET reason=EXCLUDED.reason RETURNING id`,
        [caseId(operationId,ride.id,null),operationId,subject,id,ride.id,reason])).rows[0];
      await client.query("UPDATE ride_offers SET status='held',updated_at=now() WHERE id=$1 AND status='active'",[ride.id]);
      effects.push({id:hold.id,offer_id:ride.id,allocation_id:null,driver_id:ride.driver_id,
        passenger_ids:passengers,kind:"hold"});
    }
  }
  for(const item of effects) await audit(client,operationId,item,reason);
  return effects;
}

async function audit(client:PoolClient,operationId:string,item:Effect,reason:string) {
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    SELECT COALESCE((SELECT operator_id FROM pilot_student_revocations WHERE id=$4::uuid),
      (SELECT operator_id FROM driver_car_review_operations WHERE id=$4::uuid),
      (SELECT operator_id FROM pilot_account_restriction_operations WHERE id=$4::uuid)),
      $1,$2,$3,jsonb_build_object('operationId',$4::text,'reason',$5::text,
      'offerId',$6::text,'allocationId',$7::text)
    WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE action=$1 AND entity_id=$3
      AND metadata->>'operationId'=$4::text)`,
    [item.kind==="hold"?"pilot_revocation_hold_created":"pilot_revocation_incident_created",
      item.kind==="hold"?"pilot_revocation_hold":"pilot_revocation_incident",item.id,
      operationId,reason,item.offer_id,item.allocation_id]);
}

export async function restore(client:PoolClient,subject:RevocationSubject,subjectId:string,
  operationId:string,reason:string,snapshot:Effect[],applyState=true) {
  for(const item of snapshot) {
    if(item.kind==="incident") {
      await client.query(`INSERT INTO pilot_revocation_incidents
        (id,source_operation_id,subject_type,subject_id,offer_id,reason)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_operation_id,offer_id) DO NOTHING`,
        [item.id,operationId,subject,subjectId,item.offer_id,reason]);
    } else {
      await client.query(`INSERT INTO pilot_revocation_holds
        (id,source_operation_id,subject_type,subject_id,offer_id,allocation_id,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
        [item.id,operationId,subject,subjectId,item.offer_id,item.allocation_id,reason]);
      if(applyState&&item.allocation_id) await client.query(`UPDATE pilot_seat_allocations SET status='held'
        WHERE id=$1 AND status='confirmed'`,[item.allocation_id]);
      else if(applyState) await client.query(`UPDATE ride_offers SET status='held',updated_at=now()
        WHERE id=$1 AND status='active'`,[item.offer_id]);
    }
    await audit(client,operationId,item,reason);
  }
}

export async function matches(db:Database,operationId:string,subject:RevocationSubject,
  subjectId:string,reason:string,snapshot:Effect[]) {
  for(const item of snapshot) {
    const table=item.kind==="hold"?"pilot_revocation_holds":"pilot_revocation_incidents";
    const row=(await db.query<{offer_id:string;allocation_id?:string|null;subject_type:string;
      subject_id:string;reason:string}>(`SELECT offer_id,subject_type,subject_id,reason,
      ${item.kind==="hold"?"allocation_id":"NULL::uuid AS allocation_id"}
      FROM ${table} WHERE id=$1 AND source_operation_id=$2`,[item.id,operationId])).rows[0];
    if(!row||row.offer_id!==item.offer_id||(row.allocation_id??null)!==(item.allocation_id??null)
      ||row.subject_type!==subject||row.subject_id!==subjectId||row.reason!==reason)
      return false;
  }
  return true;
}

export async function openCases(db: Database) {
  const holds=(await db.query(`SELECT h.*,o.driver_id,o.status AS offer_status,
    ARRAY(SELECT DISTINCT p.passenger_id FROM pilot_seat_allocations p
      WHERE p.offer_id=o.id ORDER BY p.passenger_id) AS passenger_ids,
    a.passenger_id,a.status AS allocation_status FROM pilot_revocation_holds h
    JOIN ride_offers o ON o.id=h.offer_id
    LEFT JOIN pilot_seat_allocations a ON a.id=h.allocation_id
    ORDER BY h.resolved_at NULLS FIRST,h.created_at DESC LIMIT 100`)).rows;
  const incidents=(await db.query(`SELECT i.*,o.driver_id,o.status AS offer_status,
    ARRAY(SELECT DISTINCT p.passenger_id FROM pilot_seat_allocations p
      WHERE p.offer_id=o.id ORDER BY p.passenger_id) AS passenger_ids
    FROM pilot_revocation_incidents i JOIN ride_offers o ON o.id=i.offer_id
    ORDER BY i.resolved_at NULLS FIRST,i.created_at DESC LIMIT 100`)).rows;
  return {holds,incidents};
}
