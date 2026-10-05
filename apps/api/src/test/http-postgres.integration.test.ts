import {setOutcomeClockForTests} from '../modules/posted-routes/outcomes.service';
import {serviceAreaApprovalFixture} from './service-area-approval-fixture';
import {setServiceAreaApprovalForTests,SERVICE_AREA} from '../modules/posted-routes/service-area';
import {pointMetres} from '../modules/posted-routes/endpoint-position';
import {valhallaFixture} from './valhalla-fixture';
import {boundaryFixture,rectangle,setFixtureRoute} from './boundary-fixture';
import {liveValhallaRehearsal} from './valhalla-live-rehearsal';
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { signAccessToken } from "../shared/jwt/tokens";
import {assertCurrentAdultDeclaration} from "../modules/adult-declaration/adult-declaration.service";
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
import {AccountRestrictionsService} from "../modules/operator/account-restrictions.service";
import {accountClosureService} from "../modules/profile/account-closure.service";
import { expirePilotSeatRequests } from "../../../worker/src/jobs/pilot-seat-expiry";
import {notifyDelayedPilotRides} from "../../../worker/src/jobs/pilot-delayed-rides";
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import { pool } from "../db/pool";
import { resetRateLimitsForTests } from "../middleware/rate-limit";
import { setAuthProviderForTests, setManagedAuthEnabledForTests, type AuthProvider, type ProviderIdentity } from "../modules/auth/auth-provider";
import { AppError } from "../shared/errors/app-error";
import { setBackupObjectProbeForTests } from "../modules/operator/backup-status";
import { setStudentReviewAfterCommitHookForTests } from "../modules/verification/student-review.service";

const verificationPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const migrations = ["0001_init.sql", "0002_profile_settings.sql", "0003_chat.sql", "0004_acknowledgement_prototype.sql", "0005_managed_auth_identities.sql", "0006_operator_allowlist.sql", "0007_operator_pause.sql", "0008_operator_intent_handoff.sql", "0009_durable_notifications.sql", "0010_email_retry_operations.sql", "0011_backup_attempts.sql", "0012_student_adult_review.sql", "0013_student_review_cycles.sql", "0014_student_review_operations.sql", "0015_student_evidence_access.sql", "0016_student_evidence_deletion_outcomes.sql", "0017_student_evidence_retry_schedule.sql", "0018_driver_car_approval.sql", "0019_ride_departures.sql", "0020_corridor_offers.sql", "0021_corridor_offer_recovery.sql", "0022_pilot_seat_requests.sql", "0023_pilot_seat_acceptance.sql", "0024_pilot_cancellations.sql", "0025_pilot_departure.sql", "0026_revocation_holds_incidents.sql", "0027_pilot_journeys.sql", "0028_journey_review_decisions.sql", "0029_direct_settlement.sql", "0030_settlement_dispute_resolution.sql", "0031_reviewed_account_restrictions.sql", "0032_stalled_work_outreach.sql", "0033_account_closure.sql", "0034_closure_recovery.sql", "0035_adult_declarations.sql", "0036_driver_vehicle_declarations.sql", "0037_posted_route_offers.sql", "0038_posted_route_seats.sql", "0039_posted_route_seat_expiry.sql", "0040_posted_route_outcomes.sql", "0041_posted_route_replacements.sql", "0042_posted_route_incidents.sql", "0043_posted_route_verification.sql", "0044_posted_route_outcome_evidence.sql"];

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
  const routeExpiryPresent=(await verificationPool.query<{present:boolean}>(
    "SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='posted_route_seat_requests_status_check' AND pg_get_constraintdef(oid) LIKE '%expired%') AS present")).rows[0].present;
  const routeOutcomesPresent=(await verificationPool.query<{present:boolean}>(
    "SELECT to_regclass('public.posted_route_outcome_notices') IS NOT NULL AS present")).rows[0].present;
  for (const migration of migrations) {
    if(routeOutcomesPresent&&migration==='0042_posted_route_incidents.sql')continue;
    // Reapplying 0023 would narrow the status check after 0024 has stored cancellations.
    if (cancellationsPresent && migration === "0023_pilot_seat_acceptance.sql") continue;
    if (routeExpiryPresent && migration === "0038_posted_route_seats.sql") continue;
    const sql = await readFile(resolve(import.meta.dirname, "../db/migrations", migration), "utf8");
    await verificationPool.query(sql);
  }
});

describe("ticket 29 pilot boundary without legacy services", () => {
  it("keeps legacy mutating routes closed and exposes PostgreSQL readiness", async () => {
    const app = createApp();
    const paths = ["/v1/rides/offers", "/v1/bookings", "/v1/settlements/bookings/example/passenger-paid",
      "/v1/matching/recompute", "/v1/payments/orders", "/v1/webhooks/razorpay",
      "/v1/chat/rooms", "/v1/pricing/quotes"];
    for (const path of paths) {
      const response = await request(app).post(path).send({});
      expect(response.status, path).toBe(410);
      expect(response.body.error.code, path).toBe("PILOT_SCOPE_DISABLED");
    }
    const email=`pilot29-boundary-${randomUUID()}@example.test`;
    const user=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[email])).rows[0];
    const token=signAccessToken({userId:user.id,email,role:"user"});
    for(const path of ["/v1/payments/orders","/v1/matching/recompute","/v1/chat/rooms"])
      expect((await request(app).post(path).set("Authorization",`Bearer ${token}`).send({})).status).toBe(410);
    expect((await request(app).get("/v1/matching/me").set("Authorization",`Bearer ${token}`)).status).toBe(410);
    expect((await request(app).get(`/v1/payments/bookings/${randomUUID()}/status`)).status).toBe(401);
    await verificationPool.query(`INSERT INTO pilot_recovery_state(singleton,mode)
      VALUES(true,'open') ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL`);
    await verificationPool.query(`INSERT INTO pilot_email_worker_state(singleton,last_seen_at)
      VALUES(true,now()-interval '2 minutes') ON CONFLICT(singleton)
      DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at`);
    const stale = await request(app).get("/v1/ready");
    expect(stale.status).toBe(503);
    expect(stale.body.worker.status).toBe("stale");
    await verificationPool.query("UPDATE pilot_email_worker_state SET last_seen_at=now() WHERE singleton=true");
    const readiness = await request(app).get("/v1/ready");
    expect(readiness.status).toBe(200);
    expect(readiness.body.work).toEqual({ executor: "postgresql", configured: true });
    expect(readiness.body.protected_mutations).toEqual({permitted:true,recovery_mode:"open"});
    expect(readiness.body.backup.required).toBe(false);
    await verificationPool.query(`INSERT INTO pilot_backup_attempts(status,snapshot_at,uploaded_at,finished_at,
      object_key,ciphertext_sha256) VALUES('complete',now(),now(),now(),'synthetic.enc',$1)`,['0'.repeat(64)]);
    setBackupObjectProbeForTests(async()=>{throw new Error("synthetic backup probe failure");});
    try {
      const backupFailed=await request(app).get("/v1/ready");
      expect(backupFailed.status).toBe(503);
      expect(backupFailed.body.database).toBe("connected");
      expect(backupFailed.body.backup.status).toBe("unknown");
      expect(backupFailed.body.protected_mutations.permitted).toBe(false);
    } finally {
      setBackupObjectProbeForTests(null);
      await verificationPool.query("DELETE FROM pilot_backup_attempts WHERE object_key='synthetic.enc'");
    }
  });
});

describe("ticket 06 legacy entry points", () => {
  it("rejects authenticated legacy mutations and keeps participant historical reads", async () => {
    const email=`ticket06-${randomUUID()}@example.test`;
    const user=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[email])).rows[0];
    const token=signAccessToken({userId:user.id,email,role:"user"});
    const app=createApp();
    const id=randomUUID();
    const mutations:["post"|"patch",string][]=[
      ["post","/v1/rides/offers"],["patch",`/v1/rides/offers/${id}`],
      ["post","/v1/rides/requests"],["patch",`/v1/rides/requests/${id}`],
      ["post","/v1/bookings"],["post",`/v1/bookings/${id}/confirm`],
      ["post",`/v1/bookings/${id}/cancel`],["post",`/v1/bookings/${id}/complete`],
      ["patch","/v1/bookings/status"],["post","/v1/payments/orders"],
      ["post","/v1/payments/client-verify"],["post","/v1/matching/recompute"],
      ["post","/v1/webhooks/razorpay"],
      ["post",`/v1/settlements/bookings/${id}/passenger-paid`],
      ["post",`/v1/settlements/bookings/${id}/confirm-offline-received`],
      ["post",`/v1/settlements/bookings/${id}/dispute`],
      ["post",`/v1/settlements/bookings/${id}/resolve`],
    ];
    for (const [method,path] of mutations) {
      const response=await request(app)[method](path).set("Authorization",`Bearer ${token}`).send({});
      expect(response.status,path).toBe(410);
      expect(response.body.error.code,path).toBe("PILOT_SCOPE_DISABLED");
    }
    expect((await request(app).get("/v1/bookings")).status).toBe(401);
    expect((await request(app).get("/v1/bookings").set("Authorization",`Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get(`/v1/bookings/${id}`).set("Authorization",`Bearer ${token}`)).status).toBe(404);
    expect((await request(app).get("/v1/settlements").set("Authorization",`Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get("/v1/direct-settlements").set("Authorization",`Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get(`/v1/payments/bookings/${id}/status`).set("Authorization",`Bearer ${token}`)).status).toBe(404);

    const outsiderEmail=`ticket06-outsider-${randomUUID()}@example.test`;
    const outsider=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[outsiderEmail])).rows[0];
    const offer=(await verificationPool.query<{id:string}>(`INSERT INTO ride_offers
      (driver_id,pickup_location,pickup_lat,pickup_lng,drop_location,drop_lat,drop_lng,date,time,
       available_seats,price_per_seat_paise)
      VALUES($1,'Old origin',20.9,77.7,'Old destination',20.8,77.8,current_date,'09:00',1,2500)
      RETURNING id`,[outsider.id])).rows[0];
    const booking=(await verificationPool.query<{id:string}>(`INSERT INTO bookings
      (ride_offer_id,created_by_user_id,passenger_id,driver_id,seats_booked,total_amount_paise,
       status,payment_state)
      VALUES($1,$2,$2,$3,1,2500,'completed','unpaid') RETURNING id`,
      [offer.id,user.id,outsider.id])).rows[0];
    await verificationPool.query(`INSERT INTO booking_settlements
      (booking_id,payer_user_id,payee_user_id,ride_fare_paise,total_due_paise,status)
      VALUES($1,$2,$3,2500,2500,'due')`,[booking.id,user.id,outsider.id]);
    const ownerRead=await request(app).get(`/v1/bookings/${booking.id}`)
      .set("Authorization",`Bearer ${token}`);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.booking).toBeTruthy();
    expect((await request(app).get(`/v1/settlements/bookings/${booking.id}`)
      .set("Authorization",`Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get(`/v1/payments/bookings/${booking.id}/status`)
      .set("Authorization",`Bearer ${token}`)).status).toBe(200);
    const thirdEmail=`ticket06-third-${randomUUID()}@example.test`;
    const third=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[thirdEmail])).rows[0];
    const thirdToken=signAccessToken({userId:third.id,email:thirdEmail,role:"user"});
    for(const path of [`/v1/bookings/${booking.id}`,`/v1/settlements/bookings/${booking.id}`,
      `/v1/payments/bookings/${booking.id}/status`])
      expect((await request(app).get(path).set("Authorization",`Bearer ${thirdToken}`)).status,path).toBe(404);
  });
});

