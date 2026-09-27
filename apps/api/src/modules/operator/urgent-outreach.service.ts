import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { pool } from "../../db/pool";
import { AppError } from "../../shared/errors/app-error";
import { pilotReceiptStore, restrictProtectedWrites } from "../protected-mutation/receipt-evidence";
import { backupStatus } from "./backup-status";
import { assertCurrentOperator } from "./operator.authorization";
import * as repo from "./urgent-outreach.repo";

type Row=repo.OutreachRow;
type Receipt={operationId:string;operatorId:string;key:string;participantId:string;
  method:repo.OutreachInput["method"];occurredAt:string;reason:string;outcome:string;
  digest:string;recordedAt:string};
const digest=(input:repo.OutreachInput)=>createHash("sha256").update(JSON.stringify(input)).digest("hex");
const receipt=(row:Row):Receipt=>({operationId:row.id,operatorId:row.operator_id,key:row.idempotency_key,
  participantId:row.participant_id,method:row.method,occurredAt:row.occurred_at.toISOString(),
  reason:row.reason,outcome:row.outcome,digest:row.payload_digest,recordedAt:row.recorded_at.toISOString()});
const store=()=>pilotReceiptStore<Receipt>("urgent-outreach","Outreach recovery evidence unavailable");
async function transaction<T>(db:Pool,fn:(client:PoolClient)=>Promise<T>) {
  const client=await db.connect();
  try {await client.query("BEGIN");const result=await fn(client);await client.query("COMMIT");return result;}
  catch(error){await client.query("ROLLBACK");throw error;}
  finally{client.release();}
}
export class UrgentOutreachService {
  constructor(private readonly db:Pool=pool){}
  receipts(){return store().list();}
  async pending(){return (await this.db.query<Row>("SELECT * FROM pilot_urgent_outreach WHERE state='committed'")).rows;}
  async verifyEvidence(retry?:{operatorId:string;key:string}) {
    try {
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      const receipts=await this.receipts();
      const all=await repo.allPrimary(this.db);
      const mapped=new Map(receipts.map(item=>[item.operationId,item]));
      for(const row of all) {
        if(row.state==='committed') {
          if(!retry||retry.operatorId!==row.operator_id||retry.key!==row.idempotency_key)
            throw new AppError(503,"Outreach evidence pending","OPERATION_PENDING",{operationId:row.id});
        } else if(JSON.stringify(mapped.get(row.id))!==JSON.stringify(receipt(row)))
          throw new AppError(503,"Outreach recovery evidence missing","RECOVERY_MISSING");
      }
      for(const item of receipts) {
        const row=all.find(value=>value.id===item.operationId);
        if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))
          throw new AppError(503,"Outreach recovery evidence conflicts","RECOVERY_CONFLICT");
      }
    } catch(error) {
      if(!(error instanceof AppError&&error.code==='OPERATION_PENDING'))
        await restrictProtectedWrites(this.db,"urgent_outreach_evidence_unavailable");
      throw error;
    }
  }
  async record(operatorId:string,key:string,input:repo.OutreachInput) {
    if(key.startsWith("fallback:")) throw new AppError(400,"Reserved idempotency key","IDEMPOTENCY_KEY_RESERVED");
    const payloadDigest=digest(input);
    const prior=await repo.byKey(this.db,operatorId,key);
    if(prior&&prior.payload_digest!==payloadDigest)
      throw new AppError(409,"Idempotency key used for different outreach","IDEMPOTENCY_PAYLOAD_MISMATCH");
    if(prior&&prior.state!=='committed') return {id:prior.id};
    await this.verifyEvidence({operatorId,key});
    try {await store().probe();}
    catch(error){await restrictProtectedWrites(this.db,"urgent_outreach_evidence_unavailable");throw error;}
    const row=await transaction(this.db,async client=>{
      const recoveryMode=await repo.recoveryModeForUpdate(client);
      await assertCurrentOperator(client,operatorId);
      await repo.lockKey(client,operatorId,key);
      const existing=await repo.byKey(client,operatorId,key);
      if(existing) {
        if(existing.payload_digest!==payloadDigest) throw new AppError(409,"Idempotency key used for different outreach","IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      if(recoveryMode!=='open') throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
      if(!(await repo.participantExists(client,input.participantId))) throw new AppError(404,"Participant not found","PARTICIPANT_NOT_FOUND");
      const id=await repo.insertOutreach(client,operatorId,key,input,payloadDigest);
      return (await repo.byId(client,id))!;
    });
    if(row.state!=='committed') return {id:row.id};
    try {
      await transaction(this.db,async client=>{
        const locked=await repo.forUpdate(client,row.id);
        if(locked.state!=='committed') return;
        await store().append(receipt(locked));
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
        await repo.acknowledge(client,row.id);
      });
      return {id:row.id};
    } catch {
      await restrictProtectedWrites(this.db,"urgent_outreach_evidence_pending");
      throw new AppError(503,"Outreach committed; recovery evidence pending","OPERATION_PENDING",{operationId:row.id});
    }
  }
  async history(operatorId:string) {
    return transaction(this.db,async client=>{await assertCurrentOperator(client,operatorId);
      return {records:await repo.listOutreach(client)};});
  }
  async reconcileReceipts(operatorId:string) {
    const receipts=await this.receipts();
    for(const item of receipts) await transaction(this.db,async client=>{
      await assertCurrentOperator(client,operatorId);
      const current=await repo.byId(client,item.operationId);
      if(current&&JSON.stringify(receipt(current))!==JSON.stringify(item))
        throw new AppError(409,"Outreach recovery conflict","RECOVERY_CONFLICT");
      if(!current) {
        const participant=await repo.participantExists(client,item.participantId);
        if(!participant) throw new AppError(409,"Outreach participant missing","RECOVERY_INCOMPLETE");
        await repo.restore(client,item);
      } else if(current.state==='committed')
        await repo.markRecovered(client,item.operationId);
    });
    return receipts.length;
  }
}
export const urgentOutreachService=new UrgentOutreachService();
export const recordUrgentOutreach=(operatorId:string,key:string,input:repo.OutreachInput)=>
  urgentOutreachService.record(operatorId,key,input);
export const urgentOutreachHistory=(operatorId:string)=>urgentOutreachService.history(operatorId);
