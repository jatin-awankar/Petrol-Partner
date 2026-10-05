import {postedRouteOutcomesService} from '../posted-routes/outcomes.service';
import {acquireMutationGuard,releaseMutationGuard} from '../posted-routes/outcomes.repo';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {pool} from '../../db/pool';
import {AppError} from '../../shared/errors/app-error';
import {assertCurrentAdultDeclaration,POLICY_VERSION} from '../adult-declaration/adult-declaration.service';
import {backupStatus} from '../operator/backup-status';
import {assertCurrentOperator} from '../operator/operator.authorization';
import {operatorQuery} from '../operator/operator.repo';
import {recordDurableNotification} from '../notifications/contract.repo';
import {pilotReceiptStore,restrictProtectedWrites} from '../protected-mutation/receipt-evidence';
import {inProtectedTransaction} from '../protected-mutation/protocol';
import * as repo from './driver-vehicle-declaration.repo';

export type Category='bike'|'scooter'|'car';
export type DriverInput={licence_categories:Category[];licence_expires_on:string;policy_version:string};
export type VehicleInput={category:Category;registration_identifier:string;registration_expires_on:string;
  insurance_expires_on:string;permission_to_use:true;belted_passenger_seats:number|null;
  passenger_capacity:number;policy_version:string};
type Receipt={operationId:string;actorUserId:string;idempotencyKey:string;payloadDigest:string;
  action:repo.Action;subjectId:string;snapshot:Record<string,unknown>;committedAt:string};
const store=()=>pilotReceiptStore<Receipt>('driver-vehicle-declaration','Driver vehicle declaration recovery evidence unavailable');
const digest=(action:repo.Action,subjectId:string,input:unknown)=>createHash('sha256')
  .update(JSON.stringify({action,subjectId,input})).digest('hex');
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,actorUserId:row.actor_user_id,
  idempotencyKey:row.idempotency_key,payloadDigest:row.payload_digest,action:row.action,
  subjectId:row.subject_id,snapshot:row.snapshot,committedAt:row.committed_at.toISOString()});
function futureDate(value:string){if(value<=new Date().toISOString().slice(0,10))
  throw new AppError(400,'Declared expiry must be in the future','DECLARATION_EXPIRED');}
function renewalAfter(now:Date){return new Date(Date.UTC(now.getUTCFullYear()+1,
  now.getUTCMonth(),now.getUTCDate(),now.getUTCHours(),now.getUTCMinutes(),
  now.getUTCSeconds(),now.getUTCMilliseconds())).toISOString();}
function state(row:Record<string,unknown>|null,restricted=false){
  if(restricted)return 'restricted';
  if(!row)return 'missing';
  if(row.false_declaration_at)return 'false_declaration';
  if(row.revoked_at||row.permission_to_use===false)return 'revoked';
  if(row.policy_version!==POLICY_VERSION||new Date(String(row.renew_after)).getTime()<=Date.now())return 'expired';
  if(row.licence_current===false||row.registration_current===false||row.insurance_current===false)
    return 'expired';
  return 'current';
}
function publicRow(row:Record<string,unknown>|null,restricted=false){return {kind:'self_declaration',
  state:state(row,restricted),declaration_state:state(row),restricted,...(row??{})};}
export async function status(userId:string){const account=await repo.account(pool,userId);
  if(!account)throw new AppError(404,'Account not found','USER_NOT_FOUND');
  const restricted=account.status!=='active'||account.restricted;
  return {driver:publicRow(await repo.driver(pool,userId),restricted),
    vehicles:(await repo.vehicles(pool,userId)).map(row=>publicRow(row,restricted))};}
