import type {Pool,PoolClient} from 'pg';
import {pool} from '../../db/pool';
import {AppError} from '../../shared/errors/app-error';
import {recordDurableNotification} from '../notifications/contract.repo';
import {backupStatus} from '../operator/backup-status';
import {operatorQuery} from '../operator/operator.repo';
import {assertCurrentOperator} from '../operator/operator.authorization';
import {inProtectedTransaction} from '../protected-mutation/protocol';
import {pilotReceiptStore,restrictProtectedWrites} from '../protected-mutation/receipt-evidence';
import {operatorRecipients} from './pilot-departure.repo';
import * as repo from './direct-settlement-silence.repo';
type Receipt={operationId:string;obligationId:string;recordedAt:string};
const store=()=>pilotReceiptStore<Receipt>('pilot-settlement-silence','Settlement review evidence unavailable');
const receipt=(row:repo.Operation):Receipt=>({operationId:row.id,obligationId:row.obligation_id,
  recordedAt:row.recorded_at.toISOString()});
async function notify(db:PoolClient,row:repo.Operation,actors:{driver_id:string;passenger_id:string}){
  const recipients=new Set([actors.driver_id,actors.passenger_id,...await operatorRecipients(db)]);
  for(const recipientId of recipients) await recordDurableNotification(db,{
    originType:'pilot_settlement_silence',operationId:row.id,recipientId,
    eventType:'settlement_review',relatedEntityType:'pilot_contribution_obligation',
    relatedEntityId:row.obligation_id,title:'Direct payment needs review',
    body:'The driver did not respond to the payment claim within 24 hours.'});
}
export class DirectSettlementSilenceService {
  constructor(private readonly db:Pool=pool){}
  async receipts(){return store().list();}
  async pending(){return (await repo.all(this.db)).filter(row=>row.state==='committed');}
  async verifyEvidence(){
    try{
      const backup=await backupStatus(this.db);
      if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup is stale','BACKUP_STALE');
      const receipts=new Map((await store().list()).map(item=>[item.operationId,item]));
      for(const row of await repo.all(this.db)){
        if(row.state==='committed') throw new AppError(503,'Settlement review awaits evidence',
          'OPERATION_PENDING',{operationId:row.id});
        const evidence=await repo.recoveryEvidence(this.db,row);
        const actors=await repo.actors(this.db,row.obligation_id);
        if(JSON.stringify(receipts.get(row.id))!==JSON.stringify(receipt(row))||!evidence.review||
          !evidence.audited||!actors||!evidence.notified.includes(actors.driver_id)||
          !evidence.notified.includes(actors.passenger_id))
          throw new AppError(503,'Settlement review evidence missing','RECOVERY_MISSING');
      }
      for(const item of receipts.values()) if(!await repo.byId(this.db,item.operationId))
        throw new AppError(503,'Settlement review receipt needs reconciliation','RECOVERY_MISSING');
    }catch(error){await restrictProtectedWrites(this.db,'pilot_settlement_silence_evidence_unavailable');throw error;}
  }
  async sweep(now=new Date()){
    let opened=0;
    for(const item of await repo.due(this.db,now)){
      await this.verifyEvidence();
      try{await store().probe();}catch{
        await restrictProtectedWrites(this.db,'pilot_settlement_silence_evidence_unavailable');
        throw new AppError(503,'Settlement review evidence unavailable','RECOVERY_UNAVAILABLE');
      }
      const operation=await inProtectedTransaction(this.db,async client=>{
        const mode=await operatorQuery<{mode:string}>(client,'recoveryModeForUpdate');
        if(mode.rows[0]?.mode!=='open') return null;
        if(!await repo.eligibleForUpdate(client,item.id,now)) return null;
        const row=await repo.insert(client,item.id,now);
        if(row.state!=='committed') return null;
        const effects=await repo.effects(client,row);
        if(!effects) throw new AppError(409,'Settlement review race requires reconciliation','RECOVERY_INCOMPLETE');
        await notify(client,row,effects);
        return row;
      });
      if(!operation) continue;
      try{
        await inProtectedTransaction(this.db,async client=>{
          const row=await repo.byId(client,operation.id,true);
          if(!row||row.state!=='committed') return;
          await store().append(receipt(row));
          const backup=await backupStatus(client);
          if(backup.required&&!backup.healthy) throw new AppError(503,'Database backup is stale','BACKUP_STALE');
          await repo.acknowledge(client,row.id);
          await repo.ready(client,row.id);
        });
        opened++;
      }catch{
        await restrictProtectedWrites(this.db,'pilot_settlement_silence_evidence_pending');
        throw new AppError(503,'Settlement review committed; evidence pending','OPERATION_PENDING',
          {operationId:operation.id});
      }
    }
    return {opened};
  }
  async reconcileReceipts(operatorId:string){
    const items=await store().list();
    for(const item of items) await inProtectedTransaction(this.db,async client=>{
      await assertCurrentOperator(client,operatorId);
      let row=await repo.byId(client,item.operationId);
      if(row&&JSON.stringify(receipt(row))!==JSON.stringify(item))
        throw new AppError(409,'Settlement review recovery conflict','RECOVERY_CONFLICT');
      if(!row) row=await repo.insert(client,item.obligationId,new Date(item.recordedAt),item.operationId,'recovered');
      if(row.id!==item.operationId) throw new AppError(409,'Settlement review recovery conflict','RECOVERY_CONFLICT');
      const effects=await repo.effects(client,row);
      if(!effects) throw new AppError(409,'Settlement review requires manual recovery','RECOVERY_INCOMPLETE');
      await notify(client,row,effects);
      await repo.markRecovered(client,row.id);
      await repo.ready(client,row.id);
      await repo.suppressRestoredEmail(client,row.id);
    });
    return items.length;
  }
}
export const directSettlementSilenceService=new DirectSettlementSilenceService();
