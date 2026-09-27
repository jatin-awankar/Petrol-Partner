import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { signAccessToken } from "../shared/jwt/tokens";
import { corridorOffersService } from "../modules/rides/corridor-offers.service";
import { SeatRequestsService, setSeatRequestClockForTests } from "../modules/rides/seat-requests.service";
import { CancellationsService } from "../modules/rides/cancellations.service";
import { PilotDepartureService } from "../modules/rides/pilot-departure.service";
import { PilotJourneyService } from "../modules/rides/pilot-journey.service";
import { JourneyReviewService } from "../modules/rides/journey-review.service";
import { DirectSettlementService } from "../modules/rides/direct-settlement.service";
import { DirectSettlementSilenceService } from "../modules/rides/direct-settlement-silence.service";
import { SettlementCasesService,setSettlementCaseAfterReceiptHookForTests } from "../modules/rides/settlement-cases.service";
import { reviewSilentJourneys } from "../../../worker/src/jobs/pilot-journey-silence";
import { StudentRevocationService } from "../modules/verification/student-revocation.service";
import { DriverCarReviewService } from "../modules/verification/driver-car-review.service";
import { RevocationCasesService } from "../modules/operator/revocation-cases.service";
import { expirePilotSeatRequests } from "../../../worker/src/jobs/pilot-seat-expiry";
import {notifyDelayedPilotRides} from "../../../worker/src/jobs/pilot-delayed-rides";
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { pool } from "../db/pool";
import { resetRateLimitsForTests } from "../middleware/rate-limit";
import { setAuthProviderForTests, setManagedAuthEnabledForTests, type AuthProvider, type ProviderIdentity } from "../modules/auth/auth-provider";
import { setBackupObjectProbeForTests } from "../modules/operator/backup-status";
import { setStudentReviewAfterCommitHookForTests } from "../modules/verification/student-review.service";

const verificationPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const migrations = ["0001_init.sql", "0002_profile_settings.sql", "0003_chat.sql", "0004_acknowledgement_prototype.sql", "0005_managed_auth_identities.sql", "0006_operator_allowlist.sql", "0007_operator_pause.sql", "0008_operator_intent_handoff.sql", "0009_durable_notifications.sql", "0010_email_retry_operations.sql", "0011_backup_attempts.sql", "0012_student_adult_review.sql", "0013_student_review_cycles.sql", "0014_student_review_operations.sql", "0015_student_evidence_access.sql", "0016_student_evidence_deletion_outcomes.sql", "0017_student_evidence_retry_schedule.sql", "0018_driver_car_approval.sql", "0019_ride_departures.sql", "0020_corridor_offers.sql", "0021_corridor_offer_recovery.sql", "0022_pilot_seat_requests.sql", "0023_pilot_seat_acceptance.sql", "0024_pilot_cancellations.sql", "0025_pilot_departure.sql", "0026_revocation_holds_incidents.sql", "0027_pilot_journeys.sql", "0028_journey_review_decisions.sql", "0029_direct_settlement.sql", "0030_settlement_dispute_resolution.sql"];

function fakeProvider(identity: ProviderIdentity): AuthProvider {
  const session = { accessToken: "provider-access", refreshToken: "provider-refresh", expiresIn: 900, identity };
  return {
    register: async () => undefined,
    login: async () => session,
    validate: async () => identity,
    refresh: async () => session,
    requestRecovery: async () => undefined,
    updatePassword: async () => undefined,
    logout: async () => undefined,
    exchangeCode: async () => session,
  };
}

beforeAll(async () => {
  const cancellationsPresent=(await verificationPool.query<{present:boolean}>(
    "SELECT to_regclass('public.pilot_cancellation_operations') IS NOT NULL AS present")).rows[0].present;
  for (const migration of migrations) {
    // Reapplying 0023 would narrow the status check after 0024 has stored cancellations.
    if (cancellationsPresent && migration === "0023_pilot_seat_acceptance.sql") continue;
    const sql = await readFile(resolve(import.meta.dirname, "../db/migrations", migration), "utf8");
    await verificationPool.query(sql);
  }
});

