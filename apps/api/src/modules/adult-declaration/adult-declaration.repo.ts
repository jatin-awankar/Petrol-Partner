import type {Pool,PoolClient} from 'pg';
import {pool} from '../../db/pool';
import {activeRestrictionSql} from '../operator/account-restrictions.repo';

type Db=Pool|PoolClient;
export type Operation={id:string;user_id:string;idempotency_key:string;payload_digest:string;
  action:'declare'|'withdraw';policy_version:string;declared_at:Date|null;expires_at:Date|null;
  withdrawn_at:Date|null;committed_at:Date;state:'committed'|'acknowledged'|'recovered'};
export const byKey=async(db:Db,userId:string,key:string)=>(await db.query<Operation>(
  'SELECT * FROM adult_declaration_operations WHERE user_id=$1 AND idempotency_key=$2',[userId,key])).rows[0]??null;
export const byId=async(db:Db,id:string)=>(await db.query<Operation>(
  'SELECT * FROM adult_declaration_operations WHERE id=$1',[id])).rows[0]??null;
export const pending=async(db:Db)=>(await db.query<Operation>(
  "SELECT * FROM adult_declaration_operations WHERE state='committed'")).rows;
export const acknowledged=async(db:Db)=>(await db.query<Operation>(
  "SELECT * FROM adult_declaration_operations WHERE state IN ('acknowledged','recovered')")).rows;
export async function lockAccount(db:PoolClient,userId:string){
  return (await db.query<{status:string}>('SELECT status FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0]??null;
}
export async function renewalExpiry(db:PoolClient,declaredAt:Date){
  return (await db.query<{expires_at:Date}>(
    `SELECT $1::timestamptz + interval '12 months' AS expires_at`,[declaredAt])).rows[0].expires_at;
}
export async function status(userId:string,db:Db=pool){
  return (await db.query<{policy_version:string|null;declared_at:Date|null;expires_at:Date|null;
    withdrawn_at:Date|null;restricted:boolean}>(`SELECT d.policy_version,d.declared_at,d.expires_at,d.withdrawn_at,
      ${activeRestrictionSql('u.id',"'passenger'")} OR ${activeRestrictionSql('u.id',"'driver'")} AS restricted
      FROM users u LEFT JOIN adult_declarations d ON d.user_id=u.id WHERE u.id=$1`,[userId])).rows[0]??null;
}
export async function apply(db:PoolClient,row:Operation){
  if(row.action==='declare') await db.query(`INSERT INTO adult_declarations
    (user_id,policy_version,declared_at,expires_at,withdrawn_at,operation_id)
    VALUES($1,$2,$3,$4,NULL,$5) ON CONFLICT(user_id) DO UPDATE SET
    policy_version=EXCLUDED.policy_version,declared_at=EXCLUDED.declared_at,
    expires_at=EXCLUDED.expires_at,withdrawn_at=NULL,operation_id=EXCLUDED.operation_id`,
    [row.user_id,row.policy_version,row.declared_at,row.expires_at,row.id]);
  else await db.query(`UPDATE adult_declarations SET withdrawn_at=$2,operation_id=$3 WHERE user_id=$1`,
    [row.user_id,row.withdrawn_at,row.id]);
}
export async function audit(db:PoolClient,row:Operation){
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    VALUES($1::uuid,$2,'adult_declaration',$1::uuid::text,jsonb_build_object('operationId',$3::text,'policyVersion',$4::text))`,
    [row.user_id,`adult_declaration_${row.action}`,row.id,row.policy_version]);
}
export async function insert(db:PoolClient,userId:string,key:string,digest:string,action:Operation['action'],
  version:string,declaredAt:Date|null,expiresAt:Date|null,withdrawnAt:Date|null){
  return (await db.query<Operation>(`INSERT INTO adult_declaration_operations
    (user_id,idempotency_key,payload_digest,action,policy_version,declared_at,expires_at,withdrawn_at,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'committed') RETURNING *`,
    [userId,key,digest,action,version,declaredAt,expiresAt,withdrawnAt])).rows[0];
}
export async function acknowledge(db:PoolClient,id:string){await db.query(`UPDATE adult_declaration_operations
  SET state='acknowledged',acknowledged_at=now() WHERE id=$1 AND state='committed'`,[id]);
  await db.query(`UPDATE pilot_notification_events SET ready_at=now()
    WHERE origin_type='adult_declaration' AND operation_id=$1 AND ready_at IS NULL`,[id]);}
