import type {Pool,PoolClient} from 'pg';
import {activeRestrictionSql} from '../operator/account-restrictions.repo';
export type Db=Pool|PoolClient;
export type Action='driver_declare'|'driver_revoke'|'vehicle_declare'|'vehicle_revoke';
export type Operation={id:string;actor_user_id:string;idempotency_key:string;payload_digest:string;action:Action;
  subject_id:string;snapshot:Record<string,unknown>;committed_at:Date;state:'committed'|'acknowledged'|'recovered'};
export const byKey=async(db:Db,userId:string,key:string)=>(await db.query<Operation>(
  'SELECT * FROM unrestricted_declaration_operations WHERE actor_user_id=$1 AND idempotency_key=$2',[userId,key])).rows[0]??null;
export const byId=async(db:Db,id:string)=>(await db.query<Operation>(
  'SELECT * FROM unrestricted_declaration_operations WHERE id=$1',[id])).rows[0]??null;
export const pending=async(db:Db)=>(await db.query<Operation>(
  "SELECT * FROM unrestricted_declaration_operations WHERE state='committed' ORDER BY committed_at,id")).rows;
export const acknowledged=async(db:Db)=>(await db.query<Operation>(
  "SELECT * FROM unrestricted_declaration_operations WHERE state IN ('acknowledged','recovered')")).rows;
export const driver=async(db:Db,userId:string)=>(await db.query(
  'SELECT *,licence_expires_on>current_date AS licence_current FROM unrestricted_driver_declarations WHERE user_id=$1',[userId])).rows[0]??null;
export const vehicle=async(db:Db,id:string)=>(await db.query(
  `SELECT *,registration_expires_on>current_date AS registration_current,
    insurance_expires_on>current_date AS insurance_current
    FROM unrestricted_vehicle_declarations WHERE id=$1`,[id])).rows[0]??null;
export const vehicles=async(db:Db,userId:string)=>(await db.query(
  `SELECT *,registration_expires_on>current_date AS registration_current,
    insurance_expires_on>current_date AS insurance_current
    FROM unrestricted_vehicle_declarations WHERE driver_user_id=$1 ORDER BY declared_at,id`,[userId])).rows;
export async function currentOperationId(db:PoolClient,row:Operation){const table=row.action.startsWith('driver')?
  'unrestricted_driver_declarations':'unrestricted_vehicle_declarations';
  const column=row.action.startsWith('driver')?'user_id':'id';
  return (await db.query<{operation_id:string}>(`SELECT operation_id FROM ${table} WHERE ${column}=$1`,
    [row.subject_id])).rows[0]?.operation_id??null;}
export async function account(db:Db,userId:string){return (await db.query<{status:string;restricted:boolean}>(
  `SELECT status,${activeRestrictionSql('u.id',"'driver'")} AS restricted FROM users u WHERE id=$1`,[userId])).rows[0]??null;}