describe("ticket 22 individual journey confirmation",()=>{
  let directory:string;
  beforeEach(async()=>{
    await verificationPool.query("TRUNCATE users CASCADE");
    await verificationPool.query(`INSERT INTO pilot_recovery_state(singleton,mode) VALUES(true,'open')
      ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL,started_at=NULL`);
    await verificationPool.query("UPDATE pilot_pause_state SET paused=false,operation_id=NULL");
    directory=await mkdtemp(resolve(tmpdir(),"pilot-journey-"));
    Object.assign(process.env,{PILOT_RECEIPT_PATH:resolve(directory,"receipts"),
      PILOT_RECEIPT_SECRET:"pilot-journey-independent-secret-for-tests",
      PILOT_CONFLICT_POLICY_APPROVED:"true",PILOT_EXPECTED_TRIP_MINUTES:"35",
      PILOT_CONFLICT_BUFFER_MINUTES:"20",PILOT_SUPPORT_WINDOW_APPROVED:"true",
      PILOT_SUPPORT_WINDOW_START:new Date(Date.now()-60*60_000).toISOString(),
      PILOT_SUPPORT_WINDOW_END:new Date(Date.now()+48*60*60_000).toISOString()});
  });
  afterEach(async()=>{
    setSettlementCaseAfterReceiptHookForTests(null);
    setManagedAuthEnabledForTests(null);
    setAuthProviderForTests(null);
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='legacy',
      legacy_login_enabled=true,authorized_at=NULL,authorized_by=NULL WHERE singleton=true`);
    delete process.env.PILOT_RECEIPT_PATH;
    delete process.env.PILOT_RECEIPT_SECRET;
    for(const name of ["PILOT_CONFLICT_POLICY_APPROVED","PILOT_EXPECTED_TRIP_MINUTES",
      "PILOT_CONFLICT_BUFFER_MINUTES","PILOT_SUPPORT_WINDOW_APPROVED",
      "PILOT_SUPPORT_WINDOW_START","PILOT_SUPPORT_WINDOW_END"]) delete process.env[name];
    await rm(directory,{recursive:true,force:true});
  });
  async function fixture(){
    const users=await Promise.all(["driver","first","second","silent","absent","outsider","operator"]
      .map(async label=>{
        const email=`journey-${label}-${randomUUID()}@example.test`;
        const id=(await verificationPool.query<{id:string}>(`INSERT INTO users(email,role,email_verified_at)
          VALUES($1,$2,now()) RETURNING id`,[email,label==='operator'?'admin':'user'])).rows[0].id;
        if(label!=='operator') await verificationPool.query(`INSERT INTO student_verifications
          (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
          VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[id]);
        return {id,token:signAccessToken({userId:id,email,role:label==='operator'?'admin':'user'})};
      }));
    const [driver,first,second,silent,absent,outsider,operator]=users;
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'synthetic journey review',now())`,[operator.id]);
    await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
      VALUES($1,'approved',CURRENT_DATE+100,CURRENT_DATE+100)`,[driver.id]);
    const car=(await verificationPool.query<{id:string}>(`INSERT INTO vehicles
      (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,use_category,
       applicable_document_required,insurance_expires_at,review_after,verification_status)
      VALUES($1,'car','4321',4,'private',false,CURRENT_DATE+100,CURRENT_DATE+100,'approved')
      RETURNING id`,[driver.id])).rows[0].id;
    await verificationPool.query(`INSERT INTO driver_vehicle_approvals
      (driver_user_id,vehicle_id,permission_category,status,review_after)
      VALUES($1,$2,'owner','approved',CURRENT_DATE+100)`,[driver.id,car]);
    const offer=(await verificationPool.query<{id:string}>(`INSERT INTO ride_offers
      (driver_id,vehicle_id,pickup_location,pickup_lat,pickup_lng,drop_location,
       drop_lat,drop_lng,date,time,available_seats,price_per_seat_paise,status,
       pilot_policy_id,pilot_policy_snapshot,pilot_origin_code,pilot_destination_code,
       pilot_capacity,pilot_currency,pilot_request_cutoff_at,pilot_acceptance_cutoff_at,
       pilot_commitment_until)
      VALUES($1,$2,'University',20,77,'College',20.1,77.1,
       ((now()-interval '10 minutes') AT TIME ZONE 'Asia/Kolkata')::date,
       ((now()-interval '10 minutes') AT TIME ZONE 'Asia/Kolkata')::time,
       0,2500,'active',(SELECT id FROM pilot_corridor_policies WHERE version=1),
       '{"version":1}'::jsonb,'university','prmitr',4,'INR',
       now()-interval '70 minutes',now()-interval '40 minutes',now()+interval '1 hour')
      RETURNING id`,[driver.id,car])).rows[0].id;
    const allocations:string[]=[];
    for(const [i,passenger] of [first,second,silent,absent].entries()){
      const requestId=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_seat_requests
        (offer_id,passenger_id,driver_id,status,offer_version,offer_terms,decision_deadline_at)
        VALUES($1,$2,$3,'accepted',1,'{}',now()-interval '40 minutes') RETURNING id`,
        [offer,passenger.id,driver.id])).rows[0].id;
      const allocationId=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_seat_allocations
        (request_id,offer_id,driver_id,passenger_id,vehicle_id,contribution_paise,currency,
         offer_version,policy_version,departure_at,commitment_until)
        VALUES($1,$2,$3,$4,$5,$6,'INR',1,1,now()-interval '10 minutes',now()+interval '1 hour')
        RETURNING id`,[requestId,offer,driver.id,passenger.id,car,2500+i*100])).rows[0].id;
      allocations.push(allocationId);
    }
    return {driver,first,second,silent,absent,outsider,operator,offer,allocations};
  }
  async function start(f:Awaited<ReturnType<typeof fixture>>){
    const boarded=f.allocations.slice(0,3);
    expect((await new PilotDepartureService(pool).start(f.driver.id,randomUUID(),f.offer,boarded,
      'departure',null,new Date())).state).toBe('acknowledged');
  }
  it("keeps claims per passenger, creates only mutual debt, and reviews disagreement and exact 24-hour silence",async()=>{
    const f=await fixture();
    const service=new PilotJourneyService(pool);
    const [a,b,c,d]=f.allocations;
    const claims=[a,b,c].map(allocation_id=>({allocation_id,travelled:true,completed:true}));
    await expect(service.complete(f.driver.id,randomUUID(),f.offer,claims))
      .rejects.toMatchObject({code:'JOURNEY_NOT_STARTED'});
    await start(f);
    const wrongHttp=await request(createApp()).post(`/v1/corridor-offers/${f.offer}/complete`)
      .set('Authorization',`Bearer ${f.outsider.token}`).set('Idempotency-Key',randomUUID())
      .send({claims});
    expect(wrongHttp.status).toBe(403);
    await expect(service.complete(f.outsider.id,randomUUID(),f.offer,claims))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(service.confirm(f.second.id,randomUUID(),f.offer,a,true,true))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(service.confirm(f.absent.id,randomUUID(),f.offer,d,true,true))
      .rejects.toMatchObject({code:'BOARDING_REQUIRED'});
    const at=new Date('2026-09-27T10:00:00.000Z');
    const key=randomUUID();
    const completion=await service.complete(f.driver.id,key,f.offer,claims,at);
    expect(completion.state).toBe('acknowledged');
    await service.verifyEvidence();
    expect((await service.complete(f.driver.id,key,f.offer,claims)).operation_id).toBe(completion.operation_id);
    await expect(service.complete(f.driver.id,key,f.offer,claims.slice(0,2)))
      .rejects.toMatchObject({code:'IDEMPOTENCY_PAYLOAD_MISMATCH'});
    expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows).toHaveLength(0);
    const confirmedAt=new Date(at.getTime()+60_000);
    const passengerKey=randomUUID();
    const first=await service.confirm(f.first.id,passengerKey,f.offer,a,true,true,confirmedAt);
    expect((await service.confirm(f.first.id,passengerKey,f.offer,a,true,true)).operation_id)
      .toBe(first.operation_id);
    await service.confirm(f.second.id,randomUUID(),f.offer,b,false,false,confirmedAt);
    const obligations=(await verificationPool.query<{allocation_id:string;amount_paise:number;
      currency:string;policy_version:number;confirmed_at:Date;due_at:Date}>(
      'SELECT * FROM pilot_contribution_obligations')).rows;
    expect(obligations).toHaveLength(1);
    expect(obligations[0]).toMatchObject({allocation_id:a,amount_paise:2500,currency:'INR',policy_version:1});
    expect(obligations[0].confirmed_at.toISOString()).toBe(confirmedAt.toISOString());
    expect(obligations[0].due_at.toISOString()).toBe(new Date(confirmedAt.getTime()+86_400_000).toISOString());
    const reviews=await service.reviews(f.operator.id);
    expect(reviews).toEqual(expect.arrayContaining([expect.objectContaining({allocation_id:b,reason:'disagreement'})]));
    expect((await reviewSilentJourneys(verificationPool,new Date(at.getTime()+86_400_000-1))).opened).toBe(0);
    expect((await reviewSilentJourneys(verificationPool,new Date(at.getTime()+86_400_000))).opened).toBe(1);
    expect((await reviewSilentJourneys(verificationPool,new Date(at.getTime()+86_400_000))).opened).toBe(0);
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n
      FROM pilot_notification_events WHERE origin_type='pilot_journey_silence'
        AND ready_at IS NOT NULL`)).rows[0].n).toBe(3);
    expect((await service.reviews(f.operator.id)).map(row=>row.allocation_id).sort()).toEqual([b,c].sort());
    expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows).toHaveLength(1);
    await verificationPool.query(`UPDATE pilot_email_jobs SET due_at=now()+interval '1 hour'
      WHERE event_id IN(SELECT id FROM pilot_notification_events WHERE origin_type<>'pilot_journey')`);
    process.env.REDIS_URL='redis://127.0.0.1:6379';
    const {processDueEmail}=await import("../../../worker/src/jobs/durable-email.job");
    expect(await processDueEmail(verificationPool,{async send(){throw new Error('provider unavailable');}})).toBe(true);
    delete process.env.REDIS_URL;
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_email_jobs j
      JOIN pilot_notification_events e ON e.id=j.event_id WHERE e.origin_type='pilot_journey'
        AND j.attempts=1 AND j.status='pending'`)).rows[0].n).toBe(1);
    expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows).toHaveLength(1);
    const trip=await request(createApp()).get(`/v1/seat-requests/confirmed/${f.offer}`)
      .set('Authorization',`Bearer ${f.first.token}`);
    expect(trip.body.trip.bookings[0]).toMatchObject({obligation_paise:2500,driver_completed:true,
      passenger_completed:true});
    expect((await request(createApp()).get('/v1/operator/journey-reviews')
      .set('Authorization',`Bearer ${f.first.token}`)).status).toBe(403);
  });
  it("restores acknowledged claims and their obligation from independent receipts",async()=>{
    const f=await fixture();
    await start(f);
    const service=new PilotJourneyService(pool);
    const allocation=f.allocations[0];
    const at=new Date('2026-09-27T11:00:00.000Z');
    await service.complete(f.driver.id,randomUUID(),f.offer,[
      ...f.allocations.slice(0,3).map(allocation_id=>({allocation_id,travelled:true,completed:true}))],at);
    await service.confirm(f.first.id,randomUUID(),f.offer,allocation,true,true,
      new Date(at.getTime()+120_000));
    const original=(await verificationPool.query<{amount_paise:number;due_at:Date}>(
      'SELECT amount_paise,due_at FROM pilot_contribution_obligations WHERE allocation_id=$1',
      [allocation])).rows[0];
    await verificationPool.query('DELETE FROM pilot_contribution_obligations WHERE allocation_id=$1',[allocation]);
    await verificationPool.query('DELETE FROM pilot_journey_review_work WHERE allocation_id=ANY($1::uuid[])',
      [f.allocations]);
    await verificationPool.query(`DELETE FROM pilot_email_jobs WHERE event_id IN
      (SELECT id FROM pilot_notification_events WHERE origin_type='pilot_journey')`);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE origin_type='pilot_journey'");
    await verificationPool.query("DELETE FROM pilot_journey_claims WHERE allocation_id=ANY($1::uuid[])",
      [f.allocations]);
    await verificationPool.query("DELETE FROM audit_logs WHERE action IN ('pilot_driver_completion','pilot_passenger_journey')");
    await verificationPool.query("DELETE FROM pilot_journey_operations WHERE offer_id=$1",[f.offer]);
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    expect(await service.reconcileReceipts(f.operator.id)).toBe(2);
    const restored=(await verificationPool.query<{amount_paise:number;due_at:Date}>(
      'SELECT amount_paise,due_at FROM pilot_contribution_obligations WHERE allocation_id=$1',
      [allocation])).rows[0];
    expect(restored.amount_paise).toBe(original.amount_paise);
    expect(restored.due_at.toISOString()).toBe(original.due_at.toISOString());
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_journey_claims")).rows[0].n)
      .toBe(4);
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n
      FROM pilot_email_jobs j JOIN pilot_notification_events e ON e.id=j.event_id
      WHERE e.origin_type='pilot_journey' AND j.status='exhausted'`)).rows[0].n)
      .toBeGreaterThan(0);
    await service.verifyEvidence();
  });
  it("opens review at the silence boundary even when the worker has not run",async()=>{
    const f=await fixture();
    await start(f);
    const service=new PilotJourneyService(pool);
    const at=new Date('2026-09-27T12:00:00.000Z');
    await service.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})),at);
    await service.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true,
      new Date(at.getTime()+86_400_000));
    expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows)
      .toHaveLength(0);
    expect((await service.reviews(f.operator.id)).map(row=>row.allocation_id))
      .toContain(f.allocations[0]);
  });
  it("does not create debt when confirmation races the silence worker",async()=>{
    const f=await fixture();
    await start(f);
    const allocation=f.allocations[0];
    const driverAt=new Date(Date.now()-86_400_000+10_000);
    await new PilotJourneyService(pool).complete(f.driver.id,randomUUID(),f.offer,
      f.allocations.slice(0,3).map(allocation_id=>({allocation_id,travelled:true,completed:true})),driverAt);
    const workerPool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    try{
      await verificationPool.query(`CREATE FUNCTION journey_race_delay() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_sleep(2); RETURN NEW; END $$`);
      await verificationPool.query(`CREATE TRIGGER journey_race_delay AFTER INSERT ON pilot_journey_reviews
        FOR EACH ROW WHEN (NEW.allocation_id='${allocation}'::uuid AND NEW.reason='silence')
        EXECUTE FUNCTION journey_race_delay()`);
      const worker=reviewSilentJourneys(workerPool,new Date(driverAt.getTime()+86_400_000));
      let sleeping=false;
      for(let attempt=0;attempt<100;attempt++){
        sleeping=(await verificationPool.query<{sleeping:boolean}>(`SELECT EXISTS(
          SELECT 1 FROM pg_stat_activity WHERE query LIKE 'INSERT INTO pilot_journey_reviews%'
            AND wait_event='PgSleep') AS sleeping`)).rows[0].sleeping;
        if(sleeping) break;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(sleeping).toBe(true);
      const confirmation=request(createApp()).post(`/v1/corridor-offers/${f.offer}/journeys/${allocation}/confirm`)
        .set('Authorization',`Bearer ${f.first.token}`).set('Idempotency-Key',randomUUID())
        .send({travelled:true,completed:true});
      expect((await confirmation).status).toBe(200);
      expect((await worker).opened).toBe(3);
      const trip=await request(createApp()).get(`/v1/seat-requests/confirmed/${f.offer}`)
        .set('Authorization',`Bearer ${f.first.token}`);
      expect(trip.body.trip.bookings[0]).toMatchObject({journey_review_reason:'silence',obligation_paise:null});
    }finally{
      await workerPool.end();
      await verificationPool.query('DROP TRIGGER IF EXISTS journey_race_delay ON pilot_journey_reviews');
      await verificationPool.query('DROP FUNCTION IF EXISTS journey_race_delay()');
    }
  },10_000);
  it("serializes concurrent retries from separate PostgreSQL connections",async()=>{
    const f=await fixture();
    await start(f);
    const driver=new PilotJourneyService(pool);
    await driver.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})),new Date());
    const firstPool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    const secondPool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    try{
      const key=randomUUID();
      const outcomes=await Promise.allSettled([
        new PilotJourneyService(firstPool).confirm(f.first.id,key,f.offer,f.allocations[0],true,true),
        new PilotJourneyService(secondPool).confirm(f.first.id,key,f.offer,f.allocations[0],true,true)]);
      expect(outcomes.every(item=>item.status==='fulfilled')).toBe(true);
      const ids=outcomes.map(item=>item.status==='fulfilled'?item.value.operation_id:null);
      expect(new Set(ids).size).toBe(1);
      expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n
        FROM pilot_contribution_obligations WHERE allocation_id=$1`,[f.allocations[0]])).rows[0].n).toBe(1);
    }finally{await Promise.all([firstPool.end(),secondPool.end()]);}
  });
  it("reviews a boarded absence and keeps a minimal case visible after trip details expire",async()=>{
    const f=await fixture();
    await start(f);
    const service=new PilotJourneyService(pool);
    const at=new Date('2026-09-27T13:00:00.000Z');
    await service.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:false,completed:false})),at);
    await service.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],false,false,
      new Date(at.getTime()+60_000));
    expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows)
      .toHaveLength(0);
    expect((await service.participantReviews(f.first.id))).toEqual(expect.arrayContaining([
      expect.objectContaining({allocation_id:f.allocations[0],reason:'absence',status:'open'})]));
    setSeatRequestClockForTests(()=>new Date(at.getTime()+86_400_000));
    try{
      const trip=await request(createApp()).get(`/v1/seat-requests/confirmed/${f.offer}`)
        .set('Authorization',`Bearer ${f.first.token}`);
      expect(trip.status).toBe(404);
      const minimal=await request(createApp()).get('/v1/seat-requests/journey-reviews')
        .set('Authorization',`Bearer ${f.first.token}`);
      expect(minimal.status).toBe(200);
      expect(minimal.body.cases).toEqual(expect.arrayContaining([
        expect.objectContaining({allocation_id:f.allocations[0],reason:'absence'})]));
      expect(JSON.stringify(minimal.body)).not.toContain('registration_number');
    }finally{setSeatRequestClockForTests(null);}
  });
  it("records separate operator outcomes, frozen obligations, retries and participant views",async()=>{
    const f=await fixture();
    await start(f);
    const journeys=new PilotJourneyService(pool);
    const [first,second,third]=f.allocations;
    await journeys.complete(f.driver.id,randomUUID(),f.offer,[first,second,third]
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journeys.confirm(f.first.id,randomUUID(),f.offer,first,false,false);
    await journeys.confirm(f.second.id,randomUUID(),f.offer,second,false,false);
    await journeys.confirm(f.silent.id,randomUUID(),f.offer,third,false,false);
    const cases=(await verificationPool.query<{id:string;allocation_id:string}>(
      'SELECT id,allocation_id FROM pilot_journey_reviews WHERE allocation_id=ANY($1::uuid[])',
      [[first,second,third]])).rows;
    expect(cases).toHaveLength(3);
    const bySeat=new Map(cases.map(row=>[row.allocation_id,row.id]));
    const review=new JourneyReviewService(pool);
    const undecided=await request(createApp()).get(`/v1/seat-requests/journey-reviews/${bySeat.get(first)}`)
      .set('Authorization',`Bearer ${f.first.token}`);
    expect(undecided.status).toBe(200);
    expect(undecided.body.case).toMatchObject({status:'open',obligation_id:null,
      driver_travelled:true,passenger_travelled:false});
    expect((await request(createApp()).get(`/v1/seat-requests/journey-reviews/${bySeat.get(first)}`)
      .set('Authorization',`Bearer ${f.outsider.token}`)).status).toBe(404);
    const key=randomUUID();
    const unresolved={outcome:'insufficient_evidence' as const,contribution_owed:null,
      reason:'Insufficient independent trip evidence',evidence_refs:['case-note-1']};
    await review.decide(f.operator.id,key,bySeat.get(first)!,unresolved);
    expect((await review.decide(f.operator.id,key,bySeat.get(first)!,unresolved)).operation_id).toBeTruthy();
    await expect(review.decide(f.operator.id,key,bySeat.get(first)!,{...unresolved,reason:'Changed reason'}))
      .rejects.toMatchObject({code:'IDEMPOTENCY_PAYLOAD_MISMATCH'});
    expect((await review.detail(f.operator.id,bySeat.get(first)!)).case.status).toBe('open');
    const owed={outcome:'travelled_completed' as const,contribution_owed:true,
      reason:'Verified travel against journey evidence',evidence_refs:['case-note-2']};
    const result=await review.decide(f.operator.id,randomUUID(),bySeat.get(first)!,owed);
    expect(result.state).toBe('acknowledged');
    await review.decide(f.operator.id,randomUUID(),bySeat.get(second)!,{
      outcome:'did_not_travel',contribution_owed:false,
      reason:'Verified that passenger did not board',evidence_refs:[]});
    await review.decide(f.operator.id,randomUUID(),bySeat.get(third)!,{
      outcome:'interrupted',contribution_owed:false,
      reason:'Travel interrupted before destination',evidence_refs:[]});
    await expect(review.decide(f.operator.id,randomUUID(),bySeat.get(first)!,owed))
      .rejects.toMatchObject({code:'REVIEW_RESOLVED'});
    const obligations=(await verificationPool.query<{allocation_id:string;amount_paise:number;
      due_at:Date;confirmed_at:Date;review_decision_id:string|null}>(
      'SELECT * FROM pilot_contribution_obligations')).rows;
    expect(obligations).toHaveLength(1);
    expect(obligations[0]).toMatchObject({allocation_id:first,amount_paise:2500,
      review_decision_id:result.operation_id});
    expect(obligations[0].due_at.getTime()-obligations[0].confirmed_at.getTime()).toBe(86_400_000);
    expect((await verificationPool.query('SELECT * FROM pilot_journey_claims')).rows).toHaveLength(6);
    expect((await verificationPool.query("SELECT * FROM pilot_journey_reviews WHERE status='open'")).rows).toHaveLength(0);
    expect((await verificationPool.query("SELECT * FROM pilot_notification_events WHERE origin_type='journey_review_decision' AND ready_at IS NOT NULL")).rows).toHaveLength(8);
    await review.verifyEvidence();
    const visible=await request(createApp()).get(`/v1/seat-requests/journey-reviews/${bySeat.get(first)}`)
      .set('Authorization',`Bearer ${f.first.token}`);
    expect(visible.body.case).toMatchObject({status:'resolved',obligation_paise:2500,
      outcome:'travelled_completed',contribution_owed:true});
    expect(JSON.stringify(visible.body)).not.toContain('case-note-2');
    const operatorEmail=`journey-operator-${randomUUID()}@example.test`;
    const httpOperator=(await verificationPool.query<{id:string}>(`INSERT INTO users(email,role,email_verified_at)
      VALUES($1,'admin',now()) RETURNING id`,[operatorEmail])).rows[0].id;
    await verificationPool.query("INSERT INTO user_profiles(user_id,full_name) VALUES($1,'Journey Operator')",[httpOperator]);
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'test journey access',now())`,[httpOperator]);
    await verificationPool.query(`INSERT INTO auth_identities(provider,provider_subject,user_id,provider_email)
      VALUES('supabase','journey-operator-subject',$1,$2)`,[httpOperator,operatorEmail]);
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='supabase',
      legacy_login_enabled=false,authorized_at=now(),authorized_by='integration-test'`);
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({subject:'journey-operator-subject',email:operatorEmail,
      emailVerified:true,assuranceLevel:'aal2',userMetadata:{}}));
    const agent=request.agent(createApp());
    const login=await agent.post('/v1/auth/login').send({email:operatorEmail,password:'synthetic'});
    expect(login.status).toBe(200);
    const csrf=login.headers['set-cookie']?.find((cookie:string)=>cookie.startsWith('pp_csrf_token='))
      ?.split(';',1)[0]?.split('=',2)[1];
    const cookie=login.headers['set-cookie'].map((item:string)=>item.split(';',1)[0]).join('; ');
    const queue=await agent.get('/v1/operator/journey-reviews');
    expect(queue.status).toBe(200);
    expect(queue.body.cases).toEqual([]);
    const detail=await agent.get(`/v1/operator/journey-reviews/${bySeat.get(first)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.decisions).toHaveLength(2);
    const conflict=await request(createApp()).post(`/v1/operator/journey-reviews/${bySeat.get(first)}/decide`)
      .set('Cookie',cookie).set('Origin','http://localhost:3000').set('X-CSRF-Token',csrf!).set('Idempotency-Key',randomUUID()).send(owed);
    expect(conflict.status).toBe(409);
    const op=await agent.get(`/v1/operator/journey-review-decisions/${result.operation_id}`);
    expect(op.status).toBe(404);
    setAuthProviderForTests(fakeProvider({subject:'journey-operator-subject',email:operatorEmail,
      emailVerified:true,assuranceLevel:'aal1',userMetadata:{}}));
    expect((await agent.get('/v1/operator/journey-reviews')).status).toBe(403);
    expect((await request(createApp()).post(`/v1/operator/journey-reviews/${bySeat.get(first)}/decide`)
      .set('Cookie',cookie).set('Origin','http://localhost:3000').set('X-CSRF-Token',csrf!)
      .set('Idempotency-Key',randomUUID()).send(owed)).status).toBe(403);
    setAuthProviderForTests(fakeProvider({subject:'journey-operator-subject',email:operatorEmail,
      emailVerified:true,assuranceLevel:'aal2',userMetadata:{}}));
    await verificationPool.query('UPDATE operator_allowlist SET active=false WHERE user_id=$1',[httpOperator]);
    expect((await agent.get('/v1/operator/journey-reviews')).status).toBe(403);
    expect((await request(createApp()).post(`/v1/operator/journey-reviews/${bySeat.get(first)}/decide`)
      .set('Cookie',cookie).set('Origin','http://localhost:3000').set('X-CSRF-Token',csrf!)
      .set('Idempotency-Key',randomUUID()).send(owed)).status).toBe(403);
  });
  it("keeps an insufficient-evidence HTTP decision visible, then restores final decisions",async()=>{
    const f=await fixture();await start(f);
    const allocation=f.allocations[0];
    const journeys=new PilotJourneyService(pool);
    await journeys.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journeys.confirm(f.first.id,randomUUID(),f.offer,allocation,false,false);
    await journeys.confirm(f.second.id,randomUUID(),f.offer,f.allocations[1],false,false);
    await journeys.confirm(f.silent.id,randomUUID(),f.offer,f.allocations[2],false,false);
    const caseId=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_journey_reviews WHERE allocation_id=$1',[allocation])).rows[0].id;
    const email=`journey-http-${randomUUID()}@example.test`,subject=`journey-http-${randomUUID()}`;
    const operatorId=(await verificationPool.query<{id:string}>(`INSERT INTO users(email,role,email_verified_at)
      VALUES($1,'admin',now()) RETURNING id`,[email])).rows[0].id;
    await verificationPool.query("INSERT INTO user_profiles(user_id,full_name) VALUES($1,'Journey Operator')",[operatorId]);
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'journey test',now())`,[operatorId]);
    await verificationPool.query(`INSERT INTO auth_identities(provider,provider_subject,user_id,provider_email)
      VALUES('supabase',$1,$2,$3)`,[subject,operatorId,email]);
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='supabase',
      legacy_login_enabled=false,authorized_at=now(),authorized_by='integration-test'`);
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({subject,email,emailVerified:true,
      assuranceLevel:'aal2',userMetadata:{}}));
    const login=await request(createApp()).post('/v1/auth/login').send({email,password:'synthetic'});
    expect(login.status).toBe(200);
    const cookies=login.headers['set-cookie'] as string[];
    const cookie=cookies.map(item=>item.split(';',1)[0]).join('; ');
    const csrf=cookies.find(item=>item.startsWith('pp_csrf_token='))?.split(';',1)[0].split('=',2)[1];
    const otherCases=(await verificationPool.query<{id:string;allocation_id:string}>(
      'SELECT id,allocation_id FROM pilot_journey_reviews WHERE allocation_id=ANY($1::uuid[])',
      [[f.allocations[1],f.allocations[2]]])).rows;
    const caseBySeat=new Map(otherCases.map(row=>[row.allocation_id,row.id]));
    const body={outcome:'interrupted',contribution_owed:true,
      reason:'Verified partial travel and frozen share',evidence_refs:['review-note-7']};
    const key=randomUUID();
    const post=(reviewId:string,idempotencyKey:string,payload=body)=>request(createApp())
      .post(`/v1/operator/journey-reviews/${reviewId}/decide`)
      .set('Cookie',cookie).set('Origin','http://localhost:3000')
      .set('X-CSRF-Token',csrf!).set('Idempotency-Key',idempotencyKey).send(payload);
    expect((await post(caseId,randomUUID(),{...body,outcome:'did_not_travel',
      contribution_owed:true})).status).toBe(400);
    const unresolved=await post(caseId,randomUUID(),{outcome:'insufficient_evidence',
      contribution_owed:null,reason:'Insufficient corroborating journey evidence',
      evidence_refs:['review-note-unresolved']});
    expect(unresolved.status,JSON.stringify(unresolved.body)).toBe(200);
    expect(unresolved.body.operation).toMatchObject({state:'acknowledged',
      outcome:'insufficient_evidence',contribution_owed:null});
    const openQueue=await request(createApp()).get('/v1/operator/journey-reviews').set('Cookie',cookie);
    expect(openQueue.body.cases).toEqual(expect.arrayContaining([
      expect.objectContaining({id:caseId,status:'open',latest_outcome:'insufficient_evidence'})]));
    const openDetail=await request(createApp()).get(`/v1/operator/journey-reviews/${caseId}`).set('Cookie',cookie);
    expect(openDetail.body.case).toMatchObject({status:'open',obligation_id:null});
    expect(openDetail.body.decisions).toEqual([expect.objectContaining({outcome:'insufficient_evidence'})]);
    const passengerEmail=(await verificationPool.query<{email:string}>(
      'SELECT email FROM users WHERE id=$1',[f.first.id])).rows[0].email;
    const passengerSubject=`journey-passenger-${randomUUID()}`;
    await verificationPool.query("INSERT INTO user_profiles(user_id,full_name) VALUES($1,'Journey Passenger')",[f.first.id]);
    await verificationPool.query(`INSERT INTO auth_identities(provider,provider_subject,user_id,provider_email)
      VALUES('supabase',$1,$2,$3)`,[passengerSubject,f.first.id,passengerEmail]);
    setAuthProviderForTests(fakeProvider({subject:passengerSubject,email:passengerEmail,
      emailVerified:true,assuranceLevel:'aal1',userMetadata:{}}));
    const passengerLogin=await request(createApp()).post('/v1/auth/login')
      .send({email:passengerEmail,password:'synthetic'});
    expect(passengerLogin.status).toBe(200);
    const passengerCookie=(passengerLogin.headers['set-cookie'] as string[])
      .map(item=>item.split(';',1)[0]).join('; ');
    const passengerDetail=await request(createApp()).get(`/v1/seat-requests/journey-reviews/${caseId}`)
      .set('Cookie',passengerCookie);
    expect(passengerDetail.body.case).toMatchObject({status:'open',obligation_id:null});
    expect(passengerDetail.body.decisions).toEqual([expect.objectContaining({
      outcome:'insufficient_evidence',contribution_owed:null})]);
    setAuthProviderForTests(fakeProvider({subject,email,emailVerified:true,
      assuranceLevel:'aal2',userMetadata:{}}));
    const first=await post(caseId,key);
    expect(first.status,JSON.stringify(first.body)).toBe(200);
    expect(first.body.operation).toMatchObject({state:'acknowledged',outcome:'interrupted',contribution_owed:true});
    expect((await post(caseId,key)).body.operation.operation_id).toBe(first.body.operation.operation_id);
    expect((await post(caseId,key,{...body,reason:'Changed decision reason'})).status).toBe(409);
    const noTravel=await post(caseBySeat.get(f.allocations[1])!,randomUUID(),{
      outcome:'did_not_travel',contribution_owed:false,
      reason:'Evidence confirms passenger did not travel',evidence_refs:[]});
    const interrupted=await post(caseBySeat.get(f.allocations[2])!,randomUUID(),{
      outcome:'interrupted',contribution_owed:false,
      reason:'Evidence confirms interrupted trip',evidence_refs:[]});
    expect(noTravel.status).toBe(200);
    expect(interrupted.status).toBe(200);
    expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows).toHaveLength(1);
    expect((await verificationPool.query('SELECT operation_id FROM pilot_journey_claims')).rows).toHaveLength(6);
    const original=(await verificationPool.query<{amount_paise:number;due_at:Date}>(
      'SELECT amount_paise,due_at FROM pilot_contribution_obligations WHERE allocation_id=$1',
      [allocation])).rows[0];
    expect(original.amount_paise).toBe(2500);
    await verificationPool.query('DELETE FROM pilot_contribution_obligations WHERE allocation_id=$1',[allocation]);
    await verificationPool.query(`DELETE FROM pilot_email_jobs WHERE event_id IN
      (SELECT id FROM pilot_notification_events WHERE origin_type='journey_review_decision')`);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE origin_type='journey_review_decision'");
    await verificationPool.query("DELETE FROM audit_logs WHERE action='pilot_journey_review_decision'");
    await verificationPool.query('DELETE FROM pilot_journey_review_decisions WHERE review_id=$1',[caseId]);
    await verificationPool.query("UPDATE pilot_journey_reviews SET status='open' WHERE id=$1",[caseId]);
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    const reviews=new JourneyReviewService(pool);
    expect(await reviews.reconcileReceipts(operatorId)).toBe(4);
    const restored=(await verificationPool.query<{amount_paise:number;due_at:Date}>(
      'SELECT amount_paise,due_at FROM pilot_contribution_obligations WHERE allocation_id=$1',
      [allocation])).rows[0];
    expect(restored.amount_paise).toBe(original.amount_paise);
    expect(restored.due_at.toISOString()).toBe(original.due_at.toISOString());
    expect((await verificationPool.query("SELECT status FROM pilot_journey_reviews WHERE id=$1",[caseId])).rows[0].status)
      .toBe('resolved');
    await reviews.verifyEvidence();
  });
  it("serializes conflicting review decisions and rolls back a failed notification",async()=>{
    const f=await fixture();await start(f);
    const allocation=f.allocations[0];
    const journeys=new PilotJourneyService(pool);
    await journeys.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journeys.confirm(f.first.id,randomUUID(),f.offer,allocation,false,false);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_journey_reviews WHERE allocation_id=$1',[allocation])).rows[0].id;
    const service=new JourneyReviewService(pool);
    const owed={outcome:'travelled_completed' as const,contribution_owed:true,
      reason:'Evidence confirms completed passenger travel',evidence_refs:[]};
    await verificationPool.query(`CREATE FUNCTION reject_journey_decision_notification_for_test()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.origin_type='journey_review_decision' THEN RAISE EXCEPTION 'synthetic notification failure'; END IF;
        RETURN NEW; END $$`);
    await verificationPool.query(`CREATE TRIGGER reject_journey_decision_notification_for_test
      BEFORE INSERT ON pilot_notification_events FOR EACH ROW
      EXECUTE FUNCTION reject_journey_decision_notification_for_test()`);
    try{
      await expect(service.decide(f.operator.id,randomUUID(),id,owed)).rejects.toThrow();
      expect((await verificationPool.query('SELECT id FROM pilot_journey_review_decisions')).rows).toHaveLength(0);
      expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows).toHaveLength(0);
      expect((await verificationPool.query('SELECT status FROM pilot_journey_reviews WHERE id=$1',[id])).rows[0].status)
        .toBe('open');
    }finally{
      await verificationPool.query('DROP TRIGGER reject_journey_decision_notification_for_test ON pilot_notification_events');
      await verificationPool.query('DROP FUNCTION reject_journey_decision_notification_for_test()');
    }
    const otherPool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    try{
      const outcomes=await Promise.allSettled([
        new JourneyReviewService(pool).decide(f.operator.id,randomUUID(),id,owed),
        new JourneyReviewService(otherPool).decide(f.operator.id,randomUUID(),id,{
          outcome:'did_not_travel',contribution_owed:false,
          reason:'Conflicting no travel evidence was reviewed',evidence_refs:[]})]);
      expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
      expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);
      expect((await verificationPool.query('SELECT id FROM pilot_journey_review_decisions')).rows).toHaveLength(1);
      expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows.length)
        .toBe((outcomes[0].status==='fulfilled')?1:0);
    }finally{await otherPool.end();}
  });
  it("rejects completion of a future unstarted trip",async()=>{
    const f=await fixture();
    await verificationPool.query(`UPDATE ride_offers SET
      date=((now()+interval '1 day') AT TIME ZONE 'Asia/Kolkata')::date,
      time=((now()+interval '1 day') AT TIME ZONE 'Asia/Kolkata')::time WHERE id=$1`,[f.offer]);
    await expect(new PilotJourneyService(pool).complete(f.driver.id,randomUUID(),f.offer,[]))
      .rejects.toMatchObject({code:'JOURNEY_NOT_STARTED'});
    expect((await verificationPool.query('SELECT id FROM pilot_journey_operations')).rows).toHaveLength(0);
  });
  it("rejects new journey claims after participant approval is revoked",async()=>{
    const f=await fixture();
    await start(f);
    const claims=f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true}));
    await verificationPool.query("UPDATE driver_eligibility SET status='suspended' WHERE user_id=$1",[f.driver.id]);
    const deniedDriver=await request(createApp()).post(`/v1/corridor-offers/${f.offer}/complete`)
      .set('Authorization',`Bearer ${f.driver.token}`).set('Idempotency-Key',randomUUID())
      .send({claims});
    expect(deniedDriver.status).toBe(403);
    await verificationPool.query("UPDATE driver_eligibility SET status='approved' WHERE user_id=$1",[f.driver.id]);
    const completed=await request(createApp()).post(`/v1/corridor-offers/${f.offer}/complete`)
      .set('Authorization',`Bearer ${f.driver.token}`).set('Idempotency-Key',randomUUID())
      .send({claims});
    expect(completed.status).toBe(200);
    await verificationPool.query("UPDATE student_verifications SET status='suspended' WHERE user_id=$1",[f.first.id]);
    const deniedPassenger=await request(createApp()).post(
      `/v1/corridor-offers/${f.offer}/journeys/${f.allocations[0]}/confirm`)
      .set('Authorization',`Bearer ${f.first.token}`).set('Idempotency-Key',randomUUID())
      .send({travelled:true,completed:true});
    expect(deniedPassenger.status).toBe(403);
    expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows).toHaveLength(0);
  });
  it('records direct payment claim without settling until driver receipt, with HTTP retries and deadlines',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    const at=new Date('2026-09-27T10:00:00.000Z');
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})),at);
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true,at);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',[f.allocations[0]])).rows[0].id;
    const app=createApp(),url=`/v1/direct-settlements/${id}`;
    expect((await settlement.detail(f.first.id,id,new Date(at.getTime()+86_400_000-1))).status).toBe('due');
    expect((await settlement.detail(f.first.id,id,new Date(at.getTime()+86_400_000))).status).toBe('overdue');
    expect((await appRequest(f.outsider.token,'claim',{method:'cash'})).status).toBe(403);
    expect((await appRequest(f.driver.token,'claim',{method:'cash'})).status).toBe(403);
    expect((await appRequest(f.first.token,'confirm',{})).status).toBe(403);
    expect((await request(app).post(`/v1/direct-settlements/${randomUUID()}/claim`)
      .set('Authorization',`Bearer ${f.first.token}`).set('Idempotency-Key',randomUUID())
      .send({method:'cash'})).status).toBe(404);
    const key=randomUUID();
    async function appRequest(token:string,action:string,body:object,idempotencyKey=randomUUID()){
      return request(app).post(`${url}/${action}`).set('Authorization',`Bearer ${token}`)
        .set('Idempotency-Key',idempotencyKey).send(body);
    }
    const claim=await appRequest(f.first.token,'claim',{method:'upi'},key);
    expect(claim.status).toBe(200);
    expect((await appRequest(f.first.token,'claim',{method:'upi'},key)).body.operation_id)
      .toBe(claim.body.operation_id);
    expect((await appRequest(f.first.token,'claim',{method:'cash'},key)).status).toBe(409);
    expect((await settlement.detail(f.first.id,id,new Date())).receipt).toBeNull();
    expect((await settlement.detail(f.first.id,id,new Date())).status).toBe('claim_pending');
    const receiptKey=randomUUID();
    const confirmed=await appRequest(f.driver.token,'confirm',{},receiptKey);
    expect(confirmed.status).toBe(200);
    expect((await appRequest(f.driver.token,'confirm',{},receiptKey)).body.operation_id)
      .toBe(confirmed.body.operation_id);
    expect((await appRequest(f.driver.token,'confirm',{})).status).toBe(409);
    expect((await settlement.detail(f.first.id,id)).status).toBe('settled');
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_settlement_operations
      WHERE obligation_id=$1 AND kind='confirm'`,[id])).rows[0].n).toBe(1);
    expect((await verificationPool.query<{amount_paise:number;currency:string}>(
      'SELECT amount_paise,currency FROM pilot_contribution_obligations WHERE id=$1',[id])).rows[0])
      .toEqual({amount_paise:2500,currency:'INR'});
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_notification_events
      WHERE origin_type='pilot_direct_settlement' AND ready_at IS NOT NULL`,[])).rows[0].n).toBe(4);
    await verificationPool.query(`UPDATE pilot_email_jobs SET due_at=now()+interval '1 hour'
      WHERE event_id IN(SELECT id FROM pilot_notification_events WHERE origin_type<>'pilot_direct_settlement')`);
    process.env.REDIS_URL='redis://127.0.0.1:6379';
    const {processDueEmail}=await import('../../../worker/src/jobs/durable-email.job');
    expect(await processDueEmail(verificationPool,{async send(){throw new Error('provider unavailable');}})).toBe(true);
    delete process.env.REDIS_URL;
    expect((await settlement.detail(f.first.id,id)).status).toBe('settled');
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_email_jobs j
      JOIN pilot_notification_events e ON e.id=j.event_id
      WHERE e.origin_type='pilot_direct_settlement' AND j.attempts=1 AND j.status='pending'`)).rows[0].n).toBe(1);
  });
  it('opens review at exact driver silence boundary and preserves claim on dispute',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    const at=new Date('2026-09-27T10:00:00.000Z');
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})),at);
    for(const [index,passenger] of [f.first,f.second].entries())
      await journey.confirm(passenger.id,randomUUID(),f.offer,f.allocations[index],true,true,at);
    const rows=(await verificationPool.query<{id:string;allocation_id:string}>(
      'SELECT id,allocation_id FROM pilot_contribution_obligations')).rows;
    const first=rows.find(x=>x.allocation_id===f.allocations[0])!.id;
    const second=rows.find(x=>x.allocation_id===f.allocations[1])!.id;
    const firstClaimAt=new Date(Date.now()-86_400_000);
    await settlement.mutate(f.first.id,randomUUID(),first,'claim','cash',firstClaimAt);
    await settlement.mutate(f.second.id,randomUUID(),second,'claim','upi');
    const silence=new DirectSettlementSilenceService(pool);
    expect((await silence.sweep(new Date(firstClaimAt.getTime()+86_400_000-1))).opened).toBe(0);
    expect((await silence.sweep(new Date(firstClaimAt.getTime()+86_400_000))).opened).toBe(1);
    await silence.verifyEvidence();
    expect((await silence.sweep(new Date(firstClaimAt.getTime()+86_400_000))).opened).toBe(0);
    expect((await settlement.detail(f.first.id,first,new Date(firstClaimAt.getTime()+86_400_000))).status).toBe('review');
    await expect(settlement.mutate(f.driver.id,randomUUID(),first,'confirm',null,
      new Date(firstClaimAt.getTime()+86_400_000))).rejects.toMatchObject({code:'REVIEW_REQUIRED'});
    expect((await verificationPool.query('SELECT id FROM pilot_settlement_operations WHERE kind=\'confirm\'')).rows)
      .toHaveLength(0);
    // A timely dispute opens review without replacing the passenger's claim or the frozen debt.
    const response=await request(createApp()).post(`/v1/direct-settlements/${second}/dispute`)
      .set('Authorization',`Bearer ${f.driver.token}`).set('Idempotency-Key',randomUUID()).send({});
    expect(response.status).toBe(200);
    expect((await settlement.detail(f.second.id,second)).status).toBe('review');
    const queue=await settlement.openReviews(f.operator.id);
    expect(queue.cases.map((x:{obligation_id:string})=>x.obligation_id)).toContain(second);
    expect((await request(createApp()).get('/v1/operator/settlement-reviews')
      .set('Authorization',`Bearer ${f.first.token}`)).status).toBe(403);
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_notification_events
      WHERE origin_type='pilot_direct_settlement' AND recipient_id=$1 AND event_type='settlement_dispute'
        AND ready_at IS NOT NULL`,[f.operator.id])).rows[0].n).toBe(1);
    expect((await verificationPool.query('SELECT amount_paise,currency FROM pilot_contribution_obligations WHERE id=$1',
      [second])).rows[0]).toEqual({amount_paise:2600,currency:'INR'});
  });
  it('reports participant disputes and keeps owed, receipt, and closure as separate findings',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    const cases=new SettlementCasesService(pool),app=createApp();
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',[f.allocations[0]])).rows[0].id;
    await settlement.mutate(f.first.id,randomUUID(),id,'claim','upi');
    const url=`/v1/direct-settlements/${id}`;
    expect((await request(app).get(`${url}/case`).set('Authorization',`Bearer ${f.outsider.token}`)).status).toBe(404);
    expect((await request(app).post(`${url}/report-dispute`).set('Authorization',`Bearer ${f.outsider.token}`)
      .set('Idempotency-Key',randomUUID()).send({reason:'I did not receive the transfer'})).status).toBe(403);
    const key=randomUUID();
    const report=await request(app).post(`${url}/report-dispute`).set('Authorization',`Bearer ${f.driver.token}`)
      .set('Idempotency-Key',key).send({reason:'I did not receive the transfer'});
    expect(report.status).toBe(200);
    expect((await request(app).post(`${url}/report-dispute`).set('Authorization',`Bearer ${f.driver.token}`)
      .set('Idempotency-Key',key).send({reason:'I did not receive the transfer'})).body.operation.operation_id)
      .toBe(report.body.operation.operation_id);
    expect((await request(app).get(`${url}/case`).set('Authorization',`Bearer ${f.first.token}`)).body
      .claim.method).toBe('upi');
    expect((await cases.queue(f.operator.id)).map((x:{obligation_id:string})=>x.obligation_id)).toContain(id);
    expect((await request(app).post(`/v1/operator/settlement-reviews/${id}/decide`)
      .set('Authorization',`Bearer ${f.operator.token}`).set('Idempotency-Key',randomUUID())
      .send({contribution_owed:true,receipt_established:false,case_resolution:'resolved',
        reason:'Reviewed the claim and driver response',evidence_refs:[],participant_confirmation_id:null})).status)
      .toBe(403);
    const unresolved={kind:'decision' as const,contribution_owed:true,receipt_established:null,
      case_resolution:'unresolved' as const,reason:'Transfer record is inconclusive',
      evidence_refs:[],participant_confirmation_id:null};
    expect((await cases.mutate(f.operator.id,randomUUID(),id,unresolved)).state).toBe('acknowledged');
    expect((await cases.detail(f.first.id,id)).review?.status).toBe('open');
    const resolved={...unresolved,receipt_established:false,case_resolution:'resolved' as const,
      reason:'Reviewed evidence; receipt was not established'};
    const decisionKey=randomUUID();
    const [a,b]=await Promise.allSettled([
      cases.mutate(f.operator.id,decisionKey,id,resolved),
      cases.mutate(f.operator.id,randomUUID(),id,{...resolved,receipt_established:true,
        evidence_refs:['reviewed-transfer-record'],receipt_basis:'reviewed_evidence',
        reviewed_evidence_summary:'Reviewed transfer record against claim'})]);
    expect([a,b].filter(x=>x.status==='fulfilled')).toHaveLength(1);
    if(a.status==='fulfilled') expect((await cases.mutate(f.operator.id,decisionKey,id,resolved)).operation_id)
      .toBe(a.value.operation_id);
    expect((await cases.detail(f.first.id,id)).review?.status).toBe('resolved');
    expect((await verificationPool.query('SELECT id FROM pilot_settlement_operations WHERE obligation_id=$1 AND kind=\'claim\'',[id])).rows).toHaveLength(1);
    expect((await verificationPool.query('SELECT id FROM pilot_settlement_operations WHERE obligation_id=$1 AND kind=\'confirm\'',[id])).rows).toHaveLength(0);
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_notification_events
      WHERE origin_type='pilot_settlement_case' AND ready_at IS NOT NULL`,[])).rows[0].n).toBe(6);
  });
  it('requires current MFA operator authority and receipt evidence in settlement HTTP decisions',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',[f.allocations[0]])).rows[0].id;
    await settlement.mutate(f.first.id,randomUUID(),id,'claim','cash');
    await settlement.mutate(f.driver.id,randomUUID(),id,'dispute');
    const email=`settlement-operator-${randomUUID()}@example.test`;
    const operatorId=(await verificationPool.query<{id:string}>(`INSERT INTO users(email,role,email_verified_at)
      VALUES($1,'admin',now()) RETURNING id`,[email])).rows[0].id;
    await verificationPool.query("INSERT INTO user_profiles(user_id,full_name) VALUES($1,'Settlement Operator')",[operatorId]);
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'settlement test',now())`,[operatorId]);
    await verificationPool.query(`INSERT INTO auth_identities(provider,provider_subject,user_id,provider_email)
      VALUES('supabase','settlement-http-operator',$1,$2)`,[operatorId,email]);
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='supabase',
      legacy_login_enabled=false,authorized_at=now(),authorized_by='integration-test'`);
    setManagedAuthEnabledForTests(true);
    const identity={subject:'settlement-http-operator',email,emailVerified:true,
      assuranceLevel:'aal2' as const,userMetadata:{}};
    setAuthProviderForTests(fakeProvider(identity));
    expect((await verificationPool.query('SELECT user_id,disabled_at FROM auth_identities WHERE provider_subject=$1',
      [identity.subject])).rows).toMatchObject([{user_id:operatorId,disabled_at:null}]);
    const agent=request.agent(createApp());
    const login=await agent.post('/v1/auth/login').send({email,password:'synthetic'});
    expect(login.status).toBe(200);
    const csrf=login.headers['set-cookie']?.find((cookie:string)=>cookie.startsWith('pp_csrf_token='))
      ?.split(';',1)[0]?.split('=',2)[1];
    const cookie=login.headers['set-cookie'].map((item:string)=>item.split(';',1)[0]).join('; ');
    const queue=await agent.get('/v1/operator/settlement-reviews');
    expect(queue.status).toBe(200);
    expect(queue.body.queue.map((x:{obligation_id:string})=>x.obligation_id)).toContain(id);
    expect((await agent.get(`/v1/operator/settlement-reviews/${id}`)).body.claim.method).toBe('cash');
    const url=`/v1/operator/settlement-reviews/${id}/decide`;
    const input={contribution_owed:true,receipt_established:true,case_resolution:'resolved',
      reason:'Reviewed transfer evidence and receipt',evidence_refs:[],participant_confirmation_id:null};
    async function decide(key:string,body:object){return request(createApp()).post(url)
      .set('Cookie',cookie).set('Origin','http://localhost:3000')
      .set('X-CSRF-Token',csrf!).set('Idempotency-Key',key).send(body);}
    expect((await decide(randomUUID(),input)).status).toBe(409);
    setAuthProviderForTests(fakeProvider({...identity,assuranceLevel:'aal1'}));
    expect((await decide(randomUUID(),{...input,evidence_refs:['transfer-proof']})).status).toBe(403);
    setAuthProviderForTests(fakeProvider(identity));
    const key=randomUUID(),body={...input,evidence_refs:['transfer-proof'],
      receipt_basis:'reviewed_evidence',reviewed_evidence_summary:'Reviewed transfer proof with parties'};
    const result=await decide(key,body);
    expect(result.status).toBe(200);
    expect((await decide(key,body)).body.operation.operation_id).toBe(result.body.operation.operation_id);
    expect((await decide(key,{...body,contribution_owed:false})).status).toBe(409);
    expect((await agent.get(`/v1/operator/settlement-reviews/${id}`)).body.decisions[0])
      .toMatchObject({contribution_owed:true,receipt_established:true,case_resolution:'resolved'});
    await verificationPool.query('UPDATE operator_allowlist SET active=false WHERE user_id=$1',[operatorId]);
    expect((await agent.get('/v1/operator/settlement-reviews')).status).toBe(403);
    expect((await decide(key,body)).status).toBe(403);
  });
  it('records not owed without receipt and blocks case acknowledgement when independent evidence is unavailable',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    const cases=new SettlementCasesService(pool);
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',[f.allocations[0]])).rows[0].id;
    await settlement.mutate(f.first.id,randomUUID(),id,'claim','cash');
    await settlement.mutate(f.driver.id,randomUUID(),id,'dispute');
    const command={kind:'decision' as const,contribution_owed:false,receipt_established:false,
      case_resolution:'resolved' as const,reason:'Reviewed journey and payment evidence',
      evidence_refs:['journey-review-record'],participant_confirmation_id:null};
    const path=resolve(directory,'receipts.pilot-settlement-case');
    const {writeFile}=await import('node:fs/promises');
    await writeFile(path,'unavailable');
    await expect(cases.mutate(f.operator.id,randomUUID(),id,command))
      .rejects.toMatchObject({code:'RECOVERY_UNAVAILABLE'});
    expect((await verificationPool.query('SELECT id FROM pilot_settlement_case_operations')).rows).toHaveLength(0);
    expect((await verificationPool.query<{mode:string}>(
      'SELECT mode FROM pilot_recovery_state WHERE singleton=true')).rows[0].mode).toBe('restricted');
    await rm(path,{recursive:true});
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='open',cause=NULL WHERE singleton=true");
    const result=await cases.mutate(f.operator.id,randomUUID(),id,command);
    expect(result.state).toBe('acknowledged');
    const view=await cases.detail(f.first.id,id);
    expect(view.decisions[0]).toMatchObject({contribution_owed:false,receipt_established:false,
      case_resolution:'resolved'});
    expect((await verificationPool.query('SELECT amount_paise FROM pilot_contribution_obligations WHERE id=$1',
      [id])).rows[0].amount_paise).toBe(2500);
  });
  it('returns pending unknown after an uncertain resolution and reconciles its durable receipt once',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    const cases=new SettlementCasesService(pool);
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',[f.allocations[0]])).rows[0].id;
    await settlement.mutate(f.first.id,randomUUID(),id,'claim','cash');
    await settlement.mutate(f.driver.id,randomUUID(),id,'dispute');
    const key=randomUUID(),command={kind:'decision' as const,contribution_owed:true,
      receipt_established:false,case_resolution:'resolved' as const,
      reason:'Reviewed claim and disputed receipt',evidence_refs:[],participant_confirmation_id:null};
    setSettlementCaseAfterReceiptHookForTests(()=>{throw new Error('lost response after receipt');});
    let operationId='';
    try{await cases.mutate(f.operator.id,key,id,command);}catch(error){
      expect(error).toMatchObject({code:'OPERATION_PENDING'});
      operationId=(error as {details:{operationId:string}}).details.operationId;
    }
    expect(operationId).toBeTruthy();
    setSettlementCaseAfterReceiptHookForTests(null);
    expect(await cases.operation(f.operator.id,operationId,true))
      .toEqual({operation_id:operationId,state:'pending_unknown'});
    expect((await verificationPool.query<{mode:string}>(
      'SELECT mode FROM pilot_recovery_state WHERE singleton=true')).rows[0].mode).toBe('restricted');
    expect(await cases.reconcileReceipts(f.operator.id)).toBe(1);
    await cases.verifyEvidence();
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n
      FROM pilot_settlement_case_operations WHERE obligation_id=$1 AND kind='decision'`,[id])).rows[0].n).toBe(1);
    expect((await cases.detail(f.first.id,id)).review?.status).toBe('resolved');
  });
  it('establishes receipt from a recorded driver confirmation and restores a missing silence review',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    const cases=new SettlementCasesService(pool);
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    for(const [index,passenger] of [f.first,f.second].entries())
      await journey.confirm(passenger.id,randomUUID(),f.offer,f.allocations[index],true,true);
    const rows=(await verificationPool.query<{id:string;allocation_id:string}>(
      'SELECT id,allocation_id FROM pilot_contribution_obligations')).rows;
    const first=rows.find(x=>x.allocation_id===f.allocations[0])!.id;
    const second=rows.find(x=>x.allocation_id===f.allocations[1])!.id;
    await settlement.mutate(f.first.id,randomUUID(),first,'claim','upi');
    const confirmation=await settlement.mutate(f.driver.id,randomUUID(),first,'confirm');
    await cases.mutate(f.first.id,randomUUID(),first,{kind:'report',contribution_owed:null,
      receipt_established:null,case_resolution:null,reason:'Driver receipt needs review',
      evidence_refs:[],participant_confirmation_id:null});
    await expect(cases.mutate(f.operator.id,randomUUID(),first,{kind:'decision',
      contribution_owed:true,receipt_established:true,case_resolution:'resolved',
      reason:'Matched recorded driver confirmation',evidence_refs:[],
      participant_confirmation_id:randomUUID(),receipt_basis:'participant_confirmation'}))
      .rejects.toMatchObject({code:'CONFIRMATION_MISSING'});
    const result=await cases.mutate(f.operator.id,randomUUID(),first,{kind:'decision',
      contribution_owed:true,receipt_established:true,case_resolution:'resolved',
      reason:'Matched recorded driver confirmation',evidence_refs:[],
      participant_confirmation_id:confirmation.operation_id,receipt_basis:'participant_confirmation'});
    expect(result.state).toBe('acknowledged');
    expect((await cases.detail(f.first.id,first)).decisions[0].receipt_basis).toBe('participant_confirmation');
    const past=new Date(Date.now()-86_400_100);
    await settlement.mutate(f.second.id,randomUUID(),second,'claim','cash',past);
    const silence=new DirectSettlementSilenceService(pool);
    expect((await silence.sweep(new Date())).opened).toBe(1);
    const decision=await cases.mutate(f.operator.id,randomUUID(),second,{kind:'decision',
      contribution_owed:true,receipt_established:false,case_resolution:'resolved',
      reason:'Claim unanswered after deadline',evidence_refs:[],participant_confirmation_id:null});
    await verificationPool.query('DELETE FROM pilot_settlement_reviews WHERE obligation_id=$1',[second]);
    expect(await cases.reconcileReceipts(f.operator.id)).toBe(3);
    expect((await cases.detail(f.second.id,second)).review?.status).toBe('resolved');
    expect((await verificationPool.query<{id:string}>(`SELECT final_decision_id AS id FROM pilot_settlement_reviews
      WHERE obligation_id=$1`,[second])).rows[0].id).toBe(decision.operation_id);
    await cases.verifyEvidence();
  });
  it('restricts protected settlement writes when independent evidence storage fails',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool);
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',[f.allocations[0]])).rows[0].id;
    const path=resolve(directory,'receipts.pilot-direct-settlement');
    await chmod(path,0o500).catch(async()=>{
      const {mkdir}=await import('node:fs/promises');await mkdir(path);await chmod(path,0o500);
    });
    try{
      const response=await request(createApp()).post(`/v1/direct-settlements/${id}/claim`)
        .set('Authorization',`Bearer ${f.first.token}`).set('Idempotency-Key',randomUUID())
        .send({method:'cash'});
      expect(response.status).toBe(503);
      expect((await verificationPool.query<{mode:string}>(
        'SELECT mode FROM pilot_recovery_state WHERE singleton=true')).rows[0].mode).toBe('restricted');
      expect((await verificationPool.query('SELECT id FROM pilot_settlement_operations')).rows).toHaveLength(0);
    }finally{await chmod(path,0o700);}
  });
  it('reconciles a lost claim operation from independent evidence without declaring receipt',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',[f.allocations[0]])).rows[0].id;
    const claim=await settlement.mutate(f.first.id,randomUUID(),id,'claim','upi');
    await verificationPool.query(`DELETE FROM pilot_email_jobs WHERE event_id IN
      (SELECT id FROM pilot_notification_events WHERE origin_type='pilot_direct_settlement')`);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE origin_type='pilot_direct_settlement'");
    await verificationPool.query("DELETE FROM audit_logs WHERE action='pilot_settlement_claim'");
    await verificationPool.query('DELETE FROM pilot_settlement_operations WHERE id=$1',[claim.operation_id]);
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    expect(await settlement.reconcileReceipts(f.operator.id)).toBe(1);
    expect((await settlement.detail(f.first.id,id)).claim?.method).toBe('upi');
    expect((await settlement.detail(f.first.id,id)).receipt).toBeNull();
    await settlement.verifyEvidence();
  });
  it('restores an acknowledged silence review from independent evidence',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',[f.allocations[0]])).rows[0].id;
    const claimedAt=new Date(Date.now()-86_400_000);
    await settlement.mutate(f.first.id,randomUUID(),id,'claim','cash',claimedAt);
    const silence=new DirectSettlementSilenceService(pool);
    expect((await silence.sweep(new Date(claimedAt.getTime()+86_400_000))).opened).toBe(1);
    const operation=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_settlement_silence_operations WHERE obligation_id=$1',[id])).rows[0].id;
    await verificationPool.query(`DELETE FROM pilot_email_jobs WHERE event_id IN
      (SELECT id FROM pilot_notification_events WHERE origin_type='pilot_settlement_silence')`);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE origin_type='pilot_settlement_silence'");
    await verificationPool.query("DELETE FROM audit_logs WHERE action='pilot_settlement_driver_silence'");
    await verificationPool.query('DELETE FROM pilot_settlement_reviews WHERE silence_operation_id=$1',[operation]);
    await verificationPool.query('DELETE FROM pilot_settlement_silence_operations WHERE id=$1',[operation]);
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    expect(await silence.reconcileReceipts(f.operator.id)).toBe(1);
    await silence.verifyEvidence();
    expect((await settlement.detail(f.first.id,id)).review?.reason).toBe('driver_silence');
  });
});

describe("ticket 21 revocation holds and incidents",()=>{
  let directory:string;
  beforeEach(async()=>{
    await verificationPool.query("TRUNCATE users CASCADE");
    await verificationPool.query(`INSERT INTO pilot_recovery_state(singleton,mode) VALUES(true,'open')
      ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL,started_at=NULL`);
    await verificationPool.query("UPDATE pilot_pause_state SET paused=false,operation_id=NULL");
    directory=await mkdtemp(resolve(tmpdir(),"pilot-revocation-"));
    Object.assign(process.env,{PILOT_RECEIPT_PATH:resolve(directory,"receipts"),
      PILOT_RECEIPT_SECRET:"pilot-revocation-independent-evidence-secret",
      PILOT_CONFLICT_POLICY_APPROVED:"true",PILOT_EXPECTED_TRIP_MINUTES:"35",
      PILOT_CONFLICT_BUFFER_MINUTES:"20",PILOT_SUPPORT_WINDOW_APPROVED:"true",
      PILOT_SUPPORT_WINDOW_START:new Date(Date.now()-60*60_000).toISOString(),
      PILOT_SUPPORT_WINDOW_END:new Date(Date.now()+24*60*60_000).toISOString()});
  });
  afterEach(async()=>{
    setManagedAuthEnabledForTests(null);
    setAuthProviderForTests(null);
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='legacy',
      legacy_login_enabled=true,authorized_at=NULL,authorized_by=NULL WHERE singleton=true`);
    for(const name of ["PILOT_RECEIPT_PATH","PILOT_RECEIPT_SECRET","PILOT_CONFLICT_POLICY_APPROVED",
      "PILOT_EXPECTED_TRIP_MINUTES","PILOT_CONFLICT_BUFFER_MINUTES","PILOT_SUPPORT_WINDOW_APPROVED",
      "PILOT_SUPPORT_WINDOW_START","PILOT_SUPPORT_WINDOW_END"]) delete process.env[name];
    await rm(directory,{recursive:true,force:true});
  });
  async function actor(label:string,operator=false) {
    const id=(await verificationPool.query<{id:string}>(`INSERT INTO users(email,role,email_verified_at)
      VALUES($1,$2,now()) RETURNING id`,[`${label}-${randomUUID()}@example.test`,operator?"admin":"user"])).rows[0].id;
    if(operator) await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'synthetic operator',now())`,[id]);
    else await verificationPool.query(`INSERT INTO student_verifications
      (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
      VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[id]);
    return id;
  }
  async function fixture() {
    const operator=await actor("revocation-operator",true);
    const driver=await actor("revocation-driver");
    const passenger=await actor("revocation-passenger");
    const other=await actor("revocation-other");
    await verificationPool.query(`INSERT INTO driver_eligibility
      (user_id,status,license_expires_at,review_after)
      VALUES($1,'approved',CURRENT_DATE+100,CURRENT_DATE+100)`,[driver]);
    const car=(await verificationPool.query<{id:string}>(`INSERT INTO vehicles
      (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,use_category,
       applicable_document_required,insurance_expires_at,review_after,verification_status)
      VALUES($1,'car','1234',3,'private',false,CURRENT_DATE+100,CURRENT_DATE+100,'approved')
      RETURNING id`,[driver])).rows[0].id;
    await verificationPool.query(`INSERT INTO driver_vehicle_approvals
      (driver_user_id,vehicle_id,permission_category,status,review_after)
      VALUES($1,$2,'owner','approved',CURRENT_DATE+100)`,[driver,car]);
    const ride=(await verificationPool.query<{id:string}>(`INSERT INTO ride_offers
      (driver_id,vehicle_id,pickup_location,pickup_lat,pickup_lng,drop_location,
       drop_lat,drop_lng,date,time,available_seats,price_per_seat_paise,status,
       pilot_policy_id,pilot_policy_snapshot,pilot_origin_code,pilot_destination_code,
       pilot_capacity,pilot_currency,pilot_request_cutoff_at,pilot_acceptance_cutoff_at,
       pilot_commitment_until)
      VALUES($1,$2,'University',20,77,'College',20.1,77.1,
       ((now()+interval '2 hours') AT TIME ZONE 'Asia/Kolkata')::date,
       ((now()+interval '2 hours') AT TIME ZONE 'Asia/Kolkata')::time,
       2,2500,'active',(SELECT id FROM pilot_corridor_policies WHERE version=1),
       '{"version":1}'::jsonb,'university','prmitr',2,'INR',
       now()+interval '1 hour',now()+interval '90 minutes',now()+interval '3 hours')
      RETURNING id`,[driver,car])).rows[0].id;
    return {operator,driver,passenger,other,car,ride};
  }
  async function requestAndAccept(driver:string,passenger:string,ride:string) {
    const requests=new SeatRequestsService(verificationPool);
    const requested=await requests.mutate(passenger,randomUUID(),"requested",ride);
    const requestId=(requested.request as {id:string}).id;
    const accepted=await requests.mutate(driver,randomUUID(),"accepted",requestId);
    return {requestId,allocationId:(accepted.booking as {id:string}).id};
  }
  it("holds a revoked passenger's future seat, preserves capacity, audits retries and limits operator access",async()=>{
    const {operator,driver,passenger,other,ride}=await fixture();
    await verificationPool.query(`INSERT INTO user_profiles(user_id,full_name,phone)
      VALUES($1,'Synthetic Passenger','1111111111')`,[passenger]);
    await verificationPool.query("UPDATE user_profiles SET phone='2222222222' WHERE user_id=$1",[passenger]);
    const {allocationId,requestId}=await requestAndAccept(driver,passenger,ride);
    const service=new StudentRevocationService(verificationPool);
    const first=await service.revoke(operator,"revoke-passenger",passenger,"Enrollment approval withdrawn for safety review");
    expect((await service.revoke(operator,"revoke-passenger",passenger,"Enrollment approval withdrawn for safety review")).operation_id)
      .toBe(first.operation_id);
    await expect(service.revoke(operator,"revoke-passenger",passenger,"Changed reason after decision"))
      .rejects.toMatchObject({code:"IDEMPOTENCY_PAYLOAD_MISMATCH"});
    expect((await verificationPool.query("SELECT status FROM pilot_seat_allocations WHERE id=$1",[allocationId])).rows[0].status)
      .toBe("held");
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_seat_allocations
      WHERE offer_id=$1 AND status IN ('confirmed','held')`,[ride])).rows[0].n).toBe(1);
    expect((await new SeatRequestsService(verificationPool).confirmed(passenger)).some(row=>row.id===allocationId)).toBe(true);
    expect((await verificationPool.query("SELECT status FROM ride_offers WHERE id=$1",[ride])).rows[0].status).toBe("active");
    await expect(new StudentRevocationService(verificationPool).revoke(other,"other-revoke",driver,"Unauthorized safety action"))
      .rejects.toMatchObject({code:"OPERATOR_ACCESS_REVOKED"});
    const cases=await new RevocationCasesService(verificationPool).receipts();
    expect(cases).toEqual([]);
    const held=(await verificationPool.query<{id:string}>(`SELECT id FROM pilot_revocation_holds
      WHERE allocation_id=$1`,[allocationId])).rows[0].id;
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM audit_logs
      WHERE entity_id=$1 AND action='pilot_revocation_hold_created'`,[held])).rows[0].n).toBe(1);
    const caseService=new RevocationCasesService(verificationPool);
    await expect(caseService.decide(operator,"premature-resolution",{caseType:"hold",caseId:held,
      action:"resolve",outcome:"cancelled",reason:"No recorded cancellation yet",recipientIds:[]}))
      .rejects.toMatchObject({code:"OUTREACH_REQUIRED"});
    await caseService.decide(operator,"passenger-only-outreach",{caseType:"hold",caseId:held,
      action:"outreach",outcome:null,reason:"Contacted the passenger",recipientIds:[passenger]});
    await expect(caseService.decide(operator,"partial-outreach-resolution",{caseType:"hold",caseId:held,
      action:"resolve",outcome:"cancelled",reason:"Driver has not been contacted",recipientIds:[]}))
      .rejects.toMatchObject({code:"OUTREACH_REQUIRED"});
    await caseService.decide(operator,"outreach",{caseType:"hold",caseId:held,action:"outreach",
      outcome:null,reason:"Contacted the driver and passenger about the held seat",
      recipientIds:[driver,passenger]});
    await expect(caseService.decide(operator,"still-held",{caseType:"hold",caseId:held,
      action:"resolve",outcome:"cancelled",reason:"No recorded cancellation yet",recipientIds:[]}))
      .rejects.toMatchObject({code:"CANCELLATION_REQUIRED"});
    await new CancellationsService(verificationPool).cancel(passenger,"cancel-held", "request",requestId,
      "Passenger cancelled after eligibility review");
    const resolved=await caseService.decide(operator,"resolve-held",{caseType:"hold",caseId:held,
      action:"resolve",outcome:"cancelled",reason:"Passenger cancellation was recorded",recipientIds:[]});
    expect((await caseService.decide(operator,"resolve-held",{caseType:"hold",caseId:held,
      action:"resolve",outcome:"cancelled",reason:"Passenger cancellation was recorded",recipientIds:[]})).operation_id)
      .toBe(resolved.operation_id);
    expect((await verificationPool.query("SELECT status FROM pilot_seat_allocations WHERE id=$1",[allocationId])).rows[0].status)
      .toBe("cancelled");
  });
  it("serializes student revocation with acceptance and departure on separate connections",async()=>{
    const {operator,driver,passenger,ride}=await fixture();
    const requested=await new SeatRequestsService(verificationPool).mutate(passenger,"race-request","requested",ride);
    const requestId=(requested.request as {id:string}).id;
    const first=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    const second=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    try {
      const outcomes=await Promise.allSettled([
        new StudentRevocationService(first).revoke(operator,"race-revoke",passenger,
          "Enrollment approval withdrawn during acceptance"),
        new SeatRequestsService(second).mutate(driver,"race-accept","accepted",requestId),
      ]);
      expect(outcomes[0].status).toBe("fulfilled");
      if(outcomes[1].status==="rejected") expect((outcomes[1].reason as {code:string}).code)
        .toBe("STUDENT_VERIFICATION_INACTIVE");
      expect((await verificationPool.query("SELECT status FROM student_verifications WHERE user_id=$1",[passenger])).rows[0].status)
        .toBe("suspended");
      const allocation=(await verificationPool.query<{status:string}>(`SELECT status FROM pilot_seat_allocations
        WHERE request_id=$1`,[requestId])).rows[0];
      expect(allocation?.status).not.toBe("confirmed");
    } finally {await Promise.all([first.end(),second.end()]);}

    const active=await fixture();
    const accepted=await requestAndAccept(active.driver,active.passenger,active.ride);
    await verificationPool.query(`UPDATE ride_offers SET
      date=((now()+interval '5 minutes') AT TIME ZONE 'Asia/Kolkata')::date,
      time=((now()+interval '5 minutes') AT TIME ZONE 'Asia/Kolkata')::time,
      pilot_commitment_until=now()+interval '60 minutes' WHERE id=$1`,[active.ride]);
    const revocationDb=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    const departureDb=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    try {
      const outcomes=await Promise.allSettled([
        new StudentRevocationService(revocationDb).revoke(active.operator,"depart-race-revoke",
          active.passenger,"Enrollment approval withdrawn during departure"),
        new PilotDepartureService(departureDb).start(active.driver,"depart-race-start",
          active.ride,[accepted.allocationId]),
      ]);
      expect(outcomes[0].status).toBe("fulfilled");
      if(outcomes[1].status==="rejected") expect([
        "PASSENGER_VERIFICATION_INACTIVE","BOOKING_HELD","DEPARTURE_INVALID",
      ]).toContain((outcomes[1].reason as {code:string}).code);
      const rideState=(await verificationPool.query<{status:string}>(
        "SELECT status FROM ride_offers WHERE id=$1",[active.ride])).rows[0].status;
      const held=(await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_revocation_holds
        WHERE offer_id=$1`,[active.ride])).rows[0].n;
      const incidents=(await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_revocation_incidents
        WHERE offer_id=$1 AND priority='high'`,[active.ride])).rows[0].n;
      expect(rideState==="departed" ? incidents : held).toBe(1);
      expect(rideState==="departed" ? held : incidents).toBe(0);
    } finally {await Promise.all([revocationDb.end(),departureDb.end()]);}
  });
  it("holds a future driver ride and creates an operator-visible incident for an active car revocation",async()=>{
    const {operator,driver,passenger,car,ride}=await fixture();
    const accepted=await requestAndAccept(driver,passenger,ride);
    const reviews=new DriverCarReviewService(verificationPool);
    await reviews.decide(operator,"driver-revocation","driver",driver,{
      outcome:"revoked",reason:"Driving approval suspended for safety",review_after:null});
    expect((await verificationPool.query("SELECT status FROM ride_offers WHERE id=$1",[ride])).rows[0].status)
      .toBe("held");
    expect((await verificationPool.query("SELECT status FROM pilot_seat_allocations WHERE id=$1",[accepted.allocationId])).rows[0].status)
      .toBe("confirmed");
    await expect(new PilotDepartureService(verificationPool).start(driver,"held-departure",ride,
      [accepted.allocationId])).rejects.toMatchObject({code:"DEPARTURE_INVALID"});
    const active=await fixture();
    await requestAndAccept(active.driver,active.passenger,active.ride);
    await verificationPool.query("UPDATE ride_offers SET status='departed' WHERE id=$1",[active.ride]);
    await reviews.decide(active.operator,"car-revocation","vehicle",active.car,{
      outcome:"revoked",reason:"Insurance safety concern during active trip",review_after:null});
    const incident=(await verificationPool.query<{id:string;priority:string}>(`SELECT id,priority
      FROM pilot_revocation_incidents WHERE offer_id=$1`,[active.ride])).rows[0];
    expect(incident.priority).toBe("high");
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM audit_logs
      WHERE entity_id=$1 AND action='pilot_revocation_incident_created'`,[incident.id])).rows[0].n).toBe(1);
    const notice=(await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_notification_events
      WHERE related_entity_id=$1 AND origin_type='pilot_revocation' AND ready_at IS NOT NULL`,[incident.id])).rows[0].n;
    expect(notice).toBeGreaterThanOrEqual(1);
    expect((await new SeatRequestsService(verificationPool).confirmed(active.passenger)).some(row=>row.offer_id===active.ride))
      .toBe(true);
    const cases=await new RevocationCasesService(verificationPool).decide(active.operator,"incident-outreach",{
      caseType:"incident",caseId:incident.id,action:"outreach",outcome:null,
      reason:"Contacted the driver and confirmed passenger about safety",
      recipientIds:[active.driver,active.passenger]});
    expect(cases.state).toBe("acknowledged");
    await expect(new RevocationCasesService(verificationPool).decide(active.operator,"incident-too-early",{
      caseType:"incident",caseId:incident.id,action:"resolve",outcome:"interrupted",
      reason:"Trip outcome has not been reported",recipientIds:[]}))
      .rejects.toMatchObject({code:"TRIP_OUTCOME_REQUIRED"});
    await new CancellationsService(verificationPool).reportInterruption(active.driver,
      "incident-interruption",active.ride,"Passenger reported a safety interruption");
    const closed=await new RevocationCasesService(verificationPool).decide(active.operator,"incident-close",{
      caseType:"incident",caseId:incident.id,action:"resolve",outcome:"interrupted",
      reason:"Operator documented interruption after outreach",recipientIds:[]});
    expect(closed.state).toBe("acknowledged");
    expect((await verificationPool.query("SELECT status FROM ride_offers WHERE id=$1",[active.ride])).rows[0].status)
      .toBe("departed");
    expect((await verificationPool.query("SELECT resolution FROM pilot_revocation_incidents WHERE id=$1",[incident.id])).rows[0].resolution)
      .toBe("interrupted");
  });
  it("serializes driver revocation against acceptance on separate connections",async()=>{
    const {operator,driver,passenger,ride}=await fixture();
    const pending=await new SeatRequestsService(verificationPool).mutate(passenger,"driver-race-request","requested",ride);
    const id=(pending.request as {id:string}).id;
    const reviewDb=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    const acceptDb=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    try {
      const outcomes=await Promise.allSettled([
        new DriverCarReviewService(reviewDb).decide(operator,"driver-race-revoke","driver",driver,{
          outcome:"revoked",reason:"Driving approval suspended during acceptance",review_after:null}),
        new SeatRequestsService(acceptDb).mutate(driver,"driver-race-accept","accepted",id),
      ]);
      expect(outcomes[0].status).toBe("fulfilled");
      if(outcomes[1].status==="rejected") expect([
        "DRIVER_CAR_NOT_APPROVED","ACCEPTANCE_WINDOW_CLOSED",
      ]).toContain((outcomes[1].reason as {code:string}).code);
      expect((await verificationPool.query("SELECT status FROM ride_offers WHERE id=$1",[ride])).rows[0].status)
        .toBe("held");
      const seats=(await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_seat_allocations
        WHERE offer_id=$1 AND status IN ('confirmed','held')`,[ride])).rows[0].n;
      expect(seats).toBeLessThanOrEqual(1);
    } finally {await Promise.all([reviewDb.end(),acceptDb.end()]);}
  });
  it("holds future offers when student driving approval or the car is revoked",async()=>{
    const studentDriver=await fixture();
    await requestAndAccept(studentDriver.driver,studentDriver.passenger,studentDriver.ride);
    await new StudentRevocationService(verificationPool).revoke(studentDriver.operator,
      "student-driver-revoked",studentDriver.driver,"Student driving eligibility withdrawn");
    expect((await verificationPool.query("SELECT status FROM ride_offers WHERE id=$1",[studentDriver.ride])).rows[0].status)
      .toBe("held");
    const carDriver=await fixture();
    await requestAndAccept(carDriver.driver,carDriver.passenger,carDriver.ride);
    await new DriverCarReviewService(verificationPool).decide(carDriver.operator,"future-car-revoked",
      "vehicle",carDriver.car,{outcome:"revoked",reason:"Car insurance approval withdrawn",review_after:null});
    expect((await verificationPool.query("SELECT status FROM ride_offers WHERE id=$1",[carDriver.ride])).rows[0].status)
      .toBe("held");
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_seat_allocations
      WHERE offer_id=$1 AND status IN ('confirmed','held')`,[carDriver.ride])).rows[0].n).toBe(1);
  });
  it("shows holds only to a current MFA operator and keeps failed email work retryable",async()=>{
    const {operator,driver,passenger,ride}=await fixture();
    await requestAndAccept(driver,passenger,ride);
    await new StudentRevocationService(verificationPool).revoke(operator,"visibility-revoke",passenger,
      "Student eligibility suspended for operator visibility test");
    const hold=(await verificationPool.query<{id:string}>(`SELECT id FROM pilot_revocation_holds
      WHERE offer_id=$1`,[ride])).rows[0].id;
    const email=(await verificationPool.query<{status:string}>(`SELECT j.status FROM pilot_email_jobs j
      JOIN pilot_notification_events e ON e.id=j.event_id
      WHERE e.related_entity_id=$1 LIMIT 1`,[hold])).rows[0];
    expect(email.status).toBe("pending");
    expect((await request(createApp()).get("/v1/operator/revocation-cases")).status).toBe(401);
    const emailAddress=(await verificationPool.query<{email:string}>("SELECT email FROM users WHERE id=$1",[operator])).rows[0].email;
    await verificationPool.query("INSERT INTO user_profiles(user_id,full_name) VALUES($1,'Pilot Operator')",[operator]);
    const subject=`operator-${randomUUID()}`;
    await verificationPool.query(`INSERT INTO auth_identities
      (provider,provider_subject,user_id,provider_email)
      VALUES('supabase',$1,$2,$3)`,[subject,operator,emailAddress]);
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='supabase',
      legacy_login_enabled=false,authorized_at=now(),authorized_by='integration-test'
      WHERE singleton=true`);
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({subject,email:emailAddress,emailVerified:true,
      assuranceLevel:"aal2",userMetadata:{}}));
    const agent=request.agent(createApp());
    const login=await agent.post("/v1/auth/login").send({email:emailAddress,password:"synthetic-password"});
    expect(login.status).toBe(200);
    const visible=await agent.get("/v1/operator/revocation-cases");
    expect(visible.status).toBe(200);
    expect(visible.body.holds.some((item:{id:string})=>item.id===hold)).toBe(true);
    setAuthProviderForTests(fakeProvider({subject,email:emailAddress,emailVerified:true,
      assuranceLevel:"aal1",userMetadata:{}}));
    const noMfa=await agent.get("/v1/operator/revocation-cases");
    expect(noMfa.status).toBe(403);
    expect(noMfa.body.error.code).toBe("MFA_REQUIRED");
    setAuthProviderForTests(fakeProvider({subject,email:emailAddress,emailVerified:true,
      assuranceLevel:"aal2",userMetadata:{}}));
    await verificationPool.query("UPDATE operator_allowlist SET active=false WHERE user_id=$1",[operator]);
    const denied=await agent.get("/v1/operator/revocation-cases");
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("OPERATOR_ACCESS_REVOKED");
  });
  it("replays a revoked and later cancelled seat from independent receipts without releasing capacity early",async()=>{
    const {operator,driver,passenger,ride}=await fixture();
    const {allocationId,requestId}=await requestAndAccept(driver,passenger,ride);
    const student=new StudentRevocationService(verificationPool);
    const cases=new RevocationCasesService(verificationPool);
    const revoked=await student.revoke(operator,"recovery-revoke",passenger,
      "Enrollment evidence withdrawn pending safety review");
    const hold=(await verificationPool.query<{id:string}>(`SELECT id FROM pilot_revocation_holds
      WHERE allocation_id=$1`,[allocationId])).rows[0].id;
    await cases.decide(operator,"recovery-outreach",{caseType:"hold",caseId:hold,
      action:"outreach",outcome:null,reason:"Contacted driver and passenger about the held seat",
      recipientIds:[driver,passenger]});
    await new CancellationsService(verificationPool).cancel(passenger,"recovery-cancel","request",requestId,
      "Passenger cancelled after safety review");
    await cases.decide(operator,"recovery-resolve",{caseType:"hold",caseId:hold,
      action:"resolve",outcome:"cancelled",reason:"Recorded passenger cancellation",recipientIds:[]});
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    await verificationPool.query("DELETE FROM pilot_revocation_case_operations");
    await verificationPool.query("DELETE FROM pilot_revocation_holds");
    await verificationPool.query("DELETE FROM pilot_student_revocations WHERE id=$1",[revoked.operation_id]);
    await verificationPool.query("UPDATE student_verifications SET status='verified' WHERE user_id=$1",[passenger]);
    expect(await student.reconcileReceipts(operator)).toBe(1);
    expect(await cases.reconcileReceipts(operator)).toBe(2);
    expect((await verificationPool.query("SELECT status FROM student_verifications WHERE user_id=$1",[passenger])).rows[0].status)
      .toBe("suspended");
    expect((await verificationPool.query("SELECT status FROM pilot_seat_allocations WHERE id=$1",[allocationId])).rows[0].status)
      .toBe("cancelled");
    expect((await verificationPool.query("SELECT resolution FROM pilot_revocation_holds WHERE id=$1",[hold])).rows[0].resolution)
      .toBe("cancelled");
  });
});

describe("pilot departure and boarding",()=>{
  it("enforces exact window boundaries, confirmed boarding, idempotency and frozen contribution",async()=>{
    const directory=await mkdtemp(resolve(tmpdir(),"pilot-departure-"));
    Object.assign(process.env,{PILOT_RECEIPT_PATH:resolve(directory,"receipts"),
      PILOT_RECEIPT_SECRET:"pilot-departure-independent-secret",PILOT_CONFLICT_POLICY_APPROVED:"true",
      PILOT_EXPECTED_TRIP_MINUTES:"35",PILOT_CONFLICT_BUFFER_MINUTES:"20",
      PILOT_SUPPORT_WINDOW_APPROVED:"true",PILOT_SUPPORT_WINDOW_START:new Date(Date.now()-60_000).toISOString(),
      PILOT_SUPPORT_WINDOW_END:new Date(Date.now()+30*24*60*60_000).toISOString()});
    try {
      const actors=await Promise.all(["driver","passenger","outsider"].map(async label=>{
        const email=`departure-${label}-${randomUUID()}@example.test`;
        const id=(await verificationPool.query<{id:string}>(
          "INSERT INTO users(email,email_verified_at) VALUES($1,now()) RETURNING id",[email])).rows[0].id;
        await verificationPool.query(`INSERT INTO student_verifications
          (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
          VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[id]);
        return {id,token:signAccessToken({userId:id,email,role:"user"})};
      }));
      const [driver,passenger,outsider]=actors;
      await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
        VALUES($1,'approved','2099-12-31','2099-12-30')`,[driver.id]);
      const car=(await verificationPool.query<{id:string}>(`INSERT INTO vehicles
        (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,status,verification_status,
         use_category,applicable_document_required,insurance_expires_at,review_after)
        VALUES($1,'car','9876',2,'active','approved','private',true,'2099-12-31','2099-12-30') RETURNING id`,
        [driver.id])).rows[0].id;
      await verificationPool.query(`INSERT INTO driver_vehicle_approvals
        (driver_user_id,vehicle_id,permission_category,status,review_after)
        VALUES($1,$2,'owner','approved','2099-12-30')`,[driver.id,car]);
      const departure=new Date(Date.now()+3*24*60*60_000);
      while(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure)==="Sun")
        departure.setUTCDate(departure.getUTCDate()+1);
      departure.setUTCHours(5,0,0,0);
      const publish=await request(createApp()).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",randomUUID())
        .send({vehicle_id:car,origin_code:"university",destination_code:"prmitr",
          departure_at:departure.toISOString(),capacity:2});
      expect(publish.status,JSON.stringify(publish.body)).toBe(201);
      const offerId=publish.body.offer.id as string;
      const ask=await request(createApp()).post("/v1/seat-requests")
        .set("Authorization",`Bearer ${passenger.token}`).set("Idempotency-Key",randomUUID())
        .send({offer_id:offerId,seats:1});
      expect(ask.status).toBe(201);
      const accept=await request(createApp()).post(`/v1/seat-requests/${ask.body.request.id}/accept`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",randomUUID()).send({});
      expect(accept.status,JSON.stringify(accept.body)).toBe(200);
      const allocation=(await verificationPool.query<{id:string;contribution_paise:number}>(`
        SELECT id,contribution_paise FROM pilot_seat_allocations WHERE offer_id=$1`,[offerId])).rows[0];
      const service=new PilotDepartureService(pool);
      const at=departure.getTime();
      await expect(service.start(driver.id,randomUUID(),offerId,[allocation.id],"departure",null,
        new Date(at-15*60_000-1))).rejects.toMatchObject({code:"DEPARTURE_WINDOW_CLOSED"});
      await expect(service.start(driver.id,randomUUID(),offerId,[randomUUID()],"departure",null,
        new Date(at-15*60_000))).rejects.toMatchObject({code:"BOARDING_INVALID"});
      await expect(service.start(outsider.id,randomUUID(),offerId,[allocation.id],"departure",null,
        new Date(at-15*60_000))).rejects.toMatchObject({code:"FORBIDDEN"});
      const key=randomUUID();
      const started=await service.start(driver.id,key,offerId,[allocation.id],"departure",null,
        new Date(at-15*60_000));
      expect(started.state).toBe("acknowledged");
      expect((await service.start(driver.id,key,offerId,[allocation.id])).operation_id).toBe(started.operation_id);
      await expect(service.start(driver.id,randomUUID(),offerId,[allocation.id],"departure",null,
        new Date(at))).rejects.toMatchObject({code:"DEPARTURE_INVALID"});
      expect((await verificationPool.query<{count:string}>(
        "SELECT count(*) FROM pilot_departure_boarding WHERE allocation_id=$1 AND boarded=true",
        [allocation.id])).rows[0].count).toBe("1");
      expect((await verificationPool.query<{contribution_paise:number}>(
        "SELECT contribution_paise FROM pilot_seat_allocations WHERE id=$1",[allocation.id])).rows[0].contribution_paise)
        .toBe(allocation.contribution_paise);
      expect((await verificationPool.query<{count:string}>(`SELECT count(*) FROM pilot_notification_events
        WHERE origin_type='pilot_departure' AND operation_id=$1 AND ready_at IS NOT NULL`,
        [started.operation_id])).rows[0].count).toBe("2");
      expect((await verificationPool.query<{count:string}>(`SELECT count(*) FROM pilot_email_jobs j
        JOIN pilot_notification_events e ON e.id=j.event_id
        WHERE e.operation_id=$1 AND e.origin_type='pilot_departure' AND j.status='pending'`,
        [started.operation_id])).rows[0].count).toBe("2");
      const trip=await request(createApp()).get(`/v1/seat-requests/confirmed/${offerId}`)
        .set("Authorization",`Bearer ${passenger.token}`);
      expect(trip.body.trip.bookings[0]).toMatchObject({trip_state:"departed",boarded:true});
      const afterStartCancel=await request(createApp()).post(`/v1/seat-requests/${ask.body.request.id}/cancel`)
        .set("Authorization",`Bearer ${passenger.token}`).set("Idempotency-Key",randomUUID())
        .send({reason:"Could not finish the trip"});
      expect(afterStartCancel.status).toBe(202);
      expect(afterStartCancel.body.kind).toBe("review_required");
      const interruption=await request(createApp()).post(`/v1/corridor-offers/${offerId}/interruption`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",randomUUID())
        .send({reason:"Vehicle stopped unexpectedly"});
      expect(interruption.status).toBe(202);
      expect(interruption.body.kind).toBe("review_required");
      expect((await verificationPool.query<{status:string}>("SELECT status FROM ride_offers WHERE id=$1",
        [offerId])).rows[0].status).toBe("departed");
      const nextDay=(from:Date)=>{
        const value=new Date(from.getTime()+24*60*60_000);
        while(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(value)==="Sun")
          value.setUTCDate(value.getUTCDate()+1);
        return value;
      };
      const publishAnother=async(date:Date)=>{
        const response=await request(createApp()).post("/v1/corridor-offers")
          .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",randomUUID())
          .send({vehicle_id:car,origin_code:"university",destination_code:"prmitr",
            departure_at:date.toISOString(),capacity:2});
        expect(response.status,JSON.stringify(response.body)).toBe(201);
        return response.body.offer.id as string;
      };
      const boundary=nextDay(departure);
      const boundaryId=await publishAnother(boundary);
      const boundaryRequest=await request(createApp()).post("/v1/seat-requests")
        .set("Authorization",`Bearer ${passenger.token}`).set("Idempotency-Key",randomUUID())
        .send({offer_id:boundaryId,seats:1});
      expect(boundaryRequest.status).toBe(201);
      const boundaryAccept=await request(createApp()).post(`/v1/seat-requests/${boundaryRequest.body.request.id}/accept`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",randomUUID()).send({});
      expect(boundaryAccept.status).toBe(200);
      await expect(service.start(driver.id,randomUUID(),boundaryId,[],"departure",null,
        new Date(boundary.getTime()+30*60_000+1))).rejects.toMatchObject({code:"DEPARTURE_WINDOW_CLOSED"});
      await expect(service.start(driver.id,randomUUID(),boundaryId,[],"departure",null,
        new Date(boundary.getTime()+30*60_000))).rejects.toMatchObject({code:"ACTIVE_TRIP_CONFLICT"});
      await verificationPool.query("UPDATE ride_offers SET status='completed' WHERE id=$1",[offerId]);
      const absent=await service.start(driver.id,randomUUID(),boundaryId,[],"departure",null,
        new Date(boundary.getTime()+30*60_000));
      expect(absent.state).toBe("acknowledged");
      expect((await verificationPool.query<{count:string}>(`SELECT count(*) FROM pilot_departure_review_signals
        WHERE operation_id=$1 AND signal_type='absence'`,[absent.operation_id])).rows[0].count).toBe("1");
      await verificationPool.query("UPDATE ride_offers SET status='completed' WHERE id=$1",[boundaryId]);
      const delayed=nextDay(boundary);
      const delayedId=await publishAnother(delayed);
      const afterWindow=new Date(delayed.getTime()+30*60_000+1);
      expect((await notifyDelayedPilotRides(verificationPool,afterWindow)).delayed).toBeGreaterThan(0);
      expect((await notifyDelayedPilotRides(verificationPool,afterWindow)).delayed).toBe(0);
      expect((await verificationPool.query<{status:string}>("SELECT status FROM ride_offers WHERE id=$1",
        [delayedId])).rows[0].status).toBe("active");
      const laterDate=new Date(delayed.getTime()+2*60*60_000);
      const laterId=await publishAnother(laterDate);
      const operatorId=(await verificationPool.query<{id:string}>(
        "INSERT INTO users(email,role,email_verified_at) VALUES($1,'admin',now()) RETURNING id",
        [`departure-operator-${randomUUID()}@example.test`])).rows[0].id;
      await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
        VALUES($1,true,'synthetic late departure',now())`,[operatorId]);
      await verificationPool.query("UPDATE driver_eligibility SET status='suspended' WHERE user_id=$1",[driver.id]);
      await expect(service.start(operatorId,randomUUID(),delayedId,[],"late_departure",
        "Operator reviewed delay",afterWindow)).rejects.toMatchObject({code:"DRIVER_CAR_NOT_APPROVED"});
      await verificationPool.query("UPDATE driver_eligibility SET status='approved' WHERE user_id=$1",[driver.id]);
      await expect(service.start(operatorId,randomUUID(),delayedId,[],"late_departure",
        "Operator reviewed delay",new Date(delayed.getTime()+90*60_000)))
        .rejects.toMatchObject({code:"COMMITMENT_CONFLICT"});
      expect((await new CancellationsService().cancel(driver.id,randomUUID(),"offer",laterId,
        "Later ride no longer needed")).kind).toBe("cancelled");
      const late=await service.start(operatorId,randomUUID(),delayedId,[],"late_departure",
        "Operator reviewed delay",afterWindow);
      expect(late.state).toBe("acknowledged");
      expect((await verificationPool.query<{count:string}>(`SELECT count(*) FROM audit_logs
        WHERE action='pilot_late_departure' AND entity_id=$1`,[delayedId])).rows[0].count).toBe("1");
      await verificationPool.query("UPDATE ride_offers SET status='completed' WHERE id=$1",[delayedId]);
      const raceDate=nextDay(delayed);
      const raceId=await publishAnother(raceDate);
      const startPool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
      const cancelPool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
      try {
        const [departureAttempt,cancellationAttempt]=await Promise.allSettled([
          new PilotDepartureService(startPool).start(driver.id,randomUUID(),raceId,[],"departure",null,
            new Date(raceDate.getTime()-15*60_000)),
          new CancellationsService(cancelPool).cancel(driver.id,randomUUID(),"offer",raceId,"Plans changed")]);
        expect(cancellationAttempt.status).toBe("fulfilled");
        const status=(await verificationPool.query<{status:string}>(
          "SELECT status FROM ride_offers WHERE id=$1",[raceId])).rows[0].status;
        expect(["cancelled","departed"]).toContain(status);
        expect(status==="departed").toBe(departureAttempt.status==="fulfilled");
        expect((await verificationPool.query<{count:string}>(`
          SELECT count(*) FROM pilot_departure_operations WHERE offer_id=$1`,[raceId])).rows[0].count)
          .toBe(status==="departed"?"1":"0");
      } finally {await Promise.all([startPool.end(),cancelPool.end()]);}
      // Simulate an older database snapshot for one acknowledged departure.
      await verificationPool.query(`DELETE FROM pilot_email_jobs WHERE event_id IN
        (SELECT id FROM pilot_notification_events WHERE origin_type='pilot_departure' AND operation_id=$1)`,
        [late.operation_id]);
      await verificationPool.query("DELETE FROM pilot_notification_events WHERE origin_type='pilot_departure' AND operation_id=$1",
        [late.operation_id]);
      await verificationPool.query("DELETE FROM pilot_departure_boarding WHERE operation_id=$1",[late.operation_id]);
      await verificationPool.query("DELETE FROM pilot_departure_review_signals WHERE operation_id=$1",[late.operation_id]);
      await verificationPool.query("DELETE FROM audit_logs WHERE metadata->>'operationId'=$1",[late.operation_id]);
      await verificationPool.query("DELETE FROM pilot_departure_operations WHERE id=$1",[late.operation_id]);
      await verificationPool.query("UPDATE ride_offers SET status='active' WHERE id=$1",[delayedId]);
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
      expect(await service.reconcileReceipts(operatorId)).toBeGreaterThanOrEqual(3);
      expect((await verificationPool.query<{status:string}>("SELECT status FROM ride_offers WHERE id=$1",
        [delayedId])).rows[0].status).toBe("departed");
    } finally {
      for(const name of ["PILOT_RECEIPT_PATH","PILOT_RECEIPT_SECRET","PILOT_CONFLICT_POLICY_APPROVED",
        "PILOT_EXPECTED_TRIP_MINUTES","PILOT_CONFLICT_BUFFER_MINUTES","PILOT_SUPPORT_WINDOW_APPROVED",
        "PILOT_SUPPORT_WINDOW_START","PILOT_SUPPORT_WINDOW_END"]) delete process.env[name];
      await rm(directory,{recursive:true,force:true});
    }
  });
});

