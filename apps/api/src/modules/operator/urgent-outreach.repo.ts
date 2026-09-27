import type { Pool, PoolClient } from "pg";

export type OutreachInput = {
  participantId: string; method: "email" | "phone" | "in_person" | "other";
  occurredAt: string; reason: string; outcome: string;
};

export async function participantExists(client: PoolClient, id: string) {
  const row = await client.query("SELECT 1 FROM users WHERE id = $1", [id]);
  return !!row.rowCount;
}

export async function outreachByKey(client: PoolClient, operatorId: string, key: string) {
  const row = await client.query<{id:string;payload_digest:string}>(
    "SELECT id, payload_digest FROM pilot_urgent_outreach WHERE operator_id=$1 AND idempotency_key=$2", [operatorId, key]);
  return row.rows[0];
}

export async function insertOutreach(client: PoolClient, operatorId: string, key: string,
  input: OutreachInput, digest: string) {
  const row = await client.query<{id:string}>(`INSERT INTO pilot_urgent_outreach
    (operator_id,idempotency_key,participant_id,method,occurred_at,reason,outcome,payload_digest)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [operatorId,key,input.participantId,input.method,input.occurredAt,input.reason,input.outcome,digest]);
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id)
    VALUES($1,'urgent_outreach_recorded','pilot_urgent_outreach',$2)`,[operatorId,row.rows[0].id]);
  return row.rows[0].id;
}

export async function listOutreach(client: PoolClient) {
  const row = await client.query(`SELECT id,operator_id,participant_id,method,occurred_at,reason,outcome,recorded_at
    FROM pilot_urgent_outreach WHERE state IN ('acknowledged','recovered') ORDER BY recorded_at DESC LIMIT 100`);
  return row.rows;
}

export type OutreachRow={id:string;operator_id:string;idempotency_key:string;participant_id:string;
  method:OutreachInput["method"];occurred_at:Date;reason:string;outcome:string;
  payload_digest:string;recorded_at:Date;state:string};
export type OutreachReceipt={operationId:string;operatorId:string;key:string;participantId:string;
  method:OutreachInput["method"];occurredAt:string;reason:string;outcome:string;
  digest:string;recordedAt:string};
export async function byKey(db:Pool|PoolClient,operatorId:string,key:string) {
  const row=await db.query<OutreachRow>("SELECT * FROM pilot_urgent_outreach WHERE operator_id=$1 AND idempotency_key=$2",[operatorId,key]);
  return row.rows[0];
}
export async function byId(db:Pool|PoolClient,id:string) {
  const row=await db.query<OutreachRow>("SELECT * FROM pilot_urgent_outreach WHERE id=$1",[id]);
  return row.rows[0];
}
export async function allPrimary(db:Pool|PoolClient) {
  return (await db.query<OutreachRow>("SELECT * FROM pilot_urgent_outreach WHERE idempotency_key NOT LIKE 'fallback:%'")).rows;
}
export async function pending(db:Pool|PoolClient) {
  return (await db.query<OutreachRow>("SELECT * FROM pilot_urgent_outreach WHERE state='committed'")).rows;
}
export async function recoveryModeForUpdate(client:PoolClient) {
  return (await client.query<{mode:string}>("SELECT mode FROM pilot_recovery_state WHERE singleton=true FOR UPDATE")).rows[0]?.mode;
}
export async function lockKey(client:PoolClient,operatorId:string,key:string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`urgent-outreach:${operatorId}:${key}`]);
}
export async function forUpdate(client:PoolClient,id:string) {
  return (await client.query<OutreachRow>("SELECT * FROM pilot_urgent_outreach WHERE id=$1 FOR UPDATE",[id])).rows[0];
}
export async function acknowledge(client:PoolClient,id:string) {
  await client.query("UPDATE pilot_urgent_outreach SET state='acknowledged' WHERE id=$1",[id]);
}
export async function restore(client:PoolClient,item:OutreachReceipt) {
  await client.query(`INSERT INTO pilot_urgent_outreach
    (id,operator_id,idempotency_key,participant_id,method,occurred_at,reason,outcome,payload_digest,recorded_at,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'recovered')`,
    [item.operationId,item.operatorId,item.key,item.participantId,item.method,item.occurredAt,
      item.reason,item.outcome,item.digest,item.recordedAt]);
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id)
    VALUES($1,'urgent_outreach_recovered','pilot_urgent_outreach',$2)`,[item.operatorId,item.operationId]);
}
export async function markRecovered(client:PoolClient,id:string) {
  await client.query("UPDATE pilot_urgent_outreach SET state='recovered' WHERE id=$1",[id]);
}
