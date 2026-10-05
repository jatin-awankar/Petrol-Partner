import type {PoolClient} from 'pg';
import {AppError} from '../../shared/errors/app-error';
import type {Operation} from './outcomes.repo';

type Row=Record<string,unknown>;
export type Snapshot=Record<string,Row[]>;
const tables={
  posted_route_offers:'id=$1',
  posted_route_seat_requests:'offer_id=$1',
  posted_route_seat_allocations:'offer_id=$1',
  posted_route_journey_claims:'allocation_id IN (SELECT id FROM posted_route_seat_allocations WHERE offer_id=$1)',
  posted_route_journey_reviews:'allocation_id IN (SELECT id FROM posted_route_seat_allocations WHERE offer_id=$1)',
  posted_route_obligations:'allocation_id IN (SELECT id FROM posted_route_seat_allocations WHERE offer_id=$1)',
  posted_route_payment_claims:'obligation_id IN (SELECT o.id FROM posted_route_obligations o JOIN posted_route_seat_allocations a ON a.id=o.allocation_id WHERE a.offer_id=$1)',
  posted_route_receipt_decisions:'claim_id IN (SELECT c.id FROM posted_route_payment_claims c JOIN posted_route_obligations o ON o.id=c.obligation_id JOIN posted_route_seat_allocations a ON a.id=o.allocation_id WHERE a.offer_id=$1)',
  posted_route_settlement_reviews:'obligation_id IN (SELECT o.id FROM posted_route_obligations o JOIN posted_route_seat_allocations a ON a.id=o.allocation_id WHERE a.offer_id=$1)',
  posted_route_incidents:'offer_id=$1',
} as const;
const mutable:Record<string,string[]>={
  posted_route_offers:['status'],posted_route_seat_requests:['status','decided_at'],
  posted_route_seat_allocations:['status','boarded'],
  posted_route_journey_reviews:['status','outcome','resolution_reason','resolved_by','resolved_at','evidence_refs','resolution_operation_id'],
  posted_route_settlement_reviews:['status','receipt_established','resolution_reason','resolved_by','resolved_at','evidence_refs','resolution_operation_id'],
  posted_route_incidents:['status','resolved_by','resolution_operation_id','resolution_reason','evidence_refs','resolved_at'],
};
function canonical(value:unknown):string{
  if(value instanceof Date)return JSON.stringify(value.toISOString());
  if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:/.test(value)&&Number.isFinite(Date.parse(value)))return JSON.stringify(new Date(value).toISOString());
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return JSON.stringify(Object.fromEntries(Object.entries(value)
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,JSON.parse(canonical(v))])));
  return JSON.stringify(value);
}
export async function snapshot(db:PoolClient,offer:string):Promise<Snapshot>{
  const result:Snapshot={};
  for(const [table,where] of Object.entries(tables))result[table]=(await db.query<{row:Row}>(
    `SELECT to_jsonb(t) AS row FROM ${table} t WHERE ${where} ORDER BY id`,[offer])).rows.map(r=>r.row);
  return result;
}
export async function restoreOperation(db:PoolClient,row:Operation){
  await db.query(`INSERT INTO posted_route_outcome_operations
    (id,actor_id,idempotency_key,payload_digest,offer_id,allocation_id,action,payload,result,state,created_at,acknowledged_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'recovered',$10,now())`,
    [row.id,row.actor_id,row.idempotency_key,row.payload_digest,row.offer_id,row.allocation_id,
      row.action,row.payload,row.result,row.created_at]);
}
// Receipts retain exact IDs and clocks. Reconciliation accepts only an evidenced prior
// state or the original booking baseline; unknown conflicting state needs human review.
export async function restoreSnapshots(db:PoolClient,history:Snapshot[]){
  for(const table of Object.keys(tables)){
    const versions=new Map<string,Row[]>();
    for(const snap of history)for(const row of snap[table]??[]){
      const id=String(row.id);versions.set(id,[...(versions.get(id)??[]),row]);
    }
    for(const [id,rows] of versions){
      const expected=rows.at(-1)!;
      const current=(await db.query<{row:Row}>(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id=$1 FOR UPDATE`,[id])).rows[0]?.row;
      if(current&&canonical(current)===canonical(expected))continue;
      if(current){
        const keys=mutable[table]??[];
        const immutable=(row:Row)=>Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)));
        if(canonical(immutable(current))!==canonical(immutable(expected)))
          throw new AppError(409,'Frozen outcome recovery state conflicts','RECOVERY_CONFLICT');
        const original=table==='posted_route_offers'?{...expected,status:'prepared'}:
          table==='posted_route_seat_allocations'?{...expected,status:'confirmed',boarded:null}:null;
        if(!rows.some(r=>canonical(r)===canonical(current))&&(!original||canonical(original)!==canonical(current)))
          throw new AppError(409,`Outcome recovery transition conflicts (${table})`,'RECOVERY_CONFLICT');
        if(keys.length)await db.query(`UPDATE ${table} t SET ${keys.map(k=>`${k}=r.${k}`).join(',')}
          FROM jsonb_populate_record(NULL::${table},$2::jsonb) r WHERE t.id=$1`,[id,expected]);
      }else{
        if(['posted_route_offers','posted_route_seat_allocations','posted_route_seat_requests'].includes(table))
          throw new AppError(409,'Restore route and acceptance evidence first','RECOVERY_INCOMPLETE');
        await db.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table},$1::jsonb)`,[expected]);
      }
    }
  }
}

export async function factsMatch(db:import('pg').Pool,snap:Snapshot){
  for(const table of Object.keys(tables))for(const expected of snap[table]??[]){
    const current=(await db.query<{row:Row}>(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id=$1`,[expected.id])).rows[0]?.row;
    if(!current)return false;
    const keys=expected.status==='resolved'?[]:mutable[table]??[];
    const facts=(r:Row)=>Object.fromEntries(Object.entries(r).filter(([k])=>!keys.includes(k)));
    if(canonical(facts(current))!==canonical(facts(expected)))return false;
  }
  return true;
}

export function sameRecord(a:Row,b:Row){return canonical(a)===canonical(b);}
export function sameFrozenRecord(table:string,a:Row,b:Row){
  const keys=mutable[table]??[];
  const strip=(r:Row)=>Object.fromEntries(Object.entries(r).filter(([k,v])=>
    !keys.includes(k)&&!(k==='route_verification'&&v==null)));
  return sameRecord(strip(a),strip(b));
}

export async function latestCommitmentsMatch(db:import('pg').Pool,history:Snapshot[]){
  for(const table of ['posted_route_offers','posted_route_seat_allocations']){
    const latest=new Map<string,Row>();
    for(const snap of history)for(const row of snap[table]??[])latest.set(String(row.id),row);
    for(const [id,expected] of latest){
      const current=(await db.query<{row:Row}>(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id=$1`,[id])).rows[0]?.row;
      if(!current||current.status!==expected.status||
        table==='posted_route_seat_allocations'&&current.boarded!==expected.boarded)return false;
    }
  }
  return true;
}
