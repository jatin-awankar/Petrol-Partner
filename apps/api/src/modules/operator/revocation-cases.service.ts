import {createHash} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {pool} from "../../db/pool";
import {AppError} from "../../shared/errors/app-error";
import {inProtectedTransaction} from "../protected-mutation/protocol";
import {pilotReceiptStore,restrictProtectedWrites} from "../protected-mutation/receipt-evidence";
import {recordDurableNotification} from "../notifications/contract.repo";
import {backupStatus} from "./backup-status";
import {operatorQuery} from "./operator.repo";
import {assertCurrentOperator} from "./operator.authorization";
import * as repo from "./revocation-cases.repo";
import {openCases} from "../verification/revocation-effects.repo";

type Receipt={operationId:string;operatorId:string;key:string;digest:string;
  caseType:repo.CaseType;caseId:string;action:repo.Operation["action"];
  outcome:string|null;reason:string;recipientIds:string[];committedAt:string};
const store=()=>pilotReceiptStore<Receipt>("revocation-case","Case recovery evidence unavailable");
const digest=(input:Command)=>createHash("sha256").update(JSON.stringify({...input,
  recipientIds:input.action==="resolve"?[]:input.recipientIds})).digest("hex");
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,operatorId:row.operator_id,
  key:row.idempotency_key,digest:row.payload_digest,caseType:row.case_type,caseId:row.case_id,
  action:row.action,outcome:row.outcome,reason:row.reason,recipientIds:row.recipient_ids,
  committedAt:row.committed_at.toISOString()});
const result=(row:repo.Operation)=>({operation_id:row.id,state:row.state,case_type:row.case_type,
  case_id:row.case_id,action:row.action,outcome:row.outcome});
type Command={caseType:repo.CaseType;caseId:string;action:"outreach"|"resolve";
  outcome:string|null;reason:string;recipientIds:string[]};