export async function getOperation(userId:string,key:string){
  const row=await repo.byKey(pool,userId,key);
  return row?{operation_id:row.id,action:row.action,state:row.state}:null;
}
export async function assertCurrentDriverVehicle(client:PoolClient,userId:string,vehicleId:string,seats:number){
  await assertCurrentAdultDeclaration(client,userId);
  const account=await repo.account(client,userId);
  if(account?.status!=='active'||account.restricted)throw new AppError(403,'Driver is restricted','DRIVER_RESTRICTED');
  const driver=await repo.driver(client,userId);
  if(state(driver)!=='current')throw new AppError(403,'Current driver self-declaration required','DRIVER_DECLARATION_REQUIRED');
  const vehicle=await repo.lockVehicle(client,vehicleId);
  if(!vehicle||vehicle.driver_user_id!==userId)throw new AppError(404,'Vehicle not found','VEHICLE_NOT_FOUND');
  if(state(vehicle)!=='current')throw new AppError(403,'Current vehicle self-declaration required','VEHICLE_DECLARATION_REQUIRED');
  if(!driver.licence_categories.includes(vehicle.category))throw new AppError(403,'Licence category not declared','LICENCE_CATEGORY_REQUIRED');
  if(!Number.isInteger(seats)||seats<1||seats>vehicle.passenger_capacity)
    throw new AppError(400,'Requested seats exceed declared capacity','CAPACITY_EXCEEDED');
  return {category:vehicle.category,passengerCapacity:vehicle.passenger_capacity,kind:'self_declaration' as const};
}
async function verifyEvidence(retry?:{userId:string;key:string}){
  try{const backup=await backupStatus(pool);
    if(backup.required&&!backup.healthy)throw new AppError(503,'Database backup is stale','BACKUP_STALE');
    const receipts=new Map((await store().list()).map(item=>[item.operationId,item]));
    for(const row of await repo.acknowledged(pool))if(JSON.stringify(receipts.get(row.id))!==JSON.stringify(receipt(row)))
      throw new AppError(503,'Declaration recovery evidence is missing','RECOVERY_MISSING');
    const pending=await repo.pending(pool);
    if(pending.length&&(!retry||pending.some(row=>row.actor_user_id!==retry.userId||row.idempotency_key!==retry.key)))
      throw new AppError(503,'Declaration pending recovery evidence','OPERATION_PENDING');
  }catch(error){await restrictProtectedWrites(pool,'driver_vehicle_evidence_unavailable');throw error;}
}
async function notification(client:PoolClient,row:repo.Operation){await recordDurableNotification(client,{
  eventId:row.id,originType:'driver_vehicle_declaration',operationId:row.id,recipientId:row.actor_user_id,
  eventType:row.action,relatedEntityType:'self_declaration',relatedEntityId:row.subject_id,
  title:'Self-declaration',body:'Your declaration was recorded. Petrol Partner has not inspected or approved it.'});}
