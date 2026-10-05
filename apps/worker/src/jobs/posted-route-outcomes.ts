import type {Pool} from 'pg';
import {dueOutcomes,recordOutcomeNotice,lockOutcomeProduction} from './posted-route-outcomes.repo';

// Timers report overdue facts, never travel, cancellation, receipt or debt.
// The recovery lock serializes these records with protected participant decisions.
export async function produceRouteOutcomeNotices(database:Pool,at=new Date()){
  const db=await database.connect();
  try{
    await db.query('BEGIN');
    if(!await lockOutcomeProduction(db)){await db.query('COMMIT');return 0;}
    let count=0;
    for(const item of await dueOutcomes(db,at))if(await recordOutcomeNotice(db,item))count++;
    await db.query('COMMIT');return count;
  }catch(error){await db.query('ROLLBACK');throw error;}
  finally{db.release();}
}
