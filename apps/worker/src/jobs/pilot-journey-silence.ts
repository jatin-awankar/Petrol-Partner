import type {Pool} from 'pg';
import * as repo from './pilot-journey-silence.repo';

// Due work is durable and locked in PostgreSQL; a retry cannot create a second case.
export async function reviewSilentJourneys(database:Pool,now=new Date()) {
  const client=await database.connect();
  try {
    await client.query('BEGIN');
    if(!await repo.writesAllowed(client)){
      await client.query('COMMIT');
      return {processed:0,opened:0};
    }
    const due=await repo.due(client,now);
    let opened=0;
    for(const item of due){
      if(!await repo.hasPassengerClaim(client,item.allocation_id)){
        const caseId=await repo.openReview(client,item,now);
        if(caseId){
          opened++;
          for(const recipientId of await repo.recipients(client,item.allocation_id))
            await repo.notify(client,caseId,item.offer_id,recipientId);
        }
      }
      await repo.finish(client,item.allocation_id,now);
    }
    await client.query('COMMIT');
    return {processed:due.length,opened};
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