describe("ticket 28 closure safety queue",()=>{
  let receiptDirectory:string;
  beforeEach(async()=>{
    await verificationPool.query("TRUNCATE users CASCADE");
    await verificationPool.query(`INSERT INTO pilot_recovery_state(singleton,mode) VALUES(true,'open')
      ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL,started_at=NULL`);
    await verificationPool.query("UPDATE pilot_pause_state SET paused=false,operation_id=NULL");
    receiptDirectory=await mkdtemp(resolve(tmpdir(),"pilot-closure-"));
    process.env.PILOT_RECEIPT_PATH=resolve(receiptDirectory,"receipts");
    process.env.PILOT_RECEIPT_SECRET="pilot-closure-independent-evidence-secret";
  });
  afterEach(async()=>{
    delete process.env.PILOT_RECEIPT_PATH;
    delete process.env.PILOT_RECEIPT_SECRET;
    await rm(receiptDirectory,{recursive:true,force:true});
  });

  it("does not acknowledge a closure request when independent recovery evidence fails",async()=>{
    const user=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[`closure-${randomUUID()}@example.test`])).rows[0];
    process.env.PILOT_RECEIPT_PATH=resolve(receiptDirectory,"missing","receipts");
    await chmod(receiptDirectory,0o500);
    try {
      expect((await verificationPool.query("SELECT mode FROM pilot_recovery_state WHERE singleton=true"))
        .rows[0].mode).toBe("open");
      await expect(accountClosureService.request(user.id))
        .rejects.toMatchObject({code:"OPERATION_PENDING"});
      expect((await verificationPool.query("SELECT mode FROM pilot_recovery_state WHERE singleton=true"))
        .rows[0].mode).toBe("restricted");
    } finally {await chmod(receiptDirectory,0o700);}
    const pending=(await verificationPool.query("SELECT id FROM pilot_account_closures WHERE user_id=$1",[user.id])).rows[0];
    expect((await accountClosureService.request(user.id)).id).toBe(pending.id);
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM pilot_closure_events
      WHERE closure_id=$1 AND state='acknowledged'`,[pending.id])).rows[0].n).toBe(1);
  });
  it("rejects a closure retry after its independent receipt disappears",async()=>{
    const user=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[`closure-${randomUUID()}@example.test`])).rows[0];
    const closure=await accountClosureService.request(user.id);
    const event=(await verificationPool.query<{id:string}>(
      "SELECT id FROM pilot_closure_events WHERE closure_id=$1 AND event='requested'",[closure.id])).rows[0];
    await rm(resolve(receiptDirectory,"receipts.account-closure",`${event.id}.json`));
    await expect(accountClosureService.request(user.id))
      .rejects.toMatchObject({code:"RECOVERY_MISSING"});
    expect((await verificationPool.query("SELECT mode FROM pilot_recovery_state WHERE singleton=true"))
      .rows[0].mode).toBe("restricted");
  });

  it("rebuilds a closure request from independent evidence after an older restore",async()=>{
    const user=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[`closure-${randomUUID()}@example.test`])).rows[0];
    const operator=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email,role) VALUES($1,'admin') RETURNING id",
      [`operator-${randomUUID()}@example.test`])).rows[0];
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'synthetic recovery',now())`,[operator.id]);
    const closure=await accountClosureService.request(user.id);
    await verificationPool.query("DELETE FROM pilot_closure_events WHERE closure_id=$1",[closure.id]);
    await verificationPool.query("DELETE FROM pilot_account_closures WHERE id=$1",[closure.id]);
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    await expect(accountClosureService.verifyEvidence())
      .rejects.toMatchObject({code:"RECOVERY_CONFLICT"});
    expect(await accountClosureService.reconcileReceipts(operator.id)).toBe(1);
    expect((await accountClosureService.mine(user.id))?.id).toBe(closure.id);
    await accountClosureService.verifyEvidence();
  });

  it("rebuilds a reviewed hold after an older restore",async()=>{
    const user=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[`closure-${randomUUID()}@example.test`])).rows[0];
    const operator=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email,role) VALUES($1,'admin') RETURNING id",
      [`operator-${randomUUID()}@example.test`])).rows[0];
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'synthetic recovery',now())`,[operator.id]);
    const closure=await accountClosureService.request(user.id);
    const hold=await accountClosureService.hold(operator.id,"restore-hold",closure.id,
      "incident","Synthetic unresolved incident",new Date(Date.now()+86400000));
    await verificationPool.query("DELETE FROM pilot_closure_events WHERE subject_id=$1",[hold.id]);
    await verificationPool.query("DELETE FROM pilot_retention_holds WHERE id=$1",[hold.id]);
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    expect(await accountClosureService.reconcileReceipts(operator.id)).toBe(2);
    expect((await accountClosureService.queue(operator.id)).find(item=>item.id===closure.id)?.holds)
      .toEqual([expect.objectContaining({id:hold.id,scope:"incident"})]);
  });
  it("rebuilds a reviewed hold release after an older restore",async()=>{
    const user=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[`closure-${randomUUID()}@example.test`])).rows[0];
    const operator=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email,role) VALUES($1,'admin') RETURNING id",
      [`operator-${randomUUID()}@example.test`])).rows[0];
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'synthetic recovery',now())`,[operator.id]);
    const closure=await accountClosureService.request(user.id);
    const hold=await accountClosureService.hold(operator.id,"restore-hold",closure.id,
      "incident","Synthetic incident review is open",new Date(Date.now()+86400000));
    await accountClosureService.release(operator.id,"restore-release",hold.id,"Review was completed");
    await verificationPool.query("DELETE FROM pilot_closure_events WHERE event='hold_released' AND subject_id=$1",[hold.id]);
    await verificationPool.query(`UPDATE pilot_retention_holds SET released_at=NULL,released_by=NULL,
      release_reason=NULL,release_key=NULL WHERE id=$1`,[hold.id]);
    await verificationPool.query("UPDATE pilot_account_closures SET status='held' WHERE id=$1",[closure.id]);
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    expect(await accountClosureService.reconcileReceipts(operator.id)).toBe(3);
    expect((await accountClosureService.mine(user.id))?.status).toBe("pending");
    expect((await accountClosureService.queue(operator.id)).find(item=>item.id===closure.id)?.holds).toEqual([]);
  });

  it("serializes repeated requests and keeps a non-personal receipt empty until deletion",async()=>{
    const user=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[`closure-${randomUUID()}@example.test`])).rows[0];
    const [first,second]=await Promise.all([
      accountClosureService.request(user.id),accountClosureService.request(user.id)]);
    expect(first.id).toBe(second.id);
    expect(first.status).toBe("pending");
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_closure_events WHERE closure_id=$1",
      [first.id])).rows[0].n).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_deletion_receipts")).rows[0].n).toBe(0);
    expect((await accountClosureService.mine(user.id))?.id).toBe(first.id);
  });
  it("names the participant endpoint as a request and returns its pending state",async()=>{
    const email=`closure-${randomUUID()}@example.test`;
    const user=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES($1) RETURNING id",[email])).rows[0];
    const token=signAccessToken({userId:user.id,email,role:"user"});
    const created=await request(createApp()).post("/v1/profile/closure-requests")
      .set("Authorization",`Bearer ${token}`).send({});
    expect(created.status).toBe(200);
    expect(created.body.request.status).toBe("pending");
    const current=await request(createApp()).get("/v1/profile/closure-requests")
      .set("Authorization",`Bearer ${token}`);
    expect(current.body.request.id).toBe(created.body.request.id);
  });

  it("records a scoped review hold, blocks stale operator access, and releases with an audit trail",async()=>{
    const rows=await verificationPool.query<{id:string}>(`INSERT INTO users(email,role) VALUES
      ($1,'user'),($2,'admin') RETURNING id`,[`closure-${randomUUID()}@example.test`,
      `operator-${randomUUID()}@example.test`]);
    const [user,operator]=rows.rows;
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'synthetic operator',now())`,[operator.id]);
    const closure=await accountClosureService.request(user.id);
    const candidate=(await verificationPool.query<{id:string}>(`INSERT INTO users(email,created_at)
      VALUES($1,now()-interval '31 days') RETURNING id`,
      [`onboarding-${randomUUID()}@example.test`])).rows[0];
    await verificationPool.query(`INSERT INTO student_verifications
      (user_id,provider,status,institution_name,eligibility_ends_at)
      VALUES($1,'manual_review','pending_review','Synthetic College',now()+interval '1 year')`,
      [candidate.id]);
    await verificationPool.query(`INSERT INTO student_evidence
      (user_id,object_key,content_type,byte_count,sha256,status,decision_at,delete_after,
       deletion_outcome,next_delete_attempt_at)
      VALUES($1,$2,'application/pdf',1,'synthetic','retained',now()-interval '7 days',
        now()-interval '1 minute','failed',now()+interval '5 minutes')`,[user.id,randomUUID()]);
    const hold=await accountClosureService.hold(operator.id,"hold-once",closure.id,"incident",
      "Synthetic unresolved incident",new Date(Date.now()+86400000));
    expect(await accountClosureService.status(operator.id)).toEqual(expect.objectContaining({
      held_closures:1,due_student_objects:1,failed_student_objects:1,
      onboarding_review_candidates:1,deletion_receipts:0}));
    expect((await accountClosureService.hold(operator.id,"hold-once",closure.id,"incident",
      "Synthetic unresolved incident",new Date(hold.review_at))).id).toBe(hold.id);
    await expect(accountClosureService.hold(operator.id,"hold-once",closure.id,"legal_review",
      "Synthetic unresolved incident",new Date(hold.review_at)))
      .rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
    expect((await accountClosureService.queue(operator.id)).find(item=>item.id===closure.id)?.holds)
      .toEqual([expect.objectContaining({scope:"incident",reason:"Synthetic unresolved incident"})]);
    await verificationPool.query("UPDATE operator_allowlist SET active=false WHERE user_id=$1",[operator.id]);
    await expect(accountClosureService.status(operator.id))
      .rejects.toMatchObject({code:"OPERATOR_ACCESS_REVOKED"});
    await expect(accountClosureService.release(operator.id,"release-once",hold.id,"Review was completed"))
      .rejects.toMatchObject({code:"OPERATOR_ACCESS_REVOKED"});
    await verificationPool.query("UPDATE operator_allowlist SET active=true WHERE user_id=$1",[operator.id]);
    expect(await accountClosureService.release(operator.id,"release-once",hold.id,"Review was completed"))
      .toEqual({released:true});
    expect(await accountClosureService.release(operator.id,"release-once",hold.id,"Review was completed"))
      .toEqual({released:true});
    await expect(accountClosureService.release(operator.id,"different-release",hold.id,"Review was completed"))
      .rejects.toMatchObject({code:"HOLD_ALREADY_RELEASED"});
    expect((await accountClosureService.mine(user.id))?.status).toBe("pending");
    expect((await verificationPool.query("SELECT event FROM pilot_closure_events WHERE closure_id=$1 ORDER BY recorded_at,id",
      [closure.id])).rows.map(row=>row.event).sort()).toEqual(["hold_added","hold_released","requested"]);
  });
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
  it('keeps closure held through an active commitment and an unrelated manual hold release',async()=>{
    const f=await fixture();
    const closure=await accountClosureService.request(f.first.id);
    expect(closure.status).toBe('held');
    const hold=await accountClosureService.hold(f.operator.id,'synthetic-case-hold',closure.id,
      'commitment','Synthetic confirmed seat still active',new Date(Date.now()+86400000));
    await expect(accountClosureService.release(f.operator.id,'synthetic-case-release',hold.id,
      'Manual case hold completed')).rejects.toMatchObject({code:'HOLD_CONDITION_ACTIVE'});
    expect((await accountClosureService.mine(f.first.id))?.status).toBe('held');
    expect((await verificationPool.query('SELECT status FROM pilot_seat_allocations WHERE id=$1',
      [f.allocations[0]])).rows[0].status).toBe('confirmed');
  });
  it('requires a reviewed settlement decision before manual restriction and preserves the original claim',async()=>{
    const f=await fixture();
    await start(f);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM pilot_account_restriction_operations'))
      .rows[0].n).toBe(0);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true);
    const obligation=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',
      [f.allocations[0]])).rows[0].id;
    const restrictions=new AccountRestrictionsService(verificationPool);
    const input={targetUserId:f.first.id,scope:'passenger' as const,sourceType:'settlement' as const,
      sourceId:obligation,reason:'Repeated conduct reviewed by operator',
      reviewedEvidence:'Operator reviewed dispute outcome and participant response'};
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM pilot_account_restriction_operations'))
      .rows[0].n).toBe(0);
    const claim=await settlement.mutate(f.first.id,randomUUID(),obligation,'claim','cash');
    await expect(restrictions.restrict(f.operator.id,'unanswered-claim',input))
      .rejects.toMatchObject({code:'SOURCE_NOT_FOUND'});
    await settlement.mutate(f.driver.id,randomUUID(),obligation,'dispute');
    await expect(restrictions.restrict(f.operator.id,'open-review',input))
      .rejects.toMatchObject({code:'SOURCE_NOT_FOUND'});
    await new SettlementCasesService(verificationPool).mutate(f.operator.id,randomUUID(),obligation,{
      kind:'decision',contribution_owed:true,receipt_established:false,
      case_resolution:'resolved',reason:'Reviewed disputed cash claim and records',
      evidence_refs:[],participant_confirmation_id:null});
    expect((await restrictions.restrict(f.operator.id,'reviewed-settlement',input)).state)
      .toBe('acknowledged');
    expect((await verificationPool.query('SELECT id FROM pilot_settlement_operations WHERE id=$1',
      [claim.operation_id])).rows).toHaveLength(1);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM pilot_account_restriction_operations'))
      .rows[0].n).toBe(1);
  });
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
    const {processDueEmail}=await import("../../../worker/src/jobs/durable-email.job");
    expect(await processDueEmail(verificationPool,{async send(){throw new Error('provider unavailable');}})).toBe(true);
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_email_jobs j
      JOIN pilot_notification_events e ON e.id=j.event_id WHERE e.origin_type='pilot_journey'
        AND j.attempts=1 AND j.status='pending'`)).rows[0].n).toBe(1);
    expect((await verificationPool.query('SELECT id FROM pilot_contribution_obligations')).rows).toHaveLength(1);
    setSeatRequestClockForTests(()=>new Date(confirmedAt.getTime()+60_000));
    let trip;
    try {
      trip=await request(createApp()).get(`/v1/seat-requests/confirmed/${f.offer}`)
        .set('Authorization',`Bearer ${f.first.token}`);
    } finally { setSeatRequestClockForTests(null); }
    expect(trip.status).toBe(200);
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
    const {processDueEmail}=await import('../../../worker/src/jobs/durable-email.job');
    expect(await processDueEmail(verificationPool,{async send(){throw new Error('provider unavailable');}})).toBe(true);
    expect((await settlement.detail(f.first.id,id)).status).toBe('settled');
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_email_jobs j
      JOIN pilot_notification_events e ON e.id=j.event_id
      WHERE e.origin_type='pilot_direct_settlement' AND j.attempts=1 AND j.status='pending'`)).rows[0].n).toBe(1);
  });
  it('keeps operator settlement findings unknown before a case decision',async()=>{
    const f=await fixture();await start(f);
    const journey=new PilotJourneyService(pool),settlement=new DirectSettlementService(pool);
    await journey.complete(f.driver.id,randomUUID(),f.offer,f.allocations.slice(0,3)
      .map(allocation_id=>({allocation_id,travelled:true,completed:true})));
    await journey.confirm(f.first.id,randomUUID(),f.offer,f.allocations[0],true,true);
    const id=(await verificationPool.query<{id:string}>(
      'SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1',[f.allocations[0]])).rows[0].id;
    await settlement.mutate(f.first.id,randomUUID(),id,'claim','cash');
    await settlement.mutate(f.driver.id,randomUUID(),id,'confirm');
    const response=await request(createApp()).get(`/v1/direct-settlements/${id}`)
      .set('Authorization',`Bearer ${f.first.token}`);
    expect(response.status).toBe(200);
    expect(response.body.obligation).toMatchObject({contribution_owed:null,receipt_established:null,
      response:'confirm'});
    expect(response.body.obligation.receipt).toMatchObject({id:expect.any(String)});
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
  it("requires an operator-reviewed restriction source, holds future seats, and reverses separately without changing other eligibility",async()=>{
    const {operator,driver,passenger,other,ride}=await fixture();
    const {allocationId}=await requestAndAccept(driver,passenger,ride);
    const incident=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_revocation_incidents
      (source_operation_id,subject_type,subject_id,offer_id,reason)
      VALUES(gen_random_uuid(),'student',$1,$2,'Synthetic reviewed incident') RETURNING id`,
      [passenger,ride])).rows[0].id;
    const restrictions=new AccountRestrictionsService(verificationPool);
    const input={targetUserId:passenger,scope:"passenger" as const,sourceType:"incident" as const,
      sourceId:incident,reason:"Reviewed safety concern on the corridor",
      reviewedEvidence:"Operator reviewed incident notes and participant account"};
    await expect(restrictions.restrict(other,"unauthorized-restriction",input))
      .rejects.toMatchObject({code:"OPERATOR_ACCESS_REVOKED"});
    await expect(restrictions.restrict(operator,"unrelated-target",{...input,targetUserId:other}))
      .rejects.toMatchObject({code:"SOURCE_TARGET_MISMATCH"});
    const first=await restrictions.restrict(operator,"restriction-1",input);
    expect((await restrictions.restrict(operator,"restriction-1",input)).operation_id)
      .toBe(first.operation_id);
    await expect(restrictions.restrict(operator,"restriction-1",{...input,reason:"Different reviewed reason"}))
      .rejects.toMatchObject({code:"IDEMPOTENCY_PAYLOAD_MISMATCH"});
    expect((await verificationPool.query("SELECT status FROM pilot_seat_allocations WHERE id=$1",[allocationId])).rows[0].status)
      .toBe("held");
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_seat_allocations WHERE offer_id=$1 AND status IN ('confirmed','held')",[ride])).rows[0].n)
      .toBe(1);
    expect((await verificationPool.query("SELECT mode FROM pilot_recovery_state WHERE singleton=true")).rows[0].mode).toBe("open");
    expect((await verificationPool.query("SELECT capability,paused FROM pilot_pause_state WHERE paused=true")).rows).toEqual([]);
    await restrictions.verifyEvidence();
    await expect(new SeatRequestsService(verificationPool).mutate(passenger,"restricted-request","requested",ride))
      .rejects.toMatchObject({code:"ACCOUNT_RESTRICTED"});
    const participantHistory=await restrictions.history(passenger,passenger);
    expect(JSON.stringify(participantHistory)).not.toContain(input.reviewedEvidence);
    await expect(restrictions.history(other,passenger)).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await restrictions.history(operator,passenger,true)).length).toBe(1);
    const second=await restrictions.restrict(operator,"restriction-2",{...input,
      reason:"Separate reviewed concern remains active"});
    const reversed=await restrictions.reverse(operator,"reversal-1",first.operation_id,
      "Reviewed restriction no longer warranted","Operator checked new incident evidence");
    expect((await restrictions.reverse(operator,"reversal-1",first.operation_id,
      "Reviewed restriction no longer warranted","Operator checked new incident evidence")).operation_id)
      .toBe(reversed.operation_id);
    await expect(restrictions.reverse(operator,"reversal-2",first.operation_id,
      "Another reversal is not valid","Reviewed incident evidence again"))
      .rejects.toMatchObject({code:"RESTRICTION_NOT_ACTIVE"});
    await expect(new SeatRequestsService(verificationPool).mutate(passenger,"other-restriction-still-active",
      "requested",ride)).rejects.toMatchObject({code:"ACCOUNT_RESTRICTED"});
    await restrictions.reverse(operator,"reversal-second",second.operation_id,
      "Second restriction no longer warranted","Operator checked separate evidence");
    expect((await verificationPool.query("SELECT status FROM pilot_seat_allocations WHERE id=$1",[allocationId])).rows[0].status)
      .toBe("held");
    await verificationPool.query("UPDATE student_verifications SET status='suspended' WHERE user_id=$1",[passenger]);
    await expect(new SeatRequestsService(verificationPool).mutate(passenger,"reversed-but-suspended","requested",ride))
      .rejects.toMatchObject({code:"STUDENT_VERIFICATION_INACTIVE"});
    const audits=(await verificationPool.query<{action:string}>(`SELECT action FROM audit_logs
      WHERE metadata->>'operationId' IN ($1,$2) ORDER BY created_at`,[first.operation_id,reversed.operation_id]))
      .rows.map(row=>row.action);
    expect(audits).toContain("pilot_account_restrict");
    expect(audits).toContain("pilot_account_reverse");
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM pilot_notification_events
      WHERE origin_type='account_restriction' AND operation_id IN ($1,$2) AND ready_at IS NOT NULL`,
      [first.operation_id,reversed.operation_id])).rows[0].n).toBeGreaterThan(1);
  });
  it("serializes restriction with acceptance on separate PostgreSQL connections",async()=>{
    const {operator,driver,passenger,ride}=await fixture();
    const requested=await new SeatRequestsService(verificationPool).mutate(passenger,
      "restriction-race-request","requested",ride);
    const requestId=(requested.request as {id:string}).id;
    const incident=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_revocation_incidents
      (source_operation_id,subject_type,subject_id,offer_id,reason)
      VALUES(gen_random_uuid(),'student',$1,$2,'Synthetic reviewed incident') RETURNING id`,
      [passenger,ride])).rows[0].id;
    const first=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    const second=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    try {
      const outcomes=await Promise.allSettled([
        new AccountRestrictionsService(first).restrict(operator,"restriction-race",{
          targetUserId:passenger,scope:"passenger",sourceType:"incident",sourceId:incident,
          reason:"Reviewed incident requires temporary restriction",
          reviewedEvidence:"Operator checked incident and participant report"}),
        new SeatRequestsService(second).mutate(driver,"acceptance-race","accepted",requestId),
      ]);
      expect(outcomes[0].status,JSON.stringify(outcomes)).toBe("fulfilled");
      if(outcomes[1].status==="rejected") expect(["ACCOUNT_RESTRICTED","PILOT_PAUSED"])
        .toContain((outcomes[1].reason as {code:string}).code);
      const allocation=(await verificationPool.query<{status:string}>(
        "SELECT status FROM pilot_seat_allocations WHERE request_id=$1",[requestId])).rows[0];
      expect(allocation?.status).not.toBe("confirmed");
    } finally {await Promise.all([first.end(),second.end()]);}
  });
  it("blocks offer, acceptance, and departure for a driver restriction",async()=>{
    const {operator,driver,passenger,car,ride}=await fixture();
    const requested=await new SeatRequestsService(verificationPool).mutate(passenger,
      'driver-restriction-pending','requested',ride);
    const requestId=(requested.request as {id:string}).id;
    const source=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_revocation_incidents
      (source_operation_id,subject_type,subject_id,offer_id,reason)
      VALUES(gen_random_uuid(),'driver',$1,$2,'Synthetic driver incident') RETURNING id`,
      [driver,ride])).rows[0].id;
    await new AccountRestrictionsService(verificationPool).restrict(operator,'driver-restriction',{
      targetUserId:driver,scope:'driver',sourceType:'incident',sourceId:source,
      reason:'Reviewed driving conduct needs temporary restriction',
      reviewedEvidence:'Operator checked driver incident and trip account'});
    expect((await verificationPool.query('SELECT status FROM ride_offers WHERE id=$1',[ride])).rows[0].status)
      .toBe('held');
    await expect(corridorOffersService.publish(driver,'restricted-offer',{kind:'publish',input:{
      vehicle_id:car,origin_code:'university',destination_code:'prmitr',
      departure_at:new Date(Date.now()+5*60*60_000).toISOString(),capacity:1}}))
      .rejects.toMatchObject({code:'ACCOUNT_RESTRICTED'});
    await expect(new SeatRequestsService(verificationPool).mutate(driver,'restricted-acceptance',
      'accepted',requestId)).rejects.toMatchObject({code:'ACCOUNT_RESTRICTED'});
    await expect(new PilotDepartureService(verificationPool).start(driver,'restricted-departure',
      ride,[])).rejects.toMatchObject({code:'ACCOUNT_RESTRICTED'});
    expect((await verificationPool.query('SELECT status FROM pilot_seat_requests WHERE id=$1',
      [requestId])).rows[0].status).toBe('pending');
  });
  it("requires live MFA operator access and gives participants a private restriction view",async()=>{
    const {operator,passenger,other,ride}=await fixture();
    const incident=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_revocation_incidents
      (source_operation_id,subject_type,subject_id,offer_id,reason)
      VALUES(gen_random_uuid(),'student',$1,$2,'Synthetic reviewed incident') RETURNING id`,
      [passenger,ride])).rows[0].id;
    const operatorEmail=(await verificationPool.query<{email:string}>(
      "SELECT email FROM users WHERE id=$1",[operator])).rows[0].email;
    const passengerEmail=(await verificationPool.query<{email:string}>(
      "SELECT email FROM users WHERE id=$1",[passenger])).rows[0].email;
    const otherEmail=(await verificationPool.query<{email:string}>(
      "SELECT email FROM users WHERE id=$1",[other])).rows[0].email;
    await verificationPool.query(`INSERT INTO user_profiles(user_id,full_name)
      VALUES($1,'Synthetic Operator'),($2,'Synthetic Passenger'),($3,'Synthetic Other')`,
      [operator,passenger,other]);
    const subjects=[`operator-${randomUUID()}`,`passenger-${randomUUID()}`,`other-${randomUUID()}`];
    for(const [index,id] of [operator,passenger,other].entries())
      await verificationPool.query(`INSERT INTO auth_identities(provider,provider_subject,user_id,provider_email)
        VALUES('supabase',$1,$2,$3)`,[subjects[index],id,[operatorEmail,passengerEmail,otherEmail][index]]);
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='supabase',
      legacy_login_enabled=false,authorized_at=now(),authorized_by='integration-test'`);
    setManagedAuthEnabledForTests(true);
    const identity={subject:subjects[0],email:operatorEmail,emailVerified:true,
      assuranceLevel:'aal2' as const,userMetadata:{}};
    setAuthProviderForTests(fakeProvider(identity));
    const agent=request.agent(createApp());
    const login=await agent.post('/v1/auth/login').send({email:operatorEmail,password:'synthetic'});
    expect(login.status).toBe(200);
    const csrf=login.headers['set-cookie']?.find((cookie:string)=>cookie.startsWith('pp_csrf_token='))
      ?.split(';',1)[0]?.split('=',2)[1];
    const cookie=login.headers['set-cookie'].map((item:string)=>item.split(';',1)[0]).join('; ');
    const body={target_user_id:passenger,scope:'passenger',source_type:'incident',source_id:incident,
      reason:'Reviewed incident requires a travel restriction',
      reviewed_evidence:'Operator reviewed account and incident evidence'};
    const post=()=>request(createApp()).post('/v1/operator/account-restrictions')
      .set('Cookie',cookie).set('Origin','http://localhost:3000')
      .set('X-CSRF-Token',csrf!).set('Idempotency-Key','http-restriction').send(body);
    setAuthProviderForTests(fakeProvider({...identity,assuranceLevel:'aal1'}));
    expect((await post()).body.error.code).toBe('MFA_REQUIRED');
    setAuthProviderForTests(fakeProvider(identity));
    const recorded=await post();
    expect(recorded.status,JSON.stringify(recorded.body)).toBe(200);
    expect((await agent.get(`/v1/operator/account-restrictions/${passenger}`)).body.history[0])
      .toMatchObject({reviewed_evidence:body.reviewed_evidence,operator_id:operator});
    const participantIdentity={subject:subjects[1],email:passengerEmail,emailVerified:true,
      assuranceLevel:'aal1' as const,userMetadata:{}};
    setAuthProviderForTests(fakeProvider(participantIdentity));
    const participant=request.agent(createApp());
    expect((await participant.post('/v1/auth/login').send({email:passengerEmail,password:'synthetic'})).status)
      .toBe(200);
    const own=await participant.get('/v1/verification/account-restrictions');
    expect(own.status).toBe(200);
    expect(JSON.stringify(own.body)).not.toContain(body.reviewed_evidence);
    setAuthProviderForTests(fakeProvider({subject:subjects[2],email:otherEmail,emailVerified:true,
      assuranceLevel:'aal1',userMetadata:{}}));
    const unrelated=request.agent(createApp());
    expect((await unrelated.post('/v1/auth/login').send({email:otherEmail,password:'synthetic'})).status)
      .toBe(200);
    expect((await unrelated.get('/v1/verification/account-restrictions')).body.history).toEqual([]);
    setAuthProviderForTests(fakeProvider(identity));
    await verificationPool.query("UPDATE operator_allowlist SET active=false WHERE user_id=$1",[operator]);
    expect((await post()).body.error.code).toBe('OPERATOR_ACCESS_REVOKED');
    expect((await agent.get(`/v1/operator/account-restrictions/${passenger}`)).status).toBe(403);
  });
  it("rolls back a restriction when durable notification recording fails",async()=>{
    const {operator,passenger,ride}=await fixture();
    const incident=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_revocation_incidents
      (source_operation_id,subject_type,subject_id,offer_id,reason)
      VALUES(gen_random_uuid(),'student',$1,$2,'Synthetic reviewed incident') RETURNING id`,
      [passenger,ride])).rows[0].id;
    await verificationPool.query(`CREATE OR REPLACE FUNCTION reject_restriction_notification_for_test()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.origin_type='account_restriction' THEN RAISE EXCEPTION 'synthetic notification outage'; END IF;
      RETURN NEW; END $$`);
    await verificationPool.query(`CREATE TRIGGER reject_restriction_notification_for_test
      BEFORE INSERT ON pilot_notification_events FOR EACH ROW
      EXECUTE FUNCTION reject_restriction_notification_for_test()`);
    try{
      await expect(new AccountRestrictionsService(verificationPool).restrict(operator,
        'failed-restriction',{targetUserId:passenger,scope:'passenger',sourceType:'incident',
          sourceId:incident,reason:'Reviewed incident requires temporary restriction',
          reviewedEvidence:'Operator checked incident and participant report'})).rejects.toThrow();
      expect((await verificationPool.query(`SELECT count(*)::int AS n FROM pilot_account_restriction_operations`))
        .rows[0].n).toBe(0);
      expect((await verificationPool.query(`SELECT count(*)::int AS n FROM pilot_revocation_holds
        WHERE subject_type='restriction'`)).rows[0].n).toBe(0);
    }finally{
      await verificationPool.query('DROP TRIGGER reject_restriction_notification_for_test ON pilot_notification_events');
      await verificationPool.query('DROP FUNCTION reject_restriction_notification_for_test()');
    }
  });
  it("creates a high-priority incident instead of changing an active trip",async()=>{
    const {operator,driver,passenger,ride}=await fixture();
    const {allocationId}=await requestAndAccept(driver,passenger,ride);
    await verificationPool.query(`UPDATE ride_offers SET
      date=((now()+interval '5 minutes') AT TIME ZONE 'Asia/Kolkata')::date,
      time=((now()+interval '5 minutes') AT TIME ZONE 'Asia/Kolkata')::time,
      pilot_commitment_until=now()+interval '60 minutes' WHERE id=$1`,[ride]);
    await new PilotDepartureService(verificationPool).start(driver,'active-restriction-departure',
      ride,[allocationId]);
    const source=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_revocation_incidents
      (source_operation_id,subject_type,subject_id,offer_id,reason)
      VALUES(gen_random_uuid(),'student',$1,$2,'Synthetic active trip incident') RETURNING id`,
      [passenger,ride])).rows[0].id;
    const recorded=await new AccountRestrictionsService(verificationPool).restrict(operator,
      'active-trip-restriction',{targetUserId:passenger,scope:'passenger',sourceType:'incident',
        sourceId:source,reason:'Reviewed active trip safety concern',
        reviewedEvidence:'Operator reviewed active trip incident and account'});
    expect((await verificationPool.query('SELECT status FROM ride_offers WHERE id=$1',[ride])).rows[0].status)
      .toBe('departed');
    expect((await verificationPool.query('SELECT status FROM pilot_seat_allocations WHERE id=$1',
      [allocationId])).rows[0].status).toBe('confirmed');
    const incident=(await verificationPool.query<{id:string;priority:string}>(`SELECT id,priority
      FROM pilot_revocation_incidents WHERE source_operation_id=$1`,[recorded.operation_id])).rows[0];
    expect(incident.priority).toBe('high');
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n
      FROM pilot_notification_events WHERE origin_type='account_restriction'
        AND operation_id=$1 AND recipient_id=$2 AND ready_at IS NOT NULL`,
      [recorded.operation_id,operator])).rows[0].n).toBe(1);
  });
  it("serializes restriction with departure on separate PostgreSQL connections",async()=>{
    const {operator,driver,passenger,ride}=await fixture();
    const {allocationId}=await requestAndAccept(driver,passenger,ride);
    await verificationPool.query(`UPDATE ride_offers SET
      date=((now()+interval '5 minutes') AT TIME ZONE 'Asia/Kolkata')::date,
      time=((now()+interval '5 minutes') AT TIME ZONE 'Asia/Kolkata')::time,
      pilot_commitment_until=now()+interval '60 minutes' WHERE id=$1`,[ride]);
    const source=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_revocation_incidents
      (source_operation_id,subject_type,subject_id,offer_id,reason)
      VALUES(gen_random_uuid(),'student',$1,$2,'Synthetic trip incident') RETURNING id`,
      [passenger,ride])).rows[0].id;
    const restrictionDb=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    const departureDb=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    try{
      const outcomes=await Promise.allSettled([
        new AccountRestrictionsService(restrictionDb).restrict(operator,'departure-race-restriction',{
          targetUserId:passenger,scope:'passenger',sourceType:'incident',sourceId:source,
          reason:'Reviewed trip incident needs restriction',
          reviewedEvidence:'Operator reviewed active trip safety evidence'}),
        new PilotDepartureService(departureDb).start(driver,'departure-race-action',ride,[allocationId]),
      ]);
      expect(outcomes[0].status,JSON.stringify(outcomes)).toBe('fulfilled');
      if(outcomes[1].status==='rejected') expect(['ACCOUNT_RESTRICTED','BOOKING_HELD'])
        .toContain((outcomes[1].reason as {code:string}).code);
      const state=(await verificationPool.query<{status:string}>(
        'SELECT status FROM ride_offers WHERE id=$1',[ride])).rows[0].status;
      const held=(await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n
        FROM pilot_revocation_holds WHERE source_operation_id=$1`,
        [(outcomes[0] as PromiseFulfilledResult<{operation_id:string}>).value.operation_id])).rows[0].n;
      const incidents=(await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n
        FROM pilot_revocation_incidents WHERE source_operation_id=$1`,
        [(outcomes[0] as PromiseFulfilledResult<{operation_id:string}>).value.operation_id])).rows[0].n;
      expect(state==='departed'?incidents:held).toBe(1);
      expect(state==='departed'?held:incidents).toBe(0);
    }finally{await Promise.all([restrictionDb.end(),departureDb.end()]);}
  });
  it("reconciles an acknowledged restriction from independent evidence",async()=>{
    const {operator,driver,passenger,ride}=await fixture();
    const {allocationId}=await requestAndAccept(driver,passenger,ride);
    const incident=(await verificationPool.query<{id:string}>(`INSERT INTO pilot_revocation_incidents
      (source_operation_id,subject_type,subject_id,offer_id,reason)
      VALUES(gen_random_uuid(),'student',$1,$2,'Synthetic reviewed incident') RETURNING id`,
      [passenger,ride])).rows[0].id;
    const service=new AccountRestrictionsService(verificationPool);
    const recorded=await service.restrict(operator,'restore-restriction',{
      targetUserId:passenger,scope:'passenger',sourceType:'incident',sourceId:incident,
      reason:'Reviewed incident requires temporary restriction',
      reviewedEvidence:'Operator checked incident and participant report'});
    const reversed=await service.reverse(operator,'restore-reversal',recorded.operation_id,
      'Reviewed issue no longer requires restriction','Operator reviewed follow-up incident evidence');
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    await verificationPool.query("DELETE FROM pilot_revocation_holds WHERE source_operation_id=$1",
      [recorded.operation_id]);
    await verificationPool.query("DELETE FROM audit_logs WHERE metadata->>'operationId'=ANY($1::text[])",
      [[recorded.operation_id,reversed.operation_id]]);
    await verificationPool.query("DELETE FROM pilot_account_restriction_operations WHERE id=$1",
      [reversed.operation_id]);
    await verificationPool.query("DELETE FROM pilot_account_restriction_operations WHERE id=$1",
      [recorded.operation_id]);
    expect(await service.reconcileReceipts(operator)).toBe(2);
    expect((await verificationPool.query("SELECT state FROM pilot_account_restriction_operations WHERE id=$1",
      [recorded.operation_id])).rows[0].state).toBe('recovered');
    expect((await verificationPool.query("SELECT status FROM pilot_seat_allocations WHERE id=$1",
      [allocationId])).rows[0].status).toBe('held');
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM pilot_revocation_holds
      WHERE source_operation_id=$1`,[recorded.operation_id])).rows[0].n).toBe(1);
    expect((await verificationPool.query(`SELECT action,state FROM pilot_account_restriction_operations
      WHERE id=$1`,[reversed.operation_id])).rows[0]).toMatchObject({action:'reverse',state:'recovered'});
    await service.verifyEvidence();
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
      departure.setUTCHours(5,0,0,0);
      while(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure)==="Sun")
        departure.setUTCDate(departure.getUTCDate()+1);
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
      departure.setUTCHours(5,0,0,0);
      while (new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure)==="Sun")
        departure.setUTCDate(departure.getUTCDate()+1);
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
  it("runs one synthetic request through direct receipt and retryable notification without legacy credentials", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "pilot29-flow-"));
    const saved = Object.fromEntries(["REDIS_URL","RAZORPAY_KEY_ID","RAZORPAY_KEY_SECRET"]
      .map(name => [name,process.env[name]]));
    for (const name of Object.keys(saved)) delete process.env[name];
    expect(process.env.REDIS_URL).toBeUndefined();
    expect(process.env.RAZORPAY_KEY_ID).toBeUndefined();
    expect(process.env.RAZORPAY_KEY_SECRET).toBeUndefined();
    Object.assign(process.env, {PILOT_RECEIPT_PATH:resolve(directory,"receipts"),
      PILOT_RECEIPT_SECRET:"pilot29-independent-receipt-secret-for-tests",
      PILOT_CONFLICT_POLICY_APPROVED:"true",PILOT_EXPECTED_TRIP_MINUTES:"35",
      PILOT_CONFLICT_BUFFER_MINUTES:"20",PILOT_SUPPORT_WINDOW_APPROVED:"true",
      PILOT_SUPPORT_WINDOW_START:new Date(Date.now()-60_000).toISOString(),
      PILOT_SUPPORT_WINDOW_END:new Date(Date.now()+5*86_400_000).toISOString()});
    try {
      await verificationPool.query("TRUNCATE users CASCADE");
      await verificationPool.query(`INSERT INTO pilot_recovery_state(singleton,mode) VALUES(true,'open')
        ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL`);
      await verificationPool.query("UPDATE pilot_pause_state SET paused=false,operation_id=NULL");
      const actors=[];
      for(const label of ["driver","passenger"]){
        const email=`pilot29-${label}-${randomUUID()}@example.test`;
        const id=(await verificationPool.query<{id:string}>(
          "INSERT INTO users(email,email_verified_at) VALUES($1,now()) RETURNING id",[email])).rows[0].id;
        await verificationPool.query(`INSERT INTO student_verifications
          (user_id,provider,status,adult_eligible,institution_name,eligibility_ends_at)
          VALUES($1,'manual_review','verified',true,'Synthetic College',now()+interval '1 year')`,[id]);
        actors.push({id,token:signAccessToken({userId:id,email,role:"user"})});
      }
      const [driver,passenger]=actors;
      await verificationPool.query(`INSERT INTO driver_eligibility(user_id,status,license_expires_at,review_after)
        VALUES($1,'approved','2099-12-31','2099-12-30')`,[driver.id]);
      const car=(await verificationPool.query<{id:string}>(`INSERT INTO vehicles
        (owner_user_id,vehicle_type,registration_number_last4,seat_capacity,status,verification_status,
         use_category,applicable_document_required,insurance_expires_at,review_after)
        VALUES($1,'car','2929',2,'active','approved','private',true,'2099-12-31','2099-12-30') RETURNING id`,
        [driver.id])).rows[0].id;
      await verificationPool.query("UPDATE vehicles SET make='Tata',model='Tiago',color='Blue' WHERE id=$1",[car]);
      await verificationPool.query(`INSERT INTO driver_vehicle_approvals
        (driver_user_id,vehicle_id,permission_category,status,review_after)
        VALUES($1,$2,'owner','approved','2099-12-30')`,[driver.id,car]);
      const departure=new Date(Date.now()+2*86_400_000);
      departure.setUTCHours(5,0,0,0);
      while(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure)==="Sun")
        departure.setUTCDate(departure.getUTCDate()+1);
      const app=createApp();
      const offer=await request(app).post("/v1/corridor-offers")
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",randomUUID())
        .send({vehicle_id:car,origin_code:"university",destination_code:"prmitr",
          departure_at:departure.toISOString(),capacity:1});
      expect(offer.status,JSON.stringify(offer.body)).toBe(201);
      const offerId=offer.body.offer.id;
      const requested=await request(app).post("/v1/seat-requests")
        .set("Authorization",`Bearer ${passenger.token}`).set("Idempotency-Key",randomUUID())
        .send({offer_id:offerId,seats:1});
      expect(requested.status,JSON.stringify(requested.body)).toBe(201);
      const accepted=await request(app).post(`/v1/seat-requests/${requested.body.request.id}/accept`)
        .set("Authorization",`Bearer ${driver.token}`).set("Idempotency-Key",randomUUID()).send({});
      expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
      const allocationId=accepted.body.booking.id;
      expect((await new PilotDepartureService(pool).start(driver.id,randomUUID(),offerId,[allocationId],
        "departure",null,departure)).state).toBe("acknowledged");
      const arrived=new Date(departure.getTime()+40*60_000);
      const journey=new PilotJourneyService(pool);
      await journey.complete(driver.id,randomUUID(),offerId,
        [{allocation_id:allocationId,travelled:true,completed:true}],arrived);
      await journey.confirm(passenger.id,randomUUID(),offerId,allocationId,true,true,arrived);
      const obligation=(await verificationPool.query<{id:string}>(
        "SELECT id FROM pilot_contribution_obligations WHERE allocation_id=$1",[allocationId])).rows[0].id;
      const settlement=new DirectSettlementService(pool);
      await settlement.mutate(passenger.id,randomUUID(),obligation,"claim","upi",arrived);
      await settlement.mutate(driver.id,randomUUID(),obligation,"confirm",null,arrived);
      expect((await settlement.detail(passenger.id,obligation,arrived)).status).toBe("settled");
      await verificationPool.query(`UPDATE pilot_email_jobs SET due_at=now()+interval '1 hour'
        WHERE event_id IN(SELECT id FROM pilot_notification_events
          WHERE origin_type<>'pilot_direct_settlement')`);
      const {processDueEmail}=await import("../../../worker/src/jobs/durable-email.job");
      expect(await processDueEmail(verificationPool,{async send(){throw new Error("synthetic provider failure");}}))
        .toBe(true);
      expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_email_jobs j
        JOIN pilot_notification_events e ON e.id=j.event_id
        WHERE e.related_entity_id=$1 AND j.status='pending' AND j.attempts=1`,[obligation])).rows[0].n)
        .toBeGreaterThan(0);
    } finally {
      for(const [name,value] of Object.entries(saved)) if(value===undefined) delete process.env[name];
        else process.env[name]=value;
      for(const name of ["PILOT_RECEIPT_PATH","PILOT_RECEIPT_SECRET","PILOT_CONFLICT_POLICY_APPROVED",
        "PILOT_EXPECTED_TRIP_MINUTES","PILOT_CONFLICT_BUFFER_MINUTES","PILOT_SUPPORT_WINDOW_APPROVED",
        "PILOT_SUPPORT_WINDOW_START","PILOT_SUPPORT_WINDOW_END"]) delete process.env[name];
      await rm(directory,{recursive:true,force:true});
    }
  });
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
      departure.setUTCHours(5,0,0,0);
      while (new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure) === "Sun")
        departure.setUTCDate(departure.getUTCDate()+1);
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
      departure.setUTCHours(5,0,0,0);
      for (let n=0;n<7;n++) {
        if (new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure) !== "Sun") break;
        departure.setUTCDate(departure.getUTCDate()+1);
      }
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
        .send({ride_offer_id:offerId,seats_booked:1})).status).toBe(410);
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
  it("reads MFA status and history while the application database is read-only", async () => {
    const email = "mfa-readonly@example.test";
    const subject = "mfa-readonly-subject";
    const factorId = "read-only-pending-factor";
    const operator = await verificationPool.query<{ id: string }>(
      "INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'MFA Operator')", [operator.rows[0].id]);
    await verificationPool.query(
      "INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)",
      [subject, operator.rows[0].id, email]);
    await verificationPool.query(
      "INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic test', now())",
      [operator.rows[0].id]);
    await verificationPool.query(
      "UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    const identity = { subject, email, emailVerified: true, assuranceLevel: "aal1", userMetadata: {} };
    setAuthProviderForTests({ ...fakeProvider(identity), listTotpFactors: async () => [],
      listPendingTotpFactors: async () => [{ id: factorId, friendlyName: "Unfinished setup" }],
    });
    const agent = request.agent(createApp());
    expect((await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" })).status).toBe(200);
    const clients = await Promise.all(Array.from({ length: Math.max(1, pool.totalCount) }, () => pool.connect()));
    try {
      await Promise.all(clients.map((client) => client.query("SET default_transaction_read_only = on")));
    } finally {
      clients.forEach((client) => client.release());
    }
    try {
      expect((await pool.query<{ readOnly: string }>('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe("on");
      const status = await agent.get("/v1/auth/mfa/factors");
      expect(status.status).toBe(200);
      expect(status.body.pendingFactors).toEqual([{ id: factorId, friendlyName: "Unfinished setup" }]);
      const history = await agent.get("/v1/auth/mfa/history");
      expect(history.status).toBe(200);
      expect(history.body.events).toEqual([]);
    } finally {
      const restore = await Promise.all(Array.from({ length: Math.max(1, pool.totalCount) }, () => pool.connect()));
      try {
        await Promise.all(restore.map((client) => client.query("SET default_transaction_read_only = off")));
      } finally {
        restore.forEach((client) => client.release());
      }
    }
  });

  it("serializes overlapping authenticator setups for the same operator", async () => {
    const email = "mfa-overlap@example.test";
    const subject = "mfa-overlap-subject";
    const operator = await verificationPool.query<{ id: string }>(
      "INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'MFA Operator')", [operator.rows[0].id]);
    await verificationPool.query(
      "INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)",
      [subject, operator.rows[0].id, email]);
    await verificationPool.query(
      "INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic test', now())",
      [operator.rows[0].id]);
    await verificationPool.query(
      "UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    const identity = { subject, email, emailVerified: true, assuranceLevel: "aal1", userMetadata: {} };
    const pending: Array<{ id: string; friendlyName: string }> = [];
    let createCount = 0;
    let signalFirstEntered!: () => void;
    let releaseFirst!: () => void;
    const firstEntered = new Promise<void>((resolve) => { signalFirstEntered = resolve; });
    const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    setAuthProviderForTests({ ...fakeProvider(identity), listTotpFactors: async () => [],
      listPendingTotpFactors: async () => [...pending],
      enrollTotp: async () => {
        const number = ++createCount;
        if (number === 1) { signalFirstEntered(); await firstMayFinish; }
        const factorId = `factor-${number}`;
        pending.push({ id: factorId, friendlyName: "Operator authenticator" });
        return { factorId, secret: `SYNTHETICSECRET${number}`, uri: "otpauth://totp/synthetic", qrCode: "<svg/>" };
      },
    });
    const app = createApp();
    const firstAgent = request.agent(app);
    const secondAgent = request.agent(app);
    const firstLogin = await firstAgent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    const secondLogin = await secondAgent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    const csrfFor = (response: typeof firstLogin) => response.headers["set-cookie"]
      .find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    const start = (agent: typeof firstAgent, csrf: string) => agent.post("/v1/auth/mfa/enroll")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
    const first = start(firstAgent, csrfFor(firstLogin)).then((response) => response);
    await firstEntered;
    const second = start(secondAgent, csrfFor(secondLogin)).then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseFirst();
    const results = await Promise.all([first, second]);
    expect(results.map((response) => response.status)).toEqual([201, 409]);
    expect(results[1].body.error.code).toBe("MFA_SETUP_PENDING");
    expect(createCount).toBe(1);
    expect((await firstAgent.get("/v1/auth/mfa/factors")).body.pendingFactors)
      .toEqual([{ id: "factor-1", friendlyName: "Operator authenticator" }]);
    const history = await firstAgent.get("/v1/auth/mfa/history");
    expect(history.body.events.map((event: { action: string }) => event.action)).toEqual([
      "operator_mfa_enrollment_requested", "operator_mfa_factor_enrolled",
    ]);
  });

  it("shows an allowlisted operator their verified TOTP factors before step-up", async () => {
    const email = "mfa-operator@example.test";
    const subject = "mfa-operator-subject";
    const operator = await verificationPool.query<{ id: string }>(
      "INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'MFA Operator')", [operator.rows[0].id]);
    await verificationPool.query(
      "INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)",
      [subject, operator.rows[0].id, email]);
    await verificationPool.query(
      "INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic test', now())",
      [operator.rows[0].id]);
    await verificationPool.query(
      "UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    const identity = { subject, email, emailVerified: true, assuranceLevel: "aal1", userMetadata: {} };
    const provider = fakeProvider(identity);
    setAuthProviderForTests({ ...provider, listTotpFactors: async () => [] });
    const agent = request.agent(createApp());
    expect((await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" })).status).toBe(200);

    const response = await agent.get("/v1/auth/mfa/factors");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ factors: [], pendingFactors: [], assuranceLevel: "aal1" });
  });

  it("enrolls a TOTP factor only from the current allowlisted operator session", async () => {
    const email = "mfa-enroll@example.test";
    const subject = "mfa-enroll-subject";
    const operator = await verificationPool.query<{ id: string }>(
      "INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'MFA Operator')", [operator.rows[0].id]);
    await verificationPool.query(
      "INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)",
      [subject, operator.rows[0].id, email]);
    await verificationPool.query(
      "INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic test', now())",
      [operator.rows[0].id]);
    await verificationPool.query(
      "UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    const identity = { subject, email, emailVerified: true, assuranceLevel: "aal1", userMetadata: {} };
    const provider = fakeProvider(identity);
    let enrolledWith = "";
    let hasVerifiedFactor = false;
    setAuthProviderForTests({ ...provider, listTotpFactors: async () => hasVerifiedFactor
      ? [{ id: "verified-factor", friendlyName: "Existing" }] : [], enrollTotp: async (token) => {
      enrolledWith = token;
      return { factorId: "factor-1", secret: "SYNTHETICSECRET", uri: "otpauth://totp/Petrol%20Partner?secret=SYNTHETICSECRET", qrCode: "<svg/>" };
    } });
    const app = createApp();
    const agent = request.agent(app);
    const login = await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    expect(login.status).toBe(200);
    const csrf = login.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];

    const denied = await agent.post("/v1/auth/mfa/enroll").set("Origin", "http://localhost:3000").send({});
    expect(denied.body.error.code).toBe("CSRF_REJECTED");
    const enrolled = await agent.post("/v1/auth/mfa/enroll")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
    expect(enrolled.status).toBe(201);
    expect(enrolled.body).toEqual({ factorId: "factor-1", secret: "SYNTHETICSECRET", uri: "otpauth://totp/Petrol%20Partner?secret=SYNTHETICSECRET", qrCode: "<svg/>" });
    expect(enrolledWith).toBe("provider-access");
    hasVerifiedFactor = true;
    const rotatedCsrf = enrolled.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    const missingMfa = await agent.post("/v1/auth/mfa/enroll")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", rotatedCsrf).send({});
    expect(missingMfa.status).toBe(403);
    expect(missingMfa.body.error.code).toBe("MFA_REQUIRED");
    await verificationPool.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [operator.rows[0].id]);
    const nextCsrf = missingMfa.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    const revoked = await agent.post("/v1/auth/mfa/enroll")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", nextCsrf).send({});
    expect(revoked.status).toBe(403);
    expect(revoked.body.error.code).toBe("OPERATOR_ACCESS_REVOKED");
  });

  it("preserves an unfinished TOTP setup on retry until the operator explicitly replaces it", async () => {
    const email = "mfa-restart@example.test";
    const subject = "mfa-restart-subject";
    const operator = await verificationPool.query<{ id: string }>(
      "INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'MFA Operator')", [operator.rows[0].id]);
    await verificationPool.query(
      "INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)",
      [subject, operator.rows[0].id, email]);
    await verificationPool.query(
      "INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic test', now())",
      [operator.rows[0].id]);
    await verificationPool.query(
      "UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    const identity = { subject, email, emailVerified: true, assuranceLevel: "aal1", userMetadata: {} };
    setAuthProviderForTests(fakeProvider(identity));
    const agent = request.agent(createApp());
    const login = await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    expect(login.status).toBe(200);
    const csrf = login.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    setAuthProviderForTests(null);
    const accessToken = `header.${Buffer.from(JSON.stringify({ aal: "aal1" })).toString("base64url")}.signature`;
    const providerUser = { id: subject, email, email_confirmed_at: "2026-10-02T00:00:00Z", user_metadata: {},
      factors: [] as Array<{ id: string; factor_type: string; status: string; friendly_name: string }> };
    const pendingFactorId = "df4ecc30-e46e-4bd5-b8c1-a403cbda9a07";
    const replacementFactorId = "4385e583-a2c9-4294-af3a-a420b165a319";
    let enrollments = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url, "https://synthetic.example").pathname;
      if (path.endsWith("/token")) return Response.json({ access_token: accessToken, refresh_token: "provider-refresh", expires_in: 900, user: providerUser });
      if (path.endsWith("/user")) return Response.json(providerUser);
      if (path.endsWith(`/factors/${pendingFactorId}`) && init.method === "DELETE") {
        providerUser.factors = providerUser.factors.filter((factor) => factor.id !== pendingFactorId);
        return Response.json({ id: pendingFactorId });
      }
      if (path.endsWith("/factors") && init.method === "POST") {
        const id = ++enrollments === 1 ? pendingFactorId : replacementFactorId;
        providerUser.factors.push({ id, factor_type: "totp", status: "unverified", friendly_name: "Operator authenticator" });
        return Response.json({ id, totp: { secret: "SYNTHETICSECRET", uri: "otpauth://totp/first", qr_code: "<svg/>" } });
      }
      throw new Error(`Unexpected provider path: ${path}`);
    }));
    try {
      const first = await agent.post("/v1/auth/mfa/enroll")
        .set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
      expect(first.status).toBe(201);
      // The caller never receives the first response, then repeats the same setup action.
      const nextCsrf = first.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
      const retry = await agent.post("/v1/auth/mfa/enroll")
        .set("Origin", "http://localhost:3000").set("X-CSRF-Token", nextCsrf).send({});
      expect(retry.status).toBe(409);
      expect(retry.body.error.code).toBe("MFA_SETUP_PENDING");
      const factors = await agent.get("/v1/auth/mfa/factors");
      expect(factors.body.pendingFactors).toEqual([{ id: pendingFactorId, friendlyName: "Operator authenticator" }]);
      const statusCsrf = factors.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
      const replacement = await agent.post("/v1/auth/mfa/enroll")
        .set("Origin", "http://localhost:3000").set("X-CSRF-Token", statusCsrf)
        .send({ replacePendingFactorId: pendingFactorId });
      expect(replacement.status).toBe(201);
      expect(replacement.body.factorId).toBe(replacementFactorId);
      const replacementStatus = await agent.get("/v1/auth/mfa/factors");
      expect(replacementStatus.body.pendingFactors)
        .toEqual([{ id: replacementFactorId, friendlyName: "Operator authenticator" }]);
      const replacementCsrf = replacementStatus.headers["set-cookie"]
        .find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
      const staleRetry = await agent.post("/v1/auth/mfa/enroll")
        .set("Origin", "http://localhost:3000").set("X-CSRF-Token", replacementCsrf)
        .send({ replacePendingFactorId: pendingFactorId });
      expect(staleRetry.status).toBe(409);
      expect(staleRetry.body.error.code).toBe("MFA_SETUP_CHANGED");
      expect((await agent.get("/v1/auth/mfa/factors")).body.pendingFactors)
        .toEqual([{ id: replacementFactorId, friendlyName: "Operator authenticator" }]);
      const history = await agent.get("/v1/auth/mfa/history");
      expect(history.status).toBe(200);
      expect(history.body.events.map((event: { action: string }) => event.action)).toEqual([
        "operator_mfa_enrollment_requested", "operator_mfa_factor_enrolled",
        "operator_mfa_replacement_requested", "operator_mfa_factor_discarded", "operator_mfa_factor_replaced",
      ]);
      expect(history.body.events[3].factorId).toBe(pendingFactorId);
      expect(history.body.events[4]).toMatchObject({
        factorId: replacementFactorId, replacedFactorId: pendingFactorId,
      });
      expect(JSON.stringify(history.body)).not.toContain("SYNTHETICSECRET");
    } finally {
      vi.unstubAllGlobals();
    setOutcomeClockForTests(null);
    }
  });

  it("records a provider-created factor discovered after an uncertain enrollment response", async () => {
    const email = "mfa-uncertain@example.test";
    const subject = "mfa-uncertain-subject";
    const factorId = "650b19c8-3ec7-4c34-bf4d-96828a58922e";
    const operator = await verificationPool.query<{ id: string }>(
      "INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'MFA Operator')", [operator.rows[0].id]);
    await verificationPool.query(
      "INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)",
      [subject, operator.rows[0].id, email]);
    await verificationPool.query(
      "INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic test', now())",
      [operator.rows[0].id]);
    await verificationPool.query(
      "UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    const identity = { subject, email, emailVerified: true, assuranceLevel: "aal1", userMetadata: {} };
    let pending: Array<{ id: string; friendlyName: string }> = [];
    let verified = false;
    setAuthProviderForTests({ ...fakeProvider(identity), listTotpFactors: async () => verified
      ? [{ id: factorId, friendlyName: "Operator authenticator" }] : [],
      listPendingTotpFactors: async () => pending,
      enrollTotp: async () => {
        pending = [{ id: factorId, friendlyName: "Operator authenticator" }];
        throw new AppError(503, "Provider response was lost", "AUTH_ASSURANCE_UNAVAILABLE");
      },
    });
    const agent = request.agent(createApp());
    const login = await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    const csrf = login.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    const uncertain = await agent.post("/v1/auth/mfa/enroll")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({});
    expect(uncertain.status).toBe(503);
    const status = await agent.get("/v1/auth/mfa/factors");
    expect(status.body.pendingFactors).toEqual([{ id: factorId, friendlyName: "Operator authenticator" }]);
    const retryCsrf = status.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    const retry = await agent.post("/v1/auth/mfa/enroll")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", retryCsrf).send({});
    expect(retry.body.error.code).toBe("MFA_SETUP_PENDING");
    const history = await agent.get("/v1/auth/mfa/history");
    expect(history.body.events.map((event: { action: string }) => event.action)).toEqual([
      "operator_mfa_enrollment_requested", "operator_mfa_factor_observed",
    ]);
    expect(history.body.events[1].factorId).toBe(factorId);
    verified = true;
    pending = [];
    const verifiedStatus = await agent.get("/v1/auth/mfa/factors");
    expect(verifiedStatus.body.factors).toEqual([
      { id: factorId, friendlyName: "Operator authenticator" },
    ]);
    const verifiedRetry = await agent.post("/v1/auth/mfa/enroll")
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", verifiedStatus.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1])
      .send({});
    expect(verifiedRetry.body.error.code).toBe("MFA_REQUIRED");
    const verifiedHistory = await agent.get("/v1/auth/mfa/history");
    expect(verifiedHistory.body.events[2]).toMatchObject({
      action: "operator_mfa_factor_verification_observed", factorId,
    });
  });

  it("records a discarded factor discovered after an uncertain replacement response", async () => {
    const email = "mfa-discard-uncertain@example.test";
    const subject = "mfa-discard-uncertain-subject";
    const factorId = "b680e24d-23d5-4d05-9bc0-10ea6c89832f";
    const operator = await verificationPool.query<{ id: string }>(
      "INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'MFA Operator')", [operator.rows[0].id]);
    await verificationPool.query(
      "INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)",
      [subject, operator.rows[0].id, email]);
    await verificationPool.query(
      "INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic test', now())",
      [operator.rows[0].id]);
    await verificationPool.query(
      "UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    const identity = { subject, email, emailVerified: true, assuranceLevel: "aal1", userMetadata: {} };
    let pending = [{ id: factorId, friendlyName: "Unfinished setup" }];
    setAuthProviderForTests({ ...fakeProvider(identity), listTotpFactors: async () => [],
      listPendingTotpFactors: async () => pending,
      removePendingTotp: async () => {
        pending = [];
        throw new AppError(503, "Provider response was lost", "AUTH_ASSURANCE_UNAVAILABLE");
      },
      enrollTotp: async () => { throw new Error("Replacement must stop after the uncertain removal"); },
    });
    const agent = request.agent(createApp());
    const login = await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    const csrf = login.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    const uncertain = await agent.post("/v1/auth/mfa/enroll")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf)
      .send({ replacePendingFactorId: factorId });
    expect(uncertain.status).toBe(503);
    const status = await agent.get("/v1/auth/mfa/factors");
    expect(status.body.pendingFactors).toEqual([]);
    const retry = await agent.post("/v1/auth/mfa/enroll")
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", status.headers["set-cookie"].find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1])
      .send({ replacePendingFactorId: factorId });
    expect(retry.body.error.code).toBe("MFA_SETUP_CHANGED");
    const history = await agent.get("/v1/auth/mfa/history");
    expect(history.body.events.map((event: { action: string }) => event.action)).toEqual([
      "operator_mfa_factor_observed", "operator_mfa_replacement_requested", "operator_mfa_factor_discard_observed",
    ]);
    expect(history.body.events[2].factorId).toBe(factorId);
  });

  it("promotes a verified TOTP challenge to an aal2 operator session", async () => {
    const email = "mfa-verify@example.test";
    const subject = "mfa-verify-subject";
    const factorId = "df4ecc30-e46e-4bd5-b8c1-a403cbda9a07";
    const challengeId = "b01e9b8c-55bd-4de3-b9b4-b3a6a4c67591";
    const operator = await verificationPool.query<{ id: string }>(
      "INSERT INTO users (email, role, email_verified_at) VALUES ($1, 'admin', now()) RETURNING id", [email]);
    await verificationPool.query("INSERT INTO user_profiles (user_id, full_name) VALUES ($1, 'MFA Operator')", [operator.rows[0].id]);
    await verificationPool.query(
      "INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email) VALUES ('supabase', $1, $2, $3)",
      [subject, operator.rows[0].id, email]);
    await verificationPool.query(
      "INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at) VALUES ($1, true, 'synthetic test', now())",
      [operator.rows[0].id]);
    await verificationPool.query(
      "UPDATE auth_cutover_state SET active_provider = 'supabase', legacy_login_enabled = false, authorized_at = now(), authorized_by = 'integration-test'");
    setManagedAuthEnabledForTests(true);
    let level = "aal1";
    const identity = () => ({ subject, email, emailVerified: true, assuranceLevel: level, userMetadata: {} });
    const session = () => ({ accessToken: level === "aal2" ? "verified-access" : "provider-access", refreshToken: "provider-refresh", expiresIn: 900, identity: identity() });
    setAuthProviderForTests({
      ...fakeProvider(identity()),
      login: async () => session(), refresh: async () => session(), validate: async () => identity(),
      challengeTotp: async () => ({ challengeId }),
      verifyTotp: async (_token, _factor, _challenge, code) => {
        if (code !== "123456") throw new AppError(400, "Invalid authenticator code", "MFA_CODE_INVALID");
        level = "aal2";
        return session();
      },
    });
    const agent = request.agent(createApp());
    const login = await agent.post("/v1/auth/login").send({ email, password: "synthetic-password" });
    expect(login.status).toBe(200);
    const csrfFrom = (response: typeof login) => response.headers["set-cookie"]
      ?.find((cookie: string) => cookie.startsWith("pp_csrf_token="))?.split(";", 1)[0]?.split("=", 2)[1];
    const beforeStepUp = await agent.get("/v1/operator/pending");
    expect(beforeStepUp.body.error.code).toBe("MFA_REQUIRED");

    const challenge = await agent.post("/v1/auth/mfa/challenge")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrfFrom(beforeStepUp))
      .send({ factorId });
    expect(challenge.status).toBe(200);
    expect(challenge.body).toEqual({ challengeId });
    const invalid = await agent.post("/v1/auth/mfa/verify")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrfFrom(challenge))
      .send({ factorId, challengeId, code: "000000" });
    expect(invalid.body.error.code).toBe("MFA_CODE_INVALID");
    const stillAal1 = await agent.get("/v1/operator/pending");
    expect(stillAal1.body.error.code).toBe("MFA_REQUIRED");
    const verified = await agent.post("/v1/auth/mfa/verify")
      .set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrfFrom(stillAal1))
      .send({ factorId, challengeId, code: "123456" });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ assuranceLevel: "aal2" });
    expect((await agent.get("/v1/operator/pending")).status).toBe(200);
    const history = await agent.get("/v1/auth/mfa/history");
    expect(history.body.events).toEqual([expect.objectContaining({
      action: "operator_mfa_factor_verified", factorId,
    })]);
  });

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
  it("records coded urgent outreach only for current MFA operators and reconciles outage fallback", async () => {
    const operatorSession=await operator("aal2",true,"outreach");
    const participant=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email) VALUES('outreach-participant@example.test') RETURNING id")).rows[0].id;
    const body={participantId:participant,method:"phone",occurredAt:new Date().toISOString(),
      reason:"safety_check",outcome:"contacted"};
    const send=(payload:typeof body,key="outreach-1")=>request(createApp()).post("/v1/operator/urgent-outreach")
      .set("Cookie",operatorSession.cookie).set("Origin","http://localhost:3000")
      .set("X-CSRF-Token",operatorSession.csrf).set("Idempotency-Key",key).send(payload);
    const first=await send(body);
    expect(first.status,JSON.stringify(first.body)).toBe(200);
    expect((await send(body)).body.id).toBe(first.body.id);
    expect((await send({...body,outcome:"escalated"})).status).toBe(409);
    expect((await send({...body,reason:"Call 9999999999"},"outreach-sensitive")).status).toBe(400);
    const history=await operatorSession.agent.get("/v1/operator/urgent-outreach");
    expect(history.status).toBe(200);
    expect(history.headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify(history.body)).not.toContain("9999999999");
    const weak=await operator("aal1",true,"outreach-weak");
    expect((await weak.agent.get("/v1/operator/urgent-outreach")).status).toBe(403);
    const revoked=await operator("aal2",false,"outreach-revoked");
    expect((await revoked.agent.get("/v1/operator/urgent-outreach")).status).toBe(403);
    const {appendFallback,reconcileFallback}=await import("../../../../scripts/pilot-outage-outreach.mjs");
    const path=resolve(receiptDirectory,"outreach.jsonl");
    const secret="integration-test-independent-fallback-secret";
    const fallbackId=await appendFallback(path,secret,{operatorId:operatorSession.userId,
      participantId:participant,method:"phone",reason:"service_outage",outcome:"follow_up_required",
      occurredAt:new Date().toISOString()});
    const independent=await verificationPool.connect();
    try {expect(await reconcileFallback(path,secret,independent)).toBe(1);
      expect(await reconcileFallback(path,secret,independent)).toBe(1);
      await independent.query("UPDATE pilot_urgent_outreach SET outcome='escalated' WHERE id=$1",[fallbackId]);
      await expect(reconcileFallback(path,secret,independent)).rejects.toThrow(/conflicts with existing state/);
    } finally {independent.release();}
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_urgent_outreach WHERE id=$1",[fallbackId])).rows[0].n).toBe(1);
  });
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
    const queueHealth=(await agent.get("/v1/operator/notifications/delivery")).body.health;
    expect(queueHealth.due).toBe(1);
    expect(queueHealth.queue_size).toBe(1);
    expect(queueHealth.awaiting_first_attempt).toBe(1);
    expect(queueHealth.oldest_important_queued_at).toBeTruthy();
    expect((await verificationPool.query("SELECT count(*)::int AS count FROM pilot_notification_events WHERE recipient_id = $1", [other.rows[0].id])).rows[0].count).toBe(0);
    const second = await operator("aal2", true, "second-notification");
    expect((await second.agent.get("/v1/notifications/durable")).body.notifications).toEqual([]);
    const jobId = (await verificationPool.query<{ id: string }>("SELECT id FROM pilot_email_jobs LIMIT 1")).rows[0].id;
    await verificationPool.query("UPDATE pilot_email_jobs SET status = 'exhausted', attempts = 5, last_error = 'secret provider response' WHERE id = $1", [jobId]);
    const delivery = await second.agent.get("/v1/operator/notifications/delivery");
    expect(delivery.headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify(delivery.body)).not.toContain("secret provider response");
    expect(delivery.body.jobs[0]).toMatchObject({
      origin_type: "operator_pause", event_type: "operator_pause_changed",
      related_entity_type: "pilot_pause_operation", related_entity_id: first.body.id,
    });
    expect(delivery.body.jobs[0].body).toBeUndefined();
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
    await chmod(receiptDirectory,0o700);
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
      departure.setUTCHours(5,0,0,0); // 10:30 in the corridor timezone
      for (let n=0;n<7;n++) {
        const day = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",weekday:"short"}).format(departure);
        if (day !== "Sun") break;
        departure.setUTCDate(departure.getUTCDate()+1);
      }
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

describe('ticket 07 adult self-declaration',()=>{
  let directory:string;
  beforeEach(async()=>{
    await verificationPool.query('TRUNCATE users CASCADE');
    await verificationPool.query(`INSERT INTO pilot_recovery_state(singleton,mode) VALUES(true,'open')
      ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL,started_at=NULL`);
    directory=await mkdtemp(resolve(tmpdir(),'adult-declaration-'));
    process.env.PILOT_RECEIPT_PATH=resolve(directory,'receipts');
    process.env.PILOT_RECEIPT_SECRET='adult-declaration-independent-evidence-secret';
  });
  afterEach(async()=>{
    delete process.env.PILOT_RECEIPT_PATH;delete process.env.PILOT_RECEIPT_SECRET;
    await rm(directory,{recursive:true,force:true});
  });
  async function user(){
    const email=`adult-${randomUUID()}@example.test`;
    const id=(await verificationPool.query<{id:string}>(
      'INSERT INTO users(email) VALUES($1) RETURNING id',[email])).rows[0].id;
    return {id,token:signAccessToken({userId:id,email,role:'user'})};
  }
  async function adultOperator(){
    const email=`adult-operator-${randomUUID()}@example.test`;
    const subject=`adult-operator-${randomUUID()}`;
    const id=(await verificationPool.query<{id:string}>(
      `INSERT INTO users(email,role,email_verified_at) VALUES($1,'admin',now()) RETURNING id`,[email])).rows[0].id;
    await verificationPool.query(`INSERT INTO user_profiles(user_id,full_name) VALUES($1,'Adult Recovery Operator')`,[id]);
    await verificationPool.query(`INSERT INTO auth_identities(provider,provider_subject,user_id,provider_email)
      VALUES('supabase',$1,$2,$3)`,[subject,id,email]);
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'ticket 07 recovery',now())`,[id]);
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='supabase',
      legacy_login_enabled=false,authorized_at=now(),authorized_by='integration-test'`);
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests(fakeProvider({subject,email,emailVerified:true,assuranceLevel:'aal2',userMetadata:{}}));
    const login=await request(createApp()).post('/v1/auth/login').send({email,password:'synthetic-password'});
    expect(login.status).toBe(200);
    return {cookie:login.headers['set-cookie'].map((item:string)=>item.split(';',1)[0]).join('; '),
      csrf:login.headers['set-cookie'].find((item:string)=>item.startsWith('pp_csrf_token='))?.split(';',1)[0]?.split('=',2)[1] as string};
  }
  const version='unrestricted-declared-2026-09-28.1';
  const path='/v1/adult-declaration';
  const auth=(token:string)=>({Authorization:`Bearer ${token}`});
  it('keeps a committed unrestricted declaration notice private and supports coded delivery-failure outreach',async()=>{
    const app=createApp();const participant=await user();const other=await user();
    const recorded=await request(app).put(path).set(auth(participant.token))
      .set('Idempotency-Key',randomUUID()).send({at_least_18:true,policy_version:version});
    expect(recorded.status).toBe(200);
    const own=await request(app).get('/v1/notifications/durable').set(auth(participant.token));
    expect(own.headers['cache-control']).toContain('no-store');
    const unrelated=await request(app).get('/v1/notifications/durable').set(auth(other.token));
    expect(own.body.notifications).toEqual([expect.objectContaining({
      event_type:'adult_declaration_declare',related_entity_id:participant.id})]);
    expect(own.body.notifications[0].recipient_id).toBeUndefined();
    expect(unrelated.body.notifications).toEqual([]);
    const onDuty=await adultOperator();
    const queue=await request(createApp()).get('/v1/operator/notifications/delivery')
      .set('Cookie',onDuty.cookie);
    expect(queue.status).toBe(200);
    expect(queue.headers['cache-control']).toContain('no-store');
    const job=queue.body.jobs.find((item:{operation_id:string})=>item.operation_id===recorded.body.operation_id);
    expect(job).toMatchObject({origin_type:'adult_declaration',recipient_id:participant.id});
    expect(job.body).toBeUndefined();
    await verificationPool.query(`UPDATE pilot_email_jobs SET status='exhausted',attempts=5,
      last_error='synthetic provider token' WHERE id=$1`,[job.id]);
    const failed=await request(createApp()).get('/v1/operator/notifications/delivery').set('Cookie',onDuty.cookie);
    expect(JSON.stringify(failed.body)).not.toContain('synthetic provider token');
    const outreach=await request(createApp()).post('/v1/operator/urgent-outreach')
      .set('Cookie',onDuty.cookie).set('Origin','http://localhost:3000')
      .set('X-CSRF-Token',onDuty.csrf).set('Idempotency-Key',randomUUID())
      .send({participantId:participant.id,method:'phone',occurredAt:new Date().toISOString(),
        reason:'delivery_failure',outcome:'no_answer'});
    expect(outreach.status,JSON.stringify(outreach.body)).toBe(200);
    const history=await request(createApp()).get('/v1/operator/urgent-outreach').set('Cookie',onDuty.cookie);
    expect(history.body.records).toEqual([expect.objectContaining({
      participant_id:participant.id,reason:'delivery_failure',outcome:'no_answer'})]);
    expect((await verificationPool.query('SELECT state FROM adult_declaration_operations WHERE id=$1',
      [recorded.body.operation_id])).rows[0].state).toBe('acknowledged');
  });
  it('requires authentication, records an unverified declaration, and retries once',async()=>{
    const app=createApp();const a=await user();
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).put(path).set(auth(a.token)).send({at_least_18:true,policy_version:version})).status).toBe(400);
    expect((await request(app).get(path).set(auth(a.token))).body.declaration.state).toBe('missing');
    const key=randomUUID();
    const first=await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',key)
      .send({at_least_18:true,policy_version:version});
    expect(first.status).toBe(200);
    expect(first.body.declaration).toMatchObject({state:'current',kind:'self_declaration'});
    const repeat=await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',key)
      .send({at_least_18:true,policy_version:version});
    expect(repeat.status).toBe(200);
    expect(repeat.body.operation_id).toBe(first.body.operation_id);
    expect((await request(app).post(`${path}/withdraw`).set(auth(a.token)).set('Idempotency-Key',key)
      .send({policy_version:version})).body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    const operations=await verificationPool.query(`SELECT count(*)::int AS n FROM adult_declaration_operations WHERE user_id=$1`,[a.id]);
    expect(operations.rows[0].n).toBe(1);
    const audits=await verificationPool.query(`SELECT count(*)::int AS n FROM audit_logs
      WHERE actor_user_id=$1 AND action='adult_declaration_declare'`,[a.id]);
    expect(audits.rows[0].n).toBe(1);
  });
  it('lets only the owner look up an adult declaration operation by its retry key',async()=>{
    const app=createApp();const owner=await user();const other=await user();const key=randomUUID();
    const recorded=await request(app).put(path).set(auth(owner.token)).set('Idempotency-Key',key)
      .send({at_least_18:true,policy_version:version});
    expect(recorded.status).toBe(200);
    const lookup=`${path}/operations/${key}`;
    expect((await request(app).get(lookup)).status).toBe(401);
    expect((await request(app).get(lookup).set(auth(other.token))).body.operation).toBeNull();
    expect((await request(app).get(lookup).set(auth(owner.token))).body.operation).toEqual({
      operation_id:recorded.body.operation_id,action:'declare',state:'acknowledged'});
  });
  it('shows expired, withdrawn, restricted and historical PRMITR-only states',async()=>{
    const app=createApp();const a=await user();
    await verificationPool.query(`INSERT INTO student_verifications(user_id,provider,institution_name,status,adult_eligible,eligibility_ends_at)
      VALUES($1,'manual_review','PRMITR','verified',true,now()+interval '1 year')`,[a.id]);
    expect((await request(app).get(path).set(auth(a.token))).body.declaration.state).toBe('missing');
    await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    await verificationPool.query(`UPDATE adult_declarations SET declared_at=now()-interval '13 months',expires_at=now()-interval '1 month' WHERE user_id=$1`,[a.id]);
    expect((await request(app).get(path).set(auth(a.token))).body.declaration.state).toBe('expired');
    await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    const withdrawal=await request(app).post(`${path}/withdraw`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send({policy_version:version});
    expect(withdrawal.body.declaration.state).toBe('withdrawn');
    await verificationPool.query(`INSERT INTO pilot_account_restriction_operations
      (operator_id,target_user_id,idempotency_key,payload_digest,action,scope,source_type,
       source_id,reason,reviewed_evidence,state)
      VALUES($1,$1,$2,$3,'restrict','all','incident',$4,'test','test','acknowledged')`,
      [a.id,randomUUID(),'digest',randomUUID()]);
    expect((await request(app).get(path).set(auth(a.token))).body.declaration.state).toBe('restricted');
  });
  it('uses the current policy, twelve calendar months, and isolates account state',async()=>{
    const app=createApp();const a=await user();const b=await user();
    const stale=await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:'historical-policy'});
    expect(stale.body.error.code).toBe('POLICY_VERSION_STALE');
    const first=await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    expect(first.status).toBe(200);
    const declared=new Date(first.body.declaration.declared_at);
    const expected=new Date(declared);expected.setUTCFullYear(expected.getUTCFullYear()+1);
    expect(new Date(first.body.declaration.expires_at).toISOString()).toBe(expected.toISOString());
    expect((await request(app).get(path).set(auth(b.token))).body.declaration.state).toBe('missing');
  });
  it('serializes concurrent same-key retries on separate PostgreSQL connections',async()=>{
    const app=createApp();const a=await user();const key=randomUUID();
    const [one,two]=await Promise.all([1,2].map(()=>request(app).put(path).set(auth(a.token))
      .set('Idempotency-Key',key).send({at_least_18:true,policy_version:version})));
    expect(one.status).toBe(200);expect(two.status).toBe(200);
    expect(one.body.operation_id).toBe(two.body.operation_id);
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM adult_declaration_operations
      WHERE user_id=$1`,[a.id])).rows[0].n).toBe(1);
  });
  it('server participation gate rejects missing, expired, withdrawn, restricted and disabled accounts',async()=>{
    const app=createApp();const a=await user();
    const check=async()=>{const client=await verificationPool.connect();try{
      await client.query('BEGIN');await assertCurrentAdultDeclaration(client,a.id);await client.query('ROLLBACK');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
    await expect(check()).rejects.toMatchObject({code:'ADULT_DECLARATION_REQUIRED'});
    await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    await expect(check()).resolves.toBeUndefined();
    await verificationPool.query(`UPDATE adult_declarations SET declared_at=now()-interval '13 months',
      expires_at=now()-interval '1 month' WHERE user_id=$1`,[a.id]);
    await expect(check()).rejects.toMatchObject({code:'ADULT_DECLARATION_REQUIRED'});
    await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    await request(app).post(`${path}/withdraw`).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({policy_version:version});
    await expect(check()).rejects.toMatchObject({code:'ADULT_DECLARATION_REQUIRED'});
    await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    await verificationPool.query(`UPDATE users SET status='suspended' WHERE id=$1`,[a.id]);
    await expect(check()).rejects.toMatchObject({code:'ACCOUNT_DISABLED'});
    await verificationPool.query(`UPDATE users SET status='active' WHERE id=$1`,[a.id]);
    await verificationPool.query(`INSERT INTO pilot_account_restriction_operations
      (operator_id,target_user_id,idempotency_key,payload_digest,action,scope,source_type,
       source_id,reason,reviewed_evidence,state)
      VALUES($1,$1,$2,$3,'restrict','all','incident',$4,'test','test','acknowledged')`,
      [a.id,randomUUID(),'digest',randomUUID()]);
    await expect(check()).rejects.toMatchObject({code:'ACCOUNT_RESTRICTED'});
  });
  it('shows a suspended account as restricted even while its declaration is unexpired',async()=>{
    const app=createApp();const a=await user();
    const recorded=await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    expect(recorded.status).toBe(200);
    await verificationPool.query(`UPDATE users SET status='suspended' WHERE id=$1`,[a.id]);
    const visible=await request(app).get(path).set(auth(a.token));
    expect(visible.status).toBe(200);
    expect(visible.body.declaration).toMatchObject({state:'restricted',restriction_source:'account_status'});
  });
  it('operator reconciliation restores an acknowledged declaration after an older database snapshot',async()=>{
    const app=createApp();const a=await user();
    const created=await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    expect(created.status).toBe(200);
    const id=created.body.operation_id;
    const original=(await verificationPool.query<{declared_at:Date;expires_at:Date}>(
      `SELECT declared_at,expires_at FROM adult_declarations WHERE user_id=$1`,[a.id])).rows[0];
    await verificationPool.query(`DELETE FROM pilot_email_jobs WHERE event_id=$1`,[id]);
    await verificationPool.query(`DELETE FROM pilot_notification_events WHERE id=$1`,[id]);
    await verificationPool.query(`DELETE FROM audit_logs WHERE metadata->>'operationId'=$1`,[id]);
    await verificationPool.query(`DELETE FROM adult_declarations WHERE user_id=$1`,[a.id]);
    await verificationPool.query(`DELETE FROM adult_declaration_operations WHERE id=$1`,[id]);
    const operator=await adultOperator();
    const reconciled=await request(createApp()).post('/v1/operator/reconcile')
      .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
      .set('X-CSRF-Token',operator.csrf).send({});
    expect(reconciled.status,JSON.stringify(reconciled.body)).toBe(200);
    const restored=await verificationPool.query<{declared_at:Date;expires_at:Date;state:string}>(
      `SELECT d.declared_at,d.expires_at,o.state FROM adult_declarations d
       JOIN adult_declaration_operations o ON o.id=d.operation_id WHERE d.user_id=$1`,[a.id]);
    expect(restored.rows[0]).toMatchObject({...original,state:'recovered'});
  });
  it('does not recover a withdrawal without its preceding declaration evidence',async()=>{
    const app=createApp();const a=await user();
    const declared=await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    const withdrawn=await request(app).post(`${path}/withdraw`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send({policy_version:version});
    expect(withdrawn.status).toBe(200);
    await rm(resolve(directory,'receipts.adult-declaration',`${declared.body.operation_id}.json`));
    await verificationPool.query(`DELETE FROM pilot_email_jobs WHERE event_id IN($1,$2)`,
      [declared.body.operation_id,withdrawn.body.operation_id]);
    await verificationPool.query(`DELETE FROM pilot_notification_events WHERE id IN($1,$2)`,
      [declared.body.operation_id,withdrawn.body.operation_id]);
    await verificationPool.query(`DELETE FROM audit_logs WHERE metadata->>'operationId' IN($1,$2)`,
      [declared.body.operation_id,withdrawn.body.operation_id]);
    await verificationPool.query(`DELETE FROM adult_declarations WHERE user_id=$1`,[a.id]);
    await verificationPool.query(`DELETE FROM adult_declaration_operations WHERE user_id=$1`,[a.id]);
    const operator=await adultOperator();
    const reconciled=await request(createApp()).post('/v1/operator/reconcile')
      .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
      .set('X-CSRF-Token',operator.csrf).send({});
    expect(reconciled.status).toBe(409);
    expect(reconciled.body.error.code).toBe('RECOVERY_INCOMPLETE');
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM adult_declaration_operations
      WHERE user_id=$1`,[a.id])).rows[0].n).toBe(0);
  });
  it('operator reconciliation resolves a committed declaration after receipt storage recovers',async()=>{
    const app=createApp();const a=await user();
    const key=randomUUID();
    process.env.PILOT_RECEIPT_PATH=resolve(directory,'missing','receipts');
    await chmod(directory,0o500);
    const pending=await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',key)
      .send({at_least_18:true,policy_version:version});
    await chmod(directory,0o700);
    expect(pending.body.error.code).toBe('OPERATION_PENDING');
    const id=pending.body.error.details.operationId;
    const operator=await adultOperator();
    const reconciled=await request(createApp()).post('/v1/operator/reconcile')
      .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
      .set('X-CSRF-Token',operator.csrf).send({});
    expect(reconciled.status,JSON.stringify(reconciled.body)).toBe(200);
    expect((await verificationPool.query(`SELECT state FROM adult_declaration_operations WHERE id=$1`,[id]))
      .rows[0].state).toBe('recovered');
    const reopened=await request(createApp()).post('/v1/operator/reopen')
      .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
      .set('X-CSRF-Token',operator.csrf).set('Idempotency-Key',randomUUID())
      .send({reason:'Reviewed recovered adult declaration evidence'});
    expect(reopened.status,JSON.stringify(reopened.body)).toBe(200);
  });
  it('does not acknowledge when independent recovery evidence fails',async()=>{
    const app=createApp();const a=await user();
    process.env.PILOT_RECEIPT_PATH=resolve(directory,'missing','receipts');
    await chmod(directory,0o500);
    const result=await request(app).put(path).set(auth(a.token)).set('Idempotency-Key',randomUUID())
      .send({at_least_18:true,policy_version:version});
    await chmod(directory,0o700);
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('OPERATION_PENDING');
    expect((await verificationPool.query(`SELECT mode FROM pilot_recovery_state WHERE singleton=true`)).rows[0].mode).toBe('restricted');
    expect((await verificationPool.query(`SELECT state FROM adult_declaration_operations WHERE user_id=$1`,[a.id])).rows[0].state).toBe('committed');
  });
});

describe('ticket 08 driver and vehicle self-declarations',()=>{
  const path='/v1/driver-vehicle-declarations';
  const version='unrestricted-declared-2026-09-28.1';
  const auth=(token:string)=>({Authorization:`Bearer ${token}`});
  let directory:string;
  beforeEach(async()=>{
    await verificationPool.query('TRUNCATE users CASCADE');
    await verificationPool.query(`INSERT INTO pilot_recovery_state(singleton,mode) VALUES(true,'open')
      ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL,started_at=NULL`);
    directory=await mkdtemp(resolve(tmpdir(),'driver-vehicle-declaration-'));
    process.env.PILOT_RECEIPT_PATH=resolve(directory,'receipts');
    process.env.PILOT_RECEIPT_SECRET='driver-vehicle-independent-evidence-secret';
  });
  afterEach(async()=>{delete process.env.PILOT_RECEIPT_PATH;delete process.env.PILOT_RECEIPT_SECRET;
    await rm(directory,{recursive:true,force:true});});
  async function user(){const email=`vehicle-${randomUUID()}@example.test`;
    const id=(await verificationPool.query<{id:string}>(
      'INSERT INTO users(email) VALUES($1) RETURNING id',[email])).rows[0].id;
    return {id,token:signAccessToken({userId:id,email,role:'user'})};}
  async function adult(a:{id:string;token:string}){return request(createApp()).put('/v1/adult-declaration')
    .set(auth(a.token)).set('Idempotency-Key',randomUUID())
    .send({at_least_18:true,policy_version:version});}
  const future=(years=1)=>`${new Date().getUTCFullYear()+years}-12-31`;
  const driverBody=()=>({licence_categories:['bike','scooter','car'],licence_expires_on:future(2),policy_version:version});
  const vehicleBody=(category:'bike'|'scooter'|'car',capacity=1,belted:number|null=category==='car'?capacity:null)=>({
    category,registration_identifier:`MH20-${randomUUID().slice(0,8)}`,registration_expires_on:future(2),
    insurance_expires_on:future(2),permission_to_use:true,belted_passenger_seats:belted,
    passenger_capacity:capacity,policy_version:version});
  async function driver(a:{id:string;token:string}){return request(createApp()).put(`${path}/driver`)
    .set(auth(a.token)).set('Idempotency-Key',randomUUID()).send(driverBody());}
  it('requires an adult declaration and records no implied approval',async()=>{
    const app=createApp();const a=await user();
    expect((await request(app).get(path)).status).toBe(401);
    const missing=await driver(a);
    expect(missing.body.error.code).toBe('ADULT_DECLARATION_REQUIRED');
    await adult(a);
    const declared=await driver(a);
    expect(declared.status,JSON.stringify(declared.body)).toBe(200);
    expect(declared.body.declaration.driver).toMatchObject({kind:'self_declaration',state:'current'});
    expect(JSON.stringify(declared.body)).not.toMatch(/approved|inspected|verified/i);
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM driver_vehicle_approvals`)).rows[0].n).toBe(0);
  });
  it('rejects unsupported categories, expired documents and invalid capacity at HTTP and SQL boundaries',async()=>{
    const app=createApp();const a=await user();await adult(a);await driver(a);
    const bike=vehicleBody('bike',2,null);
    expect((await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(bike)).body.error.code).toBe('CAPACITY_EXCEEDED');
    expect((await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send({...bike,category:'truck'})).status).toBe(400);
    expect((await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send({...bike,category:'car',
        belted_passenger_seats:2,passenger_capacity:3})).body.error.code).toBe('CAPACITY_EXCEEDED');
    expect((await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send({...bike,passenger_capacity:1,
        insurance_expires_on:'2020-01-01'})).body.error.code).toBe('DECLARATION_EXPIRED');
    await expect(verificationPool.query(`INSERT INTO unrestricted_vehicle_declarations
      (driver_user_id,category,registration_identifier,registration_expires_on,insurance_expires_on,
       permission_to_use,belted_passenger_seats,passenger_capacity,policy_version,declared_at,renew_after,operation_id)
      VALUES($1,'bike','INVALID',current_date+1,current_date+1,true,NULL,2,$2,now(),now()+interval '1 year',$3)`,
      [a.id,version,randomUUID()])).rejects.toMatchObject({code:'23514'});
    await expect(verificationPool.query(`INSERT INTO unrestricted_vehicle_declarations
      (driver_user_id,category,registration_identifier,registration_expires_on,insurance_expires_on,
       permission_to_use,belted_passenger_seats,passenger_capacity,policy_version,declared_at,renew_after,operation_id)
      VALUES($1,'car','CAR-INVALID',current_date+1,current_date+1,true,2,3,$2,now(),now()+interval '1 year',$3)`,
      [a.id,version,randomUUID()])).rejects.toMatchObject({code:'23514'});
    const scooter=await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(vehicleBody('scooter'));
    expect(scooter.status).toBe(200);
    expect(scooter.body.declaration.vehicles[0]).toMatchObject({category:'scooter',passenger_capacity:1});
  });
  it('enforces ownership, licence category, restrictions, expiry and changed capacity',async()=>{
    const app=createApp();const a=await user();const b=await user();await adult(a);await adult(b);
    await driver(a);await driver(b);
    const car=vehicleBody('car',3,3);const created=await request(app).post(`${path}/vehicles`)
      .set(auth(a.token)).set('Idempotency-Key',randomUUID()).send(car);
    expect(created.status,JSON.stringify(created.body)).toBe(200);
    const id=created.body.declaration.vehicles[0].id;
    const wrong=await request(app).put(`${path}/vehicles/${id}`).set(auth(b.token))
      .set('Idempotency-Key',randomUUID()).send(car);
    expect(wrong.body.error.code).toBe('VEHICLE_NOT_OWNED');
    const check=async(seats:number)=>{const client=await verificationPool.connect();try{
      await client.query('BEGIN');
      const result=await (await import('../modules/driver-vehicle-declaration/driver-vehicle-declaration.service'))
        .assertCurrentDriverVehicle(client,a.id,id,seats);
      await client.query('ROLLBACK');return result;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
    await expect(check(3)).resolves.toMatchObject({passengerCapacity:3});
    const changed=await request(app).put(`${path}/vehicles/${id}`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send({...car,passenger_capacity:2});
    expect(changed.status,JSON.stringify(changed.body)).toBe(200);
    await expect(check(3)).rejects.toMatchObject({code:'CAPACITY_EXCEEDED'});
    await verificationPool.query(`UPDATE unrestricted_vehicle_declarations SET insurance_expires_on=current_date-1 WHERE id=$1`,[id]);
    await expect(check(1)).rejects.toMatchObject({code:'VEHICLE_DECLARATION_REQUIRED'});
    await verificationPool.query(`UPDATE unrestricted_vehicle_declarations SET insurance_expires_on=current_date+1 WHERE id=$1`,[id]);
    await verificationPool.query(`UPDATE unrestricted_driver_declarations SET licence_expires_on=current_date-1
      WHERE user_id=$1`,[a.id]);
    await expect(check(1)).rejects.toMatchObject({code:'DRIVER_DECLARATION_REQUIRED'});
    await verificationPool.query(`UPDATE unrestricted_driver_declarations SET licence_expires_on=current_date+1,
      licence_categories=ARRAY['bike']::text[] WHERE user_id=$1`,[a.id]);
    await expect(check(1)).rejects.toMatchObject({code:'LICENCE_CATEGORY_REQUIRED'});
    await verificationPool.query(`UPDATE unrestricted_driver_declarations SET licence_categories=ARRAY['bike','car']::text[]
      WHERE user_id=$1`,[a.id]);
    await verificationPool.query(`INSERT INTO pilot_account_restriction_operations
      (operator_id,target_user_id,idempotency_key,payload_digest,action,scope,source_type,
       source_id,reason,reviewed_evidence,state)
      VALUES($1,$1,$2,$3,'restrict','driver','incident',$4,'test','test','acknowledged')`,
      [a.id,randomUUID(),'digest',randomUUID()]);
    await expect(check(1)).rejects.toMatchObject({code:'ACCOUNT_RESTRICTED'});
    const restrictedRenewal=await request(app).put(`${path}/driver`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(driverBody());
    expect(restrictedRenewal.body.error.code).toBe('ACCOUNT_RESTRICTED');
  });
  it('serializes revocation with the participation gate on separate connections',async()=>{
    const app=createApp();const a=await user();await adult(a);await driver(a);
    const created=await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(vehicleBody('bike'));
    const id=created.body.declaration.vehicles[0].id;
    const client=await verificationPool.connect();
    try{await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[a.id]);
      const revoking=request(app).post(`${path}/vehicles/${id}/revoke`).set(auth(a.token))
        .set('Idempotency-Key',randomUUID()).send({});
      const pending=revoking.then(result=>result);
      const gate=(await import('../modules/driver-vehicle-declaration/driver-vehicle-declaration.service'))
        .assertCurrentDriverVehicle(client,a.id,id,1);
      await expect(gate).resolves.toMatchObject({passengerCapacity:1});
      await client.query('COMMIT');
      const revoked=await pending;expect(revoked.status,JSON.stringify(revoked.body)).toBe(200);
      const other=await verificationPool.connect();try{await other.query('BEGIN');
        await expect((await import('../modules/driver-vehicle-declaration/driver-vehicle-declaration.service'))
          .assertCurrentDriverVehicle(other,a.id,id,1)).rejects.toMatchObject({code:'VEHICLE_DECLARATION_REQUIRED'});
        await other.query('ROLLBACK');}finally{other.release();}
    }finally{client.release();}
  });
  it('serializes driver revocation with the participation gate on separate connections',async()=>{
    const app=createApp();const a=await user();await adult(a);await driver(a);
    const created=await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(vehicleBody('bike'));
    const id=created.body.declaration.vehicles[0].id;
    const gate=(await import('../modules/driver-vehicle-declaration/driver-vehicle-declaration.service'))
      .assertCurrentDriverVehicle;
    const first=await verificationPool.connect();
    try{await first.query('BEGIN');await expect(gate(first,a.id,id,1)).resolves.toMatchObject({passengerCapacity:1});
      const revoking=request(app).post(`${path}/driver/revoke`).set(auth(a.token))
        .set('Idempotency-Key',randomUUID()).send({});
      const pending=revoking.then(result=>result);
      await first.query('COMMIT');
      const revoked=await pending;expect(revoked.status,JSON.stringify(revoked.body)).toBe(200);
      const second=await verificationPool.connect();try{await second.query('BEGIN');
        await expect(gate(second,a.id,id,1)).rejects.toMatchObject({code:'DRIVER_DECLARATION_REQUIRED'});
        await second.query('ROLLBACK');}finally{second.release();}
    }finally{first.release();}
  });
  it('keeps retries idempotent and rejects a changed payload',async()=>{
    const app=createApp();const a=await user();await adult(a);await driver(a);
    const body=vehicleBody('scooter');const key=randomUUID();
    const send=(payload:object)=>request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',key).send(payload);
    const first=await send(body);const retry=await send(body);
    expect(first.status).toBe(200);expect(retry.status).toBe(200);
    expect(retry.body.operation_id).toBe(first.body.operation_id);
    expect((await send({...body,registration_identifier:'DIFFERENT'})).body.error.code)
      .toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM unrestricted_vehicle_declarations
      WHERE driver_user_id=$1`,[a.id])).rows[0].n).toBe(1);
  });
  it('lets only the owner look up a driver or vehicle declaration operation',async()=>{
    const app=createApp();const owner=await user();const other=await user();await adult(owner);
    const key=randomUUID();const recorded=await request(app).put(`${path}/driver`).set(auth(owner.token))
      .set('Idempotency-Key',key).send(driverBody());
    expect(recorded.status).toBe(200);
    const lookup=`${path}/operations/${key}`;
    expect((await request(app).get(lookup)).status).toBe(401);
    expect((await request(app).get(lookup).set(auth(other.token))).body.operation).toBeNull();
    expect((await request(app).get(lookup).set(auth(owner.token))).body.operation).toEqual({
      operation_id:recorded.body.operation_id,action:'driver_declare',state:'acknowledged'});
  });
  it('blocks known false declarations and does not let the owner restore a revoked record',async()=>{
    const app=createApp();const a=await user();await adult(a);await driver(a);
    const body=vehicleBody('car',2,2);
    const created=await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(body);
    const id=created.body.declaration.vehicles[0].id;
    await verificationPool.query(`UPDATE unrestricted_vehicle_declarations
      SET false_declaration_at=now() WHERE id=$1`,[id]);
    const flagged=await request(app).put(`${path}/vehicles/${id}`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(body);
    expect(flagged.body.error.code).toBe('DECLARATION_REVIEW_REQUIRED');
    expect((await request(app).get(path).set(auth(a.token))).body.vehicles[0].state)
      .toBe('false_declaration');
    const revoked=await request(app).post(`${path}/vehicles/${id}/revoke`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send({});
    expect(revoked.status).toBe(200);
    const restore=await request(app).put(`${path}/vehicles/${id}`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(body);
    expect(restore.body.error.code).toBe('DECLARATION_REVIEW_REQUIRED');
  });
  it('blocks a driver with a known false declaration from renewing or registering a vehicle',async()=>{
    const app=createApp();const a=await user();await adult(a);await driver(a);
    await verificationPool.query(`UPDATE unrestricted_driver_declarations
      SET false_declaration_at=now() WHERE user_id=$1`,[a.id]);
    const visible=await request(app).get(path).set(auth(a.token));
    expect(visible.status).toBe(200);
    expect(visible.body.driver).toMatchObject({kind:'self_declaration',
      declaration_state:'false_declaration'});
    const renewal=await request(app).put(`${path}/driver`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(driverBody());
    expect(renewal.status).toBe(403);
    expect(renewal.body.error.code).toBe('DECLARATION_REVIEW_REQUIRED');
    const registration=await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(vehicleBody('bike'));
    expect(registration.status).toBe(403);
    expect(registration.body.error.code).toBe('DRIVER_DECLARATION_REQUIRED');
  });
  it('holds acknowledgement when recovery evidence cannot be written',async()=>{
    const app=createApp();const a=await user();await adult(a);
    process.env.PILOT_RECEIPT_PATH=resolve(directory,'missing','receipts');
    await chmod(directory,0o500);
    const result=await request(app).put(`${path}/driver`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(driverBody());
    await chmod(directory,0o700);
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('OPERATION_PENDING');
    expect((await verificationPool.query(`SELECT state FROM unrestricted_declaration_operations
      WHERE actor_user_id=$1`,[a.id])).rows[0].state).toBe('committed');
    expect((await verificationPool.query(`SELECT mode FROM pilot_recovery_state
      WHERE singleton=true`)).rows[0].mode).toBe('restricted');
  });
  it('restores an acknowledged vehicle and audit from independent evidence',async()=>{
    const app=createApp();const a=await user();await adult(a);await driver(a);
    const created=await request(app).post(`${path}/vehicles`).set(auth(a.token))
      .set('Idempotency-Key',randomUUID()).send(vehicleBody('bike'));
    expect(created.status).toBe(200);
    const operationId=created.body.operation_id;
    const vehicleId=created.body.declaration.vehicles[0].id;
    await verificationPool.query('DELETE FROM pilot_email_jobs WHERE event_id=$1',[operationId]);
    await verificationPool.query('DELETE FROM pilot_notification_events WHERE id=$1',[operationId]);
    await verificationPool.query(`DELETE FROM audit_logs WHERE metadata->>'operationId'=$1`,[operationId]);
    await verificationPool.query('DELETE FROM unrestricted_vehicle_declarations WHERE id=$1',[vehicleId]);
    await verificationPool.query('DELETE FROM unrestricted_declaration_operations WHERE id=$1',[operationId]);
    const operator=(await verificationPool.query<{id:string}>(`INSERT INTO users(email,role,email_verified_at)
      VALUES($1,'admin',now()) RETURNING id`,[`operator-${randomUUID()}@example.test`])).rows[0].id;
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'ticket 08 recovery test',now())`,[operator]);
    const {driverVehicleRecovery}=await import('../modules/driver-vehicle-declaration/driver-vehicle-declaration.service');
    await expect(driverVehicleRecovery.reconcileReceipts(operator)).resolves.toBeGreaterThan(0);
    const restored=await verificationPool.query(`SELECT o.state,v.category FROM unrestricted_declaration_operations o
      JOIN unrestricted_vehicle_declarations v ON v.operation_id=o.id WHERE o.id=$1`,[operationId]);
    expect(restored.rows[0]).toMatchObject({state:'recovered',category:'bike'});
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM audit_logs
      WHERE metadata->>'operationId'=$1`,[operationId])).rows[0].n).toBe(1);
  });
});

describe('ticket 10 isolated posted route preparation',()=>{
  let directory:string;
  const version='unrestricted-declared-2026-09-28.1';
  const path='/v1/posted-routes';
  const routeModule=()=>import('../modules/posted-routes/routing');
  const safeStop={placeId:'synthetic-stop',driverConfirmed:true,legal:true,correctSide:true,
    correctDirection:true,helmetSpace:true};
  const safeStopForKind=async(_point:unknown,kind:'pickup'|'dropoff')=>({...safeStop,placeId:`synthetic-${kind}`});
  beforeEach(async()=>{
    // Explicit unavailable-approval fixture; the packaged real review is now approved.
    setServiceAreaApprovalForTests({status:'pending'});
    await verificationPool.query('TRUNCATE users CASCADE');
    await verificationPool.query('UPDATE pilot_pause_state SET paused=false');
    await verificationPool.query(`INSERT INTO pilot_recovery_state(singleton,mode) VALUES(true,'open')
      ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL,started_at=NULL`);
    directory=await mkdtemp(resolve(tmpdir(),'posted-route-'));
    process.env.PILOT_RECEIPT_PATH=resolve(directory,'receipts');
    process.env.PILOT_RECEIPT_SECRET='posted-route-independent-evidence-secret';
    process.env.ROUTE_SUPPORT_WINDOW_START=new Date(Date.now()-3600000).toISOString();
    process.env.ROUTE_SUPPORT_WINDOW_END=new Date(Date.now()+8*86400000).toISOString();
    process.env.ROUTE_SUPPORT_WINDOW_APPROVED='true';
  });
  afterEach(async()=>{
    setServiceAreaApprovalForTests(null);
    (await routeModule()).setRoutingAdapterForTests(null);
    (await import('../modules/posted-routes/route-boundary')).setBoundaryCheckForTests(null);
    (await import('../modules/posted-routes/route-boundary')).setBoundaryArtifactForTests(null);
    vi.unstubAllGlobals();
    setOutcomeClockForTests(null);
    delete process.env.VALHALLA_URL;delete process.env.VALHALLA_BUILD_MANIFEST;
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(null);
    for(const name of ['PILOT_RECEIPT_PATH','PILOT_RECEIPT_SECRET','ROUTE_SUPPORT_WINDOW_START','ROUTE_SUPPORT_WINDOW_END','ROUTE_SUPPORT_WINDOW_APPROVED'])delete process.env[name];
    await rm(directory,{recursive:true,force:true});
  });
  async function participant(mode:'car'|'bike'|'scooter'='car'){
    const email=`posted-${randomUUID()}@example.test`;
    const id=(await verificationPool.query<{id:string}>('INSERT INTO users(email) VALUES($1) RETURNING id',[email])).rows[0].id;
    const token=signAccessToken({userId:id,email,role:'user'});
    const app=createApp(), auth={Authorization:`Bearer ${token}`};
    const send=(method:'put'|'post',url:string,body:unknown)=>request(app)[method](url).set(auth)
      .set('Idempotency-Key',randomUUID()).send(body);
    expect((await send('put','/v1/adult-declaration',{at_least_18:true,policy_version:version})).status).toBe(200);
    expect((await send('put','/v1/driver-vehicle-declarations/driver',{licence_categories:[mode],
      licence_expires_on:'2030-12-31',policy_version:version})).status).toBe(200);
    const vehicle=await send('post','/v1/driver-vehicle-declarations/vehicles',{category:mode,
      registration_identifier:`MH-${randomUUID().slice(0,8)}`,registration_expires_on:'2030-12-31',
      insurance_expires_on:'2030-12-31',permission_to_use:true,belted_passenger_seats:mode==='car'?2:null,
      passenger_capacity:mode==='car'?2:1,policy_version:version});
    expect(vehicle.status,JSON.stringify(vehicle.body)).toBe(200);
    return {id,token,vehicle:vehicle.body.declaration.vehicles[0].id};
  }
  function departure(){const now=new Date();for(let d=1;d<=6;d++){
    const candidate=new Date(now.getTime()+d*86400000);
    const ist=new Date(candidate.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    if(ist.getDay()>=1&&ist.getDay()<=5){
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(candidate);
      const [month,dd,year]=day.split('/');
      const date=day.includes('/')?`${year}-${month}-${dd}`:day;
      const scheduled=new Date(`${date}T10:00:00+05:30`);
      if(scheduled.getTime()>now.getTime()+2*3600000)return scheduled.toISOString();
    }}throw new Error('No weekday');}
  async function valhallaInput(mode:'car'|'bike'|'scooter'='car'){
    const actor=await participant(mode),app=createApp();
    const input={vehicle_id:actor.vehicle,mode,origin:[77.75,20.9001],destination:[77.765,20.9001],
      departure_at:departure(),capacity:1};
    const send=(url:string,body:unknown=input,key=randomUUID(),token=actor.token)=>request(app).post(url)
      .set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
    return {actor,app,input,send};
  }
  async function approvedServiceArea(){
    setServiceAreaApprovalForTests(null);
  }
  function confirmPreview(input:Record<string,unknown>,preview:{preview_digest:string;route:{geometry:{coordinates:number[][]}}}){
    return {...input,endpoint_confirmation:{preview_digest:preview.preview_digest,
      origin:preview.route.geometry.coordinates[0],destination:preview.route.geometry.coordinates.at(-1),
      safe_stopping_places:true,correct_side_and_direction:true,helmet_space:true}};
  }
  async function passengerPublication(mode:'car'|'bike'|'scooter'='car',configure?:(provider:ReturnType<typeof valhallaFixture>)=>void,capacity=1){
    const f=await valhallaInput(mode),provider=valhallaFixture();f.input.capacity=capacity;configure?.(provider);await approvedServiceArea();
    const preview=await f.send(`${path}/preview`);
    expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    const stops=[{id:'origin',name:'Driver selected origin',point:f.input.origin},
      {id:'destination',name:'Driver selected destination',point:f.input.destination}].map(stop=>({...stop,
        matched_point:[stop.point[0],20.9],safe_stopping_place:true,legal_stopping:true,correct_side:true,correct_direction:true,helmet_space:true}));
    const input={...confirmPreview(f.input,preview.body),passenger_publication:{stops}};
    const publicationKey=randomUUID();
    const published=await f.send(path,input,publicationKey);
    expect(published.status,JSON.stringify(published.body)).toBe(201);
    const passenger=await participant();
    const id=published.body.offer.id;
    const selection={route_version:1,pickup:f.input.origin,dropoff:f.input.destination};
    return {...f,provider,passenger,id,selection,publicationKey,publicationOperation:published.body.offer.operation_id,publicationInput:input,
      quote:(payload:unknown=selection,token=passenger.token)=>f.send(`${path}/${id}/quote`,payload,randomUUID(),token)};
  }
  it('ticket 12 refuses acceptance when its deadline passes during provider verification',async()=>{
    const f=await passengerPublication();
    const asked=await f.send(`${path}/${f.id}/requests`,f.selection,randomUUID(),f.passenger.token);
    expect(asked.status).toBe(201);
    const deadline=new Date(asked.body.request.decision_deadline_at).getTime();
    const providerFetch=globalThis.fetch;
    vi.stubGlobal('fetch',async(...args:Parameters<typeof fetch>)=>{
      const response=await providerFetch(...args);
      vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(deadline+1);
      return response;
    });
    try{
      const accepted=await f.send(`${path}/requests/${asked.body.request.id}/accept`,{});
      expect(accepted.body.error?.code,JSON.stringify(accepted.body)).toBe('REQUEST_NOT_PENDING');
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations')).rows[0].n).toBe(0);
    }finally{vi.useRealTimers();}
  });
  it('ticket 12 revalidates published selection, price, support, declarations and provider at acceptance',async()=>{
    const f=await passengerPublication();
    const ask=(selection:unknown=f.selection)=>f.send(`${path}/${f.id}/requests`,selection,randomUUID(),f.passenger.token);
    expect((await ask({...f.selection,pickup:[77.751,20.9]})).body.error.code).toBe('STOP_CONFIRMATION_REQUIRED');
    expect((await ask({...f.selection,pickup:[77.73,20.9]})).body.error.code).toBe('BOUNDARY_INVALID');
    const asked=await ask(),id=asked.body.request.id;
    expect(asked.status).toBe(201);
    const accept=()=>f.send(`${path}/requests/${id}/accept`,{});
    f.provider.fail=true;
    expect((await accept()).body.error.code).toBe('ROUTING_UNAVAILABLE');f.provider.fail=false;
    f.provider.build='0'.repeat(64);
    expect((await accept()).body.error.code).toBe('ROUTING_UNAVAILABLE');
    f.provider.build=(await import('../modules/posted-routes/valhalla')).manifestDigest(JSON.parse(process.env.VALHALLA_BUILD_MANIFEST!));
    setServiceAreaApprovalForTests({status:'revoked'});
    expect((await accept()).body.error.code).toBe('BOUNDARY_UNAVAILABLE');
    setServiceAreaApprovalForTests(serviceAreaApprovalFixture());
    expect((await accept()).body.error.code).toBe('ROUTE_AREA_STALE');setServiceAreaApprovalForTests(null);
    process.env.ROUTE_SUPPORT_WINDOW_APPROVED='false';
    expect((await accept()).body.error.code).toBe('SUPPORT_WINDOW_UNAVAILABLE');process.env.ROUTE_SUPPORT_WINDOW_APPROVED='true';
    await verificationPool.query('UPDATE adult_declarations SET withdrawn_at=now() WHERE user_id=$1',[f.passenger.id]);
    expect((await accept()).body.error.code).toBe('ADULT_DECLARATION_REQUIRED');
    await verificationPool.query('UPDATE adult_declarations SET withdrawn_at=NULL WHERE user_id=$1',[f.passenger.id]);
    await verificationPool.query("UPDATE users SET status='suspended' WHERE id=$1",[f.passenger.id]);
    expect((await accept()).body.error.code).toBe('ACCOUNT_DISABLED');
    await verificationPool.query("UPDATE users SET status='active' WHERE id=$1",[f.passenger.id]);
    await verificationPool.query("UPDATE posted_route_seat_requests SET proposed_terms=jsonb_set(proposed_terms,'{total_paise}','1') WHERE id=$1",[id]);
    expect((await accept()).body.error.code).toBe('SEGMENT_TERMS_CHANGED');
    await verificationPool.query('UPDATE posted_route_seat_requests SET proposed_terms=$2 WHERE id=$1',[id,asked.body.request.proposed_terms]);
    await verificationPool.query('UPDATE posted_route_offers SET route_version=2 WHERE id=$1',[f.id]);
    expect((await accept()).body.error.code).toBe('ROUTE_VERSION_STALE');
    await verificationPool.query('UPDATE posted_route_offers SET route_version=1 WHERE id=$1',[f.id]);
    expect((await accept()).status).toBe(200);
  });
  it('ticket 12 rejects private preparations and missing independent publication evidence',async()=>{
    const f=await valhallaInput();valhallaFixture();await approvedServiceArea();
    const preview=await f.send(`${path}/preview`),privateOffer=await f.send(path,confirmPreview(f.input,preview.body));
    const passenger=await participant();
    const asked=await f.send(`${path}/${privateOffer.body.offer.id}/requests`,
      {route_version:1,pickup:f.input.origin,dropoff:f.input.destination},randomUUID(),passenger.token);
    expect(asked.body.error.code).toBe('ROUTE_NOT_FOUND');
    const publication=await passengerPublication();
    await rm(resolve(directory,'receipts.posted-route',`${publication.publicationOperation}.json`));
    const missing=await publication.send(`${path}/${publication.id}/requests`,publication.selection,randomUUID(),publication.passenger.token);
    expect(missing.body.error.code).toBe('RECOVERY_UNAVAILABLE');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_requests')).rows[0].n).toBe(0);
  });
  it('ticket 12 observes area revocation while acceptance waits on a separate PostgreSQL connection',async()=>{
    const f=await passengerPublication();
    const asked=await f.send(`${path}/${f.id}/requests`,f.selection,randomUUID(),f.passenger.token);
    expect(asked.status).toBe(201);
    const blocker=await verificationPool.connect();
    try{
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM posted_route_offers WHERE id=$1 FOR UPDATE',[f.id]);
      const accepting=Promise.resolve(f.send(`${path}/requests/${asked.body.request.id}/accept`,{}));
      let waiting=false;
      for(let attempt=0;attempt<100&&!waiting;attempt++){
        waiting=(await verificationPool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM posted_route_offers WHERE id=%' ")).rowCount!==0;
        if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(waiting).toBe(true);
      setServiceAreaApprovalForTests({status:'revoked'});
      await blocker.query('COMMIT');
      expect((await accepting).body.error.code).toBe('BOUNDARY_UNAVAILABLE');
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations')).rows[0].n).toBe(0);
    }finally{await blocker.query('ROLLBACK');blocker.release();}
  });
  it('ticket 13 departure rejects revoked area approval and preserves accepted terms',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    const seat=accepted.body.booking.id;
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    setServiceAreaApprovalForTests({status:'revoked'});
    const response=await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]});
    expect(response.body.error?.code).toBe('BOUNDARY_UNAVAILABLE');
    expect((await verificationPool.query('SELECT status,accepted_terms FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0])
      .toEqual({status:'confirmed',accepted_terms:accepted.body.booking.accepted_terms});
  });
  it('ticket 12 preserves acknowledged published acceptance on retries after revocation and pause',async()=>{
    const f=await passengerPublication(),requestKey=randomUUID(),acceptKey=randomUUID();
    const asked=await f.send(`${path}/${f.id}/requests`,f.selection,requestKey,f.passenger.token);
    const accepted=await f.send(`${path}/requests/${asked.body.request.id}/accept`,{},acceptKey);
    expect(accepted.status).toBe(200);
    setServiceAreaApprovalForTests({status:'revoked'});f.provider.fail=true;
    await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='acceptance'");
    const retried=await f.send(`${path}/requests/${asked.body.request.id}/accept`,{},acceptKey);
    expect(retried.status).toBe(200);expect(retried.body).toEqual(accepted.body);
    expect((await f.send(`${path}/${f.id}/requests`,{...f.selection,route_version:2},requestKey,f.passenger.token)).body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect((await f.send(`${path}/requests/${asked.body.request.id}/reject`,{},acceptKey)).body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });
  it('ticket 12 holds preserve seats and frozen terms until audited cancellation, including acceptance races',async()=>{
    const f=await bookingFixture(1,true),first=await participant(),next=await participant();
    const firstId=await f.ask(first),nextId=await f.ask(next);
    const accepted=await f.call(f.driver.token,`${path}/requests/${firstId}/accept`,{});
    expect(accepted.status).toBe(200);
    const allocation=accepted.body.booking;
    const operator=await seatRecoveryOperator();
    try{
      const held=await request(f.app).post(`${path}/${f.offer}/hold`).set('Cookie',operator.cookie)
        .set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf)
        .set('Idempotency-Key',randomUUID()).send({reason:'Review before accepting more seats'});
      expect(held.status,JSON.stringify(held.body)).toBe(200);
    }finally{await clearSeatRecoveryOperator();}
    expect((await f.call(f.driver.token,`${path}/requests/${nextId}/accept`,{})).body.error.code).toBe('ROUTE_UNAVAILABLE');
    const held=(await verificationPool.query('SELECT status,accepted_terms FROM posted_route_seat_allocations WHERE id=$1',[allocation.id])).rows[0];
    expect(held).toEqual({status:'held',accepted_terms:allocation.accepted_terms});
    await operator.resume();
    try{
      const release=await request(f.app).post(`${path}/${f.offer}/release-hold`).set('Cookie',operator.cookie)
        .set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf)
        .set('Idempotency-Key',randomUUID()).send({reason:'Review completed without changes'});
      expect(release.status,JSON.stringify(release.body)).toBe(200);
    }finally{await clearSeatRecoveryOperator();}
    expect((await f.call(f.driver.token,`${path}/requests/${nextId}/accept`,{})).body.error.code).toBe('INSUFFICIENT_SEATS');
    const key=randomUUID(),cancel=()=>f.call(first.token,`${path}/allocations/${allocation.id}/cancel`,{reason:'Plans changed'},key);
    const [cancelled,competing]=await Promise.all([cancel(),f.call(f.driver.token,`${path}/requests/${nextId}/accept`,{})]);
    expect(cancelled.status,JSON.stringify(cancelled.body)).toBe(200);
    // Both serial orders are valid; cancellation releases capacity exactly once.
    expect([200,409]).toContain(competing.status);
    expect((await cancel()).body.operation_id).toBe(cancelled.body.operation_id);
    if(competing.status===409)expect((await f.call(f.driver.token,`${path}/requests/${nextId}/accept`,{})).status).toBe(200);
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM posted_route_seat_allocations WHERE offer_id=$1 AND status IN ('confirmed','held')",[f.offer])).rows[0].n).toBe(1);
    expect((await verificationPool.query('SELECT accepted_terms FROM posted_route_seat_allocations WHERE id=$1',[allocation.id])).rows[0].accepted_terms).toEqual(allocation.accepted_terms);
  });
  it('ticket 12 accepts a published quote and freezes its confirmed places and area evidence',async()=>{
    const f=await passengerPublication(),key=randomUUID();
    const asked=await f.send(`${path}/${f.id}/requests`,f.selection,key,f.passenger.token);
    expect(asked.status,JSON.stringify(asked.body)).toBe(201);
    expect(asked.body.request.status).toBe('pending');
    expect((await f.send(`${path}/${f.id}/requests`,f.selection,key,f.passenger.token)).body).toEqual(asked.body);
    expect((await f.send(`${path}/${f.id}/requests`,f.selection)).body.error.code).toBe('SELF_BOOKING_FORBIDDEN');
    expect((await f.send(`${path}/requests/${asked.body.request.id}/accept`,{},randomUUID(),f.passenger.token)).body.error.code).toBe('FORBIDDEN');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations')).rows[0].n).toBe(0);
    const accepted=await f.send(`${path}/requests/${asked.body.request.id}/accept`,{});
    expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.booking.accepted_terms).toMatchObject({route_id:f.id,route_version:1,
      pickup:f.selection.pickup,dropoff:f.selection.dropoff,pickup_matched_point:[77.75,20.9],
      dropoff_matched_point:[77.765,20.9],pickup_stop_id:'origin',dropoff_stop_id:'destination',
      distance_source:'saved_posted_route',segment_meters:1560,rate_paise_per_km:700,
      rounding_rule:'nearest_paise_half_up',currency:'INR',total_paise:1092,additional_charges_paise:0,
      policy_version:'unrestricted-route-contribution-2026-10-04.1',service_area:SERVICE_AREA,
      area_evidence:{approvalEvidenceKind:'recorded-operator-review'},stop_confirmation_kind:'driver_self_declaration'});
    expect(accepted.body.booking.accepted_terms).not.toHaveProperty('preview_only');
  });
  it('ticket 11 publishes confirmed stopping places for passenger discovery, detail and saved-route quotes',async()=>{
    const f=await passengerPublication();
    const list=await request(f.app).get(path).set('Authorization',`Bearer ${f.passenger.token}`);
    expect(list.status,JSON.stringify(list.body)).toBe(200);
    expect(list.body.offers).toHaveLength(1);
    expect(list.body.offers[0]).toMatchObject({id:f.id,route_version:1,visibility:'published',real_bookings_enabled:false});
    const detail=await request(f.app).get(`${path}/published/${f.id}`).set('Authorization',`Bearer ${f.passenger.token}`);
    expect(detail.status,JSON.stringify(detail.body)).toBe(200);
    expect(detail.body.offer.stops).toHaveLength(2);
    expect(detail.body.offer).not.toHaveProperty('driver_id');
    expect(detail.body.offer).not.toHaveProperty('vehicle_declaration_id');
    expect(detail.body.offer).not.toHaveProperty('route_verification');
    const quote=await f.quote();
    expect(quote.status,JSON.stringify(quote.body)).toBe(200);
    expect(quote.body.quote).toMatchObject({route_id:f.id,route_version:1,segment_meters:1560,
      vehicle_category:'car',rate_paise_per_km:700,total_paise:1092,currency:'INR',
      rounding_rule:'nearest_paise_half_up',additional_charges_paise:0,distance_source:'saved_posted_route',
      real_bookings_enabled:false,preview_only:true});
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_requests')).rows[0].n).toBe(0);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations')).rows[0].n).toBe(0);
  });
  it('ticket 11 refuses quotes when provider verification is unavailable or graph identity changes',async()=>{
    const f=await passengerPublication();
    f.provider.fail=true;
    expect((await f.quote()).body.error?.code).toBe('ROUTING_UNAVAILABLE');
    f.provider.fail=false;f.provider.build='0'.repeat(64);
    expect((await f.quote()).body.error?.code).toBe('ROUTING_UNAVAILABLE');
  });
  it('ticket 11 rejects new quotes while booking activity is paused',async()=>{
    const f=await passengerPublication();
    await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='booking'");
    expect((await f.quote()).body.error?.code).toBe('PILOT_PAUSED');
  });
  it('ticket 11 matches one continuous pass in dense saved geometry',async()=>{
    const f=await valhallaInput();
    const coordinates=Array.from({length:201},(_,i):[number,number]=>[77.75+i*0.00005,20.9]);
    (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      geometry:{type:'LineString',coordinates},cumulativeMeters:coordinates.map((_,i)=>i*5),
      distanceMeters:1000,durationSeconds:180})});
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(safeStopForKind);
    const created=await f.send(path,{...f.input,origin:coordinates[0],destination:coordinates.at(-1)});
    expect(created.status).toBe(201);
    const quote=await f.send(`${path}/${created.body.offer.id}/quote`,{route_version:1,
      pickup:coordinates[20],dropoff:coordinates[180]});
    expect(quote.status,JSON.stringify(quote.body)).toBe(200);
    expect(quote.body.quote).toMatchObject({segment_meters:800,total_paise:560});
  });
  it('ticket 11 previews matched stopping places and requires explicit confirmation of the actual points',async()=>{
    const f=await valhallaInput();valhallaFixture();await approvedServiceArea();
    const preview=await f.send(`${path}/preview`,{...f.input,stop_points:[f.input.origin,f.input.destination]});
    expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.stop_previews).toEqual([
      {requested:f.input.origin,matched:[77.75,20.9],route_meters:0},
      {requested:f.input.destination,matched:[77.765,20.9],route_meters:1560}]);
    const stops=preview.body.stop_previews.map((p:{requested:number[];matched:number[]},i:number)=>({
      id:`stop-${i}`,name:`Driver place ${i}`,point:p.requested,matched_point:p.matched,
      safe_stopping_place:true,legal_stopping:true,correct_side:true,correct_direction:true}));
    stops[0].matched_point=[77.75001,20.9];
    const failed=await f.send(path,{...confirmPreview(f.input,preview.body),passenger_publication:{stops}});
    expect(failed.body.error?.code).toBe('STOP_CONFIRMATION_REQUIRED');
  });
  it.each(['bike','scooter'] as const)('ticket 11 quotes %s at 500 paise/km using real confirmation logic',async mode=>{
    const f=await passengerPublication(mode);
    expect((await f.quote()).body.quote).toMatchObject({vehicle_category:mode,segment_meters:1560,
      rate_paise_per_km:500,total_paise:780,additional_charges_paise:0});
  });
  it('ticket 11 denies undeclared, withdrawn, restricted passengers and self quotes',async()=>{
    const f=await passengerPublication();
    expect((await f.quote(f.selection,f.actor.token)).status).toBe(403);
    await verificationPool.query('DELETE FROM adult_declarations WHERE user_id=$1',[f.passenger.id]);
    expect((await f.quote()).body.error.code).toBe('ADULT_DECLARATION_REQUIRED');
    expect((await request(f.app).get(path).set('Authorization',`Bearer ${f.passenger.token}`)).status).toBe(403);
    const other=await participant();
    await verificationPool.query('UPDATE adult_declarations SET withdrawn_at=now() WHERE user_id=$1',[other.id]);
    expect((await f.quote(f.selection,other.token)).body.error.code).toBe('ADULT_DECLARATION_REQUIRED');
    await verificationPool.query("UPDATE users SET status='suspended' WHERE id=$1",[other.id]);
    expect((await f.quote(f.selection,other.token)).status).toBe(403);
  });
  it('ticket 11 rejects stale versions, reversed, off-route, outside and unconfirmed passenger selections',async()=>{
    const f=await passengerPublication();
    for(const [selection,code] of [
      [{...f.selection,route_version:2},'ROUTE_VERSION_STALE'],
      [{...f.selection,pickup:f.selection.dropoff,dropoff:f.selection.pickup},'SEGMENT_REVERSED'],
      [{...f.selection,pickup:[77.75,20.901]},'POINT_OFF_ROUTE'],
      [{...f.selection,pickup:[77.73,20.9]},'BOUNDARY_INVALID'],
      [{...f.selection,pickup:[77.730001,20.9]},'BOUNDARY_INVALID'],
      [{...f.selection,pickup:[77.751,20.9]},'STOP_CONFIRMATION_REQUIRED'],
    ] as const)expect((await f.quote(selection)).body.error?.code,code).toBe(code);
    expect((await f.quote({...f.selection,total_paise:1})).status).toBe(400);
    expect((await f.quote({...f.selection,safe_stopping_place:true})).status).toBe(400);
  });
  it('ticket 11 refuses expired offers, changed driver eligibility and restricted recovery',async()=>{
    const f=await passengerPublication();
    await verificationPool.query('UPDATE unrestricted_vehicle_declarations SET permission_to_use=false,revoked_at=now() WHERE id=$1',[f.actor.vehicle]);
    expect((await f.quote()).body.error.code).toBe('VEHICLE_DECLARATION_REQUIRED');
    expect((await request(f.app).get(path).set('Authorization',`Bearer ${f.passenger.token}`)).body.offers).toEqual([]);
    await verificationPool.query('UPDATE unrestricted_vehicle_declarations SET permission_to_use=true,revoked_at=NULL WHERE id=$1',[f.actor.vehicle]);
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='restricted' WHERE singleton=true");
    expect((await f.quote()).body.error.code).toBe('RECOVERY_RESTRICTED');
    await verificationPool.query("UPDATE pilot_recovery_state SET mode='open' WHERE singleton=true");
    await verificationPool.query("UPDATE posted_route_offers SET request_cutoff_at=now()-interval '1 second' WHERE id=$1",[f.id]);
    expect((await f.quote()).status).toBe(404);
  });
  it('ticket 11 rejects unavailable, changed area approval and tampered saved geometry',async()=>{
    const f=await passengerPublication();
    setServiceAreaApprovalForTests({status:'revoked'});
    expect((await f.quote()).body.error.code).toBe('BOUNDARY_UNAVAILABLE');
    setServiceAreaApprovalForTests(serviceAreaApprovalFixture());
    expect((await f.quote()).body.error.code).toBe('ROUTE_AREA_STALE');
    setServiceAreaApprovalForTests(null);
    await verificationPool.query("UPDATE posted_route_offers SET cumulative_meters='[0,1,2,1560]'::jsonb WHERE id=$1",[f.id]);
    expect((await f.quote()).body.error.code).toBe('SEGMENT_UNVERIFIABLE');
  });
  it('ticket 11 rejects ambiguous road matches and malformed provider responses',async()=>{
    const f=await passengerPublication();
    f.provider.locate[0].edges.push({...f.provider.locate[0].edges[0],way_id:99});
    expect((await f.quote()).body.error.code).toBe('POINT_AMBIGUOUS');
    f.provider.locate[0].edges.pop();f.provider.malformed=true;
    expect((await f.quote()).body.error.code).toBe('ROUTING_UNAVAILABLE');
  });
  it('ticket 11 keeps publication, discovery and quotes closed outside tests',async()=>{
    const f=await passengerPublication(),previous=process.env.NODE_ENV;
    try{process.env.NODE_ENV='production';
      expect((await f.quote()).body.error.code).toBe('ROUTE_QUOTES_DISABLED');
      expect((await request(f.app).get(path).set('Authorization',`Bearer ${f.passenger.token}`)).body.error.code).toBe('ROUTE_QUOTES_DISABLED');
      expect((await request(f.app).get(`${path}/published/${f.id}`).set('Authorization',`Bearer ${f.passenger.token}`)).body.error.code).toBe('ROUTE_QUOTES_DISABLED');
      expect((await f.send(path,f.publicationInput)).body.error.code).toBe('ROUTE_QUOTES_DISABLED');
    }finally{process.env.NODE_ENV=previous;}
  });
  it.each([{metres:1564,paise:1095},{metres:1565,paise:1096},{metres:1566,paise:1096}])(
    'ticket 11 rounds published $metres metres to $paise car paise without rerouting',async({metres,paise})=>{
      const f=await passengerPublication('car',provider=>{
        provider.trace.edges[0].length=(metres-520)/1000;provider.route.trip.legs[0].summary.length=metres/1000;
      });
      // If asked for a point-to-point route now, the provider would return a shorter distance.
      f.provider.route.trip.legs[0].summary.length=0.6;
      const calls=f.provider.calls.length;
      const quote=await f.quote();
      expect(quote.status,JSON.stringify(quote.body)).toBe(200);
      expect(quote.body.quote).toMatchObject({segment_meters:metres,total_paise:paise});
      expect(f.provider.calls.slice(calls)).toHaveLength(1);
      expect(f.provider.calls.at(-1)).not.toHaveProperty('alternates');
    });
  it('ticket 11 rejects unsafe confirmations, duplicate places and missing helmet space',async()=>{
    const f=await passengerPublication('bike');
    const payload=structuredClone(f.publicationInput);
    const stops=payload.passenger_publication.stops;
    for(const field of ['safe_stopping_place','legal_stopping','correct_side','correct_direction','helmet_space'] as const){
      const unsafe={...payload,passenger_publication:{stops:stops.map((stop,i)=>i?stop:{...stop,[field]:false})}};
      expect((await f.send(path,unsafe)).status,field).toBe(400);
    }
    const {helmet_space:_,...withoutHelmet}=stops[0];
    expect((await f.send(path,{...payload,passenger_publication:{stops:[withoutHelmet,stops[1]]}})).body.error.code).toBe('STOP_UNSAFE');
    expect((await f.send(path,{...payload,passenger_publication:{stops:[stops[0],stops[0]]}})).body.error.code).toBe('STOP_UNSAFE');
  });
  it('ticket 11 publication retries preserve confirmed stops and receipt restoration',async()=>{
    const f=await passengerPublication();
    const original=await f.quote();
    f.provider.fail=true;
    expect((await f.send(path,f.publicationInput,f.publicationKey)).body.offer.operation_id).toBe(f.publicationOperation);
    const changed=structuredClone(f.publicationInput);changed.passenger_publication.stops[0].name='Different meeting instructions';
    expect((await f.send(path,changed,f.publicationKey)).body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    const recovery=(await import('../modules/posted-routes/posted-routes.service')).postedRouteRecovery;
    const receipts=await recovery.receipts();
    expect(receipts.find(r=>r.operationId===f.publicationOperation)?.snapshot.route_verification)
      .toHaveProperty('passengerPublication.stops');
    await verificationPool.query('DELETE FROM posted_route_operations WHERE id=$1',[f.publicationOperation]);
    await verificationPool.query('DELETE FROM posted_route_offers WHERE id=$1',[f.id]);
    const operator=await seatRecoveryOperator();
    try{await recovery.reconcileReceipts(operator.id);}finally{await clearSeatRecoveryOperator();}
    f.provider.fail=false;
    const restored=await f.quote();
    expect(restored.status,JSON.stringify(restored.body)).toBe(200);
    expect(restored.body.quote).toEqual(original.body.quote);
  });
  it('ticket 11 waits for concurrent offer state changes before returning a quote',async()=>{
    const f=await passengerPublication(),connection=await verificationPool.connect();
    try{
      await connection.query('BEGIN');
      await connection.query("UPDATE posted_route_offers SET status='held' WHERE id=$1",[f.id]);
      let completed=false;
      const pending=f.quote().then(result=>{completed=true;return result;});
      await new Promise(resolve=>setTimeout(resolve,100));
      expect(completed).toBe(false);
      await connection.query('COMMIT');
      expect((await pending).status).toBe(404);
    }finally{await connection.query('ROLLBACK');connection.release();}
  });
  it('ticket 11 measures an interior stop on the saved route, not an independent route',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture();await approvedServiceArea();
    provider.trace.edges[0].length=1.045;provider.route.trip.legs[0].summary.length=1.565;
    const fetcher=globalThis.fetch;
    vi.stubGlobal('fetch',async(url:URL,init:RequestInit)=>{
      const payload=JSON.parse(String(init.body));
      if(url.pathname==='/locate'&&payload.locations[1].lon===77.76)
        return new Response(JSON.stringify([provider.locate[0],{edges:[{way_id:1,correlated_lon:77.76,correlated_lat:20.9}]}]),
          {headers:{'x-petrol-routing-build':provider.build}});
      return fetcher(url,init);
    });
    const stopPoints=[f.input.origin,[77.76,20.9001]];
    const preview=await f.send(`${path}/preview`,{...f.input,stop_points:stopPoints});
    expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    const stops=preview.body.stop_previews.map((p:{requested:number[];matched:number[]},i:number)=>({
      id:`place-${i}`,name:`Driver confirmed place ${i}`,point:p.requested,matched_point:p.matched,
      safe_stopping_place:true,legal_stopping:true,correct_side:true,correct_direction:true}));
    const created=await f.send(path,{...confirmPreview(f.input,preview.body),passenger_publication:{stops}});
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    provider.route.trip.legs[0].summary.length=0.6;
    const passenger=await participant();
    const quoted=await f.send(`${path}/${created.body.offer.id}/quote`,{
      route_version:1,pickup:stopPoints[0],dropoff:stopPoints[1]},randomUUID(),passenger.token);
    expect(quoted.status,JSON.stringify(quoted.body)).toBe(200);
    expect(quoted.body.quote).toMatchObject({segment_meters:1045,total_paise:732,
      pickup_route_meters:0,dropoff_route_meters:1045,distance_source:'saved_posted_route'});
  });
  it('ticket 11 rejects outside passenger points even when their matched route lies within 30 metres',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture();await approvedServiceArea();
    const origin:[number,number]=[77.730002,20.9],destination:[number,number]=[77.74,20.9];
    setFixtureRoute(provider,[origin,destination],[1038],[180]);
    const input={...f.input,origin,destination};
    const preview=await f.send(`${path}/preview`,{...input,stop_points:[origin,destination]});
    expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    const stops=[origin,destination].map((point,i)=>({id:`place-${i}`,name:`Confirmed place ${i}`,
      point,matched_point:point,safe_stopping_place:true,legal_stopping:true,correct_side:true,correct_direction:true}));
    const created=await f.send(path,{...confirmPreview(input,preview.body),passenger_publication:{stops}});
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const passenger=await participant();
    for(const pickup of [[77.729999,20.9],[77.730001,20.9]]){
      const response=await f.send(`${path}/${created.body.offer.id}/quote`,{route_version:1,pickup,dropoff:destination},randomUUID(),passenger.token);
      expect(response.body.error.code).toBe('BOUNDARY_INVALID');
    }
  });
  it('ticket 11 stops quotes if independent publication evidence is missing',async()=>{
    const f=await passengerPublication(),original=process.env.PILOT_RECEIPT_PATH;
    try{process.env.PILOT_RECEIPT_PATH=resolve(directory,'missing-receipts');
      expect((await f.quote()).body.error.code).toBe('RECOVERY_UNAVAILABLE');
    }finally{process.env.PILOT_RECEIPT_PATH=original;}
  });
  it('ticket 11 pauses new passenger publication while preserving idempotent retries',async()=>{
    const f=await passengerPublication();
    await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='offers'");
    expect((await f.send(path,f.publicationInput)).body.error.code).toBe('PILOT_PAUSED');
    expect((await f.send(path,f.publicationInput,f.publicationKey)).body.offer.operation_id).toBe(f.publicationOperation);
  });
  it('ticket 11 passenger discovery never exposes private preparation',async()=>{
    const f=await valhallaInput();valhallaFixture();await approvedServiceArea();
    const preview=await f.send(`${path}/preview`);
    const prepared=await f.send(path,confirmPreview(f.input,preview.body));
    expect(prepared.status,JSON.stringify(prepared.body)).toBe(201);
    const passenger=await participant();
    expect((await request(f.app).get(path)).status).toBe(401);
    const list=await request(f.app).get(path).set('Authorization',`Bearer ${passenger.token}`);
    expect(list.status,JSON.stringify(list.body)).toBe(200);
    expect(list.body.offers).toEqual([]);
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect((await request(f.app).get(`${path}/${prepared.body.offer.id}`)
      .set('Authorization',`Bearer ${passenger.token}`)).status).toBe(404);
  });
  it.skipIf(!process.env.VALHALLA_REHEARSAL_URL).each(['car','bike','scooter'] as const)(
    'Amravati actual pinned engine and authenticated PostgreSQL %s',async(mode)=>{
      const f=await valhallaInput(mode);await liveValhallaRehearsal();
      const evidence=JSON.parse(await readFile(resolve(__dirname,'../modules/posted-routes/service-area/review-evidence.json'),'utf8'));
      const expected=evidence.routes.find((r:{id:string})=>r.id===`R-${mode}`).route;
      const input={...f.input,...expected.verification.requested};
      const preview=await f.send(`${path}/preview`,input);
      expect(preview.status,JSON.stringify(preview.body)).toBe(200);
      expect(preview.body.route.geometry).toEqual(expected.geometry);
      const confirmed=confirmPreview(input,preview.body);
      expect((await f.send(path,confirmed)).body.error.code).toBe('BOUNDARY_UNAVAILABLE');
      setServiceAreaApprovalForTests(null);
      const created=await f.send(path,confirmed);
      expect(created.status,JSON.stringify(created.body)).toBe(201);
      const stored=(await verificationPool.query('SELECT route_verification FROM posted_route_offers WHERE id=$1',[created.body.offer.id])).rows[0];
      expect(created.body.offer.real_bookings_enabled).toBe(false);
      expect(stored.route_verification.boundary).toMatchObject({artifact:SERVICE_AREA,outsideMetres:0,outsideSeconds:0,approvalEvidenceKind:'recorded-operator-review',approval:{reviewedAt:'2026-10-04T06:30:00.000Z'}});
    },30000);
  it('Amravati publication leaves complete historical booking rows and old terms unchanged',async()=>{
    const f=await valhallaInput(),passenger=await participant();valhallaFixture();
    const offer=(await verificationPool.query(`INSERT INTO ride_offers
      (driver_id,pickup_location,pickup_lat,pickup_lng,drop_location,drop_lat,drop_lng,date,time,available_seats,price_per_seat_paise)
      VALUES($1,'Historical origin',20.9,77.7,'Historical destination',20.8,77.8,current_date-1,'09:00',1,2500) RETURNING id`,[f.actor.id])).rows[0].id;
    const booking=(await verificationPool.query(`INSERT INTO bookings
      (ride_offer_id,created_by_user_id,passenger_id,driver_id,seats_booked,total_amount_paise,pricing_snapshot,status,payment_state)
      VALUES($1,$2,$2,$3,1,2500,'{"policy_version":"historical-pilot"}'::jsonb,'completed','paid_escrow') RETURNING id`,[offer,passenger.id,f.actor.id])).rows[0].id;
    const snapshot=async()=>({offer:(await verificationPool.query('SELECT to_jsonb(r) AS row FROM ride_offers r WHERE id=$1',[offer])).rows[0],
      booking:(await verificationPool.query('SELECT to_jsonb(b) AS row FROM bookings b WHERE id=$1',[booking])).rows[0]});
    const before=await snapshot();
    setServiceAreaApprovalForTests(null);
    const confirmed=confirmPreview(f.input,(await f.send(`${path}/preview`)).body),key=randomUUID();
    const created=await f.send(path,confirmed,key);expect(created.status).toBe(201);
    setServiceAreaApprovalForTests({status:'pending'});expect((await f.send(path,confirmed,key)).status).toBe(201);
    expect(await snapshot()).toEqual(before);
  });
  it.each(['car','bike','scooter'] as const)('Amravati pinned artifact persists %s with synthetic review only',async(mode)=>{
    const f=await valhallaInput(mode),provider=valhallaFixture();
    const preview=await f.send(`${path}/preview`),confirmed=confirmPreview(f.input,preview.body);
    expect(preview.body.service_area).toEqual(SERVICE_AREA);
    expect((await f.send(path,confirmed)).body.error.code).toBe('BOUNDARY_UNAVAILABLE');
    setServiceAreaApprovalForTests(serviceAreaApprovalFixture());
    const key=randomUUID(),created=await f.send(path,confirmed,key);
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const saved=await request(f.app).get(`${path}/${created.body.offer.id}`).set('Authorization',`Bearer ${f.actor.token}`);
    expect(saved.body.offer.route_verification.boundary).toMatchObject({artifact:SERVICE_AREA,
      outsideMetres:0,outsideSeconds:0,approvalEvidenceKind:'synthetic-test-only'});
    const stored=(await verificationPool.query('SELECT offer_snapshot FROM posted_route_operations WHERE id=$1',[created.body.offer.operation_id])).rows[0].offer_snapshot;
    expect(stored.route_verification).toEqual(saved.body.offer.route_verification);
    setServiceAreaApprovalForTests(null);provider.fail=true;
    expect((await f.send(path,confirmed,key)).body.offer).toEqual(created.body.offer);
  });
  it.each([
    {label:'interior',x:77.74,ok:true}, {label:'two quanta inside',x:77.730002,ok:true},
    {label:'one quantum inside',x:77.730001,ok:false}, {label:'on west edge',x:77.73,ok:false},
    {label:'outside',x:77.729999,ok:false}, {label:'east guard',x:77.829999,ok:false},
  ])('Amravati HTTP coordinate precision: $label',async({x,ok})=>{
    const f=await valhallaInput(),provider=valhallaFixture();
    const points:[number,number][]=[[x,20.92],[x,20.925]];
    setFixtureRoute(provider,points,[Math.round(pointMetres(...points as [[number,number],[number,number]]))],[60]);
    const input={...f.input,origin:points[0],destination:points[1]};
    const preview=await f.send(`${path}/preview`,input);
    expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    setServiceAreaApprovalForTests(serviceAreaApprovalFixture());
    const result=await f.send(path,confirmPreview(input,preview.body));
    expect(result.status,JSON.stringify(result.body)).toBe(ok?201:422);
    if(!ok)expect(result.body.error.code).toBe('BOUNDARY_INVALID');
  });
  it.each([77.729,77.73,77.730001])('Amravati rejects whole-route exit, touch or guard at %s',async(x)=>{
    const f=await valhallaInput(),provider=valhallaFixture();
    const points:[number,number][]=[[77.731,20.92],[x,20.925],[77.731,20.93]];
    setFixtureRoute(provider,points,points.slice(1).map((p,i)=>Math.round(pointMetres(points[i],p))),[60,60]);
    const input={...f.input,origin:points[0],destination:points[2]},preview=await f.send(`${path}/preview`,input);
    expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    setServiceAreaApprovalForTests(serviceAreaApprovalFixture());
    expect((await f.send(path,confirmPreview(input,preview.body))).body.error.code).toBe('BOUNDARY_INVALID');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(0);
  });
  it('Amravati rejects an outside requested endpoint even when snapped inside',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture();
    const points:[number,number][]=[[77.730002,20.92],[77.730002,20.925]];
    setFixtureRoute(provider,points,[Math.round(pointMetres(points[0],points[1]))],[60]);
    const input={...f.input,origin:[77.7299999,20.92],destination:points[1]};
    const preview=await f.send(`${path}/preview`,input);
    expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    setServiceAreaApprovalForTests(serviceAreaApprovalFixture());
    expect((await f.send(path,confirmPreview(input,preview.body))).body.error.code).toBe('BOUNDARY_INVALID');
  });
  it('Amravati rejects mismatched review and retained test approval outside test runtime',async()=>{
    const f=await valhallaInput();valhallaFixture();
    const confirmed=confirmPreview(f.input,(await f.send(`${path}/preview`)).body);
    for(const mutation of [{geometrySha256:'a'.repeat(64)},{evidenceSha256:'b'.repeat(64)},
      {areaId:'other-area'},{completeRoutesReviewed:false},{calculationVersion:'unknown'}]){
      setServiceAreaApprovalForTests({...serviceAreaApprovalFixture(),...mutation});
      expect((await f.send(path,confirmed)).body.error.code).toBe('BOUNDARY_UNAVAILABLE');
    }
    setServiceAreaApprovalForTests(serviceAreaApprovalFixture());
    const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
    try{
      const created=await f.send(path,confirmed);expect(created.status).toBe(201);
      const saved=(await verificationPool.query('SELECT route_verification FROM posted_route_offers WHERE id=$1',[created.body.offer.id])).rows[0];
      expect(saved.route_verification.boundary.approvalEvidenceKind).toBe('recorded-operator-review');
    }
    finally{process.env.NODE_ENV=previous;}
  });
  it.skipIf(!process.env.VALHALLA_REHEARSAL_URL).each(['car','bike','scooter'] as const)(
    'rehearses actual local Valhalla %s responses while boundary publication stays closed',async(mode)=>{
      const f=await valhallaInput(mode),manifest=await liveValhallaRehearsal();
      // OSM-derived road points for compatibility only, not approved stops.
      const input={...f.input,origin:[77.749113,20.901176],destination:[77.728694,20.857541]};
      const preview=await f.send(`${path}/preview`,input);
      expect(preview.status,JSON.stringify(preview.body)).toBe(200);
      expect(preview.body).toMatchObject({boundary_verified:false,real_bookings_enabled:false,
        route:{source:'valhalla',verification:{manifest,costing:mode==='car'?'auto':'motorcycle'}}});
      const route=preview.body.route;
      expect(route.cumulativeMeters).toHaveLength(route.geometry.coordinates.length);
      expect(route.cumulativeMeters[0]).toBe(0);
      expect(route.cumulativeMeters.at(-1)).toBe(route.distanceMeters);
      expect(route.distanceMeters).toBeGreaterThan(4000);
      expect(route.cumulativeMeters.every((value:number,i:number,values:number[])=>i===0||value>values[i-1])).toBe(true);
      const elapsed=route.verification.edges.map((edge:{end_node:{elapsed_time:number}})=>edge.end_node.elapsed_time);
      expect(elapsed.every((value:number,i:number)=>Number.isFinite(value)&&value>(i===0?0:elapsed[i-1]))).toBe(true);
      expect(Math.ceil(elapsed.at(-1))).toBe(route.durationSeconds);
      expect((await f.send(path,input)).body.error.code).toBe('ENDPOINT_CONFIRMATION_REQUIRED');
      const confirmed=confirmPreview(input,preview.body);
      const rejected=await f.send(path,confirmed);
      expect(rejected.body.error.code,JSON.stringify(rejected.body)).toBe('BOUNDARY_UNAVAILABLE');
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(0);
      const ambiguous=await f.send(`${path}/preview`,{...input,origin:[77.758589,20.94062]});
      expect(ambiguous.body.error.code,JSON.stringify(ambiguous.body)).toBe('ROUTE_INVALID');
      const sideFallback=await f.send(`${path}/preview`,{...input,origin:[77.749063,20.901176]});
      expect(sideFallback.body.error.code,JSON.stringify(sideFallback.body)).toBe('ROUTE_INVALID');
    },30000);
  it.each(['car','bike','scooter'] as const)('persists confirmed %s Valhalla provenance and retries without routing again',async(mode)=>{
    const f=await valhallaInput(mode),provider=valhallaFixture();
    const preview=await f.send(`${path}/preview`);
    expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.route).toMatchObject({source:'valhalla',distanceMeters:1560,durationSeconds:181,
      cumulativeMeters:[0,520,1040,1560],verification:{costing:mode==='car'?'auto':'motorcycle'}});
    expect(provider.calls.every(call=>call.costing===(mode==='car'?'auto':'motorcycle'))).toBe(true);
    expect((await f.send(path)).body.error.code).toBe('ENDPOINT_CONFIRMATION_REQUIRED');
    const confirmed=confirmPreview(f.input,preview.body);
    expect((await f.send(path,confirmed)).body.error.code).toBe('BOUNDARY_UNAVAILABLE');
    await approvedServiceArea();
    const key=randomUUID(),created=await f.send(path,confirmed,key);
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    expect(created.body.offer).toMatchObject({policy_version:'unrestricted-route-contribution-2026-10-04.1',
      operating_policy_version:'2026-10-04.1',real_bookings_enabled:false});
    provider.fail=true;
    expect((await f.send(path,confirmed,key)).body.offer.operation_id).toBe(created.body.offer.operation_id);
    expect((await f.send(path,{...confirmed,capacity:2},key)).body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    const saved=await request(f.app).get(`${path}/${created.body.offer.id}`).set('Authorization',`Bearer ${f.actor.token}`);
    expect(saved.body.offer.route_verification).toMatchObject({requested:{origin:f.input.origin},
      routed:{origin:[77.75,20.9]},normalizationVersion:'valhalla-edge-metres-2026-10-03.1',
      confirmation:confirmed.endpoint_confirmation,manifest:{graphBuildId:'synthetic-only'}});
    const operation=(await verificationPool.query('SELECT offer_snapshot FROM posted_route_operations WHERE id=$1',
      [created.body.offer.operation_id])).rows[0];
    expect(operation.offer_snapshot.route_verification).toEqual(saved.body.offer.route_verification);
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='posted_route_prepared' AND entity_id=$1",
      [created.body.offer.id])).rows[0].n).toBe(1);
  });
  it('rejects over-30-m, ambiguous and wrong-side Valhalla snaps and changed confirmations',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture();
    const preview=await f.send(`${path}/preview`),confirmed=confirmPreview(f.input,preview.body);
    expect((await f.send(`${path}/preview`,{...f.input,origin:[77.75,20.900271]})).body.error.code).toBe('ROUTE_INVALID');
    expect((await f.send(`${path}/preview`,{...f.input,origin:[77.75,20.900269]})).status).toBe(200);
    provider.locate[0].edges.push({way_id:3,correlated_lon:77.75,correlated_lat:20.9});
    expect((await f.send(`${path}/preview`)).body.error.code).toBe('ROUTE_INVALID');
    provider.locate[0].edges.pop();provider.route.trip.locations[0].side_of_street='right';
    expect((await f.send(`${path}/preview`)).body.error.code).toBe('ROUTE_INVALID');
    provider.route.trip.locations[0].side_of_street='left';
    provider.route.trip.legs[0].summary.time=200;
    expect((await f.send(path,confirmed)).body.error.code).toBe('ENDPOINT_CONFIRMATION_REQUIRED');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(0);
  });
  it('accepts a single straight endpoint pass with short first and last shape segments',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture();
    const shape="_iszf@_nnhsC?gE?gqH?owH?gqH?gE";
    provider.route.trip.legs[0].shape=shape;provider.trace.shape=shape;
    provider.trace.edges=[0.01,0.51,0.52,0.51,0.01].map((length,i)=>({begin_shape_index:i,
      end_shape_index:i+1,length,way_id:i===4?2:1,drive_on_right:false}));
    const preview=await f.send(`${path}/preview`);
    expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.route.cumulativeMeters).toEqual([0,10,520,1040,1550,1560]);
  });
  it('rejects repeated route passes at an endpoint even when locate returns one physical way',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture();
    const shape='_iszf@_nnhsC?owH?owH?nwH?nwH?owH?owH?owH';
    provider.route.trip.legs[0].shape=shape;provider.trace.shape=shape;
    provider.route.trip.legs[0].summary.length=3.64;
    provider.trace.edges=Array.from({length:7},(_,i)=>({begin_shape_index:i,end_shape_index:i+1,
      length:0.52,way_id:i===6?2:1,drive_on_right:false}));
    expect((await f.send(`${path}/preview`)).body.error.code).toBe('ROUTE_INVALID');
  });
  it('fails closed on malformed, unavailable, graph-mismatched and inconsistent Valhalla responses',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture();
    provider.fail=true;expect((await f.send(`${path}/preview`)).body.error.code).toBe('ROUTING_UNAVAILABLE');
    provider.fail=false;provider.status=429;expect((await f.send(`${path}/preview`)).status).toBe(503);
    provider.status=200;const build=provider.build;provider.build='wrong';
    expect((await f.send(`${path}/preview`)).body.error.code).toBe('ROUTING_UNAVAILABLE');
    provider.build=build;provider.malformed=true;expect((await f.send(`${path}/preview`)).body.error.code).toBe('ROUTE_INVALID');
    provider.malformed=false;provider.trace.edges[0].length=1.1;
    expect((await f.send(`${path}/preview`)).body.error.code).toBe('ROUTE_INVALID');
    provider.trace.edges[0].length=1.04;provider.trace.shape+='?owH';
    expect((await f.send(`${path}/preview`)).body.error.code).toBe('ROUTE_INVALID');
  });
  it('bounds Valhalla jobs to two and releases both slots after the ten-second deadline',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture();provider.wait=true;
    const first=f.send(`${path}/preview`).then(response=>response);
    const second=f.send(`${path}/preview`).then(response=>response);
    await vi.waitFor(()=>expect(provider.calls).toHaveLength(2),{timeout:2000});
    expect((await f.send(`${path}/preview`)).body.error.code).toBe('ROUTING_UNAVAILABLE');
    expect(provider.calls).toHaveLength(2);
    const failed=await Promise.all([first,second]);
    expect(failed.map(response=>response.body.error.code)).toEqual(['ROUTING_UNAVAILABLE','ROUTING_UNAVAILABLE']);
    provider.wait=false;expect((await f.send(`${path}/preview`)).status).toBe(200);
  },15000);
  it('authorizes Valhalla previews before contacting the provider and rejects unsafe confirmation',async()=>{
    const f=await valhallaInput('bike'),other=await participant(),provider=valhallaFixture();
    expect((await request(f.app).post(`${path}/preview`).send(f.input)).status).toBe(401);
    expect((await f.send(`${path}/preview`,f.input,randomUUID(),other.token)).body.error.code).toBe('VEHICLE_NOT_FOUND');
    expect(provider.calls).toHaveLength(0);
    const confirmed=confirmPreview(f.input,(await f.send(`${path}/preview`)).body);
    expect((await f.send(path,{...confirmed,endpoint_confirmation:{...confirmed.endpoint_confirmation,helmet_space:undefined}})).body.error.code)
      .toBe('ENDPOINT_CONFIRMATION_REQUIRED');
    expect((await f.send(path,{...confirmed,endpoint_confirmation:{...confirmed.endpoint_confirmation,origin:f.input.origin}})).body.error.code)
      .toBe('ENDPOINT_CONFIRMATION_REQUIRED');
    expect((await f.send(path,{...confirmed,endpoint_confirmation:{...confirmed.endpoint_confirmation,safe_stopping_places:false}})).status).toBe(400);
  });
  it.each([false,true])('rolls back Valhalla publication on audit or notice failure and serializes overlapping confirmations (passenger publication: %s)',async passengerPublished=>{
    const f=await valhallaInput();valhallaFixture();await approvedServiceArea();
    const confirmed={...confirmPreview(f.input,(await f.send(`${path}/preview`)).body),
      ...(passengerPublished?{passenger_publication:{stops:[f.input.origin,f.input.destination].map((point,i)=>({
        id:`place-${i}`,name:`Confirmed place ${i}`,point,matched_point:[point[0],20.9],
        safe_stopping_place:true,legal_stopping:true,correct_side:true,correct_direction:true}))}}:{})};
    for(const [table,condition] of [['audit_logs',"NEW.action='posted_route_prepared'"],
      ['pilot_notification_events',"NEW.origin_type='posted_route'"]]){
      await verificationPool.query(`CREATE FUNCTION ticket10_fail_verified() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF ${condition} THEN RAISE EXCEPTION 'ticket10 rollback'; END IF; RETURN NEW; END $$`);
      await verificationPool.query(`CREATE TRIGGER ticket10_fail_verified BEFORE INSERT ON ${table}
        FOR EACH ROW EXECUTE FUNCTION ticket10_fail_verified()`);
      try{expect((await f.send(path,confirmed)).status).toBe(503);}finally{
        await verificationPool.query(`DROP TRIGGER ticket10_fail_verified ON ${table}`);
        await verificationPool.query('DROP FUNCTION ticket10_fail_verified()');}
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(0);
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_operations')).rows[0].n).toBe(0);
    }
    const results=await Promise.all([f.send(path,confirmed),f.send(path,confirmed)]);
    expect(results.map(result=>result.status).sort()).toEqual([201,409]);
    const id=results.find(result=>result.status===201)!.body.offer.id;
    const outsider=await participant();
    expect((await request(f.app).get(`${path}/${id}`).set('Authorization',`Bearer ${outsider.token}`)).status).toBe(404);
  });
  it('persists computed synthetic polygon evidence and keeps retries independent of boundary availability',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture(),artifact=boundaryFixture();
    const boundary=await import('../modules/posted-routes/route-boundary');
    boundary.setBoundaryArtifactForTests(artifact);
    const confirmed=confirmPreview(f.input,(await f.send(`${path}/preview`)).body),key=randomUUID();
    const created=await f.send(path,confirmed,key);
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const saved=await request(f.app).get(`${path}/${created.body.offer.id}`).set('Authorization',`Bearer ${f.actor.token}`);
    expect(saved.body.offer.route_verification.boundary).toMatchObject({
      artifactSha256:artifact.geometrySha256,policyVersion:'2026-10-03.2',outsideMetres:0,outsideSeconds:0,
      artifact:{datasetId:artifact.datasetId,archiveSha256:artifact.archiveSha256,normalizedCrs:'OGC:CRS84',uncertaintyMetres:10}});
    boundary.setBoundaryArtifactForTests(null);provider.fail=true;
    expect((await f.send(path,confirmed,key)).body.offer.operation_id).toBe(created.body.offer.operation_id);
  });
  it('measures a synthetic hole crossed between vertices using whole-segment distance and whole-edge time',async()=>{
    const f=await valhallaInput();valhallaFixture();
    const artifact=boundaryFixture([[rectangle(77.74,20.89,77.78,20.91),rectangle(77.756,20.899,77.759,20.901)]]);
    (await import('../modules/posted-routes/route-boundary')).setBoundaryArtifactForTests(artifact);
    const confirmed=confirmPreview(f.input,(await f.send(`${path}/preview`)).body);
    const created=await f.send(path,confirmed);
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const saved=await request(f.app).get(`${path}/${created.body.offer.id}`).set('Authorization',`Bearer ${f.actor.token}`);
    expect(saved.body.offer.route_verification.boundary).toMatchObject({outsideMetres:520,outsideSeconds:120,
      outsideShapeSegments:[1],crossingCount:2,timingMethod:'whole-provider-edge-upper-bound'});
  });
  it('enforces boundary evidence limits without claiming synthetic polygons verify Maharashtra',async()=>{
    const f=await valhallaInput();valhallaFixture();
    const confirmed=confirmPreview(f.input,(await f.send(`${path}/preview`)).body);
    const boundary=await import('../modules/posted-routes/route-boundary');
    for(const [outsideMetres,outsideSeconds] of [[5001,600],[5000,601],[5000,NaN]]){
      boundary.setBoundaryCheckForTests(async()=>({artifactSha256:'5'.repeat(64),policyVersion:'2026-10-03.2',outsideMetres,outsideSeconds}));
      expect((await f.send(path,confirmed)).body.error.code).toBe('BOUNDARY_INVALID');
    }
    boundary.setBoundaryCheckForTests(async()=>({artifactSha256:'5'.repeat(64),policyVersion:'2026-10-03.2',outsideMetres:5000,outsideSeconds:600}));
    expect((await f.send(path,confirmed)).status).toBe(201);
  });
  it.each([
    ['requested point outside',boundaryFixture([[rectangle(77.74,20.89,77.78,20.90005)]])],
    ['routed point outside',boundaryFixture([[rectangle(77.74,20.90005,77.78,20.91)]])],
    ['point exactly on boundary',boundaryFixture([[rectangle(77.75,20.89,77.78,20.91)]])],
    ['point within uncertainty band',boundaryFixture([[rectangle(77.749995,20.89,77.78,20.91)]])],
    ['point in hole',boundaryFixture([[rectangle(77.74,20.89,77.78,20.91),rectangle(77.749,20.899,77.751,20.901)]])],
  ])('polygon boundary rejects %s without saving a route',async(_name,artifact)=>{
    const f=await valhallaInput();valhallaFixture();
    artifact.uncertaintyMetres=1;
    (await import('../modules/posted-routes/route-boundary')).setBoundaryArtifactForTests(artifact);
    const preview=await f.send(`${path}/preview`);expect(preview.status).toBe(200);
    const result=await f.send(path,confirmPreview(f.input,preview.body));
    expect(result.body.error.code,JSON.stringify(result.body)).toBe('BOUNDARY_INVALID');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_operations')).rows[0].n).toBe(0);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(0);
  });
  it.each([
    ['along a border',rectangle(77.756,20.9,77.759,20.902)],
    ['near a border',rectangle(77.756,20.90005,77.759,20.902)],
    ['through a vertex',[[77.756,20.902],[77.7575,20.9],[77.759,20.902],[77.756,20.902]] as [number,number][]],
    ['narrow uncertain excursion',rectangle(77.756,20.899,77.7561,20.901)],
  ])('polygon boundary rejects an uncertain crossing %s',async(_name,hole)=>{
    const f=await valhallaInput();valhallaFixture();
    (await import('../modules/posted-routes/route-boundary')).setBoundaryArtifactForTests(
      boundaryFixture([[rectangle(77.74,20.89,77.78,20.91),hole]]));
    const preview=await f.send(`${path}/preview`);
    expect((await f.send(path,confirmPreview(f.input,preview.body))).body.error.code).toBe('BOUNDARY_INVALID');
  });
  it.each([
    [4999,599,201],[5000,600,201],[5001,600,422],[5000,600.1,422],
  ])('polygon boundary multipart excursion upper bounds %sm/%ss return %s',async(metres,seconds,status)=>{
    const f=await valhallaInput(),provider=valhallaFixture();
    setFixtureRoute(provider,[[77.75,20.9],[77.752,20.9],[77.8,20.9],[77.802,20.9]],[208,metres,208],[10,seconds,10]);
    const input={...f.input,destination:[77.802,20.9001]};
    const artifact=boundaryFixture([[rectangle(77.74,20.89,77.76,20.91)],[rectangle(77.79,20.89,77.81,20.91)]]);
    (await import('../modules/posted-routes/route-boundary')).setBoundaryArtifactForTests(artifact);
    const preview=await f.send(`${path}/preview`,input);expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    const result=await f.send(path,confirmPreview(input,preview.body));
    expect(result.status,JSON.stringify(result.body)).toBe(status);
    if(status===201){
      const saved=await request(f.app).get(`${path}/${result.body.offer.id}`).set('Authorization',`Bearer ${f.actor.token}`);
      expect(saved.body.offer.route_verification.boundary).toMatchObject({outsideMetres:metres,outsideSeconds:seconds,
        outsideShapeSegments:[1],crossingCount:2});
    }else expect(result.body.error.code).toBe('BOUNDARY_INVALID');
  });
  it.each([[2500,300,201],[2501,300,422],[2500,301,422]])(
    'polygon boundary sums both excursions rather than accepting each individually (%s/%s)',async(metres,seconds,status)=>{
      const f=await valhallaInput(),provider=valhallaFixture();
      const coordinates:[number,number][]=[[77.75,20.9],[77.752,20.9],[77.776,20.9],[77.778,20.9],[77.802,20.9],[77.804,20.9]];
      setFixtureRoute(provider,coordinates,[208,2500,208,metres,208],[10,300,10,seconds,10]);
      const input={...f.input,destination:[77.804,20.9001]};
      (await import('../modules/posted-routes/route-boundary')).setBoundaryArtifactForTests(boundaryFixture([
        [rectangle(77.74,20.89,77.76,20.91)],[rectangle(77.77,20.89,77.785,20.91)],[rectangle(77.795,20.89,77.81,20.91)]]));
      const preview=await f.send(`${path}/preview`,input);expect(preview.status,JSON.stringify(preview.body)).toBe(200);
      const result=await f.send(path,confirmPreview(input,preview.body));
      expect(result.status,JSON.stringify(result.body)).toBe(status);
      if(status===201){
        const saved=await request(f.app).get(`${path}/${result.body.offer.id}`).set('Authorization',`Bearer ${f.actor.token}`);
        expect(saved.body.offer.route_verification.boundary).toMatchObject({outsideMetres:5000,outsideSeconds:600,crossingCount:4});
      }
    });
  it('polygon boundary counts an edge once when it contains multiple outside shape segments',async()=>{
    const f=await valhallaInput(),provider=valhallaFixture();
    provider.trace.edges=[{begin_shape_index:0,end_shape_index:3,length:1.56,way_id:1,drive_on_right:false,end_node:{elapsed_time:180.1}}];
    provider.locate[1].edges[0].way_id=1;
    (await import('../modules/posted-routes/route-boundary')).setBoundaryArtifactForTests(boundaryFixture([
      [rectangle(77.74,20.89,77.78,20.91),rectangle(77.751,20.899,77.754,20.901),rectangle(77.761,20.899,77.764,20.901)]]));
    const preview=await f.send(`${path}/preview`);expect(preview.status).toBe(200);
    const result=await f.send(path,confirmPreview(f.input,preview.body));expect(result.status,JSON.stringify(result.body)).toBe(201);
    const saved=await request(f.app).get(`${path}/${result.body.offer.id}`).set('Authorization',`Bearer ${f.actor.token}`);
    expect(saved.body.offer.route_verification.boundary).toMatchObject({outsideMetres:1040,outsideSeconds:181,outsideShapeSegments:[0,2],crossingCount:4});
  });
  it.each(['missing','nonmonotonic','mismatched total'])(
    'polygon boundary rejects %s provider timing without deriving time from distance',async(kind)=>{
      const f=await valhallaInput(),provider=valhallaFixture();
      if(kind==='missing')delete provider.trace.edges[0].end_node;
      if(kind==='nonmonotonic')provider.trace.edges[1].end_node={elapsed_time:100};
      if(kind==='mismatched total')provider.trace.edges[1].end_node={elapsed_time:175};
      await approvedServiceArea();
      const preview=await f.send(`${path}/preview`);expect(preview.status).toBe(200);
      expect((await f.send(path,confirmPreview(f.input,preview.body))).body.error.code).toBe('BOUNDARY_INVALID');
    });
  it('polygon boundary fails closed for malformed artifact provenance, checksums and topology',async()=>{
    const f=await valhallaInput();valhallaFixture();
    const confirmed=confirmPreview(f.input,(await f.send(`${path}/preview`)).body),base=boundaryFixture();
    const invalidArtifacts=[{...base,geometrySha256:'0'.repeat(64)},{...base,archiveSha256:'missing'},
      {...base,sourceCrs:''},{...base,normalizedCrs:'EPSG:7755'},{...base,topologyValidation:''},
      {...base,reuseEvidence:''},{...base,uncertaintyMetres:0},{...base,policyVersion:'old'},
      boundaryFixture([[[[77.74,20.89],[77.78,20.91],[77.74,20.91],[77.78,20.89],[77.74,20.89]]]]),
      boundaryFixture([[rectangle(77.74,20.89,77.78,20.91).slice(0,-1)]]),
      boundaryFixture([[rectangle(77.74,20.89,77.78,20.91),rectangle(77.79,20.89,77.8,20.9)]]),
      boundaryFixture([[rectangle(77.74,20.89,77.78,20.91)],[rectangle(77.76,20.895,77.8,20.915)]]),
      boundaryFixture([[rectangle(20.89,77.74,20.91,77.78)]])];
    const boundary=await import('../modules/posted-routes/route-boundary');
    for(const artifact of invalidArtifacts){
      boundary.setBoundaryArtifactForTests(artifact);
      const result=await f.send(path,confirmed);
      expect(result.body.error.code,JSON.stringify(result.body)).toBe('BOUNDARY_UNAVAILABLE');
    }
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(0);
  });
  it('polygon boundary cannot be supplied by a client or retained as production approval',async()=>{
    const f=await valhallaInput();valhallaFixture();await approvedServiceArea();
    const confirmed=confirmPreview(f.input,(await f.send(`${path}/preview`)).body);
    expect((await f.send(path,{...confirmed,boundary:boundaryFixture()})).status).toBe(400);
    vi.stubEnv('NODE_ENV','production');
    try{
      const boundary=await import('../modules/posted-routes/route-boundary');
      expect(()=>boundary.setBoundaryArtifactForTests(boundaryFixture())).toThrow('test only');
      const created=await f.send(path,confirmed);expect(created.status).toBe(201);
      const saved=(await verificationPool.query('SELECT route_verification FROM posted_route_offers WHERE id=$1',[created.body.offer.id])).rows[0];
      expect(saved.route_verification.boundary.approvalEvidenceKind).toBe('recorded-operator-review');
    }finally{vi.unstubAllEnvs();}
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(1);
  });
  it('polygon boundary rejects a pathological artifact within the topology work budget',async()=>{
    const f=await valhallaInput();valhallaFixture();
    const polygons=boundaryFixture().geometry.coordinates;
    // Disjoint detailed squares defeat an intersection-only work counter:
    // containment must also visit their many ring edges for each pair.
    for(let i=0;i<900;i++){
      const corners=rectangle(78+i*0.001,21,78.0005+i*0.001,21.0005),ring:[number,number][]=[];
      for(let edge=0;edge<4;edge++)for(let j=0;j<25;j++)
        ring.push([corners[edge][0]+(corners[edge+1][0]-corners[edge][0])*j/25,
          corners[edge][1]+(corners[edge+1][1]-corners[edge][1])*j/25]);
      ring.push(ring[0]);polygons.push([ring]);
    }
    (await import('../modules/posted-routes/route-boundary')).setBoundaryArtifactForTests(boundaryFixture(polygons));
    const preview=await f.send(`${path}/preview`);
    expect((await f.send(path,confirmPreview(f.input,preview.body))).body.error?.code).toBe('BOUNDARY_UNAVAILABLE');
  },15000);
  it('requires confirmation of a Valhalla preview and fails closed without boundary evidence',async()=>{
    const a=await participant(),app=createApp();
    const input={vehicle_id:a.vehicle,mode:'car',origin:[77.75,20.9],destination:[77.8,20.95],departure_at:departure(),capacity:2};
    const response=await request(app).post(`${path}/preview`).set('Authorization',`Bearer ${a.token}`).send(input);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('ROUTING_UNAVAILABLE');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(0);
  });
  it('rejects invalid provider answers and rolls back when notification work cannot be recorded',async()=>{
    const a=await participant(),app=createApp();
    const input={vehicle_id:a.vehicle,mode:'car',origin:[77.75,20.9],destination:[77.8,20.95],departure_at:departure(),capacity:2};
    const send=()=>request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',randomUUID()).send(input);
    const routing=await routeModule();
    routing.setRoutingAdapterForTests({verify:async()=>{throw new Error('provider down');}});
    expect((await send()).body.error.code).toBe('ROUTING_UNAVAILABLE');
    routing.setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'bike',
      geometry:{type:'LineString',coordinates:[input.origin,input.destination]},cumulativeMeters:[0,6000],distanceMeters:6000,durationSeconds:900})});
    expect((await send()).body.error.code).toBe('ROUTE_INVALID');
    routing.setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      geometry:{type:'LineString',coordinates:[[0,0],input.destination]},cumulativeMeters:[0,6000],distanceMeters:6000,durationSeconds:900})});
    expect((await send()).body.error.code).toBe('ROUTE_INVALID');
    routing.setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      geometry:{type:'LineString',coordinates:[input.origin,input.destination]},cumulativeMeters:[0,6000],distanceMeters:6000,durationSeconds:900})});
    process.env.ROUTE_SUPPORT_WINDOW_END=new Date(new Date(input.departure_at).getTime()+5*60000).toISOString();
    expect((await send()).body.error.code).toBe('SUPPORT_WINDOW_CLOSED');
    process.env.ROUTE_SUPPORT_WINDOW_END=new Date(Date.now()+8*86400000).toISOString();
    await verificationPool.query(`CREATE OR REPLACE FUNCTION ticket10_reject_notice() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.origin_type='posted_route' THEN RAISE EXCEPTION 'injected notice failure'; END IF; RETURN NEW; END $$`);
    await verificationPool.query(`CREATE TRIGGER ticket10_reject_notice BEFORE INSERT ON pilot_notification_events
      FOR EACH ROW EXECUTE FUNCTION ticket10_reject_notice()`);
    try{expect((await send()).status).toBe(503);}finally{
      await verificationPool.query('DROP TRIGGER ticket10_reject_notice ON pilot_notification_events');
      await verificationPool.query('DROP FUNCTION ticket10_reject_notice()');}
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(0);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_operations')).rows[0].n).toBe(0);
  });
  it('serializes overlapping routes on separate database connections',async()=>{
    const a=await participant(),app=createApp();
    const input={vehicle_id:a.vehicle,mode:'car',origin:[77.75,20.9],destination:[77.8,20.95],departure_at:departure(),capacity:2};
    (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      geometry:{type:'LineString',coordinates:[input.origin,input.destination]},cumulativeMeters:[0,6000],distanceMeters:6000,durationSeconds:900})});
    const send=()=>request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',randomUUID()).send(input);
    const [one,two]=await Promise.all([send(),send()]);
    expect([one.status,two.status].sort()).toEqual([201,409]);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(1);
  });
  it.each([false,true])('restores route evidence, audit and suppressed notice (Valhalla=%s)',async(useValhalla)=>{
    const a=await participant(),app=createApp();
    const input={vehicle_id:a.vehicle,mode:'car',origin:[77.75,20.9],destination:[77.8,20.95],departure_at:departure(),capacity:2};
    (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      geometry:{type:'LineString',coordinates:[input.origin,input.destination]},
      cumulativeMeters:[0,6000],distanceMeters:6000,durationSeconds:900})});
    let publishInput:unknown=input;
    if(useValhalla){
      (await routeModule()).setRoutingAdapterForTests(null);valhallaFixture();await approvedServiceArea();
      input.origin=[77.75,20.9001];input.destination=[77.765,20.9001];
      const preview=await request(app).post(`${path}/preview`).set('Authorization',`Bearer ${a.token}`).send(input);
      publishInput=confirmPreview(input,preview.body);
    }
    const created=await request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',randomUUID()).send(publishInput);
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const operationId=created.body.offer.operation_id,offerId=created.body.offer.id;
    const original=(await verificationPool.query('SELECT route_verification FROM posted_route_offers WHERE id=$1',[offerId])).rows[0];
    if(useValhalla)expect(original.route_verification.boundary.approvalEvidenceKind).toBe('recorded-operator-review');
    expect((await verificationPool.query('SELECT state FROM posted_route_operations WHERE id=$1',[operationId])).rows[0].state).toBe('acknowledged');
    await verificationPool.query(`DELETE FROM pilot_email_jobs WHERE event_id IN
      (SELECT id FROM pilot_notification_events WHERE origin_type='posted_route' AND operation_id=$1)`,[operationId]);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE origin_type='posted_route' AND operation_id=$1",[operationId]);
    await verificationPool.query("DELETE FROM audit_logs WHERE metadata->>'operationId'=$1",[operationId]);
    await verificationPool.query('DELETE FROM posted_route_operations WHERE id=$1',[operationId]);
    await verificationPool.query('DELETE FROM posted_route_offers WHERE id=$1',[offerId]);
    const operator=(await verificationPool.query<{id:string}>(`INSERT INTO users(email,role,email_verified_at)
      VALUES($1,'admin',now()) RETURNING id`,[`operator-${randomUUID()}@example.test`])).rows[0].id;
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'ticket 10 recovery test',now())`,[operator]);
    const recovery=(await import('../modules/posted-routes/posted-routes.service')).postedRouteRecovery;
    await expect(recovery.reconcileReceipts(operator)).resolves.toBeGreaterThan(0);
    expect((await verificationPool.query('SELECT state FROM posted_route_operations WHERE id=$1',[operationId])).rows[0].state).toBe('recovered');
    expect((await verificationPool.query('SELECT route_verification FROM posted_route_offers WHERE id=$1',[offerId])).rows[0]).toEqual(original);
    expect((await verificationPool.query('SELECT route_version,policy_version FROM posted_route_offers WHERE id=$1',[offerId])).rows[0])
      .toMatchObject({route_version:1,policy_version:'unrestricted-route-contribution-2026-10-04.1'});
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM audit_logs WHERE metadata->>'operationId'=$1",[operationId])).rows[0].n).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_email_jobs WHERE status='exhausted' AND event_id IN (SELECT id FROM pilot_notification_events WHERE origin_type='posted_route' AND operation_id=$1)",[operationId])).rows[0].n).toBe(1);
  });
  it('keeps preparation private, idempotent and distinct from corridor offers',async()=>{
    const a=await participant(),b=await participant(),app=createApp();
    const input={vehicle_id:a.vehicle,mode:'car',origin:[77.75,20.9],destination:[77.8,20.95],departure_at:departure(),capacity:2};
    (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      geometry:{type:'LineString',coordinates:[input.origin,input.destination]},cumulativeMeters:[0,6000],distanceMeters:6000,durationSeconds:900})});
    const key=randomUUID();const publish=()=>request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',key).send(input);
    const first=await publish();expect(first.status,JSON.stringify(first.body)).toBe(201);
    const second=await publish();expect(second.body.offer.operation_id).toBe(first.body.offer.operation_id);
    expect((await request(app).post(path).set('Authorization',`Bearer ${a.token}`).set('Idempotency-Key',key)
      .send({...input,capacity:1})).body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect((await request(app).post(path).set('Authorization',`Bearer ${b.token}`)
      .set('Idempotency-Key',randomUUID()).send({...input,vehicle_id:a.vehicle})).body.error.code).toBe('VEHICLE_NOT_FOUND');
    expect((await request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',randomUUID()).send({...input,capacity:3})).body.error.code).toBe('CAPACITY_EXCEEDED');
    const id=first.body.offer.id;
    expect((await request(app).get(`${path}/${id}`).set('Authorization',`Bearer ${b.token}`)).status).toBe(404);
    expect((await request(app).get(`${path}/${id}`).set('Authorization',`Bearer ${a.token}`)).status).toBe(200);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM ride_offers')).rows[0].n).toBe(0);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=$1',[id])).rows[0].n).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_notification_events WHERE origin_type='posted_route'")).rows[0].n).toBe(1);
  });
  it('quotes saved route metres with half-paise-up rounding and keeps other actors out',async()=>{
    const a=await participant(),b=await participant(),app=createApp();
    const origin:[number,number]=[77.75,20.9],bend:[number,number]=[77.76,20.91],destination:[number,number]=[77.77,20.9];
    const coordinates=[origin,bend,destination];
    (await routeModule()).setRoutingAdapterForTests({verify:async input=>
      input.destination[0]===bend[0]&&input.destination[1]===bend[1]
        ? {source:'synthetic-test',mode:'car',geometry:{type:'LineString',coordinates:[origin,bend]},
          cumulativeMeters:[0,600],distanceMeters:600,durationSeconds:120}
        : {source:'synthetic-test',mode:'car',geometry:{type:'LineString',coordinates},
          cumulativeMeters:[0,1005,4000],distanceMeters:4000,durationSeconds:900}});
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(safeStopForKind);
    const created=await request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',randomUUID()).send({vehicle_id:a.vehicle,mode:'car',origin,destination,departure_at:departure(),capacity:2});
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const id=created.body.offer.id,quotePath=`${path}/${id}/quote`;
    const body={route_version:1,pickup:origin,dropoff:bend};
    const send=(token:string,payload:unknown)=>request(app).post(quotePath).set('Authorization',`Bearer ${token}`).send(payload);
    const previousEnvironment=process.env.NODE_ENV;
    try{process.env.NODE_ENV='production';
      expect((await send(a.token,body)).body.error.code).toBe('ROUTE_QUOTES_DISABLED');
    }finally{process.env.NODE_ENV=previousEnvironment;}
    expect((await request(app).post(quotePath).send(body)).status).toBe(401);
    expect((await send(b.token,body)).status).toBe(404);
    const quote=await send(a.token,body);
    expect(quote.status,JSON.stringify(quote.body)).toBe(200);
    // A separately routed origin-to-bend answer would be 600 m; quote must use the posted 1005 m.
    expect(quote.body.quote).toMatchObject({route_id:id,route_version:1,segment_meters:1005,
      vehicle_category:'car',rate_paise_per_km:700,rounding_rule:'nearest_paise_half_up',currency:'INR',
      total_paise:704,additional_charges_paise:0,distance_source:'saved_posted_route',real_bookings_enabled:false});
    const wholeRoute=await send(a.token,{...body,dropoff:destination});
    expect(wholeRoute.body.quote).toMatchObject({segment_meters:4000,total_paise:2800});
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(async()=>safeStop);
    expect((await send(a.token,body)).body.error.code).toBe('STOP_UNSAFE');
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(async()=>({
      placeId:'synthetic-stop',driverConfirmed:false,legal:true,correctSide:true,correctDirection:true,helmetSpace:true}));
    expect((await send(a.token,body)).body.error.code).toBe('STOP_UNSAFE');
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(safeStopForKind);
    expect((await send(a.token,{...body,pickup:[77.7498,20.9]})).status).toBe(200);
    expect((await send(a.token,{...body,pickup:[77.7495,20.9]})).body.error.code).toBe('POINT_OFF_ROUTE');
    expect((await send(a.token,{...body,distance_meters:1})).status).toBe(400);
    expect((await send(a.token,{...body,route_version:2})).body.error.code).toBe('ROUTE_VERSION_STALE');
    expect((await send(a.token,{...body,pickup:bend,dropoff:origin})).body.error.code).toBe('SEGMENT_REVERSED');
    expect((await send(a.token,{...body,dropoff:[78,21]})).body.error.code).toBe('POINT_OFF_ROUTE');
    expect((await send(a.token,{...body,dropoff:[77.750001,20.900001]})).body.error.code).toBe('SEGMENT_TOO_SHORT');
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(async()=>({...safeStop,legal:false}));
    expect((await send(a.token,body)).body.error.code).toBe('STOP_UNSAFE');
    for(const invalid of [{correctSide:false},{correctDirection:false}]){
      (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(async(_point,kind)=>
        ({...safeStop,placeId:`synthetic-${kind}`,...invalid}));
      expect((await send(a.token,body)).body.error.code).toBe('STOP_UNSAFE');
    }
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(async()=>{throw new Error('stop source down');});
    expect((await send(a.token,body)).body.error.code).toBe('STOP_VERIFICATION_UNAVAILABLE');
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(null);
    expect((await send(a.token,body)).body.error.code).toBe('STOP_VERIFICATION_UNAVAILABLE');
    await verificationPool.query("UPDATE posted_route_offers SET cumulative_meters='[]'::jsonb WHERE id=$1",[id]);
    expect((await send(a.token,body)).body.error.code).toBe('SEGMENT_UNVERIFIABLE');
    await verificationPool.query("UPDATE posted_route_offers SET geometry='null'::jsonb WHERE id=$1",[id]);
    expect((await send(a.token,body)).body.error.code).toBe('SEGMENT_UNVERIFIABLE');
    await verificationPool.query('UPDATE posted_route_offers SET route_version=2 WHERE id=$1',[id]);
    expect((await send(a.token,body)).body.error.code).toBe('ROUTE_VERSION_STALE');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM ride_offers')).rows[0].n).toBe(0);
  });
  it('prices a saved segment from Valhalla edge metres rather than shorter shape-length totals',async()=>{
    const a=await participant(),app=createApp();
    const origin:[number,number]=[77.75,20.9],pickupEnd:[number,number]=[77.76,20.9],
      destination:[number,number]=[77.765,20.9];
    const {buildValhallaDistanceProgression}=await import('../modules/posted-routes/valhalla-distance');
    const routeShape='_iszf@_nnhsC?owH?owH?owH';
    const distance=buildValhallaDistanceProgression({routeShape,
      routeLengthKm:1.562,trace:{shape:routeShape,
        edges:[{begin_shape_index:0,end_shape_index:2,length:1.04},
          {begin_shape_index:2,end_shape_index:3,length:0.52}],
        shape_attributes:{length:[0.5,0.5,0.5]}}});
    (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      ...distance,durationSeconds:180})});
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(safeStopForKind);
    const created=await request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',randomUUID()).send({vehicle_id:a.vehicle,mode:'car',origin,destination,
        departure_at:departure(),capacity:2});
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const quoted=await request(app).post(`${path}/${created.body.offer.id}/quote`)
      .set('Authorization',`Bearer ${a.token}`).send({route_version:1,pickup:origin,dropoff:pickupEnd});
    expect(quoted.status,JSON.stringify(quoted.body)).toBe(200);
    expect(quoted.body.quote).toMatchObject({segment_meters:1040,total_paise:728,
      distance_source:'saved_posted_route',real_bookings_enabled:false});
  });
  it('does not prepare a route whose Valhalla edge distance contradicts its geometry',async()=>{
    const a=await participant(),app=createApp();
    const origin:[number,number]=[77.75,20.9],destination:[number,number]=[77.75001,20.9];
    const routeShape='_iszf@_nnhsC?S';
    const {buildValhallaDistanceProgression}=await import('../modules/posted-routes/valhalla-distance');
    (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      ...buildValhallaDistanceProgression({routeShape,routeLengthKm:1.005,
        trace:{shape:routeShape,edges:[{begin_shape_index:0,end_shape_index:1,length:1.005}]}}),
      durationSeconds:180})});
    const response=await request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',randomUUID()).send({vehicle_id:a.vehicle,mode:'car',origin,destination,
        departure_at:departure(),capacity:2});
    expect(response.body.error.code).toBe('ROUTING_UNAVAILABLE');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n).toBe(0);
  });
  it('rejects repeated-pass ambiguity even when the requested point is within tolerance',async()=>{
    const a=await participant(),app=createApp();
    const origin:[number,number]=[77.75,20.9],turn:[number,number]=[77.76,20.9],
      near:[number,number]=[77.7501,20.9],destination:[number,number]=[77.77,20.9];
    (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      geometry:{type:'LineString',coordinates:[origin,turn,near,destination]},
      cumulativeMeters:[0,1000,2000,3000],distanceMeters:3000,durationSeconds:900})});
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(safeStopForKind);
    const created=await request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',randomUUID()).send({vehicle_id:a.vehicle,mode:'car',origin,destination,departure_at:departure(),capacity:2});
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const response=await request(app).post(`${path}/${created.body.offer.id}/quote`)
      .set('Authorization',`Bearer ${a.token}`).send({route_version:1,pickup:origin,dropoff:destination});
    expect(response.body.error.code).toBe('POINT_AMBIGUOUS');
  });
  it.each([{metres:1004,paise:703},{metres:1005,paise:704},{metres:1006,paise:704}])(
    'rounds a $metres m car segment to $paise paise',async({metres,paise})=>{
      const a=await participant(),app=createApp();
      const origin:[number,number]=[77.75,20.9],destination:[number,number]=[77.76,20.9];
      (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
        geometry:{type:'LineString',coordinates:[origin,destination]},
        cumulativeMeters:[0,metres],distanceMeters:metres,durationSeconds:120})});
      (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(safeStopForKind);
      const created=await request(app).post(path).set('Authorization',`Bearer ${a.token}`)
        .set('Idempotency-Key',randomUUID()).send({vehicle_id:a.vehicle,mode:'car',origin,destination,departure_at:departure(),capacity:2});
      expect(created.status,JSON.stringify(created.body)).toBe(201);
      const quoted=await request(app).post(`${path}/${created.body.offer.id}/quote`)
        .set('Authorization',`Bearer ${a.token}`).send({route_version:1,pickup:origin,dropoff:destination});
      expect(quoted.status,JSON.stringify(quoted.body)).toBe(200);
      expect(quoted.body.quote.total_paise).toBe(paise);
    });
  it.each(['bike','scooter'] as const)('quotes the %s passenger at 500 paise per kilometre',async mode=>{
    const a=await participant(mode),app=createApp();
    const origin:[number,number]=[77.75,20.9],destination:[number,number]=[77.76,20.9];
    (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode,
      geometry:{type:'LineString',coordinates:[origin,destination]},
      cumulativeMeters:[0,501],distanceMeters:501,durationSeconds:120})});
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(safeStopForKind);
    const created=await request(app).post(path).set('Authorization',`Bearer ${a.token}`)
      .set('Idempotency-Key',randomUUID()).send({vehicle_id:a.vehicle,mode,origin,destination,departure_at:departure(),capacity:1});
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const quoted=await request(app).post(`${path}/${created.body.offer.id}/quote`).set('Authorization',`Bearer ${a.token}`)
      .send({route_version:1,pickup:origin,dropoff:destination});
    expect(quoted.status,JSON.stringify(quoted.body)).toBe(200);
    expect(quoted.body.quote).toMatchObject({segment_meters:501,vehicle_category:mode,
      rate_paise_per_km:500,total_paise:251,additional_charges_paise:0});
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(async(_point,kind)=>
      ({...safeStop,placeId:`synthetic-${kind}`,helmetSpace:false}));
    const unsafe=await request(app).post(`${path}/${created.body.offer.id}/quote`).set('Authorization',`Bearer ${a.token}`)
      .send({route_version:1,pickup:origin,dropoff:destination});
    expect(unsafe.body.error.code).toBe('STOP_UNSAFE');
  });
  async function moveToRouteDeparture(offer:string){
    const row=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[offer])).rows[0];
    setOutcomeClockForTests(()=>row.departure_at.getTime());
  }
  async function bookingFixture(capacity=1,published=false){
    if(published){
      const f=await passengerPublication('car',undefined,capacity);
      const call=(token:string,url:string,body:unknown,key=randomUUID())=>f.send(url,body,key,token);
      const ask=async(passenger:Awaited<ReturnType<typeof participant>>)=>{
        const response=await call(passenger.token,`${path}/${f.id}/requests`,f.selection);
        expect(response.status,JSON.stringify(response.body)).toBe(201);
        expect(response.body.request.status).toBe('pending');return response.body.request.id as string;
      };
      return {driver:f.actor,app:f.app,offer:f.id,selection:f.selection,call,ask};
    }
    const driver=await participant(),app=createApp();
    const origin:[number,number]=[77.75,20.9],destination:[number,number]=[77.76,20.9];
    (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',mode:'car',
      geometry:{type:'LineString',coordinates:[origin,destination]},
      cumulativeMeters:[0,1005],distanceMeters:1005,durationSeconds:120})});
    (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(safeStopForKind);
    const prepared=await request(app).post(path).set('Authorization',`Bearer ${driver.token}`)
      .set('Idempotency-Key',randomUUID()).send({vehicle_id:driver.vehicle,mode:'car',
        origin,destination,departure_at:departure(),capacity});
    expect(prepared.status,JSON.stringify(prepared.body)).toBe(201);
    const offer=prepared.body.offer.id,selection={route_version:1,pickup:origin,dropoff:destination};
    const call=(token:string,url:string,body:unknown,key=randomUUID())=>request(app).post(url)
      .set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
    const ask=async(passenger:Awaited<ReturnType<typeof participant>>)=>{
      const response=await call(passenger.token,`${path}/${offer}/requests`,selection);
      expect(response.status,JSON.stringify(response.body)).toBe(201);
      expect(response.body.request.status).toBe('pending');
      return response.body.request.id as string;
    };
    return {driver,app,offer,selection,call,ask};
  }
  async function seatRecoveryOperator(){
    const email=`operator-${randomUUID()}@example.test`,subject=randomUUID();
    const operator=(await verificationPool.query<{id:string}>(
      "INSERT INTO users(email,role,email_verified_at) VALUES($1,'admin',now()) RETURNING id",[email])).rows[0].id;
    await verificationPool.query("INSERT INTO user_profiles(user_id,full_name) VALUES($1,'Seat Recovery Operator')",[operator]);
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'synthetic recovery review',now())`,[operator]);
    await verificationPool.query(`INSERT INTO auth_identities(provider,provider_subject,user_id,provider_email)
      VALUES('supabase',$1,$2,$3)`,[subject,operator,email]);
    const resume=async(assuranceLevel:'aal1'|'aal2'='aal2')=>{
      await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='supabase',
        legacy_login_enabled=false,authorized_at=now(),authorized_by='integration-test'`);
      setManagedAuthEnabledForTests(true);
      setAuthProviderForTests(fakeProvider({subject,email,emailVerified:true,assuranceLevel,userMetadata:{}}));
    };
    await resume();
    const login=await request(createApp()).post('/v1/auth/login').send({email,password:'synthetic-password'});
    expect(login.status).toBe(200);
    const cookies=login.headers['set-cookie'] as string[];
    return {id:operator,resume,cookie:cookies.map(item=>item.split(';',1)[0]).join('; '),
      csrf:cookies.find(item=>item.startsWith('pp_csrf_token='))!.split(';',1)[0].split('=',2)[1]};
  }
  async function clearSeatRecoveryOperator(){
    setManagedAuthEnabledForTests(null);setAuthProviderForTests(null);
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='legacy',
      legacy_login_enabled=true,authorized_at=NULL,authorized_by=NULL`);
  }
  it('ticket 09 keeps accepted booking notices private through real worker failure and operator retry',async()=>{
    const f=await bookingFixture(),passenger=await participant(),outsider=await participant();
    const id=await f.ask(passenger),key=randomUUID();
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{},key);
    expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
    const operation=accepted.body.operation_id;
    const requestedOperation=(await verificationPool.query<{operation_id:string}>(`SELECT operation_id
      FROM pilot_notification_events WHERE related_entity_id=$1 AND event_type='requested'`,[id])).rows[0].operation_id;
    await deliverRouteNotices(requestedOperation,'requested',[f.driver.id]);
    await deliverRouteNotices(operation,'accepted_driver',[f.driver.id]);
    const notices=async(token:string)=>{
      const response=await request(f.app).get('/v1/notifications/durable').set('Authorization',`Bearer ${token}`);
      expect(response.status).toBe(200);expect(response.headers['cache-control']).toContain('no-store');
      return response.body.notifications as {id:string;event_type:string;related_entity_id:string}[];
    };
    const own=(await notices(passenger.token)).filter(item=>item.related_entity_id===id);
    expect(own.map(item=>item.event_type)).toEqual(['accepted']);
    expect((await notices(f.driver.token)).filter(item=>item.related_entity_id===id).map(item=>item.event_type).sort())
      .toEqual(['accepted_driver','requested']);
    expect((await notices(outsider.token)).filter(item=>item.related_entity_id===id)).toEqual([]);
    expect((await request(f.app).get('/v1/operator/notifications/delivery')
      .set('Authorization',`Bearer ${outsider.token}`)).status).toBe(403);
    // Defer unrelated fixture notices; run the actual worker for the accepted passenger's event.
    await verificationPool.query("UPDATE pilot_email_jobs SET due_at=now()+interval '1 day'");
    const job=(await verificationPool.query<{id:string}>(`SELECT j.id FROM pilot_email_jobs j
      JOIN pilot_notification_events e ON e.id=j.event_id WHERE e.operation_id=$1 AND e.recipient_id=$2`,
      [operation,passenger.id])).rows[0].id;
    const {processDueEmail}=await import('../../../worker/src/jobs/durable-email.job');
    const messages:{eventId:string;to:string;subject:string;body:string}[]=[];
    for(let attempt=0;attempt<5;attempt++){
      await verificationPool.query('UPDATE pilot_email_jobs SET due_at=now() WHERE id=$1',[job]);
      expect(await processDueEmail(verificationPool,{send:async message=>{
        messages.push(message);throw new Error('synthetic provider secret and private contact');
      }})).toBe(true);
    }
    expect(new Set(messages.map(item=>item.eventId)).size).toBe(1);
    expect(messages[0].to).toMatch(/@example.test$/);
    expect(messages[0].body).toContain('Your driver accepted one whole-ride seat.');
    expect(messages[0].body).not.toMatch(/MH-|77\.75|20\.9|phone|insurance/);
    const retry=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{},key);
    expect(retry.body.operation_id).toBe(operation);
    expect(retry.body.booking.id).toBe(accepted.body.booking.id);
    const onDuty=await seatRecoveryOperator();
    try{
      const queue=await request(f.app).get('/v1/operator/notifications/delivery').set('Cookie',onDuty.cookie);
      expect(queue.headers['cache-control']).toContain('no-store');
      expect(JSON.stringify(queue.body)).not.toContain('synthetic provider secret');
      const failed=queue.body.jobs.find((item:{id:string})=>item.id===job);
      expect(failed).toMatchObject({status:'exhausted',attempt_count:5,operation_id:operation,
        origin_type:'posted_route_seat',event_type:'accepted',recipient_id:passenger.id});
      expect(failed.body).toBeUndefined();expect(failed.to).toBeUndefined();
      const retryKey=randomUUID();
      for(let n=0;n<2;n++)expect((await request(f.app).post(`/v1/operator/notifications/email/${job}/retry`)
        .set('Cookie',onDuty.cookie).set('Origin','http://localhost:3000').set('X-CSRF-Token',onDuty.csrf)
        .set('Idempotency-Key',retryKey).send({})).status).toBe(200);
      expect(await processDueEmail(verificationPool,{send:async message=>{messages.push(message);}})).toBe(true);
      const sent=await request(f.app).get('/v1/operator/notifications/delivery').set('Cookie',onDuty.cookie);
      expect(sent.body.jobs.find((item:{id:string})=>item.id===job)).toMatchObject({status:'sent',attempt_count:6});
      expect(new Set(messages.map(item=>item.eventId)).size).toBe(1);
    }finally{await clearSeatRecoveryOperator();}
    expect((await notices(passenger.token)).filter(item=>item.related_entity_id===id)).toHaveLength(1);
    expect((await request(f.app).get(`${path}/requests/${id}`).set('Authorization',`Bearer ${passenger.token}`))
      .body.request.status).toBe('accepted');
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM audit_logs
      WHERE action='posted_route_seat_accepted' AND metadata->>'operationId'=$1`,[operation])).rows[0].n).toBe(1);
  });
  it('ticket 09 rehearses missed contact with paused commitments and an active incident',async()=>{
    const active=await bookingFixture(),passenger=await participant(),id=await active.ask(passenger);
    const accepted=await active.call(active.driver.token,`${path}/requests/${id}/accept`,{});
    const seat=accepted.body.booking.id as string;
    await moveToRouteDeparture(active.offer);
    expect((await active.call(active.driver.token,`${path}/${active.offer}/depart`,{boarded_ids:[seat]})).status).toBe(200);
    const waiting=await bookingFixture(2),waitingPassenger=await participant(),pendingPassenger=await participant();
    const waitingId=await waiting.ask(waitingPassenger),pendingId=await waiting.ask(pendingPassenger);
    expect((await waiting.call(waiting.driver.token,`${path}/requests/${waitingId}/accept`,{})).status).toBe(200);
    const newcomer=await participant();
    const onDuty=await seatRecoveryOperator();
    const operatorPost=(url:string,body:unknown,key=randomUUID())=>request(active.app).post(url)
      .set('Cookie',onDuty.cookie).set('Origin','http://localhost:3000').set('X-CSRF-Token',onDuty.csrf)
      .set('Idempotency-Key',key).send(body);
    try{
      // Simulation only: a missed 15-minute personal acknowledgement is an operator input,
      // not a claim that the application measures inbox receipt or independently pages anyone.
      const outreach={participantId:passenger.id,method:'email',occurredAt:new Date().toISOString(),
        reason:'service_outage',outcome:'no_answer'};
      expect((await operatorPost('/v1/operator/urgent-outreach',{...outreach,contact:'private@example.test'})).status).toBe(400);
      const outreachKey=randomUUID();
      const recorded=await operatorPost('/v1/operator/urgent-outreach',outreach,outreachKey);
      expect(recorded.status).toBe(200);
      expect((await operatorPost('/v1/operator/urgent-outreach',outreach,outreachKey)).body.id).toBe(recorded.body.id);
      for(const capability of ['offers','requests','acceptance','booking']){
        const paused=await operatorPost('/v1/operator/pause',{capability,paused:true,
          reason:'Synthetic missed urgent acknowledgement; sole operator coverage unavailable'});
        expect(paused.status,JSON.stringify(paused.body)).toBe(200);
      }
      const history=await request(active.app).get('/v1/operator/urgent-outreach').set('Cookie',onDuty.cookie);
      expect(history.headers['cache-control']).toContain('no-store');
      expect(history.body.records).toEqual([expect.objectContaining({id:recorded.body.id,outcome:'no_answer'})]);
      await clearSeatRecoveryOperator();
      expect((await waiting.call(newcomer.token,`${path}/${waiting.offer}/requests`,waiting.selection)).body.error.code).toBe('PILOT_PAUSED');
      expect((await waiting.call(waiting.driver.token,`${path}/requests/${pendingId}/accept`,{})).body.error.code).toBe('PILOT_PAUSED');
      expect((await waiting.call(waiting.driver.token,`${path}/${waiting.offer}/depart`,{boarded_ids:[]})).body.error.code).toBe('PILOT_PAUSED');
      const visible=await request(active.app).get(`${path}/requests/${id}`).set('Authorization',`Bearer ${passenger.token}`);
      expect(visible.status).toBe(200);expect(visible.body.request.status).toBe('accepted');
      const incident=await active.call(passenger.token,`${path}/allocations/${seat}/incidents`,{
        kind:'safety',reason:'Synthetic missed contact while trip remains active'});
      expect(incident.status,JSON.stringify(incident.body)).toBe(200);
      await deliverRouteNotices(incident.body.operation_id,'incident_report',[active.driver.id,passenger.id,onDuty.id]);
      expect((await active.call(passenger.token,`${path}/incidents/${incident.body.incident_id}/resolve`,{
        reason:'Participant cannot resolve an operator incident',evidence_refs:[]})).status).toBe(403);
      await onDuty.resume('aal1');
      const noMfa=await request(active.app).get(`${path}/incidents`).set('Cookie',onDuty.cookie);
      expect(noMfa.status).toBe(403);expect(noMfa.body.error.code).toBe('MFA_REQUIRED');
      expect((await operatorPost(`${path}/incidents/${incident.body.incident_id}/resolve`,{
        reason:'AAL1 must not reconcile a support incident',evidence_refs:[]})).body.error.code).toBe('MFA_REQUIRED');
      await onDuty.resume();
      const cases=await request(active.app).get(`${path}/incidents`).set('Cookie',onDuty.cookie);
      expect(cases.status).toBe(200);
      expect(cases.body.incidents).toEqual([expect.objectContaining({id:incident.body.incident_id,status:'open',priority:'high'})]);
      const resolution=await operatorPost(`${path}/incidents/${incident.body.incident_id}/resolve`,{
        reason:'Synthetic fallback reconciliation; no real receipt or independent escalation claimed',
        evidence_refs:[`urgent-outreach:${recorded.body.id}`]});
      expect(resolution.status,JSON.stringify(resolution.body)).toBe(200);
      await deliverRouteNotices(resolution.body.operation_id,'operator_incident',[active.driver.id,passenger.id]);
      expect((await verificationPool.query('SELECT evidence_refs FROM posted_route_incidents WHERE id=$1',
        [incident.body.incident_id])).rows[0].evidence_refs).toEqual([`urgent-outreach:${recorded.body.id}`]);
      // Reconciliation must be possible while new commitments and unsupported departures stay paused.
      const status=await request(active.app).get('/v1/operator/status').set('Cookie',onDuty.cookie);
      expect(status.body.capabilities.every((item:{paused:boolean})=>item.paused)).toBe(true);
      expect((await request(active.app).get(`${path}/incidents`).set('Cookie',onDuty.cookie)).body.incidents).toEqual([]);
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
      expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[active.offer])).rows[0].status).toBe('departed');
    }finally{await clearSeatRecoveryOperator();}
  });
  it('ticket 09 traces outcome notices from cancellation through a completed cash journey',async()=>{
    const f=await bookingFixture(2),passenger=await participant(),outsider=await participant();
    const observe=async(response:{status:number;body:Record<string,unknown>},event:string,
      recipients:Awaited<ReturnType<typeof participant>>[])=>{
      expect(response.status,JSON.stringify(response.body)).toBe(200);
      const events=(await verificationPool.query<{id:string;recipient_id:string;ready_at:Date}>(
        'SELECT id,recipient_id,ready_at FROM pilot_notification_events WHERE operation_id=$1 AND event_type=$2',
        [response.body.operation_id,event])).rows;
      expect(events.map(item=>item.recipient_id).sort()).toEqual(recipients.map(item=>item.id).sort());
      for(const recipient of [...recipients,outsider]){
        const read=await request(f.app).get('/v1/notifications/durable').set('Authorization',`Bearer ${recipient.token}`);
        expect(read.status).toBe(200);expect(read.headers['cache-control']).toContain('no-store');
        const visible=read.body.notifications.filter((item:{id:string})=>events.some(event=>event.id===item.id));
        expect(visible).toHaveLength(recipient===outsider?0:1);
      }
      expect(events.every(item=>item.ready_at!==null)).toBe(true);
      // Cancellation is sent through the failure adapter below; deliver the other real producer events here.
      if(event!=='passenger_cancel')await deliverRouteNotices(response.body.operation_id as string,event,recipients.map(item=>item.id));
    };
    const rejected=await f.ask(passenger);
    await observe(await f.call(f.driver.token,`${path}/requests/${rejected}/reject`,{}),'rejected',[passenger]);
    const requestId=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${requestId}/accept`,{});
    const seat=accepted.body.booking.id as string;
    const cancelled=await f.call(passenger.token,`${path}/allocations/${seat}/cancel`,{
      reason:'Synthetic private cancellation reason should not appear in notice'});
    await observe(cancelled,'passenger_cancel',[passenger,f.driver]);
    // A real worker failure after the cancellation commit must not recreate the allocation.
    await verificationPool.query("UPDATE pilot_email_jobs SET due_at=now()+interval '1 day'");
    await verificationPool.query(`UPDATE pilot_email_jobs SET due_at=now() WHERE event_id IN
      (SELECT id FROM pilot_notification_events WHERE operation_id=$1)`,[cancelled.body.operation_id]);
    const {processDueEmail}=await import('../../../worker/src/jobs/durable-email.job');
    const delivered:string[]=[];
    for(let n=0;n<2;n++)expect(await processDueEmail(verificationPool,{send:async message=>{
      delivered.push(message.body);throw new Error('Synthetic provider unavailable');
    }})).toBe(true);
    expect(delivered).toHaveLength(2);
    expect(delivered.join(' ')).not.toContain('Synthetic private cancellation reason');
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status).toBe('cancelled');
    const fresh=await participant(),freshRequest=await f.ask(fresh);
    const freshSeat=(await f.call(f.driver.token,`${path}/requests/${freshRequest}/accept`,{})).body.booking.id as string;
    const companion=await participant(),companionRequest=await f.ask(companion);
    const companionSeat=(await f.call(f.driver.token,`${path}/requests/${companionRequest}/accept`,{})).body.booking.id as string;
    await moveToRouteDeparture(f.offer);
    // Cancelled passengers must not receive later trip or payment activity.
    await observe(await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[freshSeat,companionSeat]}),
      'depart',[f.driver,fresh,companion]);
    await observe(await f.call(f.driver.token,`${path}/allocations/${freshSeat}/driver-journey`,{travelled:true,completed:true}),
      'driver_journey',[f.driver,fresh]);
    await observe(await f.call(fresh.token,`${path}/allocations/${freshSeat}/passenger-journey`,{travelled:true,completed:true}),
      'passenger_journey',[f.driver,fresh]);
    await observe(await f.call(fresh.token,`${path}/allocations/${freshSeat}/payment-claim`,{method:'cash'}),
      'payment_claim',[f.driver,fresh]);
    await observe(await f.call(f.driver.token,`${path}/allocations/${freshSeat}/receipt`,{}),
      'receipt',[f.driver,fresh]);
  });
  async function deliverRouteNotices(operation:string,event:string,recipients:string[]){
    const events=(await verificationPool.query<{id:string;recipient_id:string;email:string}>(`
      SELECT e.id,e.recipient_id,u.email FROM pilot_notification_events e JOIN users u ON u.id=e.recipient_id
      WHERE e.operation_id=$1 AND e.event_type=$2 AND e.ready_at IS NOT NULL`,[operation,event])).rows;
    expect(events.map(item=>item.recipient_id).sort()).toEqual([...recipients].sort());
    await verificationPool.query("UPDATE pilot_email_jobs SET due_at=now()+interval '1 day'");
    await verificationPool.query('UPDATE pilot_email_jobs SET due_at=now() WHERE event_id=ANY($1::uuid[])',
      [events.map(item=>item.id)]);
    const {processDueEmail}=await import('../../../worker/src/jobs/durable-email.job');
    const sent:{eventId:string;to:string;subject:string;body:string}[]=[];
    for(const _event of events)expect(await processDueEmail(verificationPool,{send:async message=>{sent.push(message);}})).toBe(true);
    expect(await processDueEmail(verificationPool,{send:async()=>{throw new Error('Duplicate send');}})).toBe(false);
    expect(sent.map(item=>item.to).sort()).toEqual(events.map(item=>item.email).sort());
    expect(sent.map(item=>item.eventId).sort()).toEqual(events.map(item=>item.id).sort());
    expect(sent.map(item=>item.body).join(' ')).not.toMatch(/Private support evidence|77\.75|MH-/);
    const jobs=await verificationPool.query(`SELECT status,attempts FROM pilot_email_jobs WHERE event_id=ANY($1::uuid[])`,
      [events.map(item=>item.id)]);
    expect(jobs.rows).toEqual(events.map(()=>({status:'sent',attempts:1})));
  }
  it('ticket 09 requires MFA for every operator outcome notice producer',async()=>{
    const onDuty=await seatRecoveryOperator();
    try{
      await onDuty.resume('aal1');
      for(const suffix of [`${randomUUID()}/hold`,`${randomUUID()}/release-hold`,
        `allocations/${randomUUID()}/resolve-journey`,`allocations/${randomUUID()}/resolve-settlement`]){
        const denied=await request(createApp()).post(`${path}/${suffix}`).set('Cookie',onDuty.cookie)
          .set('Origin','http://localhost:3000').set('X-CSRF-Token',onDuty.csrf)
          .set('Idempotency-Key',randomUUID()).send({reason:'Private support evidence'});
        expect(denied.body.error.code,suffix).toBe('MFA_REQUIRED');
      }
    }finally{await clearSeatRecoveryOperator();}
  });
  it('ticket 09 delivers hold, release, cancellation, replacement and expiry notices from their producers',async()=>{
    const f=await bookingFixture(),passenger=await participant(),pending=await participant();
    const id=await f.ask(passenger);await f.ask(pending);
    expect((await f.call(f.driver.token,`${path}/requests/${id}/accept`,{})).status).toBe(200);
    const onDuty=await seatRecoveryOperator();
    try{
      for(const [suffix,event] of [['hold','hold'],['release-hold','release_hold']]){
        const key=randomUUID();
        const perform=()=>request(f.app).post(`${path}/${f.offer}/${suffix}`).set('Cookie',onDuty.cookie)
          .set('Origin','http://localhost:3000').set('X-CSRF-Token',onDuty.csrf)
          .set('Idempotency-Key',key).send({reason:'Private support evidence'});
        const response=await perform();expect(response.status,JSON.stringify(response.body)).toBe(200);
        expect((await perform()).body.operation_id).toBe(response.body.operation_id);
        await deliverRouteNotices(response.body.operation_id,event,[f.driver.id,passenger.id]);
      }
    }finally{await clearSeatRecoveryOperator();}
    const cancelled=await f.call(f.driver.token,`${path}/${f.offer}/cancel`,{reason:'Private support evidence'});
    expect(cancelled.status).toBe(200);
    await deliverRouteNotices(cancelled.body.operation_id,'driver_cancel',[f.driver.id,passenger.id,pending.id]);
    const replacement=await f.call(f.driver.token,path,{vehicle_id:f.driver.vehicle,mode:'car',
      origin:f.selection.pickup,destination:f.selection.dropoff,departure_at:departure(),capacity:1,replaces_offer_id:f.offer});
    expect(replacement.status).toBe(201);
    const prepared=(await verificationPool.query<{operation_id:string}>(`SELECT operation_id FROM pilot_notification_events
      WHERE related_entity_id=$1 AND event_type='prepared'`,[replacement.body.offer.id])).rows[0];
    await deliverRouteNotices(prepared.operation_id,'prepared',[f.driver.id]);
    const fresh=await f.call(passenger.token,`${path}/${replacement.body.offer.id}/requests`,f.selection);
    expect(fresh.status).toBe(201);
    await verificationPool.query("UPDATE posted_route_seat_requests SET decision_deadline_at=now()-interval '1 second' WHERE id=$1",[fresh.body.request.id]);
    expect((await expirePilotSeatRequests(verificationPool)).expired).toBe(1);
    await deliverRouteNotices(fresh.body.request.id,'expired',[f.driver.id,passenger.id]);
    expect((await expirePilotSeatRequests(verificationPool)).expired).toBe(0);
    const visible=await request(f.app).get('/v1/notifications/durable').set('Authorization',`Bearer ${passenger.token}`);
    expect(visible.body.notifications.some((item:{event_type:string;related_entity_id:string})=>
      item.event_type==='expired'&&item.related_entity_id===fresh.body.request.id)).toBe(true);
  });
  it('ticket 09 delivers private journey review, UPI dispute and settlement decision notices',async()=>{
    const f=await bookingFixture(2),passenger=await participant(),other=await participant();
    const id=await f.ask(passenger),otherId=await f.ask(other);
    const seat=(await f.call(f.driver.token,`${path}/requests/${id}/accept`,{})).body.booking.id as string;
    const otherSeat=(await f.call(f.driver.token,`${path}/requests/${otherId}/accept`,{})).body.booking.id as string;
    await moveToRouteDeparture(f.offer);
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat,otherSeat]})).status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/driver-journey`,{travelled:true,completed:true})).status).toBe(200);
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/passenger-journey`,{travelled:true,completed:false})).status).toBe(200);
    const onDuty=await seatRecoveryOperator();
    const decide=(suffix:string,body:unknown)=>request(f.app).post(`${path}/allocations/${seat}/${suffix}`)
      .set('Cookie',onDuty.cookie).set('Origin','http://localhost:3000').set('X-CSRF-Token',onDuty.csrf)
      .set('Idempotency-Key',randomUUID()).send(body);
    try{
      const journey=await decide('resolve-journey',{outcome:'travelled',reason:'Private support evidence'});
      expect(journey.status,JSON.stringify(journey.body)).toBe(200);
      await deliverRouteNotices(journey.body.operation_id,'operator_journey',[f.driver.id,passenger.id]);
      await clearSeatRecoveryOperator();
      const claim=await f.call(passenger.token,`${path}/allocations/${seat}/payment-claim`,{method:'upi'});
      expect(claim.status).toBe(200);
      await deliverRouteNotices(claim.body.operation_id,'payment_claim',[f.driver.id,passenger.id]);
      const dispute=await f.call(f.driver.token,`${path}/allocations/${seat}/dispute`,{});
      expect(dispute.status).toBe(200);
      await deliverRouteNotices(dispute.body.operation_id,'dispute',[f.driver.id,passenger.id]);
      await onDuty.resume();
      const settlement=await decide('resolve-settlement',{receipt_established:false,reason:'Private support evidence'});
      expect(settlement.status,JSON.stringify(settlement.body)).toBe(200);
      await deliverRouteNotices(settlement.body.operation_id,'operator_settlement',[f.driver.id,passenger.id]);
      await clearSeatRecoveryOperator();
      const unrelated=await request(f.app).get('/v1/notifications/durable').set('Authorization',`Bearer ${other.token}`);
      expect(unrelated.body.notifications.filter((item:{event_type:string})=>
        ['operator_journey','payment_claim','dispute','operator_settlement'].includes(item.event_type))).toEqual([]);
      expect((await verificationPool.query(`SELECT receipt_established FROM posted_route_settlement_reviews r
        JOIN posted_route_obligations o ON o.id=r.obligation_id WHERE o.allocation_id=$1`,[seat])).rows[0].receipt_established).toBe(false);
    }finally{await clearSeatRecoveryOperator();}
  });
  it('shows an unanswered request as expired at its deadline even before a worker sweep',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    await verificationPool.query("UPDATE posted_route_seat_requests SET decision_deadline_at=now()-interval '1 second' WHERE id=$1",[id]);
    const visible=await request(f.app).get(`${path}/requests/${id}`)
      .set('Authorization',`Bearer ${passenger.token}`);
    expect(visible.status).toBe(200);
    expect(visible.body.request.status).toBe('expired');
    expect((await f.call(f.driver.token,`${path}/requests/${id}/accept`,{})).status).toBe(409);
  });
  it('persists expired route requests with audit and notification work in a repeatable worker sweep',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    await verificationPool.query("UPDATE posted_route_seat_requests SET decision_deadline_at=now()-interval '1 second' WHERE id=$1",[id]);
    expect((await expirePilotSeatRequests(verificationPool)).expired).toBe(1);
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_requests WHERE id=$1',[id])).rows[0].status)
      .toBe('expired');
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM audit_logs
      WHERE action='posted_route_seat_expired' AND entity_id=$1`,[id])).rows[0].n).toBe(1);
    expect((await verificationPool.query<{n:number}>(`SELECT count(*)::int AS n FROM pilot_email_jobs j
      JOIN pilot_notification_events e ON e.id=j.event_id
      WHERE e.origin_type='posted_route_seat_expiry' AND e.related_entity_id=$1`,[id])).rows[0].n).toBe(2);
    expect((await expirePilotSeatRequests(verificationPool)).expired).toBe(0);
  });
  it.each([false,true])('keeps expiry notices pending while the original request acknowledgement is uncertain (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),passenger=await participant(),id=await f.ask(passenger);
    await verificationPool.query("UPDATE posted_route_seat_requests SET decision_deadline_at=now()-interval '1 second' WHERE id=$1",[id]);
    await verificationPool.query("UPDATE posted_route_seat_operations SET state='committed' WHERE request_id=$1",[id]);
    expect((await expirePilotSeatRequests(verificationPool)).expired).toBe(0);
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_requests WHERE id=$1',[id])).rows[0].status)
      .toBe('pending');
  });
  it('reconciles acknowledged request evidence after its deterministic expiry',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const deadline=(await verificationPool.query<{decision_deadline_at:Date}>(
      'SELECT decision_deadline_at FROM posted_route_seat_requests WHERE id=$1',[id])).rows[0].decision_deadline_at;
    await expirePilotSeatRequests(verificationPool,new Date(deadline.getTime()+1000));
    const operator=await seatRecoveryOperator();
    try{
      const reconciled=await request(f.app).post('/v1/operator/reconcile')
        .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
        .set('X-CSRF-Token',operator.csrf).send({});
      expect(reconciled.status,JSON.stringify(reconciled.body)).toBe(200);
    }finally{await clearSeatRecoveryOperator();}
  });
  it('rejects an expired request without its atomic expiry audit and notices',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    await verificationPool.query(`UPDATE posted_route_seat_requests
      SET status='expired',decided_at=decision_deadline_at WHERE id=$1`,[id]);
    const operator=await seatRecoveryOperator();
    try{
      const reconciled=await request(f.app).post('/v1/operator/reconcile')
        .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
        .set('X-CSRF-Token',operator.csrf).send({});
      expect(reconciled.status).toBe(409);
      expect(reconciled.body.error.code).toBe('RECOVERY_CONFLICT');
    }finally{await clearSeatRecoveryOperator();}
  });
  it('keeps a request pending and freezes a freshly computed whole-ride segment on acceptance',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations')).rows[0].n).toBe(0);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.booking.accepted_terms).toMatchObject({route_id:f.offer,route_version:1,
      pickup:f.selection.pickup,dropoff:f.selection.dropoff,segment_meters:1005,
      distance_source:'saved_posted_route',vehicle_category:'car',rate_paise_per_km:700,
      rounding_rule:'nearest_paise_half_up',policy_version:'unrestricted-route-contribution-2026-10-04.1',
      currency:'INR',total_paise:704,additional_charges_paise:0});
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations WHERE offer_id=$1',[f.offer])).rows[0].n).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_notification_events WHERE origin_type='posted_route_seat' AND ready_at IS NOT NULL")).rows[0].n).toBe(3);
    const departure=(await verificationPool.query<{departure_at:Date}>(
      'SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    const incompatible=await f.call(passenger.token,path,{vehicle_id:passenger.vehicle,mode:'car',
      origin:f.selection.pickup,destination:f.selection.dropoff,
      departure_at:departure.toISOString(),capacity:1});
    expect(incompatible.body.error.code).toBe('COMMITMENT_CONFLICT');
    await verificationPool.query(`UPDATE pilot_email_jobs SET attempts=1,last_error='synthetic delivery failure'
      WHERE event_id IN (SELECT id FROM pilot_notification_events
        WHERE origin_type='posted_route_seat' AND operation_id=$1)`,[accepted.body.operation_id]);
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',
      [accepted.body.booking.id])).rows[0].status).toBe('confirmed');
    await expect(verificationPool.query(`UPDATE posted_route_seat_allocations
      SET accepted_terms=jsonb_set(accepted_terms,'{total_paise}','1'::jsonb)
      WHERE id=$1`,[accepted.body.booking.id])).rejects.toMatchObject({code:'23514'});
  });
  it.each([false,true])('serializes two acceptance HTTP calls for the final seat using separate PostgreSQL connections (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),a=await participant(),b=await participant();
    const [connectionA,connectionB]=await Promise.all([pool.connect(),pool.connect()]);
    try{const [pidA,pidB]=await Promise.all([connectionA.query('SELECT pg_backend_pid() AS pid'),
      connectionB.query('SELECT pg_backend_pid() AS pid')]);
      expect(pidA.rows[0].pid).not.toBe(pidB.rows[0].pid);
    }finally{connectionA.release();connectionB.release();}
    const [aId,bId]=[await f.ask(a),await f.ask(b)];
    const [one,two]=await Promise.all([
      f.call(f.driver.token,`${path}/requests/${aId}/accept`,{}),
      f.call(f.driver.token,`${path}/requests/${bId}/accept`,{})]);
    expect([one.status,two.status].sort()).toEqual([200,409]);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations WHERE offer_id=$1',[f.offer])).rows[0].n).toBe(1);
  });
  it.each([false,true])('allows two whole-ride seats while serializing a passenger conflict across offers (published=%s)',async(published)=>{
    const first=await bookingFixture(2,published),second=await bookingFixture(1,published);
    const shared=await participant(),other=await participant();
    const firstId=await first.ask(shared),secondId=await second.ask(shared),otherId=await first.ask(other);
    const [a,b]=await Promise.all([
      first.call(first.driver.token,`${path}/requests/${firstId}/accept`,{}),
      second.call(second.driver.token,`${path}/requests/${secondId}/accept`,{})]);
    expect([a.status,b.status].sort()).toEqual([200,409]);
    const losingId=a.status===200?secondId:firstId;
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_requests WHERE id=$1',[losingId])).rows[0].status).toBe('withdrawn');
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='posted_route_seat_withdrawn' AND entity_id=$1",[losingId])).rows[0].n).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_notification_events WHERE origin_type='posted_route_seat' AND event_type=$1",[`withdrawn:${losingId}`])).rows[0].n).toBe(1);
    expect((await first.call(first.driver.token,`${path}/requests/${otherId}/accept`,{})).status).toBe(200);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations WHERE passenger_id=$1',[shared.id])).rows[0].n).toBe(1);
  });
  it.each([false,true])('treats two declarations of the same registration as one overlapping vehicle (published=%s)',async(published)=>{
    const first=await bookingFixture(1,published),second=await bookingFixture(1,published);
    await verificationPool.query(`UPDATE unrestricted_vehicle_declarations
      SET registration_identifier=(SELECT registration_identifier FROM unrestricted_vehicle_declarations WHERE id=$1)
      WHERE id=$2`,[first.driver.vehicle,second.driver.vehicle]);
    const a=await participant(),b=await participant();
    const aId=await first.ask(a),bId=await second.ask(b);
    const [one,two]=await Promise.all([
      first.call(first.driver.token,`${path}/requests/${aId}/accept`,{}),
      second.call(second.driver.token,`${path}/requests/${bId}/accept`,{})]);
    expect([one.status,two.status].sort()).toEqual([200,409]);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations')).rows[0].n).toBe(1);
  });
  it.each([false,true])('blocks a new request when an overlapping legacy offer has the same registration suffix (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),passenger=await participant(),legacyDriver=await participant();
    const pending=await f.ask(passenger);
    const registration=(await verificationPool.query<{registration_identifier:string}>(
      'SELECT registration_identifier FROM unrestricted_vehicle_declarations WHERE id=$1',
      [f.driver.vehicle])).rows[0].registration_identifier;
    const suffix=registration.slice(-4);
    const vehicle=(await verificationPool.query<{id:string}>(`INSERT INTO vehicles
      (owner_user_id,vehicle_type,registration_number_last4,seat_capacity)
      VALUES($1,'car',$2,2) RETURNING id`,[legacyDriver.id,suffix])).rows[0].id;
    const timing=(await verificationPool.query<{departure_at:Date;commitment_until:Date}>(
      'SELECT departure_at,commitment_until FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0];
    await verificationPool.query(`INSERT INTO ride_offers(driver_id,vehicle_id,pickup_location,pickup_lat,pickup_lng,
      drop_location,drop_lat,drop_lng,date,time,available_seats,price_per_seat_paise,pilot_commitment_until)
      VALUES($1,$2,'Legacy origin',20.9,77.75,'Legacy destination',20.9,77.76,
        ($3::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,
        ($3::timestamptz AT TIME ZONE 'Asia/Kolkata')::time,1,2500,$4)`,
      [legacyDriver.id,vehicle,timing.departure_at,timing.commitment_until]);
    const asked=await f.call(passenger.token,`${path}/${f.offer}/requests`,f.selection);
    expect(asked.body.error.code).toBe('COMMITMENT_CONFLICT');
    expect((await f.call(f.driver.token,`${path}/requests/${pending}/accept`,{})).body.error.code).toBe('COMMITMENT_CONFLICT');
  });
  it.each([false,true])('serializes declaration revocation and pause against acceptance on independent connections (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),passenger=await participant(),id=await f.ask(passenger);
    const revoker=await verificationPool.connect();
    try{
      await revoker.query('BEGIN');
      await revoker.query('SELECT id FROM unrestricted_vehicle_declarations WHERE id=$1 FOR UPDATE',[f.driver.vehicle]);
      const accepting=Promise.resolve(f.call(f.driver.token,`${path}/requests/${id}/accept`,{}));
      await revoker.query('UPDATE unrestricted_vehicle_declarations SET revoked_at=now() WHERE id=$1',[f.driver.vehicle]);
      await revoker.query('COMMIT');
      expect((await accepting).body.error.code).toBe('VEHICLE_DECLARATION_REQUIRED');
    }finally{await revoker.query('ROLLBACK');revoker.release();}
    await verificationPool.query('UPDATE unrestricted_vehicle_declarations SET revoked_at=NULL WHERE id=$1',[f.driver.vehicle]);
    const pauser=await verificationPool.connect();
    try{
      await pauser.query('BEGIN');
      await pauser.query("SELECT capability FROM pilot_pause_state WHERE capability='acceptance' FOR UPDATE");
      const accepting=Promise.resolve(f.call(f.driver.token,`${path}/requests/${id}/accept`,{}));
      await pauser.query("UPDATE pilot_pause_state SET paused=true WHERE capability='acceptance'");
      await pauser.query('COMMIT');
      expect((await accepting).body.error.code).toBe('PILOT_PAUSED');
    }finally{await pauser.query('ROLLBACK');pauser.release();
      await verificationPool.query("UPDATE pilot_pause_state SET paused=false WHERE capability='acceptance'");}
  });
  it('rechecks revocation, pause, route version and payload retries at acceptance',async()=>{
    const f=await bookingFixture(),passenger=await participant(),requestKey=randomUUID();
    const requested=await f.call(passenger.token,`${path}/${f.offer}/requests`,f.selection,requestKey);
    expect(requested.status).toBe(201);
    const id=requested.body.request.id as string;
    expect((await f.call(passenger.token,`${path}/${f.offer}/requests`,
      {...f.selection,route_version:2},requestKey)).body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    const key=randomUUID(),original=await f.call(f.driver.token,`${path}/requests/${id}/reject`,{},key);
    expect(original.status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/requests/${id}/accept`,{},key)).body.error.code)
      .toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    const second=await f.ask(passenger);
    await verificationPool.query('UPDATE adult_declarations SET withdrawn_at=now() WHERE user_id=$1',[passenger.id]);
    expect((await f.call(f.driver.token,`${path}/requests/${second}/accept`,{})).body.error.code)
      .toBe('ADULT_DECLARATION_REQUIRED');
    await verificationPool.query('UPDATE adult_declarations SET withdrawn_at=NULL WHERE user_id=$1',[passenger.id]);
    await verificationPool.query('UPDATE posted_route_offers SET route_version=2 WHERE id=$1',[f.offer]);
    expect((await f.call(f.driver.token,`${path}/requests/${second}/accept`,{})).body.error.code)
      .toBe('ROUTE_VERSION_STALE');
    await verificationPool.query('UPDATE posted_route_offers SET route_version=1 WHERE id=$1',[f.offer]);
    await verificationPool.query("UPDATE posted_route_offers SET cumulative_meters='[0,1006]'::jsonb,distance_meters=1006 WHERE id=$1",[f.offer]);
    expect((await f.call(f.driver.token,`${path}/requests/${second}/accept`,{})).body.error.code)
      .toBe('SEGMENT_TERMS_CHANGED');
    await verificationPool.query("UPDATE posted_route_offers SET cumulative_meters='[0,1005]'::jsonb,distance_meters=1005 WHERE id=$1",[f.offer]);
    process.env.ROUTE_SUPPORT_WINDOW_APPROVED='false';
    expect((await f.call(f.driver.token,`${path}/requests/${second}/accept`,{})).body.error.code)
      .toBe('SUPPORT_WINDOW_UNAVAILABLE');
    process.env.ROUTE_SUPPORT_WINDOW_APPROVED='true';
    await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='acceptance'");
    expect((await f.call(f.driver.token,`${path}/requests/${second}/accept`,{})).body.error.code)
      .toBe('PILOT_PAUSED');
    await verificationPool.query("UPDATE pilot_pause_state SET paused=false WHERE capability='acceptance'");
  });
  it.each([false,true])('rolls back request state if audit or notification work insertion fails (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),passenger=await participant(),id=await f.ask(passenger);
    for(const table of ['audit_logs','pilot_notification_events','pilot_email_jobs']){
      const functionName=`ticket12_reject_${table}`;
      const condition=table==='audit_logs'?"NEW.entity_type='posted_route_seat_request'":
        table==='pilot_notification_events'?"NEW.origin_type='posted_route_seat'":
          "EXISTS(SELECT 1 FROM pilot_notification_events WHERE id=NEW.event_id AND origin_type='posted_route_seat')";
      await verificationPool.query(`CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF ${condition} THEN RAISE EXCEPTION SQLSTATE 'PT012' USING MESSAGE='injected failure'; END IF; RETURN NEW; END $$`);
      await verificationPool.query(`CREATE TRIGGER ${functionName} BEFORE INSERT ON ${table}
        FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
      try{const failed=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
        expect(failed.status,JSON.stringify(failed.body)).toBe(500);}
      finally{await verificationPool.query(`DROP TRIGGER ${functionName} ON ${table}`);
        await verificationPool.query(`DROP FUNCTION ${functionName}()`);}
      expect((await verificationPool.query('SELECT status FROM posted_route_seat_requests WHERE id=$1',[id])).rows[0].status).toBe('pending');
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations WHERE request_id=$1',[id])).rows[0].n).toBe(0);
    }
  });
  it.each([false,true])('reports an uncertain receipt and completes the same operation after evidence returns (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),passenger=await participant(),id=await f.ask(passenger);
    const receiptDirectory=resolve(directory,'receipts.posted-route-seat'),key=randomUUID();
    await chmod(receiptDirectory,0o500);
    try{
      const uncertain=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{},key);
      expect(uncertain.body.error.code).toBe('OPERATION_PENDING');
      const status=await request(f.app).get(`${path}/seat-operations/${uncertain.body.error.details.operationId}`)
        .set('Authorization',`Bearer ${f.driver.token}`);
      expect(status.body.operation).toEqual({operation_id:uncertain.body.error.details.operationId,
        state:'pending_unknown'});
      const requestView=await request(f.app).get(`${path}/requests/${id}`)
        .set('Authorization',`Bearer ${passenger.token}`);
      expect(requestView.body.error.code).toBe('OPERATION_PENDING');
      expect((await verificationPool.query('SELECT status FROM posted_route_seat_requests WHERE id=$1',[id])).rows[0].status).toBe('accepted');
      expect((await verificationPool.query("SELECT mode FROM pilot_recovery_state WHERE singleton=true")).rows[0].mode).toBe('restricted');
    }finally{await chmod(receiptDirectory,0o700);}
    const retried=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{},key);
    expect(retried.status,JSON.stringify(retried.body)).toBe(200);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations WHERE request_id=$1',[id])).rows[0].n).toBe(1);
  });
  it.each([false,true])('restores an acknowledged seat and audit from an independent receipt (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
    const allocationId=accepted.body.booking.id,operationId=accepted.body.operation_id;
    await verificationPool.query('DELETE FROM posted_route_seat_operations');
    await verificationPool.query('DELETE FROM posted_route_seat_allocations');
    await verificationPool.query('DELETE FROM posted_route_seat_requests');
    await verificationPool.query("DELETE FROM audit_logs WHERE entity_type='posted_route_seat_request'");
    const operator=(await verificationPool.query<{id:string}>(`INSERT INTO users(email,role,email_verified_at)
      VALUES($1,'admin',now()) RETURNING id`,[`operator-${randomUUID()}@example.test`])).rows[0].id;
    await verificationPool.query(`INSERT INTO operator_allowlist(user_id,active,reason,reviewed_at)
      VALUES($1,true,'ticket 12 synthetic restore',now())`,[operator]);
    const recovery=(await import('../modules/posted-routes/seat-booking.service')).postedRouteSeatRecovery;
    await expect(recovery.reconcileReceipts(operator)).resolves.toBeGreaterThan(0);
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_requests WHERE id=$1',[id])).rows[0].status).toBe('accepted');
    expect((await verificationPool.query('SELECT id,accepted_terms FROM posted_route_seat_allocations WHERE id=$1',[allocationId])).rows[0]).toEqual({id:allocationId,accepted_terms:accepted.body.booking.accepted_terms});
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM audit_logs WHERE metadata->>'operationId'=$1",[operationId])).rows[0].n).toBe(1);
  });
  it('does not publish recovery evidence for a committed request whose stored state conflicts',async()=>{
    const f=await bookingFixture(),passenger=await participant();
    const id=await f.ask(passenger);
    const operation=(await verificationPool.query<{id:string}>(
      "SELECT id FROM posted_route_seat_operations WHERE request_id=$1",[id])).rows[0].id;
    const receiptPath=resolve(directory,'receipts.posted-route-seat',`${operation}.json`);
    await rm(receiptPath);
    await verificationPool.query("UPDATE posted_route_seat_operations SET state='committed' WHERE id=$1",[operation]);
    await verificationPool.query("UPDATE posted_route_seat_requests SET proposed_terms='{}'::jsonb WHERE id=$1",[id]);
    const operator=await seatRecoveryOperator();
    try{
      const reconciled=await request(f.app).post('/v1/operator/reconcile')
        .set('Cookie',operator.cookie)
        .set('Origin','http://localhost:3000')
        .set('X-CSRF-Token',operator.csrf)
        .send({});
      expect(reconciled.status).toBe(409);
      await expect(readFile(receiptPath)).rejects.toMatchObject({code:'ENOENT'});
    }finally{await clearSeatRecoveryOperator();}
  });
  it('does not publish recovery evidence for a committed operation with a conflicting digest',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const operation=(await verificationPool.query<{id:string}>(
      'SELECT id FROM posted_route_seat_operations WHERE request_id=$1',[id])).rows[0].id;
    const receiptPath=resolve(directory,'receipts.posted-route-seat',`${operation}.json`);
    await rm(receiptPath);
    await verificationPool.query("UPDATE posted_route_seat_operations SET state='committed',payload_digest='bad' WHERE id=$1",[operation]);
    const operator=await seatRecoveryOperator();
    try{
      const reconciled=await request(f.app).post('/v1/operator/reconcile')
        .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
        .set('X-CSRF-Token',operator.csrf).send({});
      expect(reconciled.status).toBe(409);
      await expect(readFile(receiptPath)).rejects.toMatchObject({code:'ENOENT'});
    }finally{await clearSeatRecoveryOperator();}
  });
  it('keeps request and acceptance endpoints disabled outside synthetic tests',async()=>{
    const f=await bookingFixture(),passenger=await participant();
    process.env.NODE_ENV='production';
    try{const response=await f.call(passenger.token,`${path}/${f.offer}/requests`,f.selection);
      expect(response.body.error.code).toBe('ROUTE_BOOKINGS_DISABLED');}
    finally{process.env.NODE_ENV='test';}
  });
  it.each([false,true])('cancels a frozen route seat with an idempotent audited operation and releases whole-ride capacity (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    const seat=accepted.body.booking.id as string,key=randomUUID();
    const cancel=()=>f.call(passenger.token,`${path}/allocations/${seat}/cancel`,{reason:'Plans changed'},key);
    const first=await cancel();
    expect(first.status,JSON.stringify(first.body)).toBe(200);
    expect((await cancel()).body.operation_id).toBe(first.body.operation_id);
    const changed=await f.call(passenger.token,`${path}/allocations/${seat}/cancel`,{reason:'Different reason'},key);
    expect(changed.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status)
      .toBe('cancelled');
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='posted_route_passenger_cancel' AND metadata->>'operationId'=$1",
      [first.body.operation_id])).rows[0].n).toBe(1);
    const next=await participant(),nextId=await f.ask(next);
    expect((await f.call(f.driver.token,`${path}/requests/${nextId}/accept`,{})).status).toBe(200);
  });
  it('cancels a route and its requests without creating travel or an obligation',async()=>{
    const f=await bookingFixture(),a=await participant(),b=await participant();
    const aId=await f.ask(a),bId=await f.ask(b);
    const accepted=await f.call(f.driver.token,`${path}/requests/${aId}/accept`,{});
    expect(accepted.status).toBe(200);
    const cancelled=await f.call(f.driver.token,`${path}/${f.offer}/cancel`,{reason:'Route changed materially'});
    expect(cancelled.status,JSON.stringify(cancelled.body)).toBe(200);
    await (await import('../modules/posted-routes/outcomes.service')).postedRouteOutcomesService.verifyEvidence();
    expect(cancelled.body.withdrawn_request_ids).toContain(bId);
    expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status)
      .toBe('cancelled');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[accepted.body.booking.id]})).body.error.code)
      .toBe('DEPARTURE_INVALID');
  });
  it('replaces a cancelled route with a new identity and requires fresh seat requests',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    expect(accepted.status).toBe(200);
    const cancelled=await f.call(f.driver.token,`${path}/${f.offer}/cancel`,
      {reason:'Material route and stopping point change'});
    expect(cancelled.status).toBe(200);
    const replacement=await f.call(f.driver.token,path,{vehicle_id:f.driver.vehicle,mode:'car',
      origin:f.selection.pickup,destination:f.selection.dropoff,departure_at:departure(),capacity:1,
      replaces_offer_id:f.offer});
    expect(replacement.status,JSON.stringify(replacement.body)).toBe(201);
    expect(replacement.body.offer).toMatchObject({replaces_offer_id:f.offer,route_version:1});
    expect(replacement.body.offer.id).not.toBe(f.offer);
    const old=await request(f.app).get(`${path}/${f.offer}`).set('Authorization',`Bearer ${f.driver.token}`);
    expect(old.body.offer.status).toBe('cancelled');
    expect((await f.call(f.driver.token,`${path}/requests/${id}/accept`,{})).status).toBe(409);
    const fresh=await f.call(passenger.token,`${path}/${replacement.body.offer.id}/requests`,f.selection);
    expect(fresh.status,JSON.stringify(fresh.body)).toBe(201);
    expect(fresh.body.request.id).not.toBe(id);
    const duplicate=await f.call(f.driver.token,path,{vehicle_id:f.driver.vehicle,mode:'car',
      origin:f.selection.pickup,destination:f.selection.dropoff,departure_at:departure(),capacity:1,
      replaces_offer_id:f.offer});
    expect(duplicate.body.error.code).toBe('REPLACEMENT_EXISTS');
  });
  it('sends an attempted post-departure cancellation to incident review without creating travel or debt',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    expect(accepted.status).toBe(200);
    const seat=accepted.body.booking.id as string;
    await moveToRouteDeparture(f.offer);
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]})).status).toBe(200);
    const attempted=await f.call(passenger.token,`${path}/allocations/${seat}/cancel`,
      {reason:'I need to report an interruption'});
    expect(attempted.status,JSON.stringify(attempted.body)).toBe(200);
    expect(attempted.body).toMatchObject({action:'incident_report',incident_type:'attempted_cancellation'});
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status)
      .toBe('confirmed');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/driver-journey`,
      {travelled:true,completed:true})).status).toBe(200);
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/passenger-journey`,
      {travelled:true,completed:true})).status).toBe(200);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
    const operator=await seatRecoveryOperator();
    try{const queue=await request(f.app).get(`${path}/incidents`)
        .set('Cookie',operator.cookie).set('Origin','http://localhost:3000');
      expect(queue.status,JSON.stringify(queue.body)).toBe(200);
      expect(queue.body.incidents).toContainEqual(expect.objectContaining({id:attempted.body.incident_id,
        allocation_id:seat,status:'open',kind:'attempted_cancellation'}));
      const resolved=await request(f.app).post(`${path}/incidents/${attempted.body.incident_id}/resolve`)
        .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
        .set('X-CSRF-Token',operator.csrf).set('Idempotency-Key',randomUUID())
        .send({reason:'Reviewed participant report and kept trip history unchanged',evidence_refs:[]});
      expect(resolved.status,JSON.stringify(resolved.body)).toBe(200);
      expect((await request(f.app).get(`${path}/incidents`).set('Cookie',operator.cookie)
        .set('Origin','http://localhost:3000')).body.incidents).toEqual([]);
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
    }finally{await clearSeatRecoveryOperator();}
  });
  it('records a driver-reported boarding absence as a high-priority incident without assuming travel',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    const seat=accepted.body.booking.id as string;
    await moveToRouteDeparture(f.offer);
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[]})).status).toBe(200);
    const reported=await f.call(f.driver.token,`${path}/allocations/${seat}/incidents`,
      {kind:'absence',reason:'Passenger did not board at pickup'});
    expect(reported.status,JSON.stringify(reported.body)).toBe(200);
    expect(reported.body).toMatchObject({action:'incident_report',incident_type:'absence'});
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
    const stranger=await participant();
    expect((await f.call(stranger.token,`${path}/allocations/${seat}/incidents`,
      {kind:'safety',reason:'Synthetic unrelated report'})).status).toBe(403);
  });
  it('records boarding, mutual journey, cash claim and independent receipt at the accepted price',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    expect(accepted.status).toBe(200);
    const seat=accepted.body.booking.id as string;
    const early=await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]});
    expect(early.body.error.code).toBe('DEPARTURE_WINDOW_CLOSED');
    await moveToRouteDeparture(f.offer);
    const departed=await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]});
    expect(departed.status,JSON.stringify(departed.body)).toBe(200);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
    const driver=await f.call(f.driver.token,`${path}/allocations/${seat}/driver-journey`,
      {travelled:true,completed:true});
    expect(driver.status,JSON.stringify(driver.body)).toBe(200);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
    const confirmed=await f.call(passenger.token,`${path}/allocations/${seat}/passenger-journey`,
      {travelled:true,completed:true});
    expect(confirmed.status,JSON.stringify(confirmed.body)).toBe(200);
    const obligation=(await verificationPool.query<{amount_paise:number;accepted_route_version:number;
      accepted_segment:{segment_meters:number}}>(`SELECT amount_paise,accepted_route_version,accepted_segment
      FROM posted_route_obligations WHERE allocation_id=$1`,[seat])).rows[0];
    expect(obligation).toMatchObject({amount_paise:704,accepted_route_version:1,
      accepted_segment:{segment_meters:1005}});
    const claimed=await f.call(passenger.token,`${path}/allocations/${seat}/payment-claim`,{method:'cash'});
    expect(claimed.status,JSON.stringify(claimed.body)).toBe(200);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_receipt_decisions')).rows[0].n).toBe(0);
    const receipt=await f.call(f.driver.token,`${path}/allocations/${seat}/receipt`,{});
    expect(receipt.status,JSON.stringify(receipt.body)).toBe(200);
    expect((await verificationPool.query("SELECT kind FROM posted_route_receipt_decisions")).rows[0].kind).toBe('receipt');
    const recovery=(await import('../modules/posted-routes/outcomes.service')).postedRouteOutcomesService;
    await recovery.verifyEvidence();
    await verificationPool.query('DELETE FROM posted_route_receipt_decisions WHERE operation_id=$1',
      [receipt.body.operation_id]);
    await expect(recovery.verifyEvidence()).rejects.toMatchObject({code:'RECOVERY_UNAVAILABLE'});
    expect((await verificationPool.query('SELECT mode FROM pilot_recovery_state WHERE singleton=true')).rows[0].mode)
      .toBe('restricted');
  });
  it('ticket 13 delayed producer notifies participants and operators without starting or cancelling',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    const operator=await seatRecoveryOperator();await clearSeatRecoveryOperator();
    const {produceRouteOutcomeNotices}=await import('../../../worker/src/jobs/posted-route-outcomes');
    expect(await produceRouteOutcomeNotices(verificationPool,new Date(scheduled.getTime()+31*60000))).toBe(1);
    expect(await produceRouteOutcomeNotices(verificationPool,new Date(scheduled.getTime()+31*60000))).toBe(0);
    await deliverRouteNotices(f.offer,'delayed_departure',[f.driver.id,passenger.id,operator.id]);
    expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status).toBe('prepared');
    expect((await verificationPool.query('SELECT accepted_terms FROM posted_route_seat_allocations WHERE id=$1',[accepted.body.booking.id])).rows[0].accepted_terms).toEqual(accepted.body.booking.accepted_terms);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
  });
  it('ticket 13 silence and overdue producers preserve decisions and deliver exact recipients',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]})).status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/driver-journey`,{travelled:true,completed:true})).status).toBe(200);
    const operator=await seatRecoveryOperator();await clearSeatRecoveryOperator();
    const {produceRouteOutcomeNotices}=await import('../../../worker/src/jobs/posted-route-outcomes');
    const later=new Date(Date.now()+25*3600000);
    expect(await produceRouteOutcomeNotices(verificationPool,later)).toBe(1);
    expect(await produceRouteOutcomeNotices(verificationPool,later)).toBe(0);
    await deliverRouteNotices(seat,'journey_silence',[f.driver.id,passenger.id,operator.id]);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/passenger-journey`,{travelled:true,completed:true})).status).toBe(200);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
    await operator.resume();
    const decision=await request(f.app).post(`${path}/allocations/${seat}/resolve-journey`)
      .set('Cookie',operator.cookie).set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf)
      .set('Idempotency-Key',randomUUID()).send({outcome:'travelled',reason:'Both participants confirmed the journey'});
    expect(decision.status,JSON.stringify(decision.body)).toBe(200);await clearSeatRecoveryOperator();
    const obligation=(await verificationPool.query('SELECT * FROM posted_route_obligations WHERE allocation_id=$1',[seat])).rows[0];
    expect(await produceRouteOutcomeNotices(verificationPool,new Date(obligation.due_at.getTime()+1000))).toBe(1);
    await deliverRouteNotices(obligation.id,'payment_overdue',[f.driver.id,passenger.id,operator.id]);
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/payment-claim`,{method:'upi'})).status).toBe(200);
    const claim=(await verificationPool.query('SELECT * FROM posted_route_payment_claims WHERE obligation_id=$1',[obligation.id])).rows[0];
    expect(await produceRouteOutcomeNotices(verificationPool,new Date(claim.claimed_at.getTime()+25*3600000))).toBe(1);
    await deliverRouteNotices(claim.id,'receipt_silence',[f.driver.id,passenger.id,operator.id]);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_receipt_decisions')).rows[0].n).toBe(0);
    expect((await verificationPool.query('SELECT status,receipt_established FROM posted_route_settlement_reviews')).rows[0])
      .toMatchObject({status:'open',receipt_established:null});
  });
  it.each([false,true])('ticket 13 withdrawal holds future seats and reports active incidents (departed=%s)',async(departed)=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    if(departed){const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
      setOutcomeClockForTests(()=>scheduled.getTime());
      expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]})).status).toBe(200);}
    const key=randomUUID(),withdraw=()=>f.call(passenger.token,'/v1/adult-declaration/withdraw',
      {policy_version:'unrestricted-declared-2026-09-28.1'},key);
    const result=await withdraw();expect(result.status,JSON.stringify(result.body)).toBe(200);
    expect((await withdraw()).body.operation_id).toBe(result.body.operation_id);
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status)
      .toBe(departed?'confirmed':'held');
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM posted_route_incidents WHERE allocation_id=$1 AND priority='high'",[seat])).rows[0].n).toBe(departed?1:0);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
  });
  it('ticket 13 restricts a route participant from a reviewed incident and preserves active visibility',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]})).status).toBe(200);
    const incident=await f.call(passenger.token,`${path}/allocations/${seat}/incidents`,{kind:'safety',reason:'Passenger reported a safety concern'});
    const operator=await seatRecoveryOperator();
    try{
      const response=await request(f.app).post('/v1/operator/account-restrictions')
        .set('Cookie',operator.cookie).set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf)
        .set('Idempotency-Key',randomUUID()).send({target_user_id:f.driver.id,scope:'driver',
          source_type:'incident',source_id:incident.body.incident_id,reason:'Reviewed credible safety concern',
          reviewed_evidence:'Recorded participant report and operator interview'});
      expect(response.status,JSON.stringify(response.body)).toBe(200);
      expect((await verificationPool.query("SELECT count(*)::int AS n FROM posted_route_incidents WHERE offer_id=$1 AND priority='high'",[f.offer])).rows[0].n).toBe(2);
      expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status).toBe('departed');
    }finally{await clearSeatRecoveryOperator();}
  });
  it.each(['passenger','driver','vehicle'])('ticket 13 races %s revocation with departure on independent connections',async(kind)=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    const blocker=await verificationPool.connect();
    const revoke=()=>kind==='passenger'?f.call(passenger.token,'/v1/adult-declaration/withdraw',{policy_version:version}):
      f.call(f.driver.token,kind==='driver'?'/v1/driver-vehicle-declarations/driver/revoke':
        `/v1/driver-vehicle-declarations/vehicles/${f.driver.vehicle}/revoke`,{});
    let results:Awaited<ReturnType<typeof Promise.all>>;
    try{
      await blocker.query('SELECT pg_advisory_lock(93113,13)');
      const departing=Promise.resolve(f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]}));
      const revoking=Promise.resolve(revoke());
      let pids:number[]=[];
      for(let attempt=0;attempt<100&&pids.length<2;attempt++){
        pids=(await verificationPool.query<{pid:number}>(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_lock(93113, 13)%'`)).rows.map(r=>r.pid);
        if(pids.length<2)await new Promise(r=>setTimeout(r,10));
      }
      expect(new Set(pids).size).toBe(2);
      await blocker.query('SELECT pg_advisory_unlock(93113,13)');
      results=await Promise.all([departing,revoking]);
    }finally{await blocker.query('SELECT pg_advisory_unlock(93113,13)');blocker.release();}
    const [departed,revoked]=results!;
    expect(revoked.status,JSON.stringify(revoked.body)).toBe(200);
    expect([200,403,409]).toContain(departed.status);
    const state=(await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status;
    const allocation=(await verificationPool.query('SELECT status,accepted_terms FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0];
    expect(allocation.accepted_terms).toEqual(accepted.body.booking.accepted_terms);
    if(departed.status===200){expect(state).toBe('departed');expect(allocation.status).toBe('confirmed');
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_incidents WHERE offer_id=$1',[f.offer])).rows[0].n).toBe(1);
    }else{expect(state).toBe(kind==='passenger'?'prepared':'held');expect(allocation.status).toBe('held');}
  });
  it('ticket 13 operator settlement requires recipient evidence and preserves its audit references',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]})).status).toBe(200);
    for(const [token,role] of [[f.driver.token,'driver'],[passenger.token,'passenger']])
      expect((await f.call(token,`${path}/allocations/${seat}/${role}-journey`,{travelled:true,completed:true})).status).toBe(200);
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/payment-claim`,{method:'upi'})).status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/dispute`,{})).status).toBe(200);
    const operator=await seatRecoveryOperator();
    const decide=(body:unknown,key=randomUUID())=>request(f.app).post(`${path}/allocations/${seat}/resolve-settlement`)
      .set('Cookie',operator.cookie).set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf)
      .set('Idempotency-Key',key).send(body);
    try{
      expect((await decide({receipt_established:true,reason:'Payer says they paid the driver'})).body.error?.code)
        .toBe('RECIPIENT_EVIDENCE_REQUIRED');
      const body={receipt_established:true,recipient_confirmed:true,reason:'Recipient confirmed funds arrived',evidence_refs:['support-case:recipient-confirmation']};
      expect((await decide(body)).body.error?.code).toBe('RECIPIENT_CONFIRMATION_REQUIRED');
      await clearSeatRecoveryOperator();
      expect((await f.call(passenger.token,`${path}/allocations/${seat}/receipt`,{})).status).toBe(403);
      const recipientKey=randomUUID();
      const confirmed=await f.call(f.driver.token,`${path}/allocations/${seat}/receipt`,{},recipientKey);
      expect(confirmed.status,JSON.stringify(confirmed.body)).toBe(200);
      expect((await f.call(f.driver.token,`${path}/allocations/${seat}/receipt`,{},recipientKey)).body.operation_id).toBe(confirmed.body.operation_id);
      await operator.resume();
      const key=randomUUID(),resolved=await decide(body,key);
      expect(resolved.status,JSON.stringify(resolved.body)).toBe(200);
      expect((await decide(body,key)).body.operation_id).toBe(resolved.body.operation_id);
      expect((await verificationPool.query('SELECT evidence_refs,resolution_operation_id FROM posted_route_settlement_reviews')).rows[0])
        .toEqual({evidence_refs:body.evidence_refs,resolution_operation_id:resolved.body.operation_id});
      expect((await verificationPool.query('SELECT kind FROM posted_route_receipt_decisions ORDER BY kind')).rows).toEqual([{kind:'dispute'},{kind:'receipt'}]);
    }finally{await clearSeatRecoveryOperator();}
  });
  it('ticket 13 reconciles held and cancelled routes without rewriting pending request history',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),pending=await participant();
    const id=await f.ask(passenger),pendingId=await f.ask(pending);
    expect((await f.call(f.driver.token,`${path}/requests/${id}/accept`,{})).status).toBe(200);
    const operator=await seatRecoveryOperator();
    const admin=(url:string,body:unknown)=>request(f.app).post(url).set('Cookie',operator.cookie)
      .set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf).set('Idempotency-Key',randomUUID()).send(body);
    try{
      expect((await admin(`${path}/${f.offer}/hold`,{reason:'Operator reviewed a safety concern'})).status).toBe(200);
      let reconciled=await admin('/v1/operator/reconcile',{});
      expect(reconciled.status,JSON.stringify(reconciled.body)).toBe(200);
      await verificationPool.query("UPDATE pilot_recovery_state SET mode='open'");await clearSeatRecoveryOperator();
      expect((await f.call(f.driver.token,`${path}/${f.offer}/cancel`,{reason:'Material route change requires replacement'})).status).toBe(200);
      await operator.resume();
      reconciled=await admin('/v1/operator/reconcile',{});
      expect(reconciled.status,JSON.stringify(reconciled.body)).toBe(200);
      expect((await verificationPool.query('SELECT status FROM posted_route_seat_requests WHERE id=$1',[pendingId])).rows[0].status).toBe('withdrawn');
    }finally{await clearSeatRecoveryOperator();}
  });
  it('ticket 13 driver cancellation after departure creates an incident, never cancellation or debt',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]})).status).toBe(200);
    const response=await f.call(f.driver.token,`${path}/${f.offer}/cancel`,{reason:'Vehicle stopped during active journey'});
    expect(response.status,JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({action:'incident_report',incident_type:'attempted_cancellation'});
    expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status).toBe('departed');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations')).rows[0].n).toBe(0);
  });
  it('ticket 13 retains an uncertain cancellation and completes evidence on the same-key retry',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    const dir=resolve(directory,'receipts.posted-route-outcome'),key=randomUUID();
    const recovery=(await import('../modules/posted-routes/outcomes.service')).postedRouteOutcomesService;
    await recovery.verifyEvidence();await mkdir(dir,{recursive:true});await chmod(dir,0o500);
    const cancel=()=>f.call(passenger.token,`${path}/allocations/${seat}/cancel`,{reason:'Passenger plans changed'},key);
    let operation:string;
    try{const uncertain=await cancel();expect(uncertain.body.error?.code).toBe('OPERATION_PENDING');
      operation=uncertain.body.error.details.operationId;
      const status=await request(f.app).get(`${path}/outcome-operations/${operation}`).set('Authorization',`Bearer ${passenger.token}`);
      expect(status.body.operation.state).toBe('pending_unknown');
      expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status).toBe('cancelled');
    }finally{await chmod(dir,0o700);}
    const retried=await cancel();expect(retried.status,JSON.stringify(retried.body)).toBe(200);
    expect(retried.body.operation_id).toBe(operation!);
    expect((await recovery.pending()).length).toBe(0);
    expect((await recovery.receipts()).length).toBe(1);
    expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_notification_events WHERE origin_type='posted_route_outcome'")).rows[0].n).toBe(2);
  });
  it('ticket 13 departure rejects an overlapping held vehicle offer without allocations',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    // Model a preserved pre-existing conflicting offer, including a hold with no passengers.
    await verificationPool.query(`INSERT INTO posted_route_offers SELECT
      (jsonb_populate_record(NULL::posted_route_offers,to_jsonb(o)||jsonb_build_object('id',gen_random_uuid(),'status','held'))).*
      FROM posted_route_offers o WHERE id=$1`,[f.offer]);
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    const response=await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]});
    expect(response.body.error?.code).toBe('COMMITMENT_CONFLICT');
  });
  it.each(['audit_logs','pilot_notification_events','pilot_email_jobs'])('ticket 13 rolls back withdrawal and holds when %s insertion fails',async(table)=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    await verificationPool.query(`CREATE FUNCTION fail_ticket13_work() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic durable work failure' USING ERRCODE='XX000'; END $$`);
    await verificationPool.query(`CREATE TRIGGER fail_ticket13_work BEFORE INSERT ON ${table}
      FOR EACH ROW EXECUTE FUNCTION fail_ticket13_work()`);
    const key=randomUUID(),withdraw=()=>f.call(passenger.token,'/v1/adult-declaration/withdraw',{policy_version:version},key);
    try{
      expect((await withdraw()).status).toBe(500);
      expect((await verificationPool.query('SELECT withdrawn_at FROM adult_declarations WHERE user_id=$1',[passenger.id])).rows[0].withdrawn_at).toBeNull();
      expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status).toBe('confirmed');
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_outcome_operations')).rows[0].n).toBe(0);
    }finally{await verificationPool.query(`DROP TRIGGER fail_ticket13_work ON ${table}`);await verificationPool.query('DROP FUNCTION fail_ticket13_work()');}
    expect((await withdraw()).status).toBe(200);
  });
  it('ticket 13 timer work rolls back together and retries without duplicate notices',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    expect((await f.call(f.driver.token,`${path}/requests/${id}/accept`,{})).status).toBe(200);
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    const {produceRouteOutcomeNotices}=await import('../../../worker/src/jobs/posted-route-outcomes');
    await verificationPool.query(`CREATE FUNCTION fail_ticket13_timer() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic timer work failure'; END $$`);
    await verificationPool.query(`CREATE TRIGGER fail_ticket13_timer BEFORE INSERT ON pilot_email_jobs
      FOR EACH ROW EXECUTE FUNCTION fail_ticket13_timer()`);
    try{
      await expect(produceRouteOutcomeNotices(verificationPool,new Date(scheduled.getTime()+31*60000))).rejects.toThrow('synthetic timer work failure');
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_outcome_notices WHERE entity_id=$1',[f.offer])).rows[0].n).toBe(0);
    }finally{await verificationPool.query('DROP TRIGGER fail_ticket13_timer ON pilot_email_jobs');await verificationPool.query('DROP FUNCTION fail_ticket13_timer()');}
    expect(await produceRouteOutcomeNotices(verificationPool,new Date(scheduled.getTime()+31*60000))).toBe(1);
    expect(await produceRouteOutcomeNotices(verificationPool,new Date(scheduled.getTime()+31*60000))).toBe(0);
    await deliverRouteNotices(f.offer,'delayed_departure',[f.driver.id,passenger.id]);
  });
  it('ticket 13 publishes a material replacement only after cancellation and requires fresh confirmed requests',async()=>{
    const f=await passengerPublication();
    const asked=await f.send(`${path}/${f.id}/requests`,f.selection,randomUUID(),f.passenger.token);
    const accepted=await f.send(`${path}/requests/${asked.body.request.id}/accept`,{});
    const input={...f.input,replaces_offer_id:f.id,departure_at:new Date(Date.parse(f.input.departure_at)+3600000).toISOString()};
    const preview=await f.send(`${path}/preview`,input);
    const replacement={...confirmPreview(input,preview.body),passenger_publication:f.publicationInput.passenger_publication};
    expect((await f.send(path,replacement)).body.error.code).toBe('REPLACEMENT_INVALID');
    const cancelled=await f.send(`${path}/${f.id}/cancel`,{reason:'Departure changed materially'});
    expect(cancelled.status).toBe(200);
    const published=await f.send(path,replacement);
    expect(published.status,JSON.stringify(published.body)).toBe(201);
    expect(published.body.offer.id).not.toBe(f.id);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_seat_allocations WHERE offer_id=$1',[published.body.offer.id])).rows[0].n).toBe(0);
    const fresh=await f.send(`${path}/${published.body.offer.id}/requests`,f.selection,randomUUID(),f.passenger.token);
    expect(fresh.status,JSON.stringify(fresh.body)).toBe(201);
    expect((await f.send(`${path}/requests/${fresh.body.request.id}/accept`,{})).status).toBe(200);
    expect((await verificationPool.query('SELECT status,accepted_terms FROM posted_route_seat_allocations WHERE id=$1',[accepted.body.booking.id])).rows[0])
      .toEqual({status:'cancelled',accepted_terms:accepted.body.booking.accepted_terms});
  });
  it('ticket 13 keeps active journey and direct settlement available while new commitments are paused',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]})).status).toBe(200);
    await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='booking'");
    for(const [token,role] of [[f.driver.token,'driver'],[passenger.token,'passenger']]){
      const response=await f.call(token,`${path}/allocations/${seat}/${role}-journey`,{travelled:true,completed:true});
      expect(response.status,JSON.stringify(response.body)).toBe(200);
    }
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/payment-claim`,{method:'cash'})).status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/receipt`,{})).status).toBe(200);
  });
  it('ticket 13 detects and restores a lost eligibility hold from its receipt',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    expect((await f.call(passenger.token,'/v1/adult-declaration/withdraw',{policy_version:version})).status).toBe(200);
    await verificationPool.query("UPDATE posted_route_seat_allocations SET status='confirmed' WHERE id=$1",[seat]);
    const recovery=(await import('../modules/posted-routes/outcomes.service')).postedRouteOutcomesService;
    await expect(recovery.verifyEvidence()).rejects.toMatchObject({code:'RECOVERY_UNAVAILABLE'});
    const operator=await seatRecoveryOperator();
    try{const response=await request(f.app).post('/v1/operator/reconcile').set('Cookie',operator.cookie)
      .set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf).send({});
      expect(response.status,JSON.stringify(response.body)).toBe(200);
      expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status).toBe('held');
    }finally{await clearSeatRecoveryOperator();}
  });
  it('ticket 13 preserves acknowledged hold release history after driver revocation',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    expect((await f.call(f.driver.token,`${path}/requests/${id}/accept`,{})).status).toBe(200);
    const operator=await seatRecoveryOperator();
    const admin=(url:string)=>request(f.app).post(url).set('Cookie',operator.cookie)
      .set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf)
      .set('Idempotency-Key',randomUUID()).send({reason:'Reviewed current eligibility and safety'});
    try{
      expect((await admin(`${path}/${f.offer}/hold`)).status).toBe(200);
      expect((await admin(`${path}/${f.offer}/release-hold`)).status).toBe(200);
      await clearSeatRecoveryOperator();
      expect((await f.call(f.driver.token,'/v1/driver-vehicle-declarations/driver/revoke',{})).status).toBe(200);
      await operator.resume();
      const retry=await admin(`${path}/${f.offer}/release-hold`);
      expect(retry.status,JSON.stringify(retry.body)).toBe(403);
      expect((await verificationPool.query('SELECT mode FROM pilot_recovery_state WHERE singleton=true')).rows[0].mode).toBe('open');
      const recovery=await request(f.app).post('/v1/operator/reconcile').set('Cookie',operator.cookie)
        .set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf).send({});
      expect(recovery.status,JSON.stringify(recovery.body)).toBe(200);
      expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status).toBe('held');
    }finally{await clearSeatRecoveryOperator();}
  });
  it('ticket 13 holds existing routes after a material vehicle declaration change',async()=>{
    const f=await bookingFixture(2,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    const status=await request(f.app).get('/v1/driver-vehicle-declarations').set('Authorization',`Bearer ${f.driver.token}`);
    const vehicle=status.body.vehicles.find((v:{id:string})=>v.id===f.driver.vehicle);
    const body={category:vehicle.category,registration_identifier:vehicle.registration_identifier,
      registration_expires_on:'2099-01-01',insurance_expires_on:'2099-01-01',
      permission_to_use:true,belted_passenger_seats:1,passenger_capacity:1,policy_version:version};
    const changed=await request(f.app).put(`/v1/driver-vehicle-declarations/vehicles/${f.driver.vehicle}`)
      .set('Authorization',`Bearer ${f.driver.token}`).set('Idempotency-Key',randomUUID()).send(body);
    expect(changed.status,JSON.stringify(changed.body)).toBe(200);
    expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status).toBe('held');
    expect((await verificationPool.query('SELECT accepted_terms FROM posted_route_seat_allocations WHERE id=$1',[accepted.body.booking.id])).rows[0].accepted_terms)
      .toEqual(accepted.body.booking.accepted_terms);
  });
  it('ticket 13 detects a missing acknowledged obligation and preserves retries while paused',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    const key=randomUUID(),depart=()=>f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]},key);
    const departed=await depart();expect(departed.status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/driver-journey`,{travelled:true,completed:true})).status).toBe(200);
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/passenger-journey`,{travelled:true,completed:true})).status).toBe(200);
    await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='booking'");
    expect((await depart()).body.operation_id).toBe(departed.body.operation_id);
    await verificationPool.query('DELETE FROM posted_route_obligations WHERE allocation_id=$1',[seat]);
    const recovery=(await import('../modules/posted-routes/outcomes.service')).postedRouteOutcomesService;
    await expect(recovery.verifyEvidence()).rejects.toMatchObject({code:'RECOVERY_UNAVAILABLE'});
    const operator=await seatRecoveryOperator();
    try{await recovery.reconcileReceipts(operator.id);await recovery.verifyEvidence();
      expect((await verificationPool.query('SELECT amount_paise FROM posted_route_obligations WHERE allocation_id=$1',[seat])).rows[0].amount_paise).toBe(1092);
    }finally{await clearSeatRecoveryOperator();}
  });
  it('ticket 13 restores acknowledged journey and receipt outcomes from independent evidence',async()=>{
    const f=await bookingFixture(1,true),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    const scheduled=(await verificationPool.query('SELECT departure_at FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].departure_at;
    setOutcomeClockForTests(()=>scheduled.getTime());
    const calls:[string,string,unknown][]=[
      [f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]}],
      [f.driver.token,`${path}/allocations/${seat}/driver-journey`,{travelled:true,completed:true}],
      [passenger.token,`${path}/allocations/${seat}/passenger-journey`,{travelled:true,completed:true}],
      [passenger.token,`${path}/allocations/${seat}/payment-claim`,{method:'cash'}],
      [f.driver.token,`${path}/allocations/${seat}/receipt`,{}]];
    const operations:string[]=[];
    for(const [token,url,body] of calls){const response=await f.call(token,url,body);
      expect(response.status,JSON.stringify(response.body)).toBe(200);operations.push(response.body.operation_id);}
    const before=(await verificationPool.query('SELECT * FROM posted_route_obligations')).rows;
    expect(before[0].accepted_segment).toEqual(accepted.body.booking.accepted_terms);
    await verificationPool.query(`DELETE FROM pilot_email_jobs WHERE event_id IN
      (SELECT id FROM pilot_notification_events WHERE origin_type='posted_route_outcome')`);
    await verificationPool.query("DELETE FROM pilot_notification_events WHERE origin_type='posted_route_outcome'");
    await verificationPool.query("DELETE FROM audit_logs WHERE action LIKE 'posted_route_%' AND metadata->>'operationId'=ANY($1::text[])",[operations]);
    await verificationPool.query('DELETE FROM posted_route_receipt_decisions');
    await verificationPool.query('DELETE FROM posted_route_payment_claims');
    await verificationPool.query('DELETE FROM posted_route_obligations');
    await verificationPool.query('DELETE FROM posted_route_journey_claims');
    await verificationPool.query('DELETE FROM posted_route_outcome_operations');
    await verificationPool.query("UPDATE posted_route_offers SET status='prepared' WHERE id=$1",[f.offer]);
    await verificationPool.query('UPDATE posted_route_seat_allocations SET boarded=NULL WHERE id=$1',[seat]);
    const recovery=(await import('../modules/posted-routes/outcomes.service')).postedRouteOutcomesService;
    await expect(recovery.verifyEvidence()).rejects.toMatchObject({code:'RECOVERY_UNAVAILABLE'});
    const operator=await seatRecoveryOperator();
    try{
      const reconcile=()=>request(f.app).post('/v1/operator/reconcile').set('Cookie',operator.cookie)
        .set('Origin','http://localhost:3000').set('X-CSRF-Token',operator.csrf).send({});
      const restored=await reconcile();expect(restored.status,JSON.stringify(restored.body)).toBe(200);
      const repeated=await reconcile();expect(repeated.status,JSON.stringify(repeated.body)).toBe(200);
      await recovery.verifyEvidence();
      expect((await verificationPool.query('SELECT * FROM posted_route_obligations')).rows).toEqual(before);
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_receipt_decisions')).rows[0].n).toBe(1);
      expect((await verificationPool.query("SELECT count(*)::int AS n FROM pilot_notification_events WHERE origin_type='posted_route_outcome'")).rows[0].n).toBe(10);
    }finally{await clearSeatRecoveryOperator();}
  });
  it('keeps a disputed UPI claim open until an authorized operator decides receipt',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    const seat=accepted.body.booking.id as string;
    await moveToRouteDeparture(f.offer);
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]})).status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/driver-journey`,
      {travelled:true,completed:true})).status).toBe(200);
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/passenger-journey`,
      {travelled:true,completed:true})).status).toBe(200);
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/payment-claim`,
      {method:'upi'})).status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/dispute`,{})).status).toBe(200);
    const review=await verificationPool.query<{status:string;receipt_established:boolean|null}>(`
      SELECT status,receipt_established FROM posted_route_settlement_reviews r
      JOIN posted_route_obligations o ON o.id=r.obligation_id WHERE o.allocation_id=$1`,[seat]);
    expect(review.rows[0]).toMatchObject({status:'open',receipt_established:null});
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/dispute`,{})).body.error.code)
      .toBe('RECEIPT_EXISTS');
    const operator=await seatRecoveryOperator();
    try{
      const decision=()=>request(f.app).post(`${path}/allocations/${seat}/resolve-settlement`)
        .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
        .set('X-CSRF-Token',operator.csrf).set('Idempotency-Key',randomUUID())
        .send({receipt_established:false,reason:'No recipient evidence of receipt'});
      const resolved=await decision();
      expect(resolved.status,JSON.stringify(resolved.body)).toBe(200);
      expect((await decision()).body.error.code).toBe('REVIEW_REQUIRED');
      expect((await verificationPool.query(`SELECT status,receipt_established FROM posted_route_settlement_reviews r
        JOIN posted_route_obligations o ON o.id=r.obligation_id WHERE o.allocation_id=$1`,[seat])).rows[0])
        .toMatchObject({status:'resolved',receipt_established:false});
    }finally{await clearSeatRecoveryOperator();}
  });
  it('serializes driver cancellation against seat acceptance using separate PostgreSQL connections',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const [a,b]=await Promise.all([pool.connect(),pool.connect()]);
    try{expect((await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid).not.toBe(
      (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);}
    finally{a.release();b.release();}
    const [cancel,accept]=await Promise.all([
      f.call(f.driver.token,`${path}/${f.offer}/cancel`,{reason:'Driver cannot travel'}),
      f.call(f.driver.token,`${path}/requests/${id}/accept`,{})]);
    expect(cancel.status,JSON.stringify(cancel.body)).toBe(200);
    expect([200,409,503]).toContain(accept.status);
    if(accept.status===503){
      expect(accept.body.error.code).toBe('PILOT_PAUSED');
      const retried=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
      expect(retried.status,JSON.stringify(retried.body)).toBe(409);
    }
    const state=(await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status;
    expect(state).toBe('cancelled');
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM posted_route_seat_allocations
      WHERE offer_id=$1 AND status IN ('confirmed','held')`,[f.offer])).rows[0].n).toBe(0);
  });
  it('allows an audited driver cancellation while new bookings are paused',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    expect(accepted.status).toBe(200);
    await verificationPool.query("UPDATE pilot_pause_state SET paused=true WHERE capability='booking'");
    const cancelled=await f.call(f.driver.token,`${path}/${f.offer}/cancel`,
      {reason:'Driver cannot safely travel'});
    expect(cancelled.status,JSON.stringify(cancelled.body)).toBe(200);
    expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status)
      .toBe('cancelled');
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',
      [accepted.body.booking.id])).rows[0].status).toBe('cancelled');
  });
  it('serializes departure and passenger cancellation on distinct live PostgreSQL connections',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    const seat=accepted.body.booking.id as string;
    await moveToRouteDeparture(f.offer);
    await verificationPool.query(`CREATE OR REPLACE FUNCTION pause_route_departure_race() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='departed' THEN PERFORM pg_sleep(0.8); END IF;
      RETURN NEW; END $$`);
    await verificationPool.query(`CREATE TRIGGER pause_route_departure_race BEFORE UPDATE ON posted_route_offers
      FOR EACH ROW EXECUTE FUNCTION pause_route_departure_race()`);
    try{
      const departing=Promise.resolve(f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]}));
      let departedBackend=false;
      for(let i=0;i<30&&!departedBackend;i++){
        departedBackend=(await verificationPool.query(`SELECT 1 FROM pg_stat_activity
          WHERE datname=current_database() AND state='active'
            AND query LIKE 'UPDATE posted_route_offers SET status=%' LIMIT 1`)).rowCount!==0;
        if(!departedBackend)await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(departedBackend).toBe(true);
      const cancelling=Promise.resolve(f.call(passenger.token,`${path}/allocations/${seat}/cancel`,
        {reason:'Concurrent cancellation report'}));
      let concurrentPids:number[]=[];
      for(let i=0;i<30&&concurrentPids.length<2;i++){
        concurrentPids=(await verificationPool.query<{pid:number}>(`SELECT DISTINCT pid FROM pg_stat_activity
          WHERE datname=current_database() AND state='active'
          AND (query LIKE 'UPDATE posted_route_offers SET status=%'
            OR query LIKE 'SELECT pg_advisory_lock(93113, 13)%')`)).rows.map(row=>row.pid);
        if(concurrentPids.length<2)await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(new Set(concurrentPids).size).toBe(2);
      const [departureOutcome,cancellationOutcome]=await Promise.all([departing,cancelling]);
      expect(departureOutcome.status,JSON.stringify(departureOutcome.body)).toBe(200);
      expect(cancellationOutcome.body).toMatchObject({action:'incident_report',
        incident_type:'attempted_cancellation'});
      expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status)
        .toBe('confirmed');
    }finally{await verificationPool.query('DROP TRIGGER pause_route_departure_race ON posted_route_offers');
      await verificationPool.query('DROP FUNCTION pause_route_departure_race()');}
  });
  it('refuses departure when an accepted seat no longer has the frozen route commitment',async()=>{
    const f=await bookingFixture(),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    const seat=accepted.body.booking.id as string;
    await verificationPool.query(`UPDATE posted_route_offers SET departure_at=now(),
      request_cutoff_at=now()-interval '60 minutes',acceptance_cutoff_at=now()-interval '30 minutes',
      route_version=2
      WHERE id=$1`,[f.offer]);
    const departed=await f.call(f.driver.token,`${path}/${f.offer}/depart`,{boarded_ids:[seat]});
    expect(departed.body.error.code).toBe('COMMITMENT_CONFLICT');
    expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status)
      .toBe('prepared');
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_outcome_operations')).rows[0].n)
      .toBe(0);
  });
  it.each([false,true])('rolls back cancellation if audit insertion fails and preserves state after delivery failure (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{}),seat=accepted.body.booking.id;
    await verificationPool.query(`CREATE OR REPLACE FUNCTION reject_route_outcome_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='posted_route_passenger_cancel' THEN
      RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$`);
    await verificationPool.query(`CREATE TRIGGER reject_route_outcome_audit BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION reject_route_outcome_audit()`);
    try{const failed=await f.call(passenger.token,`${path}/allocations/${seat}/cancel`,{});
      expect(failed.status).toBeGreaterThanOrEqual(500);
      expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status)
        .toBe('confirmed');
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_outcome_operations')).rows[0].n).toBe(0);
    }finally{await verificationPool.query('DROP TRIGGER reject_route_outcome_audit ON audit_logs');
      await verificationPool.query('DROP FUNCTION reject_route_outcome_audit()');}
    await verificationPool.query(`CREATE OR REPLACE FUNCTION reject_route_outcome_notice() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN IF NEW.origin_type='posted_route_outcome' THEN
      RAISE EXCEPTION 'injected notification failure'; END IF; RETURN NEW; END $$`);
    await verificationPool.query(`CREATE TRIGGER reject_route_outcome_notice BEFORE INSERT ON pilot_notification_events
      FOR EACH ROW EXECUTE FUNCTION reject_route_outcome_notice()`);
    try{const failed=await f.call(passenger.token,`${path}/allocations/${seat}/cancel`,{});
      expect(failed.status).toBeGreaterThanOrEqual(500);
      expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status)
        .toBe('confirmed');
      expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_outcome_operations')).rows[0].n)
        .toBe(0);
    }finally{await verificationPool.query('DROP TRIGGER reject_route_outcome_notice ON pilot_notification_events');
      await verificationPool.query('DROP FUNCTION reject_route_outcome_notice()');}
    const cancelled=await f.call(passenger.token,`${path}/allocations/${seat}/cancel`,{});
    expect(cancelled.status,JSON.stringify(cancelled.body)).toBe(200);
    await verificationPool.query(`UPDATE pilot_email_jobs SET attempts=1,last_error='synthetic delivery failure'
      WHERE event_id IN (SELECT id FROM pilot_notification_events
        WHERE origin_type='posted_route_outcome' AND operation_id=$1)`,[cancelled.body.operation_id]);
    expect((await verificationPool.query('SELECT status FROM posted_route_seat_allocations WHERE id=$1',[seat])).rows[0].status)
      .toBe('cancelled');
  });
  it.each([false,true])('requires current passenger eligibility before an operator releases a route hold (published=%s)',async(published)=>{
    const f=await bookingFixture(1,published),passenger=await participant(),id=await f.ask(passenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${id}/accept`,{});
    expect(accepted.status).toBe(200);
    let operator=await seatRecoveryOperator();
    const action=(name:string)=>request(f.app).post(`${path}/${f.offer}/${name}`)
      .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
      .set('X-CSRF-Token',operator.csrf).set('Idempotency-Key',randomUUID())
      .send({reason:'Synthetic safety review'});
    try{
      const held=await action('hold');
      expect(held.status,JSON.stringify(held.body)).toBe(200);
      expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status)
        .toBe('held');
      await clearSeatRecoveryOperator();
      const withdrawn=await request(f.app).post('/v1/adult-declaration/withdraw')
        .set('Authorization',`Bearer ${passenger.token}`).set('Idempotency-Key',randomUUID())
        .send({policy_version:version});
      expect(withdrawn.status,JSON.stringify(withdrawn.body)).toBe(200);
      operator=await seatRecoveryOperator();
      const release=await action('release-hold');
      expect(release.status).toBeGreaterThanOrEqual(400);
      expect((await verificationPool.query('SELECT status FROM posted_route_offers WHERE id=$1',[f.offer])).rows[0].status)
        .toBe('held');
    }finally{await clearSeatRecoveryOperator();}
  });
  it('keeps outcome actions disabled outside synthetic tests',async()=>{
    const f=await bookingFixture();process.env.NODE_ENV='production';
    try{const response=await f.call(f.driver.token,`${path}/${f.offer}/cancel`,{reason:'Route changed materially'});
      expect(response.body.error.code).toBe('ROUTE_BOOKINGS_DISABLED');}
    finally{process.env.NODE_ENV='test';}
  });
  it('ticket 15 creates two verified accounts over HTTP before accepting a declared route seat',async()=>{
    const app=createApp();
    const identities=new Map<string,{subject:string;verified:boolean}>();
    const bySubject=(subject:string)=>{
      const record=[...identities.entries()].find(([,item])=>item.subject===subject);
      if(!record)throw new Error('Synthetic provider identity missing');
      return {email:record[0],...record[1]};
    };
    const identity=(subject:string):ProviderIdentity=>{
      const account=bySubject(subject);
      return {subject,email:account.email,emailVerified:account.verified,assuranceLevel:'aal1',
        userMetadata:{full_name:'Synthetic Participant'}};
    };
    const session=(subject:string)=>({accessToken:'access:'+subject,refreshToken:'refresh:'+subject,
      expiresIn:900,identity:identity(subject)});
    setManagedAuthEnabledForTests(true);
    setAuthProviderForTests({
      register:async({email})=>{identities.set(email,{subject:randomUUID(),verified:false});},
      login:async(email)=>session(identities.get(email)!.subject),
      validate:async(token)=>identity(token.slice('access:'.length)),
      refresh:async(token)=>session(token.slice('refresh:'.length)),
      requestRecovery:async()=>undefined,updatePassword:async()=>undefined,
      logout:async()=>undefined,exchangeCode:async()=>{throw new Error('Unused provider callback');},
    });
    await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='supabase',
      legacy_login_enabled=false,authorized_at=now(),authorized_by='integration-test'`);
    try{
      const createAccount=async()=>{
        const email=`registered-${randomUUID()}@example.test`;
        const credentials={email,password:'synthetic-password'};
        const registered=await request(app).post('/v1/auth/register').send({...credentials,
          fullName:'Synthetic Participant'});
        expect(registered.status,JSON.stringify(registered.body)).toBe(202);
        expect((await request(app).post('/v1/auth/login').send(credentials)).body.error.code)
          .toBe('EMAIL_NOT_VERIFIED');
        identities.get(email)!.verified=true;
        const login=await request(app).post('/v1/auth/login').send(credentials);
        expect(login.status,JSON.stringify(login.body)).toBe(200);
        expect(login.body.user).toMatchObject({email,isVerified:false});
        const cookies=(login.headers['set-cookie'] as string[]).map(item=>item.split(';',1)[0]);
        const csrf=cookies.find(item=>item.startsWith('pp_csrf_token='))!.split('=')[1];
        const call=(method:'put'|'post',url:string,body:unknown)=>request(app)[method](url)
          .set('Cookie',cookies.join('; ')).set('Origin','http://localhost:3000')
          .set('X-CSRF-Token',csrf).set('Idempotency-Key',randomUUID()).send(body);
        expect((await request(app).get('/v1/auth/me').set('Cookie',cookies.join('; '))).body.user.id)
          .toBe(login.body.user.id);
        return {id:login.body.user.id as string,cookies,call};
      };
      const driver=await createAccount(),passenger=await createAccount();
      expect((await driver.call('put','/v1/adult-declaration',
        {at_least_18:true,policy_version:version})).status).toBe(200);
      expect((await passenger.call('put','/v1/adult-declaration',
        {at_least_18:true,policy_version:version})).status).toBe(200);
      expect((await driver.call('put','/v1/driver-vehicle-declarations/driver',
        {licence_categories:['car'],licence_expires_on:'2030-12-31',policy_version:version})).status).toBe(200);
      const vehicle=await driver.call('post','/v1/driver-vehicle-declarations/vehicles',{
        category:'car',registration_identifier:`MH-${randomUUID().slice(0,8)}`,
        registration_expires_on:'2030-12-31',insurance_expires_on:'2030-12-31',
        permission_to_use:true,belted_passenger_seats:2,passenger_capacity:2,policy_version:version});
      expect(vehicle.status,JSON.stringify(vehicle.body)).toBe(200);
      const origin:[number,number]=[77.75,20.9],destination:[number,number]=[77.76,20.9];
      (await routeModule()).setRoutingAdapterForTests({verify:async()=>({source:'synthetic-test',
        mode:'car',geometry:{type:'LineString',coordinates:[origin,destination]},
        cumulativeMeters:[0,1005],distanceMeters:1005,durationSeconds:120})});
      (await import('../modules/posted-routes/segment-quote')).setStopCheckForTests(safeStopForKind);
      const prepared=await driver.call('post',path,{vehicle_id:vehicle.body.declaration.vehicles[0].id,
        mode:'car',origin,destination,departure_at:departure(),capacity:2});
      expect(prepared.status,JSON.stringify(prepared.body)).toBe(201);
      const mine=await request(app).get(`${path}/mine`).set('Cookie',driver.cookies.join('; '));
      expect(mine.body.offers).toContainEqual(expect.objectContaining({id:prepared.body.offer.id}));
      const selection={route_version:1,pickup:origin,dropoff:destination};
      const quoted=await driver.call('post',`${path}/${prepared.body.offer.id}/quote`,selection);
      expect(quoted.body.quote).toMatchObject({segment_meters:1005,total_paise:704});
      const asked=await passenger.call('post',`${path}/${prepared.body.offer.id}/requests`,selection);
      expect(asked.status,JSON.stringify(asked.body)).toBe(201);
      const accepted=await driver.call('post',`${path}/requests/${asked.body.request.id}/accept`,{});
      expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
      expect(accepted.body.booking.accepted_terms.total_paise).toBe(704);
      const notices=await request(app).get('/v1/notifications/durable')
        .set('Cookie',passenger.cookies.join('; '));
      expect(notices.body.notifications).toContainEqual(expect.objectContaining({
        event_type:'accepted',related_entity_id:asked.body.request.id}));
      const seat=accepted.body.booking.id as string;
      await moveToRouteDeparture(prepared.body.offer.id);
      expect((await driver.call('post',`${path}/${prepared.body.offer.id}/depart`,
        {boarded_ids:[seat]})).status).toBe(200);
      expect((await driver.call('post',`${path}/allocations/${seat}/driver-journey`,
        {travelled:true,completed:true})).status).toBe(200);
      expect((await passenger.call('post',`${path}/allocations/${seat}/passenger-journey`,
        {travelled:true,completed:true})).status).toBe(200);
      expect((await passenger.call('post',`${path}/allocations/${seat}/payment-claim`,
        {method:'cash'})).status).toBe(200);
      const receipt=await driver.call('post',`${path}/allocations/${seat}/receipt`,{});
      expect(receipt.status,JSON.stringify(receipt.body)).toBe(200);
    }finally{
      setManagedAuthEnabledForTests(null);setAuthProviderForTests(null);
      await verificationPool.query(`UPDATE auth_cutover_state SET active_provider='legacy',
        legacy_login_enabled=true,authorized_at=NULL,authorized_by=NULL`);
    }
  });
  it('ticket 15 carries cancellation into a fresh cash seat and records receipt',async()=>{
    const f=await bookingFixture(),cancelledPassenger=await participant();
    const firstRequest=await f.ask(cancelledPassenger);
    const firstSeat=(await f.call(f.driver.token,`${path}/requests/${firstRequest}/accept`,{}))
      .body.booking.id as string;
    const cancelled=await f.call(cancelledPassenger.token,
      `${path}/allocations/${firstSeat}/cancel`,{reason:'Plans changed'});
    expect(cancelled.status,JSON.stringify(cancelled.body)).toBe(200);
    const cashPassenger=await participant(),freshRequest=await f.ask(cashPassenger);
    const accepted=await f.call(f.driver.token,`${path}/requests/${freshRequest}/accept`,{});
    expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
    const cashSeat=accepted.body.booking.id as string;
    await moveToRouteDeparture(f.offer);
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,
      {boarded_ids:[cashSeat]})).status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${cashSeat}/driver-journey`,
      {travelled:true,completed:true})).status).toBe(200);
    expect((await f.call(cashPassenger.token,`${path}/allocations/${cashSeat}/passenger-journey`,
      {travelled:true,completed:true})).status).toBe(200);
    expect((await f.call(cashPassenger.token,`${path}/allocations/${cashSeat}/payment-claim`,
      {method:'cash'})).status).toBe(200);
    const receipt=await f.call(f.driver.token,`${path}/allocations/${cashSeat}/receipt`,{});
    expect(receipt.status,JSON.stringify(receipt.body)).toBe(200);
    expect((await verificationPool.query(`SELECT count(*)::int AS n FROM posted_route_obligations
      WHERE allocation_id=$1`,[firstSeat])).rows[0].n).toBe(0);
    expect((await verificationPool.query(`SELECT amount_paise FROM posted_route_obligations
      WHERE allocation_id=$1`,[cashSeat])).rows[0].amount_paise).toBe(704);
  });
  it('ticket 15 connects the authenticated route journey and preserves historical policy ownership',async()=>{
    const f=await bookingFixture(),passenger=await participant();
    const historicalOffer=(await verificationPool.query<{id:string}>(`INSERT INTO ride_offers
      (driver_id,pickup_location,pickup_lat,pickup_lng,drop_location,drop_lat,drop_lng,date,time,
       available_seats,price_per_seat_paise)
      VALUES($1,'Historical origin',20.9,77.7,'Historical destination',20.8,77.8,
        current_date-1,'09:00',1,2500) RETURNING id`,[f.driver.id])).rows[0].id;
    const historicalBooking=(await verificationPool.query<{id:string}>(`INSERT INTO bookings
      (ride_offer_id,created_by_user_id,passenger_id,driver_id,seats_booked,total_amount_paise,
       pricing_snapshot,status,payment_state)
      VALUES($1,$2,$2,$3,1,2500,'{"policy_version":"historical-pilot"}'::jsonb,
        'completed','paid_escrow') RETURNING id`,[historicalOffer,passenger.id,f.driver.id])).rows[0].id;
    await verificationPool.query(`INSERT INTO payment_orders
      (booking_id,user_id,provider,provider_order_id,amount_paise,status,idempotency_key)
      VALUES($1,$2,'razorpay',$3,2500,'paid',$4)`,
      [historicalBooking,passenger.id,`synthetic-${randomUUID()}`,randomUUID()]);
    await verificationPool.query(`INSERT INTO booking_settlements
      (booking_id,payer_user_id,payee_user_id,ride_fare_paise,total_due_paise,
       paid_amount_paise,preferred_payment_method,status)
      VALUES($1,$2,$3,2500,2500,2500,'online','settled')`,
      [historicalBooking,passenger.id,f.driver.id]);
    const historicalSettlement=await request(f.app).get(`/v1/settlements/bookings/${historicalBooking}`)
      .set('Authorization',`Bearer ${passenger.token}`);
    expect(historicalSettlement.status).toBe(200);
    expect(historicalSettlement.body.settlement.total_due_paise).toBe(2500);
    const bearer=(token:string)=>({Authorization:`Bearer ${token}`});
    expect((await request(f.app).get('/v1/adult-declaration').set(bearer(passenger.token))).body
      .declaration).toMatchObject({kind:'self_declaration'});
    expect((await request(f.app).get('/v1/driver-vehicle-declarations')
      .set(bearer(f.driver.token))).status).toBe(200);
    expect((await request(f.app).get(`${path}/${f.offer}`).set(bearer(f.driver.token))).status).toBe(200);
    const quote=await request(f.app).post(`${path}/${f.offer}/quote`)
      .set(bearer(f.driver.token)).send(f.selection);
    expect(quote.status,JSON.stringify(quote.body)).toBe(200);
    expect(quote.body.quote).toMatchObject({segment_meters:1005,rate_paise_per_km:700,
      total_paise:704,additional_charges_paise:0});
    const requestKey=randomUUID();
    const ask=()=>f.call(passenger.token,`${path}/${f.offer}/requests`,f.selection,requestKey);
    const requested=await ask();
    expect(requested.status).toBe(201);
    expect((await ask()).body.operation_id).toBe(requested.body.operation_id);
    expect((await f.call(passenger.token,`${path}/${f.offer}/requests`,
      {...f.selection,route_version:2},requestKey)).body.error.code)
      .toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    const accept=await f.call(f.driver.token,`${path}/requests/${requested.body.request.id}/accept`,{});
    expect(accept.status,JSON.stringify(accept.body)).toBe(200);
    const seat=accept.body.booking.id as string;
    expect(accept.body.booking.accepted_terms).toMatchObject({route_id:f.offer,route_version:1,
      segment_meters:1005,total_paise:704,currency:'INR',
      policy_version:'unrestricted-route-contribution-2026-10-04.1'});
    const notices=await request(f.app).get('/v1/notifications/durable')
      .set(bearer(passenger.token));
    expect(notices.status).toBe(200);
    expect(notices.body.notifications.length).toBeGreaterThan(0);
    await moveToRouteDeparture(f.offer);
    expect((await f.call(f.driver.token,`${path}/${f.offer}/depart`,
      {boarded_ids:[seat]})).status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/driver-journey`,
      {travelled:true,completed:true})).status).toBe(200);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM posted_route_obligations WHERE allocation_id=$1',
      [seat])).rows[0].n).toBe(0);
    expect((await f.call(passenger.token,`${path}/allocations/${seat}/passenger-journey`,
      {travelled:true,completed:true})).status).toBe(200);
    const obligation=(await verificationPool.query(`SELECT amount_paise,currency,policy_version
      FROM posted_route_obligations WHERE allocation_id=$1`,[seat])).rows[0];
    expect(obligation).toMatchObject({amount_paise:704,currency:'INR',
      policy_version:'unrestricted-route-contribution-2026-10-04.1'});
    const claim=await f.call(passenger.token,`${path}/allocations/${seat}/payment-claim`,{method:'upi'});
    expect(claim.status).toBe(200);
    expect((await f.call(f.driver.token,`${path}/allocations/${seat}/dispute`,{})).status).toBe(200);
    const operator=await seatRecoveryOperator();
    try{
      const review=await request(f.app).post(`${path}/allocations/${seat}/resolve-settlement`)
        .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
        .set('X-CSRF-Token',operator.csrf).set('Idempotency-Key',randomUUID())
        .send({receipt_established:false,reason:'Synthetic review found no receipt evidence'});
      expect(review.status,JSON.stringify(review.body)).toBe(200);
      const outreach=await request(f.app).post('/v1/operator/urgent-outreach')
        .set('Cookie',operator.cookie).set('Origin','http://localhost:3000')
        .set('X-CSRF-Token',operator.csrf).set('Idempotency-Key',randomUUID())
        .send({participantId:passenger.id,method:'email',occurredAt:new Date().toISOString(),
          reason:'other_support',outcome:'contacted'});
      expect(outreach.status,JSON.stringify(outreach.body)).toBe(200);
    }finally{await clearSeatRecoveryOperator();}
    expect((await verificationPool.query(`SELECT status,receipt_established FROM posted_route_settlement_reviews r
      JOIN posted_route_obligations o ON o.id=r.obligation_id WHERE o.allocation_id=$1`,[seat])).rows[0])
      .toMatchObject({status:'resolved',receipt_established:false});
    expect((await verificationPool.query(`SELECT total_amount_paise,pricing_snapshot->>'policy_version' AS policy
      FROM bookings WHERE id=$1`,[historicalBooking])).rows[0])
      .toMatchObject({total_amount_paise:2500,policy:'historical-pilot'});
    expect((await verificationPool.query('SELECT amount_paise,status FROM payment_orders WHERE booking_id=$1',
      [historicalBooking])).rows[0]).toMatchObject({amount_paise:2500,status:'paid'});
    expect((await verificationPool.query(`SELECT payer_user_id,payee_user_id,total_due_paise,status
      FROM booking_settlements WHERE booking_id=$1`,[historicalBooking])).rows[0])
      .toMatchObject({payer_user_id:passenger.id,payee_user_id:f.driver.id,
        total_due_paise:2500,status:'settled'});
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n).toBe(1);
    expect((await verificationPool.query('SELECT count(*)::int AS n FROM payment_orders')).rows[0].n).toBe(1);
  });
  it('ticket 15 keeps excluded HTTP entry points closed for an authenticated participant',async()=>{
    const app=createApp(),passenger=await participant();
    const bearer={Authorization:`Bearer ${passenger.token}`};
    for(const endpoint of ['/v1/bookings','/v1/payments/orders','/v1/payments/payouts',
      '/v1/matching/recompute','/v1/chat/rooms','/v1/tracking/sessions',
      '/v1/notifications/devices','/v1/rides/offers']){
      const closed=await request(app).post(endpoint).set(bearer).send({});
      expect(closed.body.error.code,endpoint).toBe('PILOT_SCOPE_DISABLED');
    }
    for(const [method,endpoint] of [['get','/v1/notifications/devices'],
      ['delete',`/v1/notifications/devices/${randomUUID()}`]] as const){
      const closed=await request(app)[method](endpoint).set(bearer);
      expect(closed.body.error.code,endpoint).toBe('PILOT_SCOPE_DISABLED');
    }
  });
});