export async function mutate(userId:string,key:string,action:repo.Action,subjectId:string,input:DriverInput|VehicleInput|Record<string,never>){
  const guard=await acquireMutationGuard(pool);
  try{return await mutateLocked(userId,key,action,subjectId,input);}finally{await releaseMutationGuard(guard);}
}
async function mutateLocked(userId:string,key:string,action:repo.Action,subjectId:string,input:DriverInput|VehicleInput|Record<string,never>){
  const version='policy_version' in input?input.policy_version:POLICY_VERSION;
  await verifyEvidence({userId,key});
  const payloadDigest=digest(action,subjectId,input);
  const row=await inProtectedTransaction(pool,async client=>{
    const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
    await operatorQuery(client,'lockIdempotencyKey',[`driver-vehicle:${userId}:${key}`]);
    const prior=await repo.byKey(client,userId,key);
    if(prior){if(prior.payload_digest!==payloadDigest)throw new AppError(409,
      'Idempotency key used with different payload','IDEMPOTENCY_PAYLOAD_MISMATCH');return prior;}
    if(version!==POLICY_VERSION)throw new AppError(409,'Current declaration policy required','POLICY_VERSION_STALE');
    if(action==='driver_declare')futureDate((input as DriverInput).licence_expires_on);
    if(action==='vehicle_declare'){
      futureDate((input as VehicleInput).registration_expires_on);
      futureDate((input as VehicleInput).insurance_expires_on);
      const v=input as VehicleInput;
      if(v.category==='car'?(v.belted_passenger_seats===null||v.passenger_capacity>v.belted_passenger_seats):
        (v.passenger_capacity!==1||v.belted_passenger_seats!==null))
        throw new AppError(400,'Capacity exceeds declared passenger seats','CAPACITY_EXCEEDED');
    }
    if(recovery.rows[0]?.mode!=='open')throw new AppError(503,'Protected writes restricted','RECOVERY_RESTRICTED');
    store();
    await repo.lockAccount(client,userId);
    await assertCurrentAdultDeclaration(client,userId);
    const now=new Date();
    let snapshot:Record<string,unknown>;
    let materialChange=false;
    if(action==='driver_declare'){
      const d=input as DriverInput;
      const previous=await repo.driver(client,userId);
      if(previous?.revoked_at||previous?.false_declaration_at)
        throw new AppError(403,'Declaration requires operator review','DECLARATION_REVIEW_REQUIRED');
      materialChange=Boolean(previous&&JSON.stringify([...previous.licence_categories].sort())!==JSON.stringify([...d.licence_categories].sort()));
      snapshot={...d,declared_at:now.toISOString(),renew_after:renewalAfter(now)};
    }else if(action==='vehicle_declare'){
      const v=input as VehicleInput;
      const driver=await repo.driver(client,userId);
      if(state(driver)!=='current')throw new AppError(403,'Current driver declaration required','DRIVER_DECLARATION_REQUIRED');
      if(!driver.licence_categories.includes(v.category))throw new AppError(403,'Licence category not declared','LICENCE_CATEGORY_REQUIRED');
      const current=await repo.lockVehicle(client,subjectId);
      if(current&&(current.driver_user_id!==userId||current.category!==v.category||
        current.registration_identifier!==v.registration_identifier))throw new AppError(403,'Vehicle ownership or identity differs','VEHICLE_NOT_OWNED');
      if(current?.revoked_at||current?.false_declaration_at)
        throw new AppError(403,'Declaration requires operator review','DECLARATION_REVIEW_REQUIRED');
      materialChange=Boolean(current&&(current.passenger_capacity!==v.passenger_capacity||current.belted_passenger_seats!==v.belted_passenger_seats));
      snapshot={...v,declared_at:now.toISOString(),renew_after:renewalAfter(now)};
    }else if(action==='vehicle_revoke'){
      const current=await repo.lockVehicle(client,subjectId);
      if(!current||current.driver_user_id!==userId)throw new AppError(404,'Vehicle not found','VEHICLE_NOT_FOUND');
      if(current.revoked_at)throw new AppError(409,'Vehicle already revoked','DECLARATION_REVOKED');
      snapshot={revoked_at:now.toISOString()};
    }else{
      const current=await repo.driver(client,userId);
      if(!current||current.revoked_at)throw new AppError(409,'Driver declaration missing or revoked','DECLARATION_MISSING');
      snapshot={revoked_at:now.toISOString()};
    }
    const created=await repo.insert(client,{id:randomUUID(),actor_user_id:userId,idempotency_key:key,
      payload_digest:payloadDigest,action,subject_id:subjectId,snapshot});
    await repo.apply(client,created);
    if(action==='driver_revoke'||action==='vehicle_revoke'||materialChange)
      await postedRouteOutcomesService.recordEligibilityEffects(client,userId,created.id,userId,'driver',
        action==='vehicle_revoke'||action==='vehicle_declare'?subjectId:undefined);
    await repo.audit(client,created);await notification(client,created);
    return created;
  });
  await postedRouteOutcomesService.acknowledgeEligibilityEffects(row.id);
  if(row.state==='committed'){
    try{await store().append(receipt(row));}catch{await restrictProtectedWrites(pool,'driver_vehicle_evidence_pending');
      throw new AppError(503,'Declaration pending recovery evidence','OPERATION_PENDING',{operationId:row.id});}
    try{await inProtectedTransaction(pool,async client=>repo.acknowledge(client,row.id));}
    catch{await restrictProtectedWrites(pool,'driver_vehicle_acknowledgement_pending');
      throw new AppError(503,'Declaration acknowledgement pending','OPERATION_PENDING',{operationId:row.id});}
  }
  return {operation_id:row.id,state:row.state==='committed'?'acknowledged':row.state,
    declaration:await status(userId)};
}
export const driverVehicleRecovery={receipts:()=>store().list(),pending:()=>repo.pending(pool),
  verifyEvidence:()=>verifyEvidence(),async reconcileReceipts(operatorId:string){
    const items=await store().list();const evidenced=new Map(items.map(item=>[item.operationId,item]));
    for(const row of await repo.pending(pool)){
      if(evidenced.has(row.id))continue;
      await inProtectedTransaction(pool,async client=>{await assertCurrentOperator(client,operatorId);
        const check=await repo.evidence(client,row);
        if(!check.current||!check.audit||!check.notification)
          throw new AppError(409,'Declaration recovery evidence incomplete','RECOVERY_INCOMPLETE');});
      const item=receipt(row);await store().append(item);items.push(item);evidenced.set(item.operationId,item);
    }
    items.sort((a,b)=>a.committedAt.localeCompare(b.committedAt)||a.operationId.localeCompare(b.operationId));
    for(const item of items){await inProtectedTransaction(pool,async client=>{
      await assertCurrentOperator(client,operatorId);
      const prior=await repo.byId(client,item.operationId);
      if(prior&&JSON.stringify(receipt(prior))!==JSON.stringify(item))
        throw new AppError(409,'Declaration recovery conflict','RECOVERY_CONFLICT');
      let row=prior;
      if(!row){if(!await repo.lockAccount(client,item.actorUserId))
        throw new AppError(409,'Declaration account missing','RECOVERY_INCOMPLETE');
        await repo.recover(client,{id:item.operationId,actor_user_id:item.actorUserId,
          idempotency_key:item.idempotencyKey,payload_digest:item.payloadDigest,action:item.action,
          subject_id:item.subjectId,snapshot:item.snapshot,committed_at:new Date(item.committedAt),state:'recovered'});
        row=await repo.byId(client,item.operationId);
        if(!row)throw new AppError(409,'Declaration recovery failed','RECOVERY_INCOMPLETE');
        const currentId=await repo.currentOperationId(client,row);
        const currentOperation=currentId?await repo.byId(client,currentId):null;
        if(!currentOperation||currentOperation.committed_at<=row.committed_at)
          await repo.apply(client,row);
      }
      await repo.markRecovered(client,row.id);await repo.restoreAudit(client,row);await notification(client,row);
      await repo.restoreNotificationReady(client,row.id);
    });}
    return items.length;
  }};