export async function lockAccount(db:PoolClient,userId:string){return (await db.query(
  'SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0]??null;}
export async function lockVehicle(db:PoolClient,id:string){return (await db.query(
  `SELECT *,registration_expires_on>current_date AS registration_current,
    insurance_expires_on>current_date AS insurance_current
    FROM unrestricted_vehicle_declarations WHERE id=$1 FOR UPDATE`,[id])).rows[0]??null;}
export async function insert(db:PoolClient,row:Omit<Operation,'committed_at'|'state'>){return (await db.query<Operation>(
  `INSERT INTO unrestricted_declaration_operations(id,actor_user_id,idempotency_key,payload_digest,action,subject_id,snapshot,state)
   VALUES($1,$2,$3,$4,$5,$6,$7,'committed') RETURNING *`,
  [row.id,row.actor_user_id,row.idempotency_key,row.payload_digest,row.action,row.subject_id,row.snapshot])).rows[0];}
export async function apply(db:PoolClient,row:Operation){
  const s=row.snapshot;
  if(row.action==='driver_declare') await db.query(`INSERT INTO unrestricted_driver_declarations
    (user_id,policy_version,licence_categories,licence_expires_on,declared_at,renew_after,operation_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET
    policy_version=EXCLUDED.policy_version,licence_categories=EXCLUDED.licence_categories,
    licence_expires_on=EXCLUDED.licence_expires_on,declared_at=EXCLUDED.declared_at,
    renew_after=EXCLUDED.renew_after,revoked_at=NULL,false_declaration_at=NULL,operation_id=EXCLUDED.operation_id`,
    [row.actor_user_id,s.policy_version,s.licence_categories,s.licence_expires_on,s.declared_at,s.renew_after,row.id]);
  if(row.action==='driver_revoke'){
    const result=await db.query(`UPDATE unrestricted_driver_declarations
      SET revoked_at=$2,operation_id=$3 WHERE user_id=$1`,[row.actor_user_id,s.revoked_at,row.id]);
    if(result.rowCount!==1)throw new Error('Prior driver declaration missing');
  }
  if(row.action==='vehicle_declare') await db.query(`INSERT INTO unrestricted_vehicle_declarations
    (id,driver_user_id,category,registration_identifier,registration_expires_on,insurance_expires_on,
     permission_to_use,belted_passenger_seats,passenger_capacity,policy_version,declared_at,renew_after,operation_id)
    VALUES($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$11,$12)
    ON CONFLICT(id) DO UPDATE SET registration_expires_on=EXCLUDED.registration_expires_on,
    insurance_expires_on=EXCLUDED.insurance_expires_on,permission_to_use=true,
    belted_passenger_seats=EXCLUDED.belted_passenger_seats,passenger_capacity=EXCLUDED.passenger_capacity,
    policy_version=EXCLUDED.policy_version,declared_at=EXCLUDED.declared_at,
    renew_after=EXCLUDED.renew_after,revoked_at=NULL,false_declaration_at=NULL,operation_id=EXCLUDED.operation_id`,
    [row.subject_id,row.actor_user_id,s.category,s.registration_identifier,s.registration_expires_on,
      s.insurance_expires_on,s.belted_passenger_seats,s.passenger_capacity,s.policy_version,
      s.declared_at,s.renew_after,row.id]);
  if(row.action==='vehicle_revoke'){
    const result=await db.query(`UPDATE unrestricted_vehicle_declarations
      SET revoked_at=$2,permission_to_use=false,operation_id=$3 WHERE id=$1`,[row.subject_id,s.revoked_at,row.id]);
    if(result.rowCount!==1)throw new Error('Prior vehicle declaration missing');
  }
}
export async function audit(db:PoolClient,row:Operation){await db.query(`INSERT INTO audit_logs
  (actor_user_id,action,entity_type,entity_id,metadata,created_at)
  VALUES($1,$2,'self_declaration',$3,jsonb_build_object('operationId',$4::text,'kind','self_declaration'),$5)`,
  [row.actor_user_id,row.action,row.subject_id,row.id,row.committed_at]);}
export async function restoreAudit(db:PoolClient,row:Operation){await db.query(`INSERT INTO audit_logs
  (actor_user_id,action,entity_type,entity_id,metadata,created_at)
  SELECT $1,$2,'self_declaration',$3,jsonb_build_object('operationId',$4::text,'kind','self_declaration'),$5
  WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$4)`,
  [row.actor_user_id,row.action,row.subject_id,row.id,row.committed_at]);}
export async function acknowledge(db:PoolClient,id:string){await db.query(`UPDATE unrestricted_declaration_operations
  SET state='acknowledged',acknowledged_at=now() WHERE id=$1 AND state='committed'`,[id]);
  await db.query(`UPDATE pilot_notification_events SET ready_at=now()
    WHERE origin_type='driver_vehicle_declaration' AND operation_id=$1 AND ready_at IS NULL`,[id]);}
export async function recover(db:PoolClient,item:Operation){await db.query(`INSERT INTO unrestricted_declaration_operations
  (id,actor_user_id,idempotency_key,payload_digest,action,subject_id,snapshot,committed_at,state,acknowledged_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,'recovered',now())`,[item.id,item.actor_user_id,item.idempotency_key,
    item.payload_digest,item.action,item.subject_id,item.snapshot,item.committed_at]);}
export async function markRecovered(db:PoolClient,id:string){await db.query(`UPDATE unrestricted_declaration_operations
  SET state='recovered',acknowledged_at=COALESCE(acknowledged_at,now()) WHERE id=$1 AND state='committed'`,[id]);}
export async function restoreNotificationReady(db:PoolClient,id:string){
  await db.query(`UPDATE pilot_notification_events SET ready_at=now()
    WHERE origin_type='driver_vehicle_declaration' AND operation_id=$1`,[id]);
  await db.query(`UPDATE pilot_email_jobs SET status='exhausted',lease_until=NULL,
    last_error='Suppressed after snapshot restore; delivery requires review',updated_at=now()
    WHERE event_id=$1 AND status<>'sent'`,[id]);
}
export async function evidence(db:PoolClient,row:Operation){return (await db.query<{current:boolean;audit:boolean;notification:boolean}>(
  `SELECT EXISTS(SELECT 1 FROM ${row.action.startsWith('driver')?'unrestricted_driver_declarations':'unrestricted_vehicle_declarations'}
   WHERE ${row.action.startsWith('driver')?'user_id':'id'}=$1 AND operation_id=$2) AS current,
   EXISTS(SELECT 1 FROM audit_logs WHERE metadata->>'operationId'=$2) AS audit,
   EXISTS(SELECT 1 FROM pilot_notification_events WHERE origin_type='driver_vehicle_declaration'
     AND operation_id=$2) AS notification`,[row.subject_id,row.id])).rows[0];}