async function notify(client:PoolClient,row:repo.Operation) {
  for(const recipientId of row.recipient_ids) await recordDurableNotification(client,{
    originType:"revocation_case",operationId:row.id,recipientId,
    eventType:`${row.action}:${row.case_id}`,
    relatedEntityType:`pilot_revocation_${row.case_type}`,relatedEntityId:row.case_id,
    title:row.action==="outreach"?"Operator trip outreach":"Trip case resolved",
    body:row.action==="outreach"
      ? "Operator support has recorded outreach about your trip. Check trip details and support notices."
      : "Operator support recorded a case outcome. Check trip details for the decision."});
}
export class RevocationCasesService {
  constructor(private readonly db:Pool=pool){}
  async list(operatorId:string) {
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    return openCases(this.db);
  }
  async receipts(){return store().list();}
  async pending(){return (await repo.all(this.db)).filter(row=>row.state==="committed");}
  async verifyEvidence(retry?:{operatorId:string;key:string}) {
    try {
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
      const receipts=new Map((await this.receipts()).map(item=>[item.operationId,item]));
      for(const row of await repo.all(this.db)) {
        if(row.state!=="committed"&&JSON.stringify(receipts.get(row.id))!==JSON.stringify(receipt(row)))
          throw new AppError(503,"Case recovery evidence missing","RECOVERY_MISSING");
        if(row.state==="committed"&&(!retry||row.operator_id!==retry.operatorId||
          row.idempotency_key!==retry.key))
          throw new AppError(503,"Case operation awaits recovery evidence","OPERATION_PENDING",{operationId:row.id});
      }
      for(const item of receipts.values()) {
        const row=await repo.byId(this.db,item.operationId);
        if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item)||item.digest!==digest({
          caseType:item.caseType,caseId:item.caseId,action:item.action,outcome:item.outcome,
          reason:item.reason,recipientIds:item.recipientIds}))
          throw new AppError(503,"Case recovery evidence conflicts","RECOVERY_CONFLICT");
      }
    } catch(error) {
      if(!(error instanceof AppError&&error.code==="OPERATION_PENDING"))
        await restrictProtectedWrites(this.db,"revocation_case_evidence_unavailable");
      throw error;
    }
  }
  async operation(operatorId:string,id:string) {
    await inProtectedTransaction(this.db,client=>assertCurrentOperator(client,operatorId));
    const row=await repo.byId(this.db,id);
    if(!row||row.operator_id!==operatorId) throw new AppError(404,"Case operation not found","OPERATION_NOT_FOUND");
    const recovery=await operatorQuery<{mode:string}>(this.db,"recoveryMode");
    return row.state==="committed"||recovery.rows[0]?.mode==="restricted"
      ? {operation_id:id,state:"pending_unknown"}:result(row);
  }
  async decide(operatorId:string,key:string,command:Command) {
    const recipientIds=[...new Set(command.recipientIds)].sort();
    const normalized={...command,recipientIds};
    const payloadDigest=digest(normalized);
    const prior=await repo.byKey(this.db,operatorId,key);
    if(prior?.payload_digest!==undefined&&prior.payload_digest!==payloadDigest)
      throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
    if(prior&&prior.state!=="committed") return this.operation(operatorId,prior.id);
    await this.verifyEvidence({operatorId,key});
    try {await store().probe();} catch(error) {
      await restrictProtectedWrites(this.db,"revocation_case_evidence_unavailable");throw error;
    }
    const operation=await inProtectedTransaction(this.db,async client=>{
      const recovery=await operatorQuery<{mode:string}>(client,"recoveryModeForUpdate");
      await assertCurrentOperator(client,operatorId);
      await operatorQuery(client,"lockIdempotencyKey",[`revocation-case:${operatorId}:${key}`]);
      const existing=await repo.byKey(client,operatorId,key);
      if(existing) {
        if(existing.payload_digest!==payloadDigest)
          throw new AppError(409,"Idempotency payload mismatch","IDEMPOTENCY_PAYLOAD_MISMATCH");
        return existing;
      }
      if(recovery.rows[0]?.mode!=="open")
        throw new AppError(503,"Protected writes are restricted","RECOVERY_RESTRICTED");
      const item=await repo.caseForUpdate(client,command.caseType,command.caseId);
      if(!item) throw new AppError(404,"Case not found","CASE_NOT_FOUND");
      if(item.resolved_at) throw new AppError(409,"Case is already resolved","CASE_RESOLVED");
      const participants=await repo.participants(client,item.offer_id);
      if(command.action==="outreach") {
        if(!recipientIds.length||recipientIds.some(id=>!participants.includes(id)))
          throw new AppError(400,"Outreach must name trip participants","OUTREACH_INVALID");
      } else {
        if(recipientIds.length) throw new AppError(400,"Resolution recipients are selected by the system","RECIPIENTS_INVALID");
        if(!await repo.reachedParticipants(client,command.caseType,command.caseId,participants))
          throw new AppError(409,"Participant outreach is required","OUTREACH_REQUIRED");
        if(command.caseType==="hold") {
          if(command.outcome!=="cancelled"||!await repo.cancelled(client,item))
            throw new AppError(409,"A recorded cancellation is required to release the hold","CANCELLATION_REQUIRED");
        } else {
          if(!["safe_completion","interrupted"].includes(command.outcome??""))
            throw new AppError(400,"Incident outcome is invalid","OUTCOME_INVALID");
          if(!await repo.incidentOutcomeRecorded(client,item.offer_id,command.outcome!))
            throw new AppError(409,"A recorded trip outcome is required","TRIP_OUTCOME_REQUIRED");
        }
      }
      const row=await repo.insert(client,{operatorId,key,digest:payloadDigest,type:command.caseType,
        caseId:command.caseId,action:command.action,outcome:command.outcome,reason:command.reason,
        recipientIds:command.action==="resolve"?participants:recipientIds});
      await repo.applyResolution(client,row);
      await repo.audit(client,row);
      await notify(client,row);
      return row;
    });
    if(operation.state!=="committed") return result(operation);
    try {
      const saved=await inProtectedTransaction(this.db,async client=>{
        const row=await repo.byId(client,operation.id,true);
        if(!row) throw new AppError(503,"Case operation missing","RECOVERY_MISSING");
        if(row.state!=="committed") return row;
        await store().append(receipt(row));
        const backup=await backupStatus(client);
        if(backup.required&&!backup.healthy) throw new AppError(503,"Database backup is stale","BACKUP_STALE");
        const done=await repo.acknowledge(client,row.id);
        await repo.readyNotifications(client,row.id);
        return done;
      });
      return result(saved);
    } catch {
      await restrictProtectedWrites(this.db,"revocation_case_evidence_pending");
      throw new AppError(503,"Case action committed; recovery evidence pending","OPERATION_PENDING",{operationId:operation.id});
    }
  }
  async reconcileReceipts(operatorId:string) {
    const items=(await this.receipts()).sort((a,b)=>a.committedAt.localeCompare(b.committedAt));
    for(const item of items) await inProtectedTransaction(this.db,async client=>{
      await assertCurrentOperator(client,operatorId);
      await repo.recover(client,item);
      const row=await repo.byId(client,item.operationId,true);
      if(!row||JSON.stringify(receipt(row))!==JSON.stringify(item))
        throw new AppError(409,"Case recovery conflicts","RECOVERY_CONFLICT");
      const current=await repo.caseForUpdate(client,row.case_type,row.case_id);
      if(!current) throw new AppError(409,"Case source is missing","RECOVERY_INCOMPLETE");
      await repo.applyResolution(client,row);
      await repo.audit(client,row);
      await notify(client,row);
      await repo.readyNotifications(client,row.id);
      await repo.suppressRestoredEmail(client,row.id);
    });
    return items.length;
  }
}
export const revocationCasesService=new RevocationCasesService();
