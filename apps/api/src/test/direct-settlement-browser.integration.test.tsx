// @vitest-environment jsdom
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import request from 'supertest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import Page from '../../../../app/direct-settlements/page';
import {createApp} from '../app';
import {pool} from '../db/pool';
import {PilotDepartureService} from '../modules/rides/pilot-departure.service';
import {PilotJourneyService} from '../modules/rides/pilot-journey.service';
import {signAccessToken} from '../shared/jwt/tokens';
const session=vi.hoisted(()=>({actor:'passenger',tokens:{} as Record<string,string>,
  app:null as ReturnType<typeof createApp>|null}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()})}));
vi.mock('@/hooks/auth/useCurrentUser',()=>({useCurrentUser:()=>({isAuthenticated:true,
  loading:false,user:{id:session.actor}})}));
vi.mock('@/lib/api/client',()=>({ApiError:class ApiError extends Error{},apiRequest:async(path:string,init?:{method?:string;body?:string;
  headers?:Record<string,string>})=>{
  if(!session.app) throw new Error('HTTP app missing');
  const agent=request(session.app);
  const response=init?.method==='POST'?await agent.post(path)
    .set('Authorization',`Bearer ${session.tokens[session.actor]}`)
    .set('Idempotency-Key',init.headers?.['Idempotency-Key']??'')
    .send(JSON.parse(init.body??'{}')):await agent.get(path)
    .set('Authorization',`Bearer ${session.tokens[session.actor]}`);
  if(response.status>=400) throw new Error(response.body.message??`HTTP ${response.status}`);
  return response.body;
}}));
const db=new Pool({connectionString:process.env.DATABASE_URL,max:2});
let directory='';
beforeAll(async()=>{
  const hadAcceptance=(await db.query<{present:boolean}>(
    "SELECT to_regclass('public.pilot_cancellation_operations') IS NOT NULL AS present")).rows[0].present;
  const path=resolve(import.meta.dirname,'../db/migrations');
  for(const name of (await readdir(path)).filter(x=>/^\d+_.*\.sql$/.test(x)).sort()){
    if(hadAcceptance&&name==='0023_pilot_seat_acceptance.sql') continue;
    await db.query(await readFile(resolve(path,name),'utf8'));
  }
});
afterAll(async()=>{await db.end();});
afterEach(async()=>{cleanup();session.actor='passenger';session.tokens={};session.app=null;
  delete process.env.PILOT_RECEIPT_PATH;delete process.env.PILOT_RECEIPT_SECRET;
  for(const name of ['PILOT_CONFLICT_POLICY_APPROVED','PILOT_EXPECTED_TRIP_MINUTES',
    'PILOT_CONFLICT_BUFFER_MINUTES','PILOT_SUPPORT_WINDOW_APPROVED',
    'PILOT_SUPPORT_WINDOW_START','PILOT_SUPPORT_WINDOW_END']) delete process.env[name];
  if(directory) await rm(directory,{recursive:true,force:true});});