describe("pilot cancellation and replacement", () => {
  it("releases seats once, cancels the whole ride, and requires fresh requests on a replacement", async () => {
    const directory=await mkdtemp(resolve(tmpdir(),"pilot-cancel-"));
    process.env.PILOT_RECEIPT_PATH=resolve(directory,"receipts");
    process.env.PILOT_RECEIPT_SECRET="pilot-cancellation-independent-secret";
    process.env.PILOT_CONFLICT_POLICY_APPROVED="true";
    process.env.PILOT_EXPECTED_TRIP_MINUTES="35";
    process.env.PILOT_CONFLICT_BUFFER_MINUTES="20";
    process.env.PILOT_SUPPORT_WINDOW_APPROVED="true";
    process.env.PILOT_SUPPORT_WINDOW_START=new Date(Date.now()-60_000).toISOString();
    process.env.PILOT_SUPPORT_WINDOW_END=new Date(Date.now()+30*24*60*60_000).toISOString();
    try {
      const actors=await Promise.all(["driver","one","two","three"].map(async label => {
        const email=`cancel-${label}-${randomUUID()}@example.test`;
        const id=(await verificationPool.query<{id:string}>(
          "INSERT INTO users(email,email_verified_at) VALUES($1,now()) RETURNING id",[email])).rows[0].id;
        await verificationPool.query(`INSERT INTO student_verifications
          (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
          VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[id]);
        return {id,token:signAccessToken({userId:id,email,role:"user"})};
      }));
      const [driver,one,two,three]=actors;
      await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
        VALUES($1,'approved','2099-12-31','2099-12-30')`,[driver.id]);
      const car=(await verificationPool.query<{id:string}>(`INSERT INTO vehicles
        (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,status,verification_status,
         use_category,applicable_document_required,insurance_expires_at,review_after)
        VALUES($1,'car','3210',2,'active','approved','private',true,'2099-12-31','2099-12-30') RETURNING id`,[driver.id])).rows[0].id;
      await verificationPool.query(`INSERT INTO driver_vehicle_approvals
        (driver_user_id,vehicle_id,permission_category,status,review_after)
        VALUES($1,$2,'owner','approved','2099-12-30')`,[driver.id,car]);
      const departure=new Date(Date.now()+3*24*60*60_000);
      while (new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure)==="Sun")
        departure.setUTCDate(departure.getUTCDate()+1);
      departure.setUTCHours(5,0,0,0);
      const input={vehicle_id:car,origin_code:"university",destination_code:"prmitr",
        departure_at:departure.toISOString(),capacity:2};
      const publish=(key:string,body:typeof input & {replaces_offer_id?:string}=input) =>
        request(createApp()).post("/v1/corridor-offers")
          .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",key).send(body);
      const original=await publish("cancel-original");
      expect(original.status,JSON.stringify(original.body)).toBe(201);
      const offerId=original.body.offer.id as string;
      const requestSeat=(actor:typeof one,key:string,rideId=offerId) => request(createApp())
        .post("/v1/seat-requests").set("Authorization",`Bearer ${actor.token}`)
        .set("Idempotency-Key",key).send({offer_id:rideId,seats:1});
      const attempts=[{actor:one,key:"cancel-request-one"},{actor:two,key:"cancel-request-two"},
        {actor:three,key:"cancel-request-three"}];
      const firstResults=await Promise.all(attempts.map(({actor,key})=>requestSeat(actor,key)));
      const [a,b,c]=await Promise.all(firstResults.map(async(response,index)=>{
        if(response.status!==503||response.body.error?.code!=="OPERATION_PENDING") return response;
        const {actor,key}=attempts[index];
        return requestSeat(actor,key);
      }));
      expect([a,b,c].map(response=>({status:response.status,code:response.body.error?.code})))
        .toEqual([{status:201,code:undefined},{status:201,code:undefined},{status:201,code:undefined}]);
      const accept=(id:string,key:string) => request(createApp()).post(`/v1/seat-requests/${id}/accept`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",key).send({});
      const accepted=await accept(a.body.request.id,"cancel-accept-one");
      expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
      const cancelRequest=(actor:typeof one,id:string,key:string,reason:string|null=null) =>
        request(createApp()).post(`/v1/seat-requests/${id}/cancel`)
          .set("Authorization",`Bearer ${actor.token}`).set("Idempotency-Key",key).send({reason});
      expect((await cancelRequest(driver,a.body.request.id,"not-owner")).status).toBe(403);
      const pendingCancelled=await cancelRequest(two,b.body.request.id,"cancel-pending","Changed plans");
      expect(pendingCancelled.status,JSON.stringify(pendingCancelled.body)).toBe(200);
      expect(pendingCancelled.body.requests[0].allocation_id).toBeNull();
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_allocations WHERE offer_id=$1 AND status='confirmed'`,[offerId])).rows[0].count).toBe(1);
      await verificationPool.query(`CREATE OR REPLACE FUNCTION reject_cancel_notification_for_test()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.origin_type='pilot_cancellation' THEN
            RAISE EXCEPTION 'synthetic cancellation notification failure'; END IF;
          RETURN NEW; END $$`);
      await verificationPool.query(`CREATE TRIGGER reject_cancel_notification_for_test
        BEFORE INSERT ON pilot_notification_events FOR EACH ROW EXECUTE FUNCTION reject_cancel_notification_for_test()`);
      try {
        expect((await cancelRequest(one,a.body.request.id,"failed-cancel")).status).toBeGreaterThanOrEqual(500);
        expect((await verificationPool.query<{status:string}>(`SELECT status FROM pilot_seat_allocations
          WHERE request_id=$1`,[a.body.request.id])).rows[0].status).toBe("confirmed");
      } finally {
        await verificationPool.query("DROP TRIGGER reject_cancel_notification_for_test ON pilot_notification_events");
        await verificationPool.query("DROP FUNCTION reject_cancel_notification_for_test()");
      }
      const passengerCancelled=await cancelRequest(one,a.body.request.id,"cancel-confirmed","Changed plans");
      expect(passengerCancelled.status,JSON.stringify(passengerCancelled.body)).toBe(200);
      expect((await request(createApp()).get(`/v1/seat-requests/confirmed/${offerId}`)
        .set("Authorization",`Bearer ${one.token}`)).status).toBe(200);
      setSeatRequestClockForTests(() => new Date(Date.now()+25*60*60_000));
      expect((await request(createApp()).get(`/v1/seat-requests/confirmed/${offerId}`)
        .set("Authorization",`Bearer ${one.token}`)).status).toBe(404);
      const expiredCancelledView=await request(createApp()).get("/v1/seat-requests")
        .set("Authorization",`Bearer ${one.token}`);
      expect(expiredCancelledView.status).toBe(200);
      expect(expiredCancelledView.body.requests.map((item:{id:string}) => item.id))
        .not.toContain(a.body.request.id);
      setSeatRequestClockForTests(null);
      expect((await cancelRequest(one,a.body.request.id,"cancel-confirmed","Changed plans")).body.operation_id)
        .toBe(passengerCancelled.body.operation_id);
      expect((await cancelRequest(one,a.body.request.id,"cancel-confirmed","Different reason")).body.error.code)
        .toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");
      expect((await cancelRequest(one,a.body.request.id,"second-cancel")).body.error.code)
        .toBe("REQUEST_NOT_ACTIVE");
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_allocations WHERE offer_id=$1 AND status IN ('confirmed','held')`,[offerId])).rows[0].count).toBe(0);
      const cancelledView=await request(createApp()).get("/v1/seat-requests")
        .set("Authorization",`Bearer ${one.token}`);
      expect(cancelledView.body.requests.find((item:{id:string}) => item.id===a.body.request.id))
        .toMatchObject({status:"cancelled",cancelled_by:one.id,cancellation_reason:"Changed plans",
          confirmed_contribution_paise:2500,confirmed_currency:"INR"});
      const cancelOffer=(key:string) => request(createApp()).post(`/v1/corridor-offers/${offerId}/cancel`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",key).send({reason:"Change of car"});
      expect((await request(createApp()).post(`/v1/corridor-offers/${offerId}/cancel`)
        .set("Authorization",`Bearer ${two.token}`).set("Idempotency-Key","wrong-ride-owner")
        .send({})).status).toBe(403);
      const again=await requestSeat(two,"cancel-request-two-again");
      expect(again.status).toBe(201);
      const blocker=await verificationPool.connect();
      let outcomes:Awaited<ReturnType<typeof Promise.all<[ReturnType<typeof accept>,ReturnType<typeof cancelOffer>]>>>;
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT id FROM pilot_seat_requests WHERE id=$1 FOR UPDATE",[c.body.request.id]);
        const racing=Promise.all([accept(c.body.request.id,"race-accept"),cancelOffer("cancel-whole")]);
        await new Promise(resolve => setTimeout(resolve,40));
        expect(pool.totalCount).toBeGreaterThanOrEqual(2);
        await blocker.query("COMMIT");
        outcomes=await racing;
      } finally {await blocker.query("ROLLBACK");blocker.release();}
      expect(outcomes[1].status,JSON.stringify(outcomes[1].body)).toBe(200);
      expect([200,409]).toContain(outcomes[0].status);
      expect((await cancelOffer("cancel-whole")).body.operation_id).toBe(outcomes[1].body.operation_id);
      expect((await verificationPool.query(`SELECT status FROM ride_offers WHERE id=$1`,[offerId])).rows[0].status)
        .toBe("cancelled");
      expect((await verificationPool.query<{status:string}>(`SELECT status FROM pilot_seat_requests
        WHERE offer_id=$1 ORDER BY id`,[offerId])).rows.map(row => row.status))
        .toEqual(["cancelled","cancelled","cancelled","cancelled"]);
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_allocations WHERE offer_id=$1 AND status IN ('confirmed','held')`,[offerId])).rows[0].count).toBe(0);
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_notification_events WHERE origin_type='pilot_cancellation'
        AND operation_id=$1`,[outcomes[1].body.operation_id])).rows[0].count).toBe(3);
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_cancellation_audit WHERE operation_id=$1`,[outcomes[1].body.operation_id])).rows[0].count).toBe(2);
      const replacement=await publish("replacement",{...input,replaces_offer_id:offerId});
      expect(replacement.status,JSON.stringify(replacement.body)).toBe(201);
      const replacementId=replacement.body.offer.id as string;
      expect(replacementId).not.toBe(offerId);
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_requests WHERE offer_id=$1`,[replacementId])).rows[0].count).toBe(0);
      expect((await request(createApp()).get("/v1/corridor-offers?origin_code=university&destination_code=prmitr")
        .set("Authorization",`Bearer ${two.token}`)).body.offers.map((item:{id:string}) => item.id))
        .toContain(replacementId);
      expect((await requestSeat(two,"replacement-request",replacementId)).status).toBe(201);
      const inactiveRequest=await requestSeat(three,"replacement-rejected-request",replacementId);
      expect(inactiveRequest.status).toBe(201);
      expect((await request(createApp()).post(`/v1/seat-requests/${inactiveRequest.body.request.id}/reject`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","replacement-reject")
        .send({})).status).toBe(200);
      expect((await publish("duplicate-replacement",{...input,replaces_offer_id:offerId})).status).toBe(409);
      await verificationPool.query(`UPDATE ride_offers SET date=(now()-interval '1 day')::date,
        time=(now()-interval '1 day')::time,pilot_commitment_until=now()-interval '22 hours'
        WHERE id=$1`,[replacementId]);
      const replacementRequest=(await verificationPool.query<{id:string}>(`SELECT id FROM pilot_seat_requests
        WHERE offer_id=$1 AND status='pending'`,[replacementId])).rows[0].id;
      const lateInactive=await cancelRequest(three,inactiveRequest.body.request.id,"late-inactive-cancel");
      expect(lateInactive.status).toBe(409);
      expect(lateInactive.body.error.code).toBe("REQUEST_NOT_ACTIVE");
      const lateSeat=await cancelRequest(two,replacementRequest,"late-cancel");
      expect(lateSeat.status).toBe(202);
      expect(lateSeat.body).toMatchObject({kind:"review_required",state:"acknowledged"});
      expect((await cancelRequest(two,replacementRequest,"late-cancel")).body.case_id).toBe(lateSeat.body.case_id);
      const lateRide=await request(createApp()).post(`/v1/corridor-offers/${replacementId}/cancel`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","late-ride-cancel")
        .send({});
      expect(lateRide.status).toBe(202);
      expect(lateRide.body).toMatchObject({kind:"review_required",state:"acknowledged"});
      const replacementInMine=(await request(createApp()).get("/v1/corridor-offers/mine")
        .set("Authorization",`Bearer ${driver.token}`)).body.offers
        .find((item:{id:string}) => item.id===replacementId);
      expect(replacementInMine).toMatchObject({status:"active",cancelled_at:null});
      expect((await verificationPool.query<{status:string}>("SELECT status FROM ride_offers WHERE id=$1",[replacementId])).rows[0].status)
        .toBe("active");
      expect((await verificationPool.query<{status:string}>("SELECT status FROM pilot_seat_requests WHERE id=$1",[replacementRequest])).rows[0].status)
        .toBe("pending");
      const held=await publish("held-offer");
      expect(held.status,JSON.stringify(held.body)).toBe(201);
      const heldId=held.body.offer.id as string;
      const heldRequest=await requestSeat(three,"held-request",heldId);
      expect(heldRequest.status).toBe(201);
      expect((await accept(heldRequest.body.request.id,"held-accept")).status).toBe(200);
      await verificationPool.query(`UPDATE pilot_seat_allocations SET status='held'
        WHERE request_id=$1`,[heldRequest.body.request.id]);
      await verificationPool.query("UPDATE ride_offers SET status='held' WHERE id=$1",[heldId]);
      expect((await verificationPool.query<{status:string}>(`SELECT status FROM pilot_seat_allocations
        WHERE request_id=$1`,[heldRequest.body.request.id])).rows[0].status).toBe("held");
      expect((await cancelRequest(three,heldRequest.body.request.id,"held-seat-cancel")).status).toBe(200);
      expect((await verificationPool.query<{status:string}>(`SELECT status FROM pilot_seat_allocations
        WHERE request_id=$1`,[heldRequest.body.request.id])).rows[0].status).toBe("cancelled");
      expect((await request(createApp()).post(`/v1/corridor-offers/${heldId}/cancel`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","held-ride-cancel")
        .send({})).status).toBe(200);
      expect((await verificationPool.query<{status:string}>("SELECT status FROM ride_offers WHERE id=$1",[heldId])).rows[0].status)
        .toBe("cancelled");
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM bookings WHERE ride_offer_id=$1`,[offerId])).rows[0].count).toBe(0);
      const operatorId=(await verificationPool.query<{id:string}>(
        "INSERT INTO users(email,role,email_verified_at) VALUES($1,'admin',now()) RETURNING id",
        [`cancel-operator-${randomUUID()}@example.test`])).rows[0].id;
      await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
        VALUES($1,true,'synthetic cancellation recovery',now())`,[operatorId]);
      expect((await new CancellationsService(pool).openReviews(operatorId)).map(item => item.id))
        .toEqual(expect.arrayContaining([lateSeat.body.case_id,lateRide.body.case_id]));
      await verificationPool.query(`DELETE FROM pilot_cancellation_audit WHERE request_id IN
        (SELECT id FROM pilot_seat_requests WHERE offer_id=$1)`,[offerId]);
      await verificationPool.query("DELETE FROM pilot_cancellation_operations WHERE result->>'offer_id'=$1",[offerId]);
      await verificationPool.query(`UPDATE pilot_seat_allocations SET status='confirmed',ended_at=NULL
        WHERE offer_id=$1`,[offerId]);
      await verificationPool.query(`UPDATE pilot_seat_requests r SET
        status=CASE WHEN r.id=$2 THEN 'cancelled'
          WHEN EXISTS(SELECT 1 FROM pilot_seat_allocations a WHERE a.request_id=r.id)
          THEN 'accepted' ELSE 'pending' END,decided_at=NULL WHERE offer_id=$1`,[offerId,b.body.request.id]);
      await verificationPool.query("UPDATE ride_offers SET status='active' WHERE id=$1",[offerId]);
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
      expect(await new CancellationsService(pool).reconcileReceipts(operatorId)).toBe(7);
      expect((await verificationPool.query<{status:string}>("SELECT status FROM ride_offers WHERE id=$1",[offerId])).rows[0].status)
        .toBe("cancelled");
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_allocations WHERE offer_id=$1 AND status IN ('confirmed','held')`,[offerId])).rows[0].count).toBe(0);
    } finally {
      setSeatRequestClockForTests(null);
      for (const name of ["PILOT_RECEIPT_PATH","PILOT_RECEIPT_SECRET","PILOT_CONFLICT_POLICY_APPROVED",
        "PILOT_EXPECTED_TRIP_MINUTES","PILOT_CONFLICT_BUFFER_MINUTES","PILOT_SUPPORT_WINDOW_APPROVED",
        "PILOT_SUPPORT_WINDOW_START","PILOT_SUPPORT_WINDOW_END"]) delete process.env[name];
      await rm(directory,{recursive:true,force:true});
    }
  });
});

describe("pilot seat requests through HTTP and PostgreSQL", () => {
  it("accepts one final seat atomically and keeps retries and confirmed terms visible", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "seat-accept-"));
    process.env.PILOT_RECEIPT_PATH = resolve(directory,"receipts");
    process.env.PILOT_RECEIPT_SECRET = "seat-accept-independent-receipt-secret";
    process.env.PILOT_CONFLICT_POLICY_APPROVED = "true";
    process.env.PILOT_EXPECTED_TRIP_MINUTES = "35";
    process.env.PILOT_CONFLICT_BUFFER_MINUTES = "20";
    process.env.PILOT_SUPPORT_WINDOW_APPROVED = "true";
    process.env.PILOT_SUPPORT_WINDOW_START = new Date(Date.now()-60_000).toISOString();
    process.env.PILOT_SUPPORT_WINDOW_END = new Date(Date.now()+30*24*60*60_000).toISOString();
    try {
      const actors = await Promise.all(["driver","passenger-one","passenger-two","other-driver"].map(async name => {
        const email = `accept-${name}@example.test`;
        const id = (await verificationPool.query<{id:string}>(
          "INSERT INTO users(email,email_verified_at) VALUES($1,now()) RETURNING id",[email])).rows[0].id;
        await verificationPool.query(`INSERT INTO student_verifications
          (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
          VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[id]);
        return {id,token:signAccessToken({userId:id,email,role:"user"})};
      }));
      const [driver,first,second,otherDriver] = actors;
      await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
        VALUES($1,'approved','2099-12-31','2099-12-30')`,[driver.id]);
      const car = (await verificationPool.query<{id:string}>(`INSERT INTO vehicles
        (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,status,verification_status,
         use_category,applicable_document_required,insurance_expires_at,review_after)
        VALUES($1,'car','1234',2,'active','approved','private',true,'2099-12-31','2099-12-30') RETURNING id`,[driver.id])).rows[0].id;
      await verificationPool.query("UPDATE vehicles SET make='Tata',model='Tiago',color='Blue' WHERE id=$1",[car]);
      await verificationPool.query(`INSERT INTO driver_vehicle_approvals
        (driver_user_id,vehicle_id,permission_category,status,review_after)
        VALUES($1,$2,'owner','approved','2099-12-30')`,[driver.id,car]);
      await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
        VALUES($1,'approved','2099-12-31','2099-12-30')`,[otherDriver.id]);
      const otherCar = (await verificationPool.query<{id:string}>(`INSERT INTO vehicles
        (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,status,verification_status,
         use_category,applicable_document_required,insurance_expires_at,review_after)
        VALUES($1,'car','5678',2,'active','approved','private',true,'2099-12-31','2099-12-30') RETURNING id`,[otherDriver.id])).rows[0].id;
      await verificationPool.query(`INSERT INTO driver_vehicle_approvals
        (driver_user_id,vehicle_id,permission_category,status,review_after)
        VALUES($1,$2,'owner','approved','2099-12-30')`,[otherDriver.id,otherCar]);
      const departure = new Date(Date.now()+2*24*60*60_000);
      while (new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure) === "Sun")
        departure.setUTCDate(departure.getUTCDate()+1);
      departure.setUTCHours(5,0,0,0);
      const offer = await request(createApp()).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","accept-offer")
        .send({vehicle_id:car,origin_code:"university",destination_code:"prmitr",
          departure_at:departure.toISOString(),capacity:1});
      expect(offer.status,JSON.stringify(offer.body)).toBe(201);
      const otherOffer = await request(createApp()).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${otherDriver.token}`).set("Idempotency-Key","other-accept-offer")
        .send({vehicle_id:otherCar,origin_code:"university",destination_code:"prmitr",
          departure_at:departure.toISOString(),capacity:2});
      expect(otherOffer.status,JSON.stringify(otherOffer.body)).toBe(201);
      const post = (actor:typeof first,key:string) => request(createApp()).post("/v1/seat-requests")
        .set("Authorization",`Bearer ${actor.token}`).set("Idempotency-Key",key)
        .send({offer_id:offer.body.offer.id,seats:1});
      const one = await post(first,"request-one");
      const two = await post(second,"request-two");
      expect([one.status,two.status]).toEqual([201,201]);
      const otherRequests = [];
      for (const [index,actor] of [first,second].entries()) {
        otherRequests.push(await request(createApp()).post("/v1/seat-requests")
          .set("Authorization",`Bearer ${actor.token}`).set("Idempotency-Key",`other-request-${index}`)
          .send({offer_id:otherOffer.body.offer.id,seats:1}));
      }
      expect(otherRequests.map(value => value.status)).toEqual([201,201]);
      const driverPending = await request(createApp()).post("/v1/seat-requests")
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","driver-pending-other-offer")
        .send({offer_id:otherOffer.body.offer.id,seats:1});
      expect(driverPending.status).toBe(201);
      const accept = (id:string,key:string) => request(createApp()).post(`/v1/seat-requests/${id}/accept`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",key).send({});
      expect((await request(createApp()).post(`/v1/seat-requests/${one.body.request.id}/accept`)
        .set("Authorization",`Bearer ${otherDriver.token}`).set("Idempotency-Key","wrong-driver").send({})).status).toBe(403);
      await verificationPool.query("UPDATE driver_eligibility SET status='suspended' WHERE user_id=$1",[driver.id]);
      expect((await accept(one.body.request.id,"suspended-driver")).status).toBe(403);
      await verificationPool.query("UPDATE driver_eligibility SET status='approved' WHERE user_id=$1",[driver.id]);
      await verificationPool.query(`UPDATE driver_vehicle_approvals SET status='revoked'
        WHERE driver_user_id=$1 AND vehicle_id=$2`,[driver.id,car]);
      expect((await accept(one.body.request.id,"revoked-association")).status).toBe(403);
      await verificationPool.query(`UPDATE driver_vehicle_approvals SET status='approved'
        WHERE driver_user_id=$1 AND vehicle_id=$2`,[driver.id,car]);
      await verificationPool.query("UPDATE student_verifications SET status='suspended' WHERE user_id=$1",[first.id]);
      expect((await accept(one.body.request.id,"revoked-passenger")).status).toBe(403);
      await verificationPool.query("UPDATE student_verifications SET status='verified' WHERE user_id=$1",[first.id]);
      await verificationPool.query("UPDATE users SET status='suspended' WHERE id=$1",[first.id]);
      expect((await accept(one.body.request.id,"disabled-account")).status).toBe(403);
      await verificationPool.query("UPDATE users SET status='active' WHERE id=$1",[first.id]);
      const eligibilityUpdate = await verificationPool.connect();
      try {
        await eligibilityUpdate.query("BEGIN");
        await eligibilityUpdate.query("UPDATE student_verifications SET status='suspended' WHERE user_id=$1",[first.id]);
        const pendingAcceptance = accept(one.body.request.id,"eligibility-race");
        const outcome = Promise.resolve(pendingAcceptance);
        await new Promise(resolve => setTimeout(resolve,25));
        await eligibilityUpdate.query("COMMIT");
        expect((await outcome).status).toBe(403);
      } finally {
        await eligibilityUpdate.query("ROLLBACK");
        eligibilityUpdate.release();
      }
      await verificationPool.query("UPDATE student_verifications SET status='verified' WHERE user_id=$1",[first.id]);
      await verificationPool.query("UPDATE ride_offers SET status='held' WHERE id=$1",[offer.body.offer.id]);
      expect((await accept(one.body.request.id,"held-offer")).status).toBe(409);
      await verificationPool.query("UPDATE ride_offers SET status='active' WHERE id=$1",[offer.body.offer.id]);
      await verificationPool.query("UPDATE ride_offers SET price_per_seat_paise=2600 WHERE id=$1",[offer.body.offer.id]);
      expect((await accept(one.body.request.id,"changed-terms")).body.error.code).toBe("OFFER_TERMS_CHANGED");
      await verificationPool.query("UPDATE ride_offers SET price_per_seat_paise=2500 WHERE id=$1",[offer.body.offer.id]);
      const pendingTrip = await request(createApp()).get(`/v1/seat-requests/confirmed/${offer.body.offer.id}`)
        .set("Authorization",`Bearer ${first.token}`);
      expect(pendingTrip.status).toBe(404);
      expect(pendingTrip.headers["cache-control"]).toContain("no-store");
      setSeatRequestClockForTests(() => new Date(offer.body.offer.acceptance_cutoff_at));
      expect((await accept(one.body.request.id,"deadline")).status).toBe(409);
      setSeatRequestClockForTests(null);
      await verificationPool.query(`CREATE OR REPLACE FUNCTION reject_accept_notification_for_test()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.origin_type='seat_request' AND NEW.event_type='accepted' THEN
            RAISE EXCEPTION 'synthetic acceptance notification failure'; END IF;
          RETURN NEW; END $$`);
      await verificationPool.query(`CREATE TRIGGER reject_accept_notification_for_test
        BEFORE INSERT ON pilot_notification_events FOR EACH ROW EXECUTE FUNCTION reject_accept_notification_for_test()`);
      try {
        expect((await accept(one.body.request.id,"failed-notification")).status).toBeGreaterThanOrEqual(500);
        expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
          FROM pilot_seat_allocations WHERE offer_id=$1`,[offer.body.offer.id])).rows[0].count).toBe(0);
      } finally {
        await verificationPool.query("DROP TRIGGER reject_accept_notification_for_test ON pilot_notification_events");
        await verificationPool.query("DROP FUNCTION reject_accept_notification_for_test()");
      }
      const blocker = await verificationPool.connect();
      let results:Awaited<ReturnType<typeof Promise.all<[ReturnType<typeof accept>,ReturnType<typeof accept>]>>>;
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT id FROM ride_offers WHERE id=$1 FOR UPDATE",[offer.body.offer.id]);
        const race = Promise.all([accept(one.body.request.id,"accept-one"),
          accept(two.body.request.id,"accept-two")]);
        await new Promise(resolve => setTimeout(resolve,40));
        expect(pool.totalCount).toBeGreaterThanOrEqual(2);
        await blocker.query("COMMIT");
        results = await race;
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
      const [a,b] = results;
      expect([a.status,b.status].sort()).toEqual([200,409]);
      const winner = a.status === 200 ? a : b;
      expect(winner.body.request).toMatchObject({status:"accepted",confirmed:true,seats_reserved:1});
      expect(winner.body.booking).toMatchObject({seats:1,contribution_paise:2500,currency:"INR",status:"confirmed"});
      expect(winner.body.withdrawn_requests).toEqual(expect.arrayContaining([
        expect.objectContaining({id:otherRequests[a.status === 200 ? 0 : 1].body.request.id}),
        expect.objectContaining({id:driverPending.body.request.id,passenger_id:driver.id})]));
      const winnerPassenger = a.status === 200 ? first : second;
      const winnerPassengerOtherRequestId = otherRequests[a.status === 200 ? 0 : 1].body.request.id;
      expect((await post(winnerPassenger,"duplicate-confirmed-request")).body.error.code)
        .toBe("DUPLICATE_ACTIVE_REQUEST");
      await verificationPool.query("UPDATE vehicles SET seat_capacity=1 WHERE id=$1",[otherCar]);
      const remainingOtherRequest = otherRequests[a.status === 200 ? 1 : 0].body.request.id;
      const overCarLimit = await request(createApp()).post(`/v1/seat-requests/${remainingOtherRequest}/accept`)
        .set("Authorization",`Bearer ${otherDriver.token}`).set("Idempotency-Key","reduced-car-capacity").send({});
      expect(overCarLimit.body.error.code).toBe("CAPACITY_INVALID");
      await verificationPool.query("UPDATE vehicles SET seat_capacity=2 WHERE id=$1",[otherCar]);
      await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
        VALUES($1,'approved','2099-12-31','2099-12-30')`,[winnerPassenger.id]);
      const winnerCar = (await verificationPool.query<{id:string}>(`INSERT INTO vehicles
        (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,status,verification_status,
         use_category,applicable_document_required,insurance_expires_at,review_after)
        VALUES($1,'car','9000',2,'active','approved','private',true,'2099-12-31','2099-12-30') RETURNING id`,[winnerPassenger.id])).rows[0].id;
      await verificationPool.query(`INSERT INTO driver_vehicle_approvals
        (driver_user_id,vehicle_id,permission_category,status,review_after)
        VALUES($1,$2,'owner','approved','2099-12-30')`,[winnerPassenger.id,winnerCar]);
      const overlappingDriverOffer = await request(createApp()).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${winnerPassenger.token}`).set("Idempotency-Key","overlap-as-driver")
        .send({vehicle_id:winnerCar,origin_code:"university",destination_code:"prmitr",
          departure_at:departure.toISOString(),capacity:1});
      expect(overlappingDriverOffer.body.error.code).toBe("COMMITMENT_CONFLICT");
      const laterDeparture = new Date(departure);
      laterDeparture.setUTCDate(laterDeparture.getUTCDate()+3);
      while (new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(laterDeparture) === "Sun")
        laterDeparture.setUTCDate(laterDeparture.getUTCDate()+1);
      const laterOffers = [];
      for (const [actor,vehicleId,key] of [[driver,car,"later-first"],[otherDriver,otherCar,"later-second"]] as const) {
        laterOffers.push(await request(createApp()).post("/v1/corridor-offers")
          .set("Authorization",`Bearer ${actor.token}`).set("Idempotency-Key",key)
          .send({vehicle_id:vehicleId,origin_code:"university",destination_code:"prmitr",
            departure_at:laterDeparture.toISOString(),capacity:1}));
      }
      expect(laterOffers.map(value => value.status)).toEqual([201,201]);
      const laterRequests = [];
      for (const [index,item] of laterOffers.entries()) {
        laterRequests.push(await request(createApp()).post("/v1/seat-requests")
          .set("Authorization",`Bearer ${winnerPassenger.token}`).set("Idempotency-Key",`later-request-${index}`)
          .send({offer_id:item.body.offer.id,seats:1}));
      }
      expect(laterRequests.map(value => value.status)).toEqual([201,201]);
      const passengerGate = await verificationPool.connect();
      let overlappingAcceptances:Awaited<ReturnType<typeof accept>>[];
      try {
        await passengerGate.query("BEGIN");
        await passengerGate.query("UPDATE student_verifications SET status='verified' WHERE user_id=$1",[winnerPassenger.id]);
        const racing = Promise.all(laterRequests.map((item,index) =>
          request(createApp()).post(`/v1/seat-requests/${item.body.request.id}/accept`)
            .set("Authorization",`Bearer ${index === 0 ? driver.token : otherDriver.token}`)
            .set("Idempotency-Key",`later-accept-${index}`).send({})));
        await new Promise(resolve => setTimeout(resolve,35));
        expect(pool.totalCount).toBeGreaterThanOrEqual(2);
        await passengerGate.query("COMMIT");
        overlappingAcceptances = await racing;
      } finally {
        await passengerGate.query("ROLLBACK");
        passengerGate.release();
      }
      expect(overlappingAcceptances.map(value => value.status).sort()).toEqual([200,409]);
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_allocations WHERE passenger_id=$1 AND status='confirmed'`,[winnerPassenger.id])).rows[0].count)
        .toBe(2);
      const withdrawnView = await request(createApp()).get("/v1/seat-requests")
        .set("Authorization",`Bearer ${winnerPassenger.token}`);
      expect(withdrawnView.body.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({id:winnerPassengerOtherRequestId,status:"withdrawn"})]));
      expect((await accept(a.status === 200 ? one.body.request.id : two.body.request.id,
        a.status === 200 ? "accept-one" : "accept-two")).body.operation_id).toBe(winner.body.operation_id);
      expect((await accept(a.status === 200 ? two.body.request.id : one.body.request.id,
        a.status === 200 ? "accept-one" : "accept-two")).body.error.code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");
      const bookings = await request(createApp()).get("/v1/seat-requests/confirmed")
        .set("Authorization",`Bearer ${driver.token}`);
      expect(bookings.headers["cache-control"]).toContain("no-store");
      expect(JSON.stringify(bookings.body)).not.toMatch(/phone|emergency_contact|registration_number/i);
      expect(bookings.body.bookings).toEqual(expect.arrayContaining([
        expect.objectContaining({offer_id:offer.body.offer.id,contribution_paise:2500,
          car_make:"Tata",car_model:"Tiago",car_color:"Blue",
          pickup_location:"Amravati University",passenger_origin_code:"university",
          passenger_destination_code:"prmitr"})]));
      const driverTrip = await request(createApp()).get(`/v1/seat-requests/confirmed/${offer.body.offer.id}`)
        .set("Authorization",`Bearer ${driver.token}`);
      expect(driverTrip.status).toBe(200);
      expect(driverTrip.body.trip.bookings).toHaveLength(1);
      const passengerTrip = await request(createApp()).get(`/v1/seat-requests/confirmed/${offer.body.offer.id}`)
        .set("Authorization",`Bearer ${winnerPassenger.token}`);
      expect(passengerTrip.status).toBe(200);
      expect(passengerTrip.body.trip.bookings[0]).toHaveProperty("driver_verified_name");
      expect(passengerTrip.body.trip.bookings[0].car_registration_last4).toBe("1234");
      expect(JSON.stringify(passengerTrip.body)).not.toMatch(/phone|emergency_contact|registration_number/i);
      const passengerList = await request(createApp()).get("/v1/seat-requests/confirmed")
        .set("Authorization",`Bearer ${winnerPassenger.token}`);
      expect(passengerList.body.bookings.map((item:{offer_id:string}) => item.offer_id)).toEqual(
        expect.arrayContaining([offer.body.offer.id,laterOffers[overlappingAcceptances[0].status === 200 ? 0 : 1].body.offer.id]));
      const otherDriverList = await request(createApp()).get("/v1/seat-requests/confirmed")
        .set("Authorization",`Bearer ${otherDriver.token}`);
      expect(otherDriverList.body.bookings.some((item:{offer_id:string}) => item.offer_id === offer.body.offer.id)).toBe(false);
      expect((await request(createApp()).get(`/v1/seat-requests/confirmed/${offer.body.offer.id}`)
        .set("Authorization",`Bearer ${otherDriver.token}`)).status).toBe(404);
      expect((await request(createApp()).get(`/v1/seat-requests/confirmed/${offer.body.offer.id}`)).status).toBe(401);
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_allocations WHERE offer_id=$1`,[offer.body.offer.id])).rows[0].count).toBe(1);
      await verificationPool.query(`UPDATE pilot_seat_allocations SET status='cancelled',
        ended_at=now()-interval '23 hours 59 minutes' WHERE offer_id=$1`,[offer.body.offer.id]);
      expect((await request(createApp()).get(`/v1/seat-requests/confirmed/${offer.body.offer.id}`)
        .set("Authorization",`Bearer ${winnerPassenger.token}`)).status).toBe(200);
      await verificationPool.query(`UPDATE pilot_seat_allocations SET status='cancelled',
        ended_at=now()-interval '24 hours' WHERE offer_id=$1`,[offer.body.offer.id]);
      expect((await request(createApp()).get(`/v1/seat-requests/confirmed/${offer.body.offer.id}`)
        .set("Authorization",`Bearer ${winnerPassenger.token}`)).status).toBe(404);
      await verificationPool.query(`UPDATE pilot_seat_allocations SET status='completed',
        ended_at=now()-interval '23 hours 59 minutes' WHERE offer_id=$1`,[offer.body.offer.id]);
      expect((await request(createApp()).get(`/v1/seat-requests/confirmed/${offer.body.offer.id}`)
        .set("Authorization",`Bearer ${winnerPassenger.token}`)).status).toBe(200);
      await verificationPool.query(`UPDATE pilot_seat_allocations SET status='completed',
        ended_at=now()-interval '24 hours' WHERE offer_id=$1`,[offer.body.offer.id]);
      const afterAccessWindow = await request(createApp()).get("/v1/seat-requests/confirmed")
        .set("Authorization",`Bearer ${driver.token}`);
      expect(afterAccessWindow.body.bookings.some((item:{offer_id:string}) =>
        item.offer_id === offer.body.offer.id)).toBe(false);
      expect((await request(createApp()).get(`/v1/seat-requests/confirmed/${offer.body.offer.id}`)
        .set("Authorization",`Bearer ${driver.token}`)).status).toBe(404);
      const expiredOperation = await request(createApp()).get(
        `/v1/seat-requests/operations/${winner.body.operation_id}`)
        .set("Authorization",`Bearer ${driver.token}`);
      expect(expiredOperation.status).toBe(200);
      expect(expiredOperation.body.operation.state).toBe("acknowledged");
      expect(expiredOperation.body.operation).not.toHaveProperty("booking");
      expect(expiredOperation.body.operation).not.toHaveProperty("request");
      const expiredTripDetails = await request(createApp()).get("/v1/seat-requests")
        .set("Authorization",`Bearer ${driver.token}`);
      expect(expiredTripDetails.body.requests.some((item:{id:string}) =>
        item.id === winner.body.request.id)).toBe(false);
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_withdrawal_audit WHERE operation_id=$1`,[winner.body.operation_id])).rows[0].count).toBe(2);
      const acceptedEvents = await request(createApp()).get("/v1/notifications/durable")
        .set("Authorization",`Bearer ${winnerPassenger.token}`);
      expect(acceptedEvents.body.notifications.map((item:{event_type:string}) => item.event_type))
        .toEqual(expect.arrayContaining(["accepted",`withdrawn:${winnerPassengerOtherRequestId}`]));
      const driverEvents = await request(createApp()).get("/v1/notifications/durable")
        .set("Authorization",`Bearer ${driver.token}`);
      expect(driverEvents.body.notifications.map((item:{event_type:string}) => item.event_type))
        .toContain(`withdrawn:${driverPending.body.request.id}`);
      const operatorId = (await verificationPool.query<{id:string}>(
        "INSERT INTO users(email,role,email_verified_at) VALUES('accept-recovery-operator@example.test','admin',now()) RETURNING id"
      )).rows[0].id;
      await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
        VALUES($1,true,'synthetic acceptance recovery',now())`,[operatorId]);
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
      await verificationPool.query("DELETE FROM pilot_email_jobs WHERE event_id IN (SELECT id FROM pilot_notification_events WHERE origin_type='seat_request')");
      await verificationPool.query("DELETE FROM pilot_notification_events WHERE origin_type='seat_request'");
      await verificationPool.query("DELETE FROM pilot_seat_withdrawal_audit");
      await verificationPool.query("DELETE FROM pilot_seat_request_audit");
      await verificationPool.query("DELETE FROM pilot_seat_request_operations");
      await verificationPool.query("DELETE FROM pilot_seat_allocations");
      await verificationPool.query("DELETE FROM pilot_seat_requests");
      expect(await new SeatRequestsService().reconcileReceipts(operatorId)).toBe(9);
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_allocations WHERE offer_id=$1`,[offer.body.offer.id])).rows[0].count).toBe(1);
      await verificationPool.query("DELETE FROM pilot_seat_allocations WHERE offer_id=$1",[offer.body.offer.id]);
      expect(await new SeatRequestsService().reconcileReceipts(operatorId)).toBe(9);
      expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count
        FROM pilot_seat_allocations WHERE offer_id=$1`,[offer.body.offer.id])).rows[0].count).toBe(1);
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='open' WHERE singleton=true");
      await verificationPool.query("DELETE FROM pilot_seat_allocations WHERE offer_id=$1",[offer.body.offer.id]);
      await expect(new SeatRequestsService().verifyEvidence()).rejects.toMatchObject({
        statusCode:503,code:"RECOVERY_CONFLICT"});
      expect(await new SeatRequestsService().reconcileReceipts(operatorId)).toBe(9);
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='open' WHERE singleton=true");
      await verificationPool.query(`CREATE OR REPLACE FUNCTION delay_acceptance_receipt_for_test()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.action='accepted' THEN PERFORM pg_sleep(0.5); END IF;
          RETURN NEW; END $$`);
      await verificationPool.query(`CREATE TRIGGER delay_acceptance_receipt_for_test
        AFTER INSERT ON pilot_seat_request_operations FOR EACH ROW EXECUTE FUNCTION delay_acceptance_receipt_for_test()`);
      const receiptDirectory = `${process.env.PILOT_RECEIPT_PATH}.seat-request`;
      try {
        const pendingResponse = Promise.resolve(request(createApp())
          .post(`/v1/seat-requests/${remainingOtherRequest}/accept`)
          .set("Authorization",`Bearer ${otherDriver.token}`)
          .set("Idempotency-Key","unknown-acceptance").send({}));
        await new Promise(resolve => setTimeout(resolve,150));
        await chmod(receiptDirectory,0o500);
        const uncertain = await pendingResponse;
        expect(uncertain.body.error.code).toBe("OPERATION_PENDING");
        const operationId = uncertain.body.error.details.operationId;
        const queried = await request(createApp()).get(`/v1/seat-requests/operations/${operationId}`)
          .set("Authorization",`Bearer ${otherDriver.token}`);
        expect(queried.body.operation.operation_id).toBe(operationId);
        expect(queried.body.operation.state).toBe("committed");
        await chmod(receiptDirectory,0o700);
        await verificationPool.query("DROP TRIGGER delay_acceptance_receipt_for_test ON pilot_seat_request_operations");
        await verificationPool.query("DROP FUNCTION delay_acceptance_receipt_for_test()");
        expect(await new SeatRequestsService().reconcileReceipts(operatorId)).toBe(10);
        const recovered = await request(createApp()).get(`/v1/seat-requests/operations/${operationId}`)
          .set("Authorization",`Bearer ${otherDriver.token}`);
        expect(recovered.body.operation.state).toBe("recovered");
      } finally {
        await chmod(receiptDirectory,0o700);
        await verificationPool.query("DROP TRIGGER IF EXISTS delay_acceptance_receipt_for_test ON pilot_seat_request_operations");
        await verificationPool.query("DROP FUNCTION IF EXISTS delay_acceptance_receipt_for_test()");
      }
    } finally {setSeatRequestClockForTests(null);await rm(directory,{recursive:true,force:true});}
  });
  it("keeps capacity available, freezes terms, rejects by owner, and expires at the decision deadline", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "seat-request-"));
    process.env.PILOT_RECEIPT_PATH = resolve(directory,"receipts");
    process.env.PILOT_RECEIPT_SECRET = "seat-request-independent-receipt-secret";
    process.env.PILOT_CONFLICT_POLICY_APPROVED = "true";
    process.env.PILOT_EXPECTED_TRIP_MINUTES = "35";
    process.env.PILOT_CONFLICT_BUFFER_MINUTES = "20";
    process.env.PILOT_SUPPORT_WINDOW_APPROVED = "true";
    process.env.PILOT_SUPPORT_WINDOW_START = new Date(Date.now()-60_000).toISOString();
    process.env.PILOT_SUPPORT_WINDOW_END = new Date(Date.now()+30*24*60*60_000).toISOString();
    try {
      const identities = await Promise.all(["seat-driver","seat-passenger-a","seat-passenger-b","seat-passenger-c"].map(async label => {
        const email = `${label}@example.test`;
        const id = (await verificationPool.query<{id:string}>(
          "INSERT INTO users(email,email_verified_at) VALUES($1,now()) RETURNING id",[email])).rows[0].id;
        await verificationPool.query(`INSERT INTO student_verifications
          (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
          VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[id]);
        return {id,token:signAccessToken({userId:id,email,role:"user"})};
      }));
      const [driver,passenger,other,third] = identities;
      await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
        VALUES($1,'approved','2099-12-31','2099-12-30')`,[driver.id]);
      const car = (await verificationPool.query<{id:string}>(`INSERT INTO vehicles
        (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,status,verification_status,
         use_category,applicable_document_required,insurance_expires_at,review_after)
        VALUES($1,'car','1234',3,'active','approved','private',true,'2099-12-31','2099-12-30') RETURNING id`,[driver.id])).rows[0].id;
      await verificationPool.query(`INSERT INTO driver_vehicle_approvals
        (driver_user_id,vehicle_id,permission_category,status,review_after)
        VALUES($1,$2,'owner','approved','2099-12-30')`,[driver.id,car]);
      const departure = new Date(Date.now()+2*24*60*60_000);
      for (let n=0;n<7;n++) {
        if (new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure) !== "Sun") break;
        departure.setUTCDate(departure.getUTCDate()+1);
      }
      departure.setUTCHours(5,0,0,0);
      const offerBody = {vehicle_id:car,origin_code:"university",destination_code:"prmitr",
        departure_at:departure.toISOString(),capacity:2};
      const published = await request(createApp()).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","seat-offer").send(offerBody);
      expect(published.status,JSON.stringify(published.body)).toBe(201);
      const offerId = published.body.offer.id;
      expect((await request(createApp()).post("/v1/seat-requests")
        .set("Idempotency-Key","guest-request").send({offer_id:offerId,seats:1})).status).toBe(401);
      expect((await request(createApp()).post("/v1/bookings")
        .set("Authorization",`Bearer ${passenger.token}`)
        .send({ride_offer_id:offerId,seats_booked:1})).status).toBe(403);
      const post = (token:string,key:string,body:Record<string,unknown>) => request(createApp())
        .post("/v1/seat-requests").set("Authorization",`Bearer ${token}`)
        .set("Idempotency-Key",key).send(body);
      expect((await post(driver.token,"self",{offer_id:offerId,seats:1})).status).toBe(409);
      expect((await post(passenger.token,"many",{offer_id:offerId,seats:2})).status).toBe(400);
      const race = await Promise.all([post(passenger.token,"request-a",{offer_id:offerId,seats:1}),
        post(other.token,"request-b",{offer_id:offerId,seats:1})]);
      expect(race.map(item => item.status)).toEqual([201,201]);
      const first = race[0].body.request;
      expect(first).toMatchObject({status:"pending",confirmed:false,seats_reserved:0});
      await verificationPool.query("UPDATE student_verifications SET eligibility_ends_at=now()-interval '1 second' WHERE user_id=$1",[passenger.id]);
      const lapsedList = await request(createApp()).get("/v1/seat-requests")
        .set("Authorization",`Bearer ${passenger.token}`);
      expect(lapsedList.status).toBe(200);
      expect(lapsedList.body.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({id:first.id,status:"pending",offer_terms:first.offer_terms})]));
      await verificationPool.query("UPDATE student_verifications SET eligibility_ends_at=now()+interval '1 year' WHERE user_id=$1",[passenger.id]);
      expect((await verificationPool.query("SELECT available_seats FROM ride_offers WHERE id=$1",[offerId])).rows[0].available_seats).toBe(2);
      expect((await post(passenger.token,"request-a",{offer_id:offerId,seats:1})).body.operation_id)
        .toBe(race[0].body.operation_id);
      expect((await post(passenger.token,"request-again",{offer_id:offerId,seats:1})).status).toBe(409);
      const edit = await request(createApp()).patch(`/v1/corridor-offers/${offerId}`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","seat-edit")
        .send({...offerBody,capacity:1,version:1});
      expect(edit.status).toBe(409);
      expect((await request(createApp()).post(`/v1/seat-requests/${first.id}/reject`)
        .set("Authorization",`Bearer ${other.token}`).set("Idempotency-Key","wrong-owner").send({})).status).toBe(403);
      await verificationPool.query("UPDATE driver_eligibility SET status='suspended' WHERE user_id=$1",[driver.id]);
      expect((await request(createApp()).post(`/v1/seat-requests/${first.id}/reject`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","suspended-reject").send({})).status).toBe(403);
      await verificationPool.query("UPDATE driver_eligibility SET status='approved' WHERE user_id=$1",[driver.id]);
      const rejected = await request(createApp()).post(`/v1/seat-requests/${first.id}/reject`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","reject-a").send({});
      expect(rejected.status).toBe(200);
      expect(rejected.body.request.status).toBe("rejected");
      const secondId = race[1].body.request.id;
      await verificationPool.query("UPDATE pilot_seat_requests SET decision_deadline_at=now() WHERE id=$1",[secondId]);
      const list = await request(createApp()).get("/v1/seat-requests").set("Authorization",`Bearer ${other.token}`);
      expect(list.body.requests[0].status).toBe("expired");
      expect((await request(createApp()).post(`/v1/seat-requests/${secondId}/reject`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","late-reject").send({})).status).toBe(409);
      expect(await expirePilotSeatRequests(verificationPool)).toEqual({expired:1});
      expect(await expirePilotSeatRequests(verificationPool)).toEqual({expired:0});
      const expiry = await request(createApp()).get("/v1/notifications/durable")
        .set("Authorization",`Bearer ${other.token}`);
      expect(expiry.body.notifications.filter((item:{event_type:string}) => item.event_type === "expired")).toHaveLength(1);
      const driverNotices = await request(createApp()).get("/v1/notifications/durable")
        .set("Authorization",`Bearer ${driver.token}`);
      expect(driverNotices.body.notifications.filter((item:{event_type:string}) => item.event_type === "expired")).toHaveLength(1);
      expect((await verificationPool.query("SELECT available_seats FROM ride_offers WHERE id=$1",[offerId])).rows[0].available_seats).toBe(2);

      const later = new Date(departure);
      later.setUTCDate(later.getUTCDate()+2);
      while (new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(later) === "Sun")
        later.setUTCDate(later.getUTCDate()+1);
      const secondBody = {...offerBody,departure_at:later.toISOString()};
      const secondOffer = await request(createApp()).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","race-offer").send(secondBody);
      expect(secondOffer.status).toBe(201);
      const secondOfferId = secondOffer.body.offer.id;
      const [requestRace,editRace] = await Promise.all([
        post(passenger.token,"race-request",{offer_id:secondOfferId,seats:1}),
        request(createApp()).patch(`/v1/corridor-offers/${secondOfferId}`)
          .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","race-edit")
          .send({...secondBody,capacity:1,version:1}),
      ]);
      expect(requestRace.status).toBe(201);
      expect([200,409]).toContain(editRace.status);
      const liveVersion = (await verificationPool.query("SELECT pilot_version FROM ride_offers WHERE id=$1",[secondOfferId])).rows[0].pilot_version;
      expect(requestRace.body.request.offer_version).toBe(liveVersion);
      expect(requestRace.body.request.offer_terms.capacity).toBe(editRace.status === 200 ? 1 : 2);
      await verificationPool.query(`CREATE OR REPLACE FUNCTION reject_seat_notification_for_test()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.origin_type='seat_request' THEN RAISE EXCEPTION 'synthetic notification failure'; END IF;
          RETURN NEW; END $$`);
      await verificationPool.query(`CREATE TRIGGER reject_seat_notification_for_test
        BEFORE INSERT ON pilot_notification_events FOR EACH ROW EXECUTE FUNCTION reject_seat_notification_for_test()`);
      try {
        expect((await post(other.token,"failed-notification",{offer_id:secondOfferId,seats:1})).status).toBeGreaterThanOrEqual(500);
        expect((await verificationPool.query<{count:number}>(`SELECT count(*)::int AS count FROM pilot_seat_requests
          WHERE offer_id=$1 AND passenger_id=$2`,[secondOfferId,other.id])).rows[0].count).toBe(0);
      } finally {
        await verificationPool.query("DROP TRIGGER reject_seat_notification_for_test ON pilot_notification_events");
        await verificationPool.query("DROP FUNCTION reject_seat_notification_for_test()");
      }
      expect((await post(passenger.token,"request-a",{offer_id:secondOfferId,seats:1})).body.error.code)
        .toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");

      const cutoffDeparture = new Date(later);
      cutoffDeparture.setUTCDate(cutoffDeparture.getUTCDate()+2);
      while (new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(cutoffDeparture) === "Sun")
        cutoffDeparture.setUTCDate(cutoffDeparture.getUTCDate()+1);
      const cutoffOffer = await request(createApp()).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","cutoff-offer")
        .send({...offerBody,departure_at:cutoffDeparture.toISOString()});
      expect(cutoffOffer.status).toBe(201);
      const cutoffId = cutoffOffer.body.offer.id;
      await verificationPool.query("UPDATE student_verifications SET eligibility_ends_at=now()-interval '1 second' WHERE user_id=$1",[other.id]);
      expect((await post(other.token,"stale-passenger",{offer_id:cutoffId,seats:1})).status).toBe(403);
      await verificationPool.query("UPDATE student_verifications SET eligibility_ends_at=now()+interval '1 year' WHERE user_id=$1",[other.id]);
      const requestCutoff = new Date(cutoffOffer.body.offer.request_cutoff_at).getTime();
      const decisionCutoff = new Date(cutoffOffer.body.offer.acceptance_cutoff_at).getTime();
      setSeatRequestClockForTests(() => new Date(requestCutoff-1));
      const beforeRequestCutoff = await post(other.token,"before-request-cutoff",{offer_id:cutoffId,seats:1});
      expect(beforeRequestCutoff.status).toBe(201);
      expect((await post(passenger.token,"second-before-request-cutoff",{offer_id:cutoffId,seats:1})).status).toBe(201);
      setSeatRequestClockForTests(() => new Date(requestCutoff));
      expect((await post(third.token,"at-request-cutoff",{offer_id:cutoffId,seats:1})).body.error.code)
        .toBe("REQUEST_WINDOW_CLOSED");
      setSeatRequestClockForTests(() => new Date(requestCutoff+1));
      expect((await post(third.token,"after-request-cutoff",{offer_id:cutoffId,seats:1})).body.error.code)
        .toBe("REQUEST_WINDOW_CLOSED");
      setSeatRequestClockForTests(() => new Date(decisionCutoff-1));
      expect((await request(createApp()).post(`/v1/seat-requests/${beforeRequestCutoff.body.request.id}/reject`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","before-decision-cutoff").send({})).status).toBe(200);
      const atDecisionId = (await verificationPool.query<{id:string}>(`SELECT id FROM pilot_seat_requests
        WHERE offer_id=$1 AND passenger_id=$2`,[cutoffId,passenger.id])).rows[0].id;
      setSeatRequestClockForTests(() => new Date(decisionCutoff));
      expect((await request(createApp()).post(`/v1/seat-requests/${atDecisionId}/reject`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","at-decision-cutoff").send({})).body.error.code)
        .toBe("REQUEST_NOT_PENDING");
      setSeatRequestClockForTests(() => new Date(decisionCutoff+1));
      expect((await request(createApp()).post(`/v1/seat-requests/${atDecisionId}/reject`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","after-decision-cutoff").send({})).body.error.code)
        .toBe("REQUEST_NOT_PENDING");
      setSeatRequestClockForTests(null);

      const operatorId = (await verificationPool.query<{id:string}>(
        "INSERT INTO users(email,role,email_verified_at) VALUES('seat-recovery-operator@example.test','admin',now()) RETURNING id"
      )).rows[0].id;
      await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
        VALUES($1,true,'synthetic seat recovery',now())`,[operatorId]);
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
      await verificationPool.query("DELETE FROM pilot_email_jobs WHERE event_id IN (SELECT id FROM pilot_notification_events WHERE origin_type='seat_request')");
      await verificationPool.query("DELETE FROM pilot_notification_events WHERE origin_type='seat_request'");
      await verificationPool.query("DELETE FROM pilot_seat_request_audit");
      await verificationPool.query("DELETE FROM pilot_seat_request_operations");
      await verificationPool.query("DELETE FROM pilot_seat_requests");
      expect(await new SeatRequestsService().reconcileReceipts(operatorId)).toBe(7);
      expect((await verificationPool.query<{n:number}>(
        "SELECT count(*)::int AS n FROM pilot_seat_requests WHERE offer_id=$1",[offerId])).rows[0].n).toBe(2);
      expect((await verificationPool.query<{n:number}>(
        "SELECT count(*)::int AS n FROM pilot_seat_request_operations WHERE state='recovered'")).rows[0].n).toBe(7);
      expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_email_jobs j
        JOIN pilot_notification_events e ON e.id=j.event_id
        WHERE e.origin_type='seat_request' AND j.status='pending'`)).rows[0].n).toBe(7);
      expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_notification_events e
        JOIN pilot_seat_request_operations o ON o.id=e.operation_id
        WHERE e.origin_type='seat_request' AND e.id=o.id`)).rows[0].n).toBe(7);
    } finally {setSeatRequestClockForTests(null);await rm(directory,{recursive:true,force:true});}
  });
});

beforeEach(async () => {
  resetRateLimitsForTests();
  await verificationPool.query("TRUNCATE TABLE auth_claim_reviews");
  await verificationPool.query("TRUNCATE TABLE users CASCADE");
  await verificationPool.query("TRUNCATE pilot_pause_audit, pilot_pause_followup, pilot_pause_operations, pilot_reopen_audit, pilot_reopen_operations CASCADE");
  await verificationPool.query("TRUNCATE pilot_backup_attempts");
  await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL");
  await verificationPool.query("INSERT INTO pilot_recovery_state (singleton, mode) VALUES (true, 'open') ON CONFLICT (singleton) DO UPDATE SET mode = 'open', cause = NULL, started_at = NULL, reconciled_at = NULL");
  setManagedAuthEnabledForTests(null);
  setAuthProviderForTests(null);
  setBackupObjectProbeForTests(null);
  await verificationPool.query(
    `UPDATE auth_cutover_state
        SET active_provider = 'legacy', legacy_login_enabled = true,
            authorized_at = NULL, authorized_by = NULL`,
  );
});

afterAll(async () => {
  await Promise.all([pool.end(), verificationPool.end()]);
});

describe("managed authentication HTTP boundary with PostgreSQL", () => {
  it("claims a verified provider identity without changing the stable application owner", async () => {
    const legacy = await verificationPool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ('student@example.test', 'legacy-hash') RETURNING id`,
    );
    const passenger = await verificationPool.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('passenger@example.test') RETURNING id`,
    );
    await verificationPool.query(
      `INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Existing Student')`,
      [legacy.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ('10000000-0000-4000-8000-000000000008', $1, 'legacy-refresh', now() + interval '1 day')`,
      [legacy.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO vehicles (owner_user_id, vehicle_type, registration_number_last4, seat_capacity)
       VALUES ($1, 'car', '1234', 4)`,
      [legacy.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO student_verifications
        (user_id, provider, status, institution_name, eligibility_ends_at)
       VALUES ($1, 'manual_review', 'verified', 'Synthetic College', now() + interval '1 year')`,
      [legacy.rows[0].id],
    );
    const vehicle = await verificationPool.query<{ id: string }>(
      `SELECT id FROM vehicles WHERE owner_user_id = $1`,
      [legacy.rows[0].id],
    );
    const offer = await verificationPool.query<{ id: string }>(
      `INSERT INTO ride_offers
        (driver_id, vehicle_id, pickup_location, pickup_lat, pickup_lng,
         drop_location, drop_lat, drop_lng, date, time, available_seats,
         price_per_seat_paise, status)
       VALUES ($1, $2, 'Origin', 20, 77, 'Destination', 20.1, 77.1,
         current_date + 1, '09:00', 2, 12000, 'active') RETURNING id`,
      [legacy.rows[0].id, vehicle.rows[0].id],
    );
    const booking = await verificationPool.query<{ id: string }>(
      `INSERT INTO bookings
        (ride_offer_id, created_by_user_id, passenger_id, driver_id, seats_booked,
         total_amount_paise, platform_fee_paise, status, payment_state, confirmed_at)
       VALUES ($1, $2, $3, $2, 1, 12500, 500, 'confirmed', 'paid_escrow', now())
       RETURNING id`,
      [offer.rows[0].id, legacy.rows[0].id, passenger.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO payment_orders
        (booking_id, user_id, provider, provider_order_id, amount_paise,
         currency, status, idempotency_key)
       VALUES ($1, $2, 'historical-razorpay', 'synthetic-order', 12500,
         'INR', 'paid', 'synthetic-key')`,
      [booking.rows[0].id, legacy.rows[0].id],
    );
    await verificationPool.query(
      `INSERT INTO booking_settlements
        (booking_id, payer_user_id, payee_user_id, ride_fare_paise,
         platform_fee_paise, total_due_paise, paid_amount_paise,
         preferred_payment_method, status)
       VALUES ($1, $2, $3, 12000, 500, 12500, 12500, 'online', 'settled')`,
      [booking.rows[0].id, passenger.rows[0].id, legacy.rows[0].id],
    );
    setManagedAuthEnabledForTests(true);
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setAuthProviderForTests(fakeProvider({
      subject: "supabase-subject-1",
      email: "STUDENT@example.test",
      emailVerified: true,
      assuranceLevel: "aal1",
      userMetadata: {},
    }));

    const response = await request(createApp()).post("/v1/auth/login").send({
      email: "student@example.test",
      password: "synthetic-password",
    });

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(legacy.rows[0].id);
    const ownership = await verificationPool.query(
      `SELECT v.owner_user_id, i.provider_subject, u.password_hash, u.email_verified_at IS NOT NULL AS verified
         FROM vehicles v JOIN users u ON u.id = v.owner_user_id
         JOIN auth_identities i ON i.user_id = u.id`,
    );
    expect(ownership.rows).toEqual([expect.objectContaining({
      owner_user_id: legacy.rows[0].id,
      provider_subject: "supabase-subject-1",
      password_hash: null,
      verified: true,
    })]);
    expect((await verificationPool.query(
      `SELECT event_type FROM auth_identity_events WHERE user_id = $1`,
      [legacy.rows[0].id],
    )).rows).toEqual([{ event_type: "claimed" }]);
    expect((await verificationPool.query(
      `SELECT revoked_at IS NOT NULL AS revoked FROM refresh_tokens WHERE user_id = $1`,
      [legacy.rows[0].id],
    )).rows).toEqual([{ revoked: true }]);
    const history = await verificationPool.query(
      `SELECT b.created_by_user_id, b.passenger_id, b.driver_id,
              s.payer_user_id, s.payee_user_id, s.total_due_paise,
              p.user_id AS payment_user_id, p.amount_paise,
              v.user_id AS approval_user_id
         FROM bookings b
         JOIN booking_settlements s ON s.booking_id = b.id
         JOIN payment_orders p ON p.booking_id = b.id
         JOIN student_verifications v ON v.user_id = b.driver_id`,
    );
    expect(history.rows).toEqual([{
      created_by_user_id: legacy.rows[0].id,
      passenger_id: passenger.rows[0].id,
      driver_id: legacy.rows[0].id,
      payer_user_id: passenger.rows[0].id,
      payee_user_id: legacy.rows[0].id,
      total_due_paise: 12500,
      payment_user_id: legacy.rows[0].id,
      amount_paise: 12500,
      approval_user_id: legacy.rows[0].id,
    }]);
  });

  it("does not map or authenticate an unverified provider address", async () => {
    setManagedAuthEnabledForTests(true);
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setAuthProviderForTests(fakeProvider({
      subject: "unverified-subject",
      email: "unverified@example.test",
      emailVerified: false,
      assuranceLevel: "aal1",
      userMetadata: { full_name: "Unverified Student" },
    }));

    const response = await request(createApp()).post("/v1/auth/login").send({
      email: "unverified@example.test",
      password: "synthetic-password",
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect((await verificationPool.query("SELECT count(*)::int AS count FROM users")).rows[0].count).toBe(0);
    expect((await verificationPool.query("SELECT reason FROM auth_claim_reviews")).rows).toEqual([
      { reason: "email_not_verified" },
    ]);
  });

  it("routes a competing verified identity claim to review without changing the stable owner", async () => {
    const legacy = await verificationPool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ('race@example.test', 'legacy-hash') RETURNING id`,
    );
    await verificationPool.query(
      `INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Race Student')`,
      [legacy.rows[0].id],
    );
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests({
      ...fakeProvider({ subject: "unused", email: "race@example.test", emailVerified: true, assuranceLevel: "aal1", userMetadata: {} }),
      login: async (email) => ({
        accessToken: `access-${email}`,
        refreshToken: `refresh-${email}`,
        expiresIn: 900,
        identity: {
          subject: email.startsWith("first") ? "subject-first" : "subject-second",
          email: "race@example.test",
          emailVerified: true,
          assuranceLevel: "aal1",
          userMetadata: {},
        },
      }),
    });

    const responses = await Promise.all([
      request(createApp()).post("/v1/auth/login").send({ email: "first@example.test", password: "synthetic-password" }),
      request(createApp()).post("/v1/auth/login").send({ email: "second@example.test", password: "synthetic-password" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code).toBe("IDENTITY_REVIEW_REQUIRED");
    expect((await verificationPool.query(
      `SELECT user_id FROM auth_identities WHERE disabled_at IS NULL`,
    )).rows).toEqual([{ user_id: legacy.rows[0].id }]);
  });

  it("starts browser registration with a server-held PKCE verifier", async () => {
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({
      subject: "pending-subject",
      email: "pkce@example.test",
      emailVerified: false,
      assuranceLevel: null,
      userMetadata: {},
    }));

    const response = await request(createApp()).post("/v1/auth/register").send({
      email: "pkce@example.test",
      password: "synthetic-password",
      fullName: "PKCE Student",
    });

    expect(response.status).toBe(202);
    expect(response.headers["set-cookie"]?.some((cookie: string) =>
      cookie.startsWith("pp_pkce_verifier=") && cookie.includes("HttpOnly"),
    )).toBe(true);
  });

  it("exchanges a browser authorization code without exposing provider tokens in the URL", async () => {
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    const pendingIdentity: ProviderIdentity = {
      subject: "pkce-subject",
      email: "callback@example.test",
      emailVerified: false,
      assuranceLevel: null,
      userMetadata: { full_name: "Callback Student" },
    };
    const verifiedIdentity = { ...pendingIdentity, emailVerified: true, assuranceLevel: "aal1" };
    setAuthProviderForTests({
      ...fakeProvider(pendingIdentity),
      exchangeCode: async (code, verifier) => {
        if (code !== "authorization-code" || !verifier) throw new Error("invalid PKCE exchange");
        return {
          accessToken: "callback-access",
          refreshToken: "callback-refresh",
          expiresIn: 900,
          identity: verifiedIdentity,
        };
      },
    });
    const registration = await request(createApp()).post("/v1/auth/register").send({
      email: "callback@example.test",
      password: "synthetic-password",
      fullName: "Callback Student",
    });
    const pkceCookie = registration.headers["set-cookie"]?.find((cookie: string) =>
      cookie.startsWith("pp_pkce_verifier="),
    );

    const response = await request(createApp())
      .post("/v1/auth/provider-session")
      .set("Cookie", pkceCookie)
      .send({ code: "authorization-code" });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: "callback@example.test", isVerified: false });
  });

  it("denies an aal2 admin who is not currently operator-allowlisted", async () => {
    const admin = await verificationPool.query<{ id: string }>(
      `INSERT INTO users (email, role) VALUES ('operator@example.test', 'admin') RETURNING id`,
    );
    await verificationPool.query(
      `INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Test Operator')`,
      [admin.rows[0].id],
    );
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({
      subject: "operator-subject",
      email: "operator@example.test",
      emailVerified: true,
      assuranceLevel: "aal2",
      userMetadata: { role: "admin" },
    }));
    const agent = request.agent(createApp());
    expect((await agent.post("/v1/auth/login").send({
      email: "operator@example.test",
      password: "synthetic-password",
    })).status).toBe(200);

    const response = await agent.get("/v1/verification/admin/pending");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("OPERATOR_ACCESS_REVOKED");
  });

  it("rejects a stale access token when its provider session is revoked", async () => {
    await verificationPool.query(
      `UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false,
              authorized_at = now(), authorized_by = 'integration-test'`,
    );
    setManagedAuthEnabledForTests(true);
    const identity: ProviderIdentity = {
      subject: "revoked-subject",
      email: "revoked@example.test",
      emailVerified: true,
      assuranceLevel: "aal1",
      userMetadata: { full_name: "Revoked Student" },
    };
    let revoked = false;
    const provider = fakeProvider(identity);
    setAuthProviderForTests({
      ...provider,
      refresh: async (refreshToken) => {
        if (revoked) throw new Error("provider session revoked");
        return provider.refresh(refreshToken);
      },
    });
    const agent = request.agent(createApp());
    expect((await agent.post("/v1/auth/login").send({
      email: "revoked@example.test",
      password: "synthetic-password",
    })).status).toBe(200);
    expect((await agent.get("/v1/auth/me")).status).toBe(200);

    revoked = true;
    const response = await agent.get("/v1/auth/me");

    expect(response.status).toBe(401);
  });
});

describe("legacy registration HTTP characterization with PostgreSQL", () => {
  it("commits a registered user before returning the response", async () => {
    const response = await request(createApp()).post("/v1/auth/register").send({
      email: "synthetic.student@example.test",
      password: "synthetic-password",
      fullName: "Synthetic Student",
      college: "Synthetic College",
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      email: "synthetic.student@example.test",
      fullName: "Synthetic Student",
    });

    const persisted = await verificationPool.query(
      "SELECT email FROM users WHERE id = $1",
      [response.body.user.id],
    );
    expect(persisted.rows).toEqual([{ email: "synthetic.student@example.test" }]);
  });
});

describe("synthetic student evidence HTTP/PostgreSQL", () => {
  let evidenceDirectory: string;
  beforeEach(async () => {
    evidenceDirectory = await mkdtemp(resolve(tmpdir(), "pilot-student-evidence-"));
    process.env.PILOT_SYNTHETIC_EVIDENCE_DIR = evidenceDirectory;
    await verificationPool.query("UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
  });
  afterEach(async () => { await rm(evidenceDirectory, { recursive: true, force: true }); });
  afterAll(async () => { delete process.env.PILOT_SYNTHETIC_EVIDENCE_DIR; });

  async function student(label: string) {
    const email = `${label}@example.test`;
    const subject = `${label}-subject`;
    const user = await verificationPool.query<{ id: string }>("INSERT INTO users (email, email_verified_at) VALUES ($1, now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Synthetic Student')", [user.rows[0].id]);
    await verificationPool.query("INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)", [subject, user.rows[0].id, email]);
    const identity = { subject, email, emailVerified: true, assuranceLevel: "aal1" as const, userMetadata: {} };
    setAuthProviderForTests(fakeProvider(identity));
    const agent = request.agent(createApp());
    const login = await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    expect(login.status).toBe(200);
    const csrf = login.headers["set-cookie"]?.find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    const cookie = login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; ");
    return { agent, userId: user.rows[0].id, csrf, cookie, identity };
  }

  it("keeps document bytes outside PostgreSQL and denies another student access", async () => {
    const owner = await student("evidence-owner");
    const details = { provider: "manual_review", enrolled_name: "Synthetic Student", evidence_category: "enrollment_letter", age_evidence_category: "institution_age_record", institution_name: "Synthetic College", admission_year: 2025, graduation_year: 2029 };
    const forbidden = await request(createApp()).put("/v1/verification/student").set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).send({ ...details, birth_date: "2005-01-01" });
    expect(forbidden.status).toBe(400);
    expect((await request(createApp()).put("/v1/verification/student").set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).send(details)).status).toBe(200);
    const bytes = Buffer.from("%PDF-1.4\nsynthetic sample\n");
    const upload = await request(createApp()).post("/v1/verification/student/evidence?purpose=enrollment").set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).set("X-Synthetic-Evidence", "true").set("Content-Type", "application/pdf").send(bytes);
    expect(upload.status, JSON.stringify(upload.body)).toBe(201);
    const row = await verificationPool.query<{ object_key: string; byte_count: number }>("SELECT object_key, byte_count FROM student_evidence WHERE user_id = $1 AND purpose = 'enrollment'", [owner.userId]);
    expect(row.rows[0].byte_count).toBe(bytes.length);
    expect(await readFile(resolve(evidenceDirectory, row.rows[0].object_key))).toEqual(bytes);
    const unrelated = await student("evidence-unrelated");
    setAuthProviderForTests(fakeProvider(unrelated.identity));
    const denied = await unrelated.agent.get(`/v1/verification/admin/student/${owner.userId}/evidence?purpose=enrollment`);
    expect(denied.status).toBe(403);
  });

  it("reviews both documents once, publishes the recipient event, and rejects a changed retry", async () => {
    const receiptDirectory = await mkdtemp(resolve(tmpdir(), "pilot-student-receipt-"));
    process.env.PILOT_RECEIPT_PATH = resolve(receiptDirectory, "receipts");
    process.env.PILOT_RECEIPT_SECRET = "integration-test-independent-receipt-secret";
    try {
      const owner = await student("review-owner");
      const details = { provider: "manual_review", enrolled_name: "Synthetic Student", evidence_category: "enrollment_letter", age_evidence_category: "institution_age_record", institution_name: "Synthetic College", admission_year: 2025, graduation_year: 2029 };
      expect((await request(createApp()).put("/v1/verification/student").set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).send(details)).status).toBe(200);
      for (const purpose of ["enrollment", "age"]) {
        const upload = await request(createApp()).post(`/v1/verification/student/evidence?purpose=${purpose}`).set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).set("X-Synthetic-Evidence", "true").set("Content-Type", "application/pdf").send(Buffer.from("%PDF-1.4\nsynthetic sample\n"));
        expect(upload.status, JSON.stringify(upload.body)).toBe(201);
      }
      const email = "student-review-operator@example.test";
      const subject = "student-review-operator-subject";
      const operator = await verificationPool.query<{ id: string }>("INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
      await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Review Operator')", [operator.rows[0].id]);
      await verificationPool.query("INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)", [subject, operator.rows[0].id, email]);
      await verificationPool.query("INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'test', now())", [operator.rows[0].id]);
      setAuthProviderForTests(fakeProvider({ subject, email, emailVerified: true, assuranceLevel: "aal2", userMetadata: {} }));
      const login = await request(createApp()).post("/v1/auth/login").send({ email, password: "synthetic-password" });
      expect(login.status).toBe(200);
      const cookie = login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; ");
      const csrf = login.headers["set-cookie"].find((item: string) => item.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
      const path = `/v1/verification/admin/student/${owner.userId}`;
      const post = (key: string, reason: string) => request(createApp()).post(`${path}/review`).set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", key).send({ outcome: "verified", adult_eligible: true, reason });
      const grant = await request(createApp()).post(`${path}/evidence-access?purpose=age`).set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf);
      expect(grant.status, JSON.stringify(grant.body)).toBe(201);
      expect((await request(createApp()).get(`${path}/evidence?purpose=enrollment`).set("Cookie", cookie).set("X-Evidence-Token", grant.body.token)).status).toBe(403);
      const access = await request(createApp()).get(`${path}/evidence?purpose=age`).set("Cookie", cookie).set("X-Evidence-Token", grant.body.token);
      expect(access.status).toBe(200);
      const accessAudit = await verificationPool.query<{ action: string }>("SELECT action FROM audit_logs WHERE actor_user_id = $1 AND entity_id = $2 ORDER BY created_at", [operator.rows[0].id, owner.userId]);
      expect(accessAudit.rows.map((row) => row.action).sort()).toEqual(["student_evidence_access_granted", "student_evidence_accessed"]);
      await verificationPool.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [operator.rows[0].id]);
      expect((await request(createApp()).post(`${path}/evidence-access?purpose=enrollment`).set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf)).status).toBe(403);
      await verificationPool.query("UPDATE operator_allowlist SET active = true WHERE user_id = $1", [operator.rows[0].id]);
      expect((await request(createApp()).get(`${path}/evidence?purpose=age`).set("Cookie", cookie).set("X-Evidence-Token", grant.body.token)).status).toBe(403);
      const expiring = await request(createApp()).post(`${path}/evidence-access?purpose=enrollment`).set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf);
      expect(expiring.status).toBe(201);
      await verificationPool.query("UPDATE student_evidence_access_grants SET expires_at = now() - interval '1 second' WHERE target_user_id = $1", [owner.userId]);
      expect((await request(createApp()).get(`${path}/evidence?purpose=enrollment`).set("Cookie", cookie).set("X-Evidence-Token", expiring.body.token)).status).toBe(403);
      setStudentReviewAfterCommitHookForTests(() => { throw new Error("synthetic process interruption after commit"); });
      const interrupted = await post("student-review-1", "Both documents checked");
      expect(interrupted.status).toBe(500);
      const pending = await verificationPool.query("SELECT id, state FROM student_review_operations WHERE idempotency_key = 'student-review-1'");
      expect(pending.rows[0].state).toBe("committed");
      expect((await verificationPool.query("SELECT ready_at FROM pilot_notification_events WHERE operation_id = $1", [pending.rows[0].id])).rows[0].ready_at).toBeNull();
      setStudentReviewAfterCommitHookForTests(null);
      const first = await post("student-review-1", "Both documents checked");
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.operation.state).toBe("acknowledged");
      expect((await post("student-review-1", "Both documents checked")).body.operation.id).toBe(first.body.operation.id);
      expect((await post("student-review-1", "Changed review reason")).status).toBe(409);
      const events = await verificationPool.query("SELECT recipient_id, ready_at FROM pilot_notification_events WHERE origin_type = 'student_review'");
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].recipient_id).toBe(owner.userId);
      expect(events.rows[0].ready_at).toBeTruthy();
      expect((await verificationPool.query("SELECT count(*)::int AS n FROM student_review_audit")).rows[0].n).toBe(1);
      const retention = await verificationPool.query("SELECT EXTRACT(EPOCH FROM (delete_after - decision_at))::int AS seconds FROM student_evidence WHERE user_id = $1", [owner.userId]);
      expect(retention.rows).toEqual([{ seconds: 6 * 24 * 60 * 60 }, { seconds: 6 * 24 * 60 * 60 }]);
      await verificationPool.query("UPDATE student_verifications SET review_cycle = 2, status = 'pending_review', reviewed_at = NULL, adult_eligible = NULL WHERE user_id = $1", [owner.userId]);
      await verificationPool.query("UPDATE user_profiles SET is_verified = false, college = NULL WHERE user_id = $1", [owner.userId]);
      const reconcile = await request(createApp()).post("/v1/operator/reconcile").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
      expect(reconcile.status, JSON.stringify(reconcile.body)).toBe(200);
      const later = await verificationPool.query("SELECT review_cycle, status FROM student_verifications WHERE user_id = $1", [owner.userId]);
      expect(later.rows).toEqual([{ review_cycle: 2, status: "pending_review" }]);
      const reopen = await request(createApp()).post("/v1/operator/reopen").set("Idempotency-Key", "student-review-reopen").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ reason: "Reviewed the recovered student decision and current review cycle" });
      expect(reopen.status, JSON.stringify(reopen.body)).toBe(200);
      setAuthProviderForTests(fakeProvider(owner.identity));
      for (const purpose of ["enrollment", "age"]) {
        const upload = await request(createApp()).post(`/v1/verification/student/evidence?purpose=${purpose}`).set("Cookie", owner.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", owner.csrf).set("X-Synthetic-Evidence", "true").set("Content-Type", "application/pdf").send(Buffer.from("%PDF-1.4\nsynthetic renewed sample\n"));
        expect(upload.status, JSON.stringify(upload.body)).toBe(201);
      }
      setAuthProviderForTests(fakeProvider({ subject, email, emailVerified: true, assuranceLevel: "aal2", userMetadata: {} }));
      await verificationPool.query("UPDATE student_verifications SET eligibility_ends_at = now() - interval '1 second' WHERE user_id = $1", [owner.userId]);
      const expired = await post("student-review-expired", "Enrollment has expired");
      expect(expired.status).toBe(409);
      await verificationPool.query("UPDATE student_verifications SET eligibility_ends_at = now() + interval '1 year' WHERE user_id = $1", [owner.userId]);
      const competing = await Promise.all([
        post("student-review-race-a", "Concurrent review attempt"),
        post("student-review-race-b", "Concurrent review attempt"),
      ]);
      expect(competing.map((response) => response.status)).toContain(200);
      expect([409, 503]).toContain(competing.find((response) => response.status !== 200)?.status);
      expect((await verificationPool.query("SELECT count(*)::int AS n FROM student_review_audit WHERE target_user_id = $1", [owner.userId])).rows[0].n).toBe(2);
    } finally {
      setStudentReviewAfterCommitHookForTests(null);
      delete process.env.PILOT_RECEIPT_PATH;
      delete process.env.PILOT_RECEIPT_SECRET;
      await rm(receiptDirectory, { recursive: true, force: true });
    }
  });
});

describe("driver and car approval HTTP/PostgreSQL", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(resolve(tmpdir(), "driver-car-http-"));
    process.env.PILOT_SYNTHETIC_EVIDENCE_DIR = directory;
    process.env.PILOT_RECEIPT_PATH = resolve(directory, "receipts");
    process.env.PILOT_RECEIPT_SECRET = "driver-car-http-independent-receipt-secret";
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider = 'supabase',
      legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'`);
    setManagedAuthEnabledForTests(true);
  });
  afterEach(async () => {
    delete process.env.PILOT_SYNTHETIC_EVIDENCE_DIR;
    delete process.env.PILOT_RECEIPT_PATH;
    delete process.env.PILOT_RECEIPT_SECRET;
    await rm(directory, { recursive: true, force: true });
  });

  async function principal(label: string, admin = false, assuranceLevel = "aal1") {
    const email = `${label}@example.test`;
    const subject = `${label}-subject`;
    const userId = (await verificationPool.query<{ id: string }>(
      `INSERT INTO users (email, role, email_verified_at)
      VALUES ($1, $2, now()) RETURNING id`, [email, admin ? "admin" : "user"])).rows[0].id;
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, $2)",
      [userId, admin ? "Synthetic Operator" : "Synthetic Driver"]);
    await verificationPool.query(`INSERT INTO auth_identities
      (provider, provider_subject, user_id, provider_email)
      VALUES ('supabase', $1, $2, $3)`, [subject, userId, email]);
    if (admin) await verificationPool.query(`INSERT INTO operator_allowlist
      (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic', now())`, [userId]);
    const identity = { subject, email, emailVerified: true, assuranceLevel, userMetadata: {} };
    setAuthProviderForTests(fakeProvider(identity));
    const login = await request(createApp()).post("/v1/auth/login")
      .send({ email, password: "synthetic-password" });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; ");
    const csrf = login.headers["set-cookie"].find((item: string) =>
      item.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    return { userId, cookie, csrf, identity };
  }

  it("submits each document and separately reviews driver, car, and permission through HTTP", async () => {
    const driver = await principal("driver-car-applicant");
    await verificationPool.query(`INSERT INTO student_verifications
      (user_id, provider, status, adult_eligible, institution_name, eligibility_ends_at)
      VALUES ($1, 'manual_review', 'verified', true, 'Synthetic College', now() + interval '1 year')`,
      [driver.userId]);
    const mutation = (method: "post" | "put", path: string, actor = driver) =>
      request(createApp())[method](path).set("Cookie", actor.cookie)
        .set("Origin", "http://localhost:3000").set("X-CSRF-Token", actor.csrf!);
    expect((await mutation("put", "/v1/verification/driver-eligibility")
      .send({ license_number_last4: "1234", license_expires_at: "2099-12-31" })).status).toBe(200);
    const carResponse = await mutation("post", "/v1/verification/vehicles")
      .send({ vehicle_type: "car", registration_number_last4: "5678", seat_capacity: 4 });
    expect(carResponse.status, JSON.stringify(carResponse.body)).toBe(201);
    const car = carResponse.body.vehicle.id;
    expect((await mutation("put", `/v1/verification/vehicles/${car}/pilot-documents`)
      .send({ use_category: "private", applicable_document_required: true,
        insurance_expires_at: "2099-12-31", registration_expires_at: null })).status).toBe(200);
    const associationResponse = await mutation("post", "/v1/verification/driver-vehicle-associations")
      .send({ vehicle_id: car, permission_category: "owner" });
    expect(associationResponse.status, JSON.stringify(associationResponse.body)).toBe(201);
    const association = associationResponse.body.association.id;
    for (const [type, id, purpose] of [
      ["driver", driver.userId, "licence"], ["vehicle", car, "registration"],
      ["vehicle", car, "insurance"], ["vehicle", car, "applicable"],
      ["association", association, "permission"],
    ]) {
      const upload = await mutation("post", `/v1/verification/driver-car-evidence/${type}/${id}/${purpose}`)
        .set("X-Synthetic-Evidence", "true").set("Content-Type", "application/pdf")
        .send(Buffer.from("%PDF-1.4\nsynthetic document\n"));
      expect(upload.status, JSON.stringify(upload.body)).toBe(201);
    }
    const operator = await principal("driver-car-reviewer", true, "aal1");
    const review = (type: string, id: string, key: string) =>
      mutation("post", `/v1/verification/admin/driver-car/${type}/${id}/review`, operator)
        .set("Idempotency-Key", key).send({ outcome: "approved",
          reason: "Synthetic documents checked", review_after: "2099-12-30" });
    expect((await review("driver", driver.userId, "http-driver")).status).toBe(403);
    setAuthProviderForTests(fakeProvider({ ...operator.identity, assuranceLevel: "aal2" }));
    const grant = await mutation("post", `/v1/verification/admin/driver-car-evidence/driver/${driver.userId}/licence/access`, operator)
      .send({});
    expect(grant.status, JSON.stringify(grant.body)).toBe(201);
    const read = await request(createApp()).get(
      `/v1/verification/admin/driver-car-evidence/driver/${driver.userId}/licence`)
      .set("Cookie", operator.cookie).set("X-Evidence-Token", grant.body.token);
    expect(read.status).toBe(200);
    for (const [type, id, key] of [
      ["driver", driver.userId, "http-driver"], ["vehicle", car, "http-car"],
      ["association", association, "http-permission"],
    ]) {
      const response = await review(type, id, key);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.operation.state).toBe("acknowledged");
    }
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM pilot_notification_events
      WHERE origin_type = 'driver_car_review' AND ready_at IS NOT NULL`)).rows[0].n).toBe(3);
  });
});

describe("protected operator pause HTTP/PostgreSQL", () => {
  let receiptDirectory: string;
  beforeEach(async () => {
    receiptDirectory = await mkdtemp(resolve(tmpdir(), "pilot-pause-"));
    process.env.PILOT_RECEIPT_PATH = resolve(receiptDirectory, "receipts");
    process.env.PILOT_RECEIPT_SECRET = "integration-test-independent-receipt-secret";
  });
  afterAll(async () => {
    delete process.env.PILOT_RECEIPT_PATH;
    delete process.env.PILOT_RECEIPT_SECRET;
  });
  async function operator(assuranceLevel: "aal1" | "aal2" = "aal2", allowlisted = true, label = "pause") {
    const email = `${label}-operator@example.test`;
    const subject = `${label}-subject`;
    const admin = await verificationPool.query<{ id: string }>("INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    const userId = admin.rows[0].id;
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'Pause Operator')", [userId]);
    await verificationPool.query("INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)", [subject, userId, email]);
    if (allowlisted) await verificationPool.query("INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'test', now())", [userId]);
    await verificationPool.query("UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({ subject, email, emailVerified: true, assuranceLevel, userMetadata: {} }));
    const agent = request.agent(createApp());
    const login = await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    const csrf = login.headers["set-cookie"]?.find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    expect(csrf).toBeTruthy();
    const cookie = login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; ");
    return { agent, userId, csrf, cookie };
  }
  async function startCrashServer(point: string | undefined, receipts: string) {
    const child = spawn(resolve(process.cwd(), "../../node_modules/.bin/tsx"), [resolve(import.meta.dirname, "operator-crash-server.ts")], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test", PILOT_RECEIPT_PATH: receipts, PILOT_RECEIPT_SECRET: "integration-test-independent-receipt-secret", PILOT_TEST_CRASH_POINT: point ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const port = await new Promise<number>((resolvePort, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error(`Crash server start timed out: ${stderr}`)); }, 10000);
      let stdout = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        const match = stdout.match(/READY:(\d+)/);
        if (match) { clearTimeout(timeout); resolvePort(Number(match[1])); }
      });
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Crash server exited ${code}: ${stderr}`)); });
    });
    return { child, url: `http://127.0.0.1:${port}` };
  }
  async function loginToCrashServer(url: string) {
    const login = await request(url).post("/v1/auth/login").send({ email: "pause-operator@example.test", password: "synthetic-password" });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    return {
      cookie: login.headers["set-cookie"].map((item: string) => item.split(";", 1)[0]).join("; "),
      csrf: login.headers["set-cookie"].find((item: string) => item.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1] as string,
    };
  }
  async function stopCrashServer(child: ChildProcess) {
    if (child.exitCode !== null) return;
    await new Promise<void>((resolveStop) => {
      child.once("exit", () => resolveStop());
      child.kill("SIGTERM");
    });
  }
  it("commits a recipient notification and email job once, visible after recovery evidence", async () => {
    const { agent, userId, csrf, cookie } = await operator();
    const body = { capability: "offers", paused: true, reason: "Corridor access temporarily blocked" };
    const send = () => request(createApp()).post("/v1/operator/pause")
      .set("Cookie", cookie).set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf).set("Idempotency-Key", "notification-1").send(body);
    const first = await send();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect((await send()).body.id).toBe(first.body.id);
    const other = await verificationPool.query<{ id: string }>("INSERT INTO users (email) VALUES ('other-notification@example.test') RETURNING id");
    const event = await verificationPool.query(
      `SELECT e.recipient_id, j.status, j.attempts, j.due_at <= now() + interval '1 minute' AS timely
       FROM pilot_notification_events e JOIN pilot_email_jobs j ON j.event_id = e.id
       WHERE e.operation_id = $1`, [first.body.id],
    );
    expect(event.rows).toEqual([{ recipient_id: userId, status: "pending", attempts: 0, timely: true }]);
    const visible = await agent.get("/v1/notifications/durable");
    expect(visible.status).toBe(200);
    expect(visible.body.notifications).toEqual([expect.objectContaining({ related_entity_id: first.body.id })]);
    expect(visible.body.notifications[0].body).toBe("Offers were paused by an operator.");
    expect((await agent.get("/v1/operator/notifications/delivery")).body.health.due).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS count FROM pilot_notification_events WHERE recipient_id = $1", [other.rows[0].id])).rows[0].count).toBe(0);
    const second = await operator("aal2", true, "second-notification");
    expect((await second.agent.get("/v1/notifications/durable")).body.notifications).toEqual([]);
    const jobId = (await verificationPool.query<{ id: string }>("SELECT id FROM pilot_email_jobs LIMIT 1")).rows[0].id;
    await verificationPool.query("UPDATE pilot_email_jobs SET status = 'exhausted', attempts = 5, last_error = 'secret provider response' WHERE id = $1", [jobId]);
    const delivery = await second.agent.get("/v1/operator/notifications/delivery");
    expect(JSON.stringify(delivery.body)).not.toContain("secret provider response");
    expect(delivery.body.jobs[0].last_error).toContain("redacted");
    const retry = await request(createApp()).post(`/v1/operator/notifications/email/${jobId}/retry`)
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf).set("Idempotency-Key", "email-retry-1").send({});
    expect(retry.status).toBe(200);
    expect((await verificationPool.query("SELECT status, attempts FROM pilot_email_jobs WHERE id = $1", [jobId])).rows).toEqual([{ status: "pending", attempts: 0 }]);
    await verificationPool.query("UPDATE pilot_email_jobs SET status = 'exhausted', attempts = 5 WHERE id = $1", [jobId]);
    const repeated = await request(createApp()).post(`/v1/operator/notifications/email/${jobId}/retry`)
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf).set("Idempotency-Key", "email-retry-1").send({});
    expect(repeated.status).toBe(200);
    expect((await verificationPool.query("SELECT status, attempts FROM pilot_email_jobs WHERE id = $1", [jobId])).rows).toEqual([{ status: "exhausted", attempts: 5 }]);
  });
  it("authorizes current allowlist and MFA, then keeps duplicate decisions stable", async () => {
    const { agent, userId, csrf, cookie } = await operator();
    const body = { capability: "offers", paused: true, reason: "Corridor hazard reported" };
    const first = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "pause-1").send(body);
    expect(first.status).toBe(200);
    expect(first.body.state).toBe("acknowledged");
    const repeated = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "pause-1").send(body);
    expect(repeated.body.id).toBe(first.body.id);
    const changed = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "pause-1").send({ ...body, paused: false });
    expect(changed.body.error.code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");
    const row = await verificationPool.query("SELECT count(*)::int AS total FROM pilot_pause_audit WHERE operator_id = $1", [userId]);
    expect(row.rows[0].total).toBe(1);
    const status = await agent.get(`/v1/operator/operations/${first.body.id}`);
    expect(status.body.state).toBe("acknowledged");
    const byKey = await agent.get("/v1/operator/operations/by-key/pause-1");
    expect(byKey.body.id).toBe(first.body.id);
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("resumes a persisted intent through a fresh HTTP app", async () => {
    const { userId, csrf, cookie } = await operator();
    const body = { capability: "requests", paused: true, reason: "Restart boundary rehearsal" };
    const payloadDigest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const intent = await verificationPool.query<{ id: string }>(
      `INSERT INTO pilot_pause_operations (operator_id, idempotency_key, payload_digest, capability, paused, reason, state)
       VALUES ($1, 'restart-intent', $2, $3, $4, $5, 'intent') RETURNING id`,
      [userId, payloadDigest, body.capability, body.paused, body.reason],
    );
    expect((await request(createApp()).get("/v1/operator/pilot-status")).body.capabilities.every((item: { paused: boolean }) => item.paused)).toBe(true);
    const resumed = await request(createApp()).post("/v1/operator/pause")
      .set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf)
      .set("Idempotency-Key", "restart-intent").send(body);
    expect(resumed.status).toBe(200);
    expect(resumed.body).toMatchObject({ id: intent.rows[0].id, state: "acknowledged" });
    const records = await verificationPool.query(
      `SELECT (SELECT count(*)::int FROM pilot_pause_audit WHERE operation_id = $1) AS audit_count,
              (SELECT count(*)::int FROM pilot_pause_followup WHERE operation_id = $1) AS followup_count`,
      [intent.rows[0].id],
    );
    expect(records.rows[0]).toEqual({ audit_count: 1, followup_count: 1 });
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("recovers each acknowledgement boundary after a real process exit", async () => {
    await operator();
    const points = ["after_intent", "after_commit", "after_receipt", "after_acknowledgement"] as const;
    for (const point of points) {
      await verificationPool.query("TRUNCATE pilot_email_attempts, pilot_email_jobs, pilot_notification_events CASCADE");
      await verificationPool.query("TRUNCATE pilot_recovery_events, pilot_pause_audit, pilot_pause_followup, pilot_pause_operations CASCADE");
      await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL");
      await verificationPool.query("UPDATE pilot_recovery_state SET mode = 'open', cause = NULL, started_at = NULL, reconciled_at = NULL WHERE singleton = true");
      const receipts = resolve(receiptDirectory, point, "receipts");
      const crashing = await startCrashServer(point, receipts);
      const body = { capability: "offers", paused: true, reason: `Process crash at ${point}` };
      const key = `crash-${point}`;
      try {
        const auth = await loginToCrashServer(crashing.url);
        await request(crashing.url).post("/v1/operator/pause")
          .set("Cookie", auth.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", auth.csrf)
          .set("Idempotency-Key", key).send(body).catch(() => undefined);
        await new Promise<void>((resolveExit, reject) => {
          if (crashing.child.exitCode !== null) { resolveExit(); return; }
          const timeout = setTimeout(() => reject(new Error(`Process did not exit at ${point}`)), 10000);
          crashing.child.once("exit", () => { clearTimeout(timeout); resolveExit(); });
        });
        expect(crashing.child.exitCode).toBe(92);
        if (point === "after_commit") {
          const premature = await verificationPool.query(`SELECT count(*)::int AS count FROM pilot_notification_events e
            JOIN pilot_pause_operations o ON o.id = e.operation_id WHERE o.state IN ('acknowledged', 'recovered')`);
          expect(premature.rows[0].count).toBe(0);
        }
      } finally { await stopCrashServer(crashing.child); }
      const restarted = await startCrashServer(undefined, receipts);
      try {
        const auth = await loginToCrashServer(restarted.url);
        const retry = await request(restarted.url).post("/v1/operator/pause")
          .set("Cookie", auth.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", auth.csrf)
          .set("Idempotency-Key", key).send(body);
        expect(retry.status, `${point}: ${JSON.stringify(retry.body)}`).toBe(200);
        expect(retry.body.state).toBe("acknowledged");
        const counts = await verificationPool.query(`SELECT
          (SELECT count(*)::int FROM pilot_pause_operations WHERE idempotency_key = $1) AS operations,
          (SELECT count(*)::int FROM pilot_pause_audit) AS audits,
          (SELECT count(*)::int FROM pilot_pause_followup) AS followups,
          (SELECT count(*)::int FROM pilot_notification_events) AS events,
          (SELECT count(*)::int FROM pilot_email_jobs) AS email_jobs`, [key]);
        expect(counts.rows[0]).toEqual({ operations: 1, audits: 1, followups: 1, events: 1, email_jobs: 1 });
      } finally { await stopCrashServer(restarted.child); }
    }
    await rm(receiptDirectory, { recursive: true, force: true });
  }, 60000);
  it("lets a current MFA operator finish a stranded intent after the original operator is revoked", async () => {
    const first = await operator();
    const body = { capability: "offers", paused: true, reason: "Original operator recorded hazard" };
    const intent = await verificationPool.query<{ id: string }>(
      `INSERT INTO pilot_pause_operations (operator_id, idempotency_key, payload_digest, capability, paused, reason, state)
       VALUES ($1, 'stranded-intent', $2, $3, $4, $5, 'intent') RETURNING id`,
      [first.userId, createHash("sha256").update(JSON.stringify(body)).digest("hex"), body.capability, body.paused, body.reason],
    );
    await verificationPool.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [first.userId]);
    const revokedAttempt = await request(createApp()).post(`/v1/operator/operations/${intent.rows[0].id}/resume`)
      .set("Cookie", first.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", first.csrf)
      .send({ reason: "Attempt after operator access was revoked" });
    expect(revokedAttempt.status).toBe(403);
    const second = await operator("aal2", true, "replacement");
    const resumed = await request(createApp()).post(`/v1/operator/operations/${intent.rows[0].id}/resume`)
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf)
      .send({ reason: "Reviewed original hazard and assumed pending decision" });
    expect(resumed.status, JSON.stringify(resumed.body)).toBe(200);
    expect(resumed.body).toMatchObject({ id: intent.rows[0].id, state: "acknowledged" });
    expect((await second.agent.get(`/v1/operator/pending/${intent.rows[0].id}`)).body.state).toBe("acknowledged");
    const audit = await verificationPool.query("SELECT operator_id, executed_by FROM pilot_pause_audit WHERE operation_id = $1", [intent.rows[0].id]);
    expect(audit.rows[0]).toEqual({ operator_id: first.userId, executed_by: second.userId });
    const event = await verificationPool.query("SELECT operator_id, reason FROM pilot_recovery_events WHERE operation_id = $1 AND event = 'decision_resumed'", [intent.rows[0].id]);
    expect(event.rows[0].operator_id).toBe(second.userId);
    expect(event.rows[0].reason).toContain("Reviewed original hazard");
    await verificationPool.query("DELETE FROM pilot_recovery_events WHERE operation_id = $1", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_pause_audit WHERE operation_id = $1", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_pause_followup WHERE operation_id = $1", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_email_jobs WHERE event_id IN (SELECT id FROM pilot_notification_events WHERE operation_id = $1)", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE operation_id = $1", [intent.rows[0].id]);
    await verificationPool.query("DELETE FROM pilot_pause_operations WHERE id = $1", [intent.rows[0].id]);
    await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL, updated_at = now() - interval '1 day' WHERE capability = 'offers'");
    const restored = await request(createApp()).post("/v1/operator/reconcile")
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf).send({});
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect((await verificationPool.query("SELECT executed_by FROM pilot_pause_audit WHERE operation_id = $1", [intent.rows[0].id])).rows[0].executed_by).toBe(second.userId);
    expect((await verificationPool.query("SELECT operator_id FROM pilot_recovery_events WHERE operation_id = $1 AND event = 'decision_resumed'", [intent.rows[0].id])).rows[0].operator_id).toBe(second.userId);
    expect((await second.agent.get("/v1/operator/pilot-status")).body.recovery.mode).toBe("restricted");
    expect((await verificationPool.query("SELECT id FROM pilot_notification_events WHERE operation_id = $1", [intent.rows[0].id])).rows).toEqual([{ id: intent.rows[0].id }]);
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("hands off a committed decision awaiting evidence without rewriting its business audit", async () => {
    const first = await operator();
    const body = { capability: "requests", paused: true, reason: "Commit before evidence outage" };
    const committed = await verificationPool.query<{ id: string; committed_at: Date }>(
      `INSERT INTO pilot_pause_operations (operator_id, idempotency_key, payload_digest, capability, paused, reason, state, committed_at)
       VALUES ($1, 'stranded-commit', $2, $3, $4, $5, 'committed', now()) RETURNING id, committed_at`,
      [first.userId, createHash("sha256").update(JSON.stringify(body)).digest("hex"), body.capability, body.paused, body.reason],
    );
    const id = committed.rows[0].id;
    await verificationPool.query("UPDATE pilot_pause_state SET paused = true, operation_id = $1 WHERE capability = 'requests'", [id]);
    await verificationPool.query("INSERT INTO pilot_pause_audit (operation_id, operator_id, capability, paused, reason, recorded_at, executed_by) VALUES ($1, $2, $3, $4, $5, $6, $2)", [id, first.userId, body.capability, body.paused, body.reason, committed.rows[0].committed_at]);
    await verificationPool.query("INSERT INTO pilot_pause_followup (operation_id, kind) VALUES ($1, 'operator_pause_changed')", [id]);
    await verificationPool.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [first.userId]);
    const second = await operator("aal2", true, "replacement");
    const finished = await request(createApp()).post(`/v1/operator/operations/${id}/resume`)
      .set("Cookie", second.cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", second.csrf)
      .send({ reason: "Inspected committed decision and restored recovery evidence" });
    expect(finished.status, JSON.stringify(finished.body)).toBe(200);
    expect(finished.body.state).toBe("acknowledged");
    expect((await verificationPool.query("SELECT executed_by FROM pilot_pause_audit WHERE operation_id = $1", [id])).rows[0].executed_by).toBe(first.userId);
    expect((await verificationPool.query("SELECT resumed_by, resumed_from FROM pilot_pause_operations WHERE id = $1", [id])).rows[0]).toEqual({ resumed_by: second.userId, resumed_from: "committed" });
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("rejects missing MFA and revoked allowlist", async () => {
    const { agent, userId } = await operator("aal1");
    const denied = await agent.get("/v1/operator/pending");
    expect(denied.body.error.code).toBe("MFA_REQUIRED");
    setAuthProviderForTests(fakeProvider({ subject: "pause-subject", email: "pause-operator@example.test", emailVerified: true, assuranceLevel: "aal2", userMetadata: {} }));
    await verificationPool.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [userId]);
    const revoked = await agent.get("/v1/operator/pending");
    expect(revoked.body.error.code).toBe("OPERATOR_ACCESS_REVOKED");
    await verificationPool.query("UPDATE operator_allowlist SET active = true WHERE user_id = $1", [userId]);
    await verificationPool.query("UPDATE users SET role = 'user' WHERE id = $1", [userId]);
    expect((await agent.get("/v1/operator/pending")).body.error.code).toBe("FORBIDDEN");
    await verificationPool.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
    const staleProvider = fakeProvider({ subject: "pause-subject", email: "pause-operator@example.test", emailVerified: true, assuranceLevel: "aal2", userMetadata: {} });
    setAuthProviderForTests({ ...staleProvider, refresh: async () => { throw new Error("session revoked"); } });
    expect((await agent.get("/v1/operator/pending")).status).toBe(401);
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("recovers an acknowledged pause from a receipt after an older database state", async () => {
    const { agent, csrf, cookie } = await operator();
    const decision = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "restore-1").send({ capability: "offers", paused: true, reason: "Restore rehearsal decision" });
    expect(decision.status).toBe(200);
    await verificationPool.query("DELETE FROM pilot_pause_audit WHERE operation_id = $1", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_pause_followup WHERE operation_id = $1", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_email_jobs WHERE event_id IN (SELECT id FROM pilot_notification_events WHERE operation_id = $1)", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE operation_id = $1", [decision.body.id]);
    await verificationPool.query("DELETE FROM pilot_pause_operations WHERE id = $1", [decision.body.id]);
    await verificationPool.query("UPDATE pilot_pause_state SET paused = false, operation_id = NULL, updated_at = now() - interval '1 day' WHERE capability = 'offers'");
    const recovered = await request(createApp()).post("/v1/operator/reconcile").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
    expect(recovered.status).toBe(200);
    expect(recovered.body.receipts).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS count FROM pilot_email_jobs WHERE event_id = $1 AND status IN ('pending', 'leased')", [decision.body.id])).rows[0].count).toBe(0);
    expect((await agent.get("/v1/operator/pilot-status")).body.recovery.mode).toBe("restricted");
    const reopened = await request(createApp()).post("/v1/operator/reopen").set("Idempotency-Key", "reopen-1").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ reason: "Reviewed restored receipt and state" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status.capabilities.find((item: { capability: string }) => item.capability === "offers").paused).toBe(true);
    expect((await agent.get(`/v1/operator/operations/${decision.body.id}`)).body.state).toBe("recovered");
    const repeatedReopen = await request(createApp()).post("/v1/operator/reopen").set("Idempotency-Key", "reopen-1").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ reason: "Reviewed restored receipt and state" });
    expect(repeatedReopen.body.operationId).toBe(reopened.body.operationId);
    await verificationPool.query("DELETE FROM pilot_reopen_audit WHERE operation_id = $1", [reopened.body.operationId]);
    await verificationPool.query("DELETE FROM pilot_reopen_operations WHERE id = $1", [reopened.body.operationId]);
    const reconciledReopen = await request(createApp()).post("/v1/operator/reconcile").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
    expect(reconciledReopen.status).toBe(200);
    expect((await agent.get("/v1/operator/pilot-status")).body.recovery.mode).toBe("restricted");
    expect((await verificationPool.query("SELECT state FROM pilot_reopen_operations WHERE id = $1", [reopened.body.operationId])).rows[0].state).toBe("recovered");
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("restricts acknowledgements when the latest independently uploaded snapshot is stale", async () => {
    const { agent, csrf, cookie } = await operator();
    const previous = process.env.PILOT_BACKUP_REQUIRED;
    process.env.PILOT_BACKUP_REQUIRED = "true";
    try {
      await verificationPool.query(`INSERT INTO pilot_backup_attempts (status, snapshot_at, uploaded_at, finished_at, object_key, ciphertext_sha256)
        VALUES ('complete', now() - interval '51 minutes', now() - interval '50 minutes', now() - interval '50 minutes', 'synthetic/backup', repeat('a', 64))`);
      const result = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "stale-backup-1").send({ capability: "offers", paused: true, reason: "Stale backup exercise" });
      expect(result.status).toBe(503);
      const status = await agent.get("/v1/operator/status");
      expect(status.body.backup).toMatchObject({ required: true, healthy: false, ageMinutes: 51 });
      expect(status.body.recovery.mode).toBe("restricted");
      expect((await verificationPool.query("SELECT count(*)::int AS count FROM pilot_pause_operations")).rows[0].count).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.PILOT_BACKUP_REQUIRED;
      else process.env.PILOT_BACKUP_REQUIRED = previous;
    }
  });
  it("restricts acknowledgements when a recent backup cannot be verified off site", async () => {
    const { agent, csrf, cookie } = await operator();
    setBackupObjectProbeForTests(async () => false);
    const previous = process.env.PILOT_BACKUP_REQUIRED;
    process.env.PILOT_BACKUP_REQUIRED = "true";
    try {
      await verificationPool.query(`INSERT INTO pilot_backup_attempts (status, snapshot_at, uploaded_at, finished_at, object_key, ciphertext_sha256)
        VALUES ('complete', now() - interval '10 minutes', now() - interval '9 minutes', now() - interval '9 minutes', 'synthetic/missing', repeat('a', 64))`);
      const result = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000")
        .set("X-CSRF-Token", csrf).set("Idempotency-Key", "missing-backup-1")
        .send({ capability: "offers", paused: true, reason: "Backup object missing" });
      expect(result.status).toBe(503);
      const status = await agent.get("/v1/operator/status");
      expect(status.body.backup).toMatchObject({ required: true, healthy: false, ageMinutes: 10 });
    } finally {
      if (previous === undefined) delete process.env.PILOT_BACKUP_REQUIRED;
      else process.env.PILOT_BACKUP_REQUIRED = previous;
    }
  });
  it("keeps a fresh completed snapshot visible despite many later failures", async () => {
    const { agent } = await operator();
    setBackupObjectProbeForTests(async () => true);
    const previous = process.env.PILOT_BACKUP_REQUIRED;
    process.env.PILOT_BACKUP_REQUIRED = "true";
    try {
      await verificationPool.query(`INSERT INTO pilot_backup_attempts (status, snapshot_at, uploaded_at, finished_at, object_key, ciphertext_sha256)
        VALUES ('complete', now() - interval '10 minutes', now() - interval '9 minutes', now() - interval '9 minutes', 'synthetic/backup', repeat('a', 64))`);
      await verificationPool.query(`INSERT INTO pilot_backup_attempts (status, started_at, finished_at, error_code)
        SELECT 'failed', now() - interval '8 minutes' + n * interval '1 second', now(), 'SYNTHETIC_FAILURE'
          FROM generate_series(1, 25) AS n`);
      const status = await agent.get("/v1/operator/status");
      expect(status.body.backup).toMatchObject({ required: true, healthy: true, objectVerified: true, ageMinutes: 10 });
      expect(status.body.backup.failedAttempts).toHaveLength(20);
      expect(status.body.recovery.mode).toBe("open");
    } finally {
      if (previous === undefined) delete process.env.PILOT_BACKUP_REQUIRED;
      else process.env.PILOT_BACKUP_REQUIRED = previous;
    }
  });
  it("restricts reads after acknowledged evidence disappears", async () => {
    const { agent, csrf, cookie } = await operator();
    const decision = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "lost-1").send({ capability: "offers", paused: false, reason: "Temporary clear decision" });
    expect(decision.status).toBe(200);
    await rm(process.env.PILOT_RECEIPT_PATH!, { recursive: true, force: true });
    const status = await agent.get("/v1/operator/pilot-status");
    expect(status.body.recovery.mode).toBe("restricted");
    expect(status.body.capabilities.every((item: { paused: boolean }) => item.paused)).toBe(true);
    expect((await agent.get(`/v1/operator/operations/${decision.body.id}`)).body.state).toBe("pending_unknown");
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("guards request inserts inside PostgreSQL and serializes pause against in-flight work", async () => {
    const student = await verificationPool.query<{ id: string }>("INSERT INTO users (email) VALUES ('pause-student@example.test') RETURNING id");
    const insertSql = `INSERT INTO ride_requests (passenger_id, pickup_location, pickup_lat, pickup_lng, drop_location, drop_lat, drop_lng, date, time, seats_required, price_per_seat_paise)
      VALUES ($1, 'A', 20, 77, 'B', 20.1, 77.1, current_date + 1, '09:00', 1, 10000)`;
    await verificationPool.query("UPDATE pilot_pause_state SET paused = true WHERE capability = 'requests'");
    await expect(verificationPool.query(insertSql, [student.rows[0].id])).rejects.toMatchObject({ code: "P0001" });
    await verificationPool.query("UPDATE pilot_pause_state SET paused = false WHERE capability = 'requests'");
    const first = await verificationPool.connect();
    const second = await verificationPool.connect();
    try {
      await first.query("BEGIN");
      await first.query(insertSql, [student.rows[0].id]);
      await second.query("BEGIN");
      await second.query("SET LOCAL lock_timeout = '100ms'");
      await expect(second.query("UPDATE pilot_pause_state SET paused = true WHERE capability = 'requests'")).rejects.toMatchObject({ code: "55P03" });
      await second.query("ROLLBACK");
      await first.query("COMMIT");
      await second.query("UPDATE pilot_pause_state SET paused = true WHERE capability = 'requests'");
      await expect(second.query(insertSql, [student.rows[0].id])).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      first.release(); second.release();
    }
    await rm(receiptDirectory, { recursive: true, force: true });
  });
  it("enters restricted mode on evidence failure and exposes a stable pending reference", async () => {
    const { agent, csrf, cookie } = await operator();
    await chmod(receiptDirectory, 0o500);
    const result = await request(createApp()).post("/v1/operator/pause").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).set("Idempotency-Key", "outage-1").send({ capability: "requests", paused: true, reason: "Recovery store outage" });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("OPERATION_PENDING");
    const id = result.body.error.details.operationId;
    expect((await agent.get(`/v1/operator/operations/${id}`)).body.state).toBe("committed");
    const publicStatus = await request(createApp()).get("/v1/operator/pilot-status");
    expect(publicStatus.body.recovery.mode).toBe("restricted");
    expect(publicStatus.body.recovery.cause).toBeUndefined();
    expect(publicStatus.body.capabilities.every((item: { paused: boolean }) => item.paused)).toBe(true);
    await chmod(receiptDirectory, 0o700);
    await rm(receiptDirectory, { recursive: true, force: true });
  });
});

describe("corridor offer publication and discovery", () => {
  it("publishes one private, priced offer and rejects a concurrent overlapping commitment", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "corridor-offer-"));
    process.env.PILOT_RECEIPT_PATH = resolve(directory,"receipts");
    process.env.PILOT_RECEIPT_SECRET = "corridor-offer-independent-receipt-secret";
    process.env.PILOT_CONFLICT_POLICY_APPROVED = "true";
    process.env.PILOT_EXPECTED_TRIP_MINUTES = "35";
    process.env.PILOT_CONFLICT_BUFFER_MINUTES = "20";
    process.env.PILOT_SUPPORT_WINDOW_APPROVED = "true";
    process.env.PILOT_SUPPORT_WINDOW_START = new Date(Date.now()-60_000).toISOString();
    process.env.PILOT_SUPPORT_WINDOW_END = new Date(Date.now()+30*24*60*60_000).toISOString();
    try {
      const users = await Promise.all(["corridor-driver", "corridor-passenger"].map(async label => {
        const email = `${label}@example.test`;
        const id = (await verificationPool.query<{id:string}>(
          "INSERT INTO users(email,email_verified_at) VALUES($1,now()) RETURNING id",[email])).rows[0].id;
        await verificationPool.query("INSERT INTO user_profiles(user_id,full_name,phone) VALUES($1,$2,'9999999999')",[id,label]);
        await verificationPool.query(`INSERT INTO student_verifications
          (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
          VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[id]);
        return {id,email,token:signAccessToken({userId:id,email,role:"user"})};
      }));
      const driver = users[0];
      await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
        VALUES($1,'approved','2099-12-31','2099-12-30')`,[driver.id]);
      const car = (await verificationPool.query<{id:string}>(`INSERT INTO vehicles
        (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,status,verification_status,
         use_category,applicable_document_required,insurance_expires_at,review_after)
        VALUES($1,'car','1234',3,'active','approved','private',true,'2099-12-31','2099-12-30') RETURNING id`,[driver.id])).rows[0].id;
      await verificationPool.query(`INSERT INTO driver_vehicle_approvals
        (driver_user_id,vehicle_id,permission_category,status,review_after)
        VALUES($1,$2,'owner','approved','2099-12-30')`,[driver.id,car]);
      const departure = new Date();
      departure.setUTCDate(departure.getUTCDate()+2);
      for (let n=0;n<7;n++) {
        const day = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure);
        if (day !== "Sun") break;
        departure.setUTCDate(departure.getUTCDate()+1);
      }
      departure.setUTCHours(5,0,0,0); // 10:30 in the corridor timezone
      const input = {vehicle_id:car,origin_code:"university",destination_code:"prmitr",
        departure_at:departure.toISOString(),capacity:2};
      const publish = (key:string,body=input) => request(createApp()).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",key).send(body);
      await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='offers'");
      expect((await publish("paused-offer")).status).toBe(503);
      await verificationPool.query("UPDATE pilot_pause_state SET paused=false WHERE capability='offers'");
      const outside = new Date(departure);
      outside.setUTCHours(0,0,0,0); // 05:30 IST, before the configured corridor schedule
      expect((await publish("outside-schedule",{...input,departure_at:outside.toISOString()})).status).toBe(409);
      const race = await Promise.all([publish("offer-1"),publish("offer-2")]);
      expect(race.filter(response => response.status === 201)).toHaveLength(1);
      const first = race.find(response => response.status === 201)!;
      const winnerKey = race[0].status === 201 ? "offer-1" : "offer-2";
      const loserKey = race[0].status === 201 ? "offer-2" : "offer-1";
      expect(first.body.offer).toMatchObject({state:"acknowledged",contribution_paise:2500,currency:"INR",capacity:2});
      const operationStatus = await request(createApp()).get(`/v1/corridor-offers/operations/${first.body.offer.operation_id}`)
        .set("Authorization",`Bearer ${driver.token}`);
      expect(operationStatus.status).toBe(200);
      expect(operationStatus.body.operation).toMatchObject({state:"acknowledged",id:first.body.offer.id});
      expect((await request(createApp()).get(`/v1/corridor-offers/operations/${first.body.offer.operation_id}`)
        .set("Authorization",`Bearer ${users[1].token}`)).status).toBe(404);
      expect((await publish(winnerKey)).body.offer.operation_id).toBe(first.body.offer.operation_id);
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
      await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='offers'");
      expect((await publish(winnerKey)).body.offer.operation_id).toBe(first.body.offer.operation_id);
      const uncertainStatus = await request(createApp()).get(`/v1/corridor-offers/operations/${first.body.offer.operation_id}`)
        .set("Authorization",`Bearer ${driver.token}`);
      expect(uncertainStatus.body.operation.state).toBe("pending_unknown");
      expect((await publish("new-while-restricted")).status).toBe(503);
      await verificationPool.query("UPDATE pilot_pause_state SET paused=false WHERE capability='offers'");
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='open' WHERE singleton=true");
      expect((await publish(loserKey)).status).toBe(409);
      expect((await publish(winnerKey,{...input,capacity:1})).status).toBe(409);
      const secondDriver = (await verificationPool.query<{id:string}>(
        "INSERT INTO users(email,email_verified_at) VALUES('corridor-second-driver@example.test',now()) RETURNING id")).rows[0].id;
      await verificationPool.query(`INSERT INTO student_verifications
        (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
        VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[secondDriver]);
      await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
        VALUES($1,'approved','2099-12-31','2099-12-30')`,[secondDriver]);
      await verificationPool.query(`INSERT INTO driver_vehicle_approvals
        (driver_user_id,vehicle_id,permission_category,status,review_after)
        VALUES($1,$2,'written_permission','approved','2099-12-30')`,[secondDriver,car]);
      expect((await request(createApp()).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${signAccessToken({userId:secondDriver,email:"corridor-second-driver@example.test",role:"user"})}`)
        .set("Idempotency-Key","shared-car-conflict").send(input)).status).toBe(409);
      await verificationPool.query("UPDATE driver_eligibility SET status='suspended' WHERE user_id=$1",[driver.id]);
      expect((await publish("stale-driver",input)).status).toBe(403);
      await verificationPool.query("UPDATE driver_eligibility SET status='approved' WHERE user_id=$1",[driver.id]);
      const beforeFailure = await verificationPool.query<{n:number}>("SELECT count(*)::int AS n FROM pilot_offer_audit");
      await verificationPool.query(`CREATE OR REPLACE FUNCTION reject_offer_notification_for_test() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.origin_type='corridor_offer' THEN RAISE EXCEPTION 'synthetic notification failure'; END IF; RETURN NEW; END $$`);
      await verificationPool.query("CREATE TRIGGER reject_offer_notification_for_test BEFORE INSERT ON pilot_notification_events FOR EACH ROW EXECUTE FUNCTION reject_offer_notification_for_test()");
      try {
        const failedEdit = await request(createApp()).patch(`/v1/corridor-offers/${first.body.offer.id}`)
          .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","offer-edit-notification-failure")
          .send({...input,capacity:1,version:1});
        expect(failedEdit.status).toBeGreaterThanOrEqual(500);
        expect((await verificationPool.query("SELECT pilot_version FROM ride_offers WHERE id=$1",[first.body.offer.id])).rows[0].pilot_version).toBe(1);
        expect((await verificationPool.query<{n:number}>("SELECT count(*)::int AS n FROM pilot_offer_audit")).rows[0].n).toBe(beforeFailure.rows[0].n);
      } finally {
        await verificationPool.query("DROP TRIGGER reject_offer_notification_for_test ON pilot_notification_events");
        await verificationPool.query("DROP FUNCTION reject_offer_notification_for_test()");
      }
      const edit = await request(createApp()).patch(`/v1/corridor-offers/${first.body.offer.id}`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","offer-edit-1")
        .send({...input,capacity:1,version:1});
      expect(edit.status,JSON.stringify(edit.body)).toBe(200);
      expect(edit.body.offer.version).toBe(2);
      expect((await request(createApp()).patch(`/v1/corridor-offers/${first.body.offer.id}`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","offer-edit-stale")
        .send({...input,capacity:2,version:1})).status).toBe(409);
      const competing = await Promise.all([publish("offer-3"),publish("offer-4")]);
      expect(competing.every(item => item.status === 409)).toBe(true);
      const discovery = await request(createApp()).get("/v1/corridor-offers?origin_code=university&destination_code=prmitr")
        .set("Authorization",`Bearer ${users[1].token}`);
      expect(discovery.status,JSON.stringify(discovery.body)).toBe(200);
      expect(discovery.body.offers).toHaveLength(1);
      expect(discovery.body.offers[0]).toMatchObject({contribution_paise:2500,available_seats:1,version:2});
      expect(JSON.stringify(discovery.body)).not.toContain("9999999999");
      await verificationPool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1",[users[1].id]);
      expect((await request(createApp()).get("/v1/corridor-offers?origin_code=university&destination_code=prmitr")
        .set("Authorization",`Bearer ${users[1].token}`)).status).toBe(403);
      await verificationPool.query("UPDATE users SET email_verified_at=now() WHERE id=$1",[users[1].id]);
      await verificationPool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1",[driver.id]);
      expect((await publish("driver-email-revoked")).status).toBe(403);
      expect((await request(createApp()).get("/v1/corridor-offers?origin_code=university&destination_code=prmitr")
        .set("Authorization",`Bearer ${users[1].token}`)).body.offers).toHaveLength(0);
      await verificationPool.query("UPDATE users SET email_verified_at=now() WHERE id=$1",[driver.id]);
      await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='booking'");
      expect((await request(createApp()).get("/v1/corridor-offers?origin_code=university&destination_code=prmitr")
        .set("Authorization",`Bearer ${users[1].token}`)).status).toBe(503);
      await verificationPool.query("UPDATE pilot_pause_state SET paused=false WHERE capability='booking'");
      await verificationPool.query("UPDATE driver_eligibility SET status='suspended' WHERE user_id=$1",[driver.id]);
      expect((await request(createApp()).get("/v1/corridor-offers?origin_code=university&destination_code=prmitr")
        .set("Authorization",`Bearer ${users[1].token}`)).body.offers).toHaveLength(0);
      await verificationPool.query("UPDATE driver_eligibility SET status='approved' WHERE user_id=$1",[driver.id]);
      await verificationPool.query(`INSERT INTO bookings
        (ride_offer_id,created_by_user_id,passenger_id,driver_id,seats_booked,total_amount_paise,status,payment_state)
        VALUES($1,$2,$2,$3,1,2500,'pending','unpaid')`,[first.body.offer.id,users[1].id,driver.id]);
      expect((await request(createApp()).patch(`/v1/corridor-offers/${first.body.offer.id}`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key","offer-edit-after-request")
        .send({...input,capacity:2,version:2})).status).toBe(409);
      expect((await request(createApp()).get("/v1/corridor-offers?origin_code=prmitr&destination_code=university")
        .set("Authorization",`Bearer ${users[1].token}`)).body.offers).toHaveLength(0);
      await verificationPool.query("UPDATE student_verifications SET eligibility_ends_at=now()-interval '1 second' WHERE user_id=$1",[users[1].id]);
      expect((await request(createApp()).get("/v1/corridor-offers?origin_code=university&destination_code=prmitr")
        .set("Authorization",`Bearer ${users[1].token}`)).status).toBe(403);
      const operatorId = (await verificationPool.query<{id:string}>(
        "INSERT INTO users(email,role,email_verified_at) VALUES('corridor-operator@example.test','admin',now()) RETURNING id")).rows[0].id;
      await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
        VALUES($1,true,'synthetic recovery',now())`,[operatorId]);
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
      await verificationPool.query("DELETE FROM pilot_offer_audit");
      await verificationPool.query("DELETE FROM pilot_offer_operations");
      await verificationPool.query("DELETE FROM ride_offers WHERE id=$1",[first.body.offer.id]);
      expect(await corridorOffersService.reconcileReceipts(operatorId)).toBe(2);
      expect((await verificationPool.query("SELECT pilot_version,pilot_capacity FROM ride_offers WHERE id=$1",
        [first.body.offer.id])).rows).toEqual([{pilot_version:2,pilot_capacity:1}]);
      expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_offer_audit")).rows[0].n).toBe(2);
    } finally {
      for (const name of ["PILOT_RECEIPT_PATH","PILOT_RECEIPT_SECRET","PILOT_CONFLICT_POLICY_APPROVED",
        "PILOT_EXPECTED_TRIP_MINUTES","PILOT_CONFLICT_BUFFER_MINUTES","PILOT_SUPPORT_WINDOW_APPROVED",
        "PILOT_SUPPORT_WINDOW_START","PILOT_SUPPORT_WINDOW_END"]) delete process.env[name];
      await rm(directory,{recursive:true,force:true});
    }
  });
});
