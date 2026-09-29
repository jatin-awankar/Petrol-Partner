import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {pool} from '../../db/pool';
import {AppError} from '../../shared/errors/app-error';
import {pilotReceiptStore,restrictProtectedWrites} from '../protected-mutation/receipt-evidence';
import {inProtectedTransaction} from '../protected-mutation/protocol';
import {operatorQuery} from '../operator/operator.repo';
import {backupStatus} from '../operator/backup-status';
import {recordDurableNotification} from '../notifications/contract.repo';
import * as repo from './adult-declaration.repo';

export const POLICY_VERSION='unrestricted-declared-2026-09-28.1';
type Receipt={operationId:string;userId:string;idempotencyKey:string;payloadDigest:string;
  action:'declare'|'withdraw';policyVersion:string;declaredAt:string|null;expiresAt:string|null;
  withdrawnAt:string|null;committedAt:string};
const store=()=>pilotReceiptStore<Receipt>('adult-declaration','Adult declaration recovery evidence unavailable');
const digest=(action:string,version:string)=>createHash('sha256').update(JSON.stringify({action,version})).digest('hex');
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,userId:row.user_id,
  idempotencyKey:row.idempotency_key,payloadDigest:row.payload_digest,action:row.action,
  policyVersion:row.policy_version,declaredAt:row.declared_at?.toISOString()??null,
  expiresAt:row.expires_at?.toISOString()??null,withdrawnAt:row.withdrawn_at?.toISOString()??null,
  committedAt:row.committed_at.toISOString()});

export async function getStatus(userId:string){
  const row=await repo.status(userId);
  if(!row) throw new AppError(404,'Account not found','USER_NOT_FOUND');
  const state=row.restricted?'restricted':!row.declared_at?'missing':row.withdrawn_at?'withdrawn':
    row.policy_version!==POLICY_VERSION||!row.expires_at||row.expires_at.getTime()<=Date.now()?'expired':'current';
  return {state,kind:'self_declaration' as const,policy_version:row.policy_version,
    current_policy_version:POLICY_VERSION,declared_at:row.declared_at,expires_at:row.expires_at,
    withdrawn_at:row.withdrawn_at};
}
export async function assertCurrentAdultDeclaration(client:PoolClient,userId:string){
  const account=await repo.lockAccount(client,userId);
  if(account?.status!=='active') throw new AppError(403,'Account is not active','ACCOUNT_DISABLED');
  const row=await repo.status(userId,client);
  if(!row||row.restricted) throw new AppError(403,'Account travel permission is restricted','ACCOUNT_RESTRICTED');
  if(!row.declared_at||row.withdrawn_at||row.policy_version!==POLICY_VERSION||
    !row.expires_at||row.expires_at.getTime()<=Date.now())
    throw new AppError(403,'A current adult self-declaration is required','ADULT_DECLARATION_REQUIRED');
}
async function verifyEvidence(retry?:{userId:string;key:string}){
  try{
    const backup=await backupStatus(pool);
    if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup is stale','BACKUP_STALE');
    const receipts=await store().list();
    const map=new Map(receipts.map(item=>[item.operationId,item]));
    for(const row of await repo.acknowledged(pool)){
      const item=map.get(row.id);
      if(!item||JSON.stringify(item)!==JSON.stringify(receipt(row)))
        throw new AppError(503,'Adult declaration recovery evidence is missing','RECOVERY_MISSING');
    }
    const pending=await repo.pending(pool);
    if(pending.length&&(!retry||pending.some(row=>row.user_id!==retry.userId||row.idempotency_key!==retry.key)))
      throw new AppError(503,'Adult declaration is pending recovery evidence','OPERATION_PENDING');
  }catch(error){await restrictProtectedWrites(pool,'adult_declaration_evidence_unavailable');throw error;}
}
export async function mutate(userId:string,key:string,action:'declare'|'withdraw',version:string){
  if(version!==POLICY_VERSION) throw new AppError(409,'Current declaration policy is required','POLICY_VERSION_STALE');
  await verifyEvidence({userId,key});
  const payloadDigest=digest(action,version);
  const row=await inProtectedTransaction(pool,async client=>{
    const recovery=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
    await operatorQuery(client,'lockIdempotencyKey',[`adult-declaration:${userId}:${key}`]);
    const prior=await repo.byKey(client,userId,key);
    if(prior){if(prior.payload_digest!==payloadDigest) throw new AppError(409,
      'Idempotency key used with different payload','IDEMPOTENCY_PAYLOAD_MISMATCH');return prior;}
    if(recovery.rows[0]?.mode!=='open') throw new AppError(503,'Protected writes are restricted','RECOVERY_RESTRICTED');
    store();
    const user=await repo.lockAccount(client,userId);
    if(user?.status!=='active') throw new AppError(403,'Account is not active','ACCOUNT_DISABLED');
    const current=await repo.status(userId,client);
    if(action==='withdraw'&&!current?.declared_at) throw new AppError(409,'No declaration exists','DECLARATION_MISSING');
    if(action==='withdraw'&&current?.withdrawn_at) throw new AppError(409,'Declaration was already withdrawn','DECLARATION_WITHDRAWN');
    const now=new Date();
    // PostgreSQL interval applies calendar months, including leap years.
    const expiry=action==='declare'?await repo.renewalExpiry(client,now):null;
    const created=await repo.insert(client,userId,key,payloadDigest,action,version,
      action==='declare'?now:null,expiry,action==='withdraw'?now:null);
    await repo.apply(client,created);
    await repo.audit(client,created);
    await recordDurableNotification(client,{eventId:created.id,originType:'adult_declaration',
      operationId:created.id,recipientId:userId,eventType:`adult_declaration_${action}`,
      relatedEntityType:'adult_declaration',relatedEntityId:userId,title:'Adult self-declaration',
      body:action==='declare'?'Your adult self-declaration was recorded. It is not age verification.':
        'Your adult self-declaration was withdrawn.'});
    return created;
  });
  if(row.state==='committed'){
    try{await store().append(receipt(row));}
    catch(error){await restrictProtectedWrites(pool,'adult_declaration_evidence_pending');
      throw new AppError(503,'Adult declaration pending recovery evidence','OPERATION_PENDING',{operationId:row.id});}
    try{await inProtectedTransaction(pool,async client=>repo.acknowledge(client,row.id));}
    catch{await restrictProtectedWrites(pool,'adult_declaration_acknowledgement_pending');
      throw new AppError(503,'Adult declaration acknowledgement pending','OPERATION_PENDING',{operationId:row.id});}
  }
  return {operation_id:row.id,action:row.action,state:row.state==='committed'?'acknowledged':row.state,
    declaration:await getStatus(userId)};
}