async function fixture(){
  await db.query('TRUNCATE users CASCADE');
  await db.query("UPDATE auth_cutover_state SET active_provider='legacy', legacy_login_enabled=true, authorized_at=NULL, authorized_by=NULL WHERE singleton=true");
  await db.query(`INSERT INTO pilot_recovery_state(singleton,mode) VALUES(true,'open')
    ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL,started_at=NULL`);
  await db.query("UPDATE pilot_pause_state SET paused=false,operation_id=NULL");
  directory=await mkdtemp(resolve(tmpdir(),'pilot-settlement-browser-'));
  process.env.PILOT_RECEIPT_PATH=resolve(directory,'receipts');
  process.env.PILOT_RECEIPT_SECRET='pilot-direct-settlement-browser-test-secret';
  Object.assign(process.env,{PILOT_CONFLICT_POLICY_APPROVED:'true',PILOT_EXPECTED_TRIP_MINUTES:'35',
    PILOT_CONFLICT_BUFFER_MINUTES:'20',PILOT_SUPPORT_WINDOW_APPROVED:'true',
    PILOT_SUPPORT_WINDOW_START:new Date(Date.now()-60*60_000).toISOString(),
    PILOT_SUPPORT_WINDOW_END:new Date(Date.now()+48*60*60_000).toISOString()});
  const ids:Record<string,string>={};
  for(const name of ['driver','passenger']){
    const email=`${name}-${randomUUID()}@example.test`;
    const id=(await db.query<{id:string}>(`INSERT INTO users(email,role,email_verified_at)
      VALUES($1,'user',now()) RETURNING id`,[email])).rows[0].id;
    ids[name]=id;session.tokens[id]=signAccessToken({userId:id,email,role:'user'});
    await db.query(`INSERT INTO student_verifications
      (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
      VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[id]);
  }
  await db.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
    VALUES($1,'approved',CURRENT_DATE+100,CURRENT_DATE+100)`,[ids.driver]);
  const car=(await db.query<{id:string}>(`INSERT INTO vehicles
    (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,use_category,
      applicable_document_required,insurance_expires_at,review_after,verification_status)
    VALUES($1,'car','2468',4,'private',false,CURRENT_DATE+100,CURRENT_DATE+100,'approved')
    RETURNING id`,[ids.driver])).rows[0].id;
  await db.query(`INSERT INTO driver_vehicle_approvals
    (driver_user_id,vehicle_id,permission_category,status,review_after)
    VALUES($1,$2,'owner','approved',CURRENT_DATE+100)`,[ids.driver,car]);
  const offer=(await db.query<{id:string}>(`INSERT INTO ride_offers
    (driver_id,vehicle_id,pickup_location,pickup_lat,pickup_lng,drop_location,drop_lat,drop_lng,
      date,time,available_seats,price_per_seat_paise,status,pilot_policy_id,pilot_policy_snapshot,
      pilot_origin_code,pilot_destination_code,pilot_capacity,pilot_currency,pilot_request_cutoff_at,
      pilot_acceptance_cutoff_at,pilot_commitment_until)
    VALUES($1,$2,'University',20,77,'College',20.1,77.1,
      ((now()-interval '10 minutes') AT TIME ZONE 'Asia/Kolkata')::date,
      ((now()-interval '10 minutes') AT TIME ZONE 'Asia/Kolkata')::time,0,2500,'active',
      (SELECT id FROM pilot_corridor_policies WHERE version=1),'{"version":1}'::jsonb,
      'university','prmitr',4,'INR',now()-interval '70 minutes',now()-interval '40 minutes',
      now()+interval '1 hour') RETURNING id`,[ids.driver,car])).rows[0].id;
  const seatRequest=(await db.query<{id:string}>(`INSERT INTO pilot_seat_requests
    (offer_id,passenger_id,driver_id,status,offer_version,offer_terms,decision_deadline_at)
    VALUES($1,$2,$3,'accepted',1,'{}',now()-interval '40 minutes') RETURNING id`,
    [offer,ids.passenger,ids.driver])).rows[0].id;
  const allocation=(await db.query<{id:string}>(`INSERT INTO pilot_seat_allocations
    (request_id,offer_id,driver_id,passenger_id,vehicle_id,contribution_paise,currency,
      offer_version,policy_version,departure_at,commitment_until)
    VALUES($1,$2,$3,$4,$5,2500,'INR',1,1,now()-interval '10 minutes',now()+interval '1 hour')
    RETURNING id`,[seatRequest,offer,ids.driver,ids.passenger,car])).rows[0].id;
  await new PilotDepartureService(pool).start(ids.driver,randomUUID(),offer,[allocation],
    'departure',null,new Date());
  const journey=new PilotJourneyService(pool);
  await journey.complete(ids.driver,randomUUID(),offer,[{allocation_id:allocation,travelled:true,completed:true}]);
  await journey.confirm(ids.passenger,randomUUID(),offer,allocation,true,true);
  const obligation=(await db.query<{id:string}>(`SELECT id FROM pilot_contribution_obligations
    WHERE allocation_id=$1`,[allocation])).rows[0].id;
  session.app=createApp();session.actor=ids.passenger;
  return {ids,obligation};
}
describe('direct settlement browser to HTTP to PostgreSQL',()=>{
  it('leaves a UPI claim unpaid until the driver confirms receipt',async()=>{
    const {ids,obligation}=await fixture();
    const passenger=render(<Page/>);
    fireEvent.click(await screen.findByRole('button',{name:'Report UPI paid'}));
    expect(await screen.findByText(/driver must confirm receipt before this is settled/i)).not.toBeNull();
    expect((await db.query(`SELECT kind FROM pilot_settlement_operations
      WHERE obligation_id=$1`,[obligation])).rows).toEqual([{kind:'claim'}]);
    passenger.unmount();session.actor=ids.driver;
    render(<Page/>);
    fireEvent.click(await screen.findByRole('button',{name:'Confirm receipt'}));
    await waitFor(()=>expect(screen.getByText(/Driver confirmed receipt at/)).not.toBeNull());
    expect((await db.query(`SELECT kind FROM pilot_settlement_operations
      WHERE obligation_id=$1 ORDER BY recorded_at`,[obligation])).rows.map(x=>x.kind))
      .toEqual(['claim','confirm']);
    expect((await db.query('SELECT amount_paise,currency FROM pilot_contribution_obligations WHERE id=$1',
      [obligation])).rows[0]).toEqual({amount_paise:2500,currency:'INR'});
  });
});
