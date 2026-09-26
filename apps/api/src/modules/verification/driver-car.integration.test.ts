import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../../db/pool";
import { assertApprovedDriverCanOfferRide, upsertDriverEligibility } from "./verification.service";
import { classifyVehicle, submitAssociation, uploadEvidence, grantEvidenceAccess,
  readPrivateEvidence } from "./driver-car.service";
import { DriverCarReviewService, setDriverCarReviewCrashHookForTests } from "./driver-car-review.service";
import { DepartureService, setDepartureCrashHookForTests } from "../rides/departure.service";
import { confirmBooking } from "../bookings/bookings.service";
import { PauseService } from "../operator/pause.service";

const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const migrations = ["0001_init.sql", "0006_operator_allowlist.sql", "0007_operator_pause.sql",
  "0008_operator_intent_handoff.sql", "0009_durable_notifications.sql", "0010_email_retry_operations.sql",
  "0011_backup_attempts.sql", "0012_student_adult_review.sql", "0013_student_review_cycles.sql",
  "0014_student_review_operations.sql", "0015_student_evidence_access.sql",
  "0016_student_evidence_deletion_outcomes.sql", "0017_student_evidence_retry_schedule.sql",
  "0018_driver_car_approval.sql", "0019_ride_departures.sql"];
let directory: string;

beforeAll(async () => {
  for (const migration of migrations) {
    await db.query(await readFile(resolve(import.meta.dirname, "../../db/migrations", migration), "utf8"));
  }
});
beforeEach(async () => {
  await db.query("TRUNCATE users CASCADE");
  await db.query(`INSERT INTO pilot_recovery_state (singleton, mode) VALUES (true, 'open')
    ON CONFLICT (singleton) DO UPDATE SET mode = 'open', cause = NULL, started_at = NULL`);
  directory = await mkdtemp(resolve(tmpdir(), "driver-car-test-"));
  process.env.PILOT_SYNTHETIC_EVIDENCE_DIR = directory;
  process.env.PILOT_RECEIPT_PATH = resolve(directory, "receipts");
  process.env.PILOT_RECEIPT_SECRET = "driver-car-integration-receipt-secret";
  process.env.PILOT_EXPECTED_TRIP_MINUTES = "60";
  process.env.PILOT_CONFLICT_BUFFER_MINUTES = "30";
  process.env.PILOT_CONFLICT_POLICY_APPROVED = "true";
  process.env.PILOT_SUPPORT_WINDOW_START = new Date(Date.now() - 60 * 60_000).toISOString();
  process.env.PILOT_SUPPORT_WINDOW_END = new Date(Date.now() + 60 * 60_000).toISOString();
  process.env.PILOT_SUPPORT_WINDOW_APPROVED = "true";
});
afterEach(async () => {
  setDriverCarReviewCrashHookForTests(null);
  setDepartureCrashHookForTests(null);
  delete process.env.PILOT_SYNTHETIC_EVIDENCE_DIR;
  delete process.env.PILOT_RECEIPT_PATH;
  delete process.env.PILOT_RECEIPT_SECRET;
  delete process.env.PILOT_EXPECTED_TRIP_MINUTES;
  delete process.env.PILOT_CONFLICT_BUFFER_MINUTES;
  delete process.env.PILOT_CONFLICT_POLICY_APPROVED;
  delete process.env.PILOT_SUPPORT_WINDOW_START;
  delete process.env.PILOT_SUPPORT_WINDOW_END;
  delete process.env.PILOT_SUPPORT_WINDOW_APPROVED;
  await rm(directory, { recursive: true, force: true });
});
afterAll(async () => { await Promise.all([db.end(), pool.end()]); });

async function user(email: string, operator = false) {
  const row = (await db.query<{ id: string }>(
    `INSERT INTO users (email, role, email_verified_at) VALUES ($1, $2, now()) RETURNING id`,
    [email, operator ? "admin" : "user"])).rows[0];
  if (operator) await db.query(`INSERT INTO operator_allowlist (user_id, active, reason, reviewed_at)
    VALUES ($1, true, 'synthetic test', now())`, [row.id]);
  return row.id;
}
async function approvedStudent(id: string) {
  await db.query(`INSERT INTO student_verifications (user_id, provider, status,
    adult_eligible, institution_name, eligibility_ends_at)
    VALUES ($1, 'manual_review', 'verified', true, 'Synthetic College', now() + interval '1 year')`, [id]);
}
const pdf = Buffer.from("%PDF-1.4\nsynthetic driver-car evidence\n");

describe("driver and car approval with PostgreSQL", () => {
  it("checks current eligibility at departure and serializes a revocation on separate connections", async () => {
    const driver = await user("departure-driver@example.test");
    const passenger = await user("departure-passenger@example.test");
    const other = await user("departure-other@example.test");
    await approvedStudent(driver);
    await approvedStudent(passenger);
    await approvedStudent(other);
    await db.query(`INSERT INTO driver_eligibility
      (user_id, status, license_number_last4, license_expires_at, review_after)
      VALUES ($1, 'approved', '1234', CURRENT_DATE + 100, CURRENT_DATE + 100)`, [driver]);
    const car = (await db.query<{ id: string }>(`INSERT INTO vehicles
      (owner_user_id, vehicle_type, registration_number_last4, seat_capacity,
       use_category, applicable_document_required, insurance_expires_at,
       review_after, verification_status)
      VALUES ($1, 'car', '5678', 4, 'private', false, CURRENT_DATE + 100,
        CURRENT_DATE + 100, 'approved') RETURNING id`, [driver])).rows[0].id;
    const association = (await db.query<{ id: string }>(`INSERT INTO driver_vehicle_approvals
      (driver_user_id, vehicle_id, permission_category, status, review_after)
      VALUES ($1, $2, 'owner', 'approved', CURRENT_DATE + 100) RETURNING id`,
      [driver, car])).rows[0].id;
    const now = new Date();
    const corridorTime = new Date(now.getTime() + 330 * 60_000);
    const date = corridorTime.toISOString().slice(0, 10);
    const time = corridorTime.toISOString().slice(11, 19);
    const ride = (await db.query<{ id: string }>(`INSERT INTO ride_offers
      (driver_id, vehicle_id, pickup_location, pickup_lat, pickup_lng,
       drop_location, drop_lat, drop_lng, date, time, available_seats,
       price_per_seat_paise, status)
      VALUES ($1, $2, 'College', 20, 77, 'Home', 20.1, 77.1,
        $3, $4, 3, 10000, 'active') RETURNING id`,
      [driver, car, date, time])).rows[0].id;
    const booking = (await db.query<{ id: string }>(`INSERT INTO bookings
      (ride_offer_id, created_by_user_id, passenger_id, driver_id, seats_booked,
       total_amount_paise, platform_fee_paise, status, payment_state, confirmed_at)
      VALUES ($1, $2, $3, $2, 1, 10000, 0, 'confirmed', 'unpaid', now()) RETURNING id`,
      [ride, driver, passenger])).rows[0].id;
    const departures = new DepartureService(pool);
    await expect(departures.start(other, "wrong-owner", ride, [booking], now))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(departures.start(driver, "too-early", ride, [booking],
      new Date(now.getTime() - 16 * 60_000)))
      .rejects.toMatchObject({ code: "DEPARTURE_WINDOW_CLOSED" });
    process.env.PILOT_SUPPORT_WINDOW_END = new Date(now.getTime() - 1000).toISOString();
    await expect(departures.start(driver, "outside-support", ride, [booking], now))
      .rejects.toMatchObject({ code: "SUPPORT_WINDOW_CLOSED" });
    process.env.PILOT_SUPPORT_WINDOW_END = new Date(now.getTime() + 60 * 60_000).toISOString();
    await db.query("UPDATE student_verifications SET eligibility_ends_at = now() - interval '1 second' WHERE user_id = $1", [passenger]);
    await expect(departures.start(driver, "passenger-expired", ride, [booking], now))
      .rejects.toMatchObject({ code: "PASSENGER_VERIFICATION_INACTIVE" });
    await db.query("UPDATE student_verifications SET eligibility_ends_at = now() + interval '1 year' WHERE user_id = $1", [passenger]);
    const conflict = (await db.query<{ id: string }>(`INSERT INTO ride_offers
      (driver_id, vehicle_id, pickup_location, pickup_lat, pickup_lng,
       drop_location, drop_lat, drop_lng, date, time, available_seats,
       price_per_seat_paise, status)
      VALUES ($1, $2, 'College', 20, 77, 'Home', 20.1, 77.1,
        $3, $4, 3, 10000, 'active') RETURNING id`,
      [driver, car, date, time])).rows[0].id;
    await expect(departures.start(driver, "overlapping-ride", ride, [booking], now))
      .rejects.toMatchObject({ code: "COMMITMENT_CONFLICT" });
    await db.query("DELETE FROM ride_offers WHERE id = $1", [conflict]);
    const revoker = await db.connect();
    try {
      await revoker.query("BEGIN");
      await revoker.query("SELECT id FROM driver_vehicle_approvals WHERE id = $1 FOR UPDATE", [association]);
      const waiting = departures.start(driver, "revoked-first", ride, [booking], now);
      const rejection = expect(waiting).rejects.toMatchObject({ code: "DRIVER_CAR_NOT_APPROVED" });
      await new Promise((resolve) => setTimeout(resolve, 30));
      await revoker.query("UPDATE driver_vehicle_approvals SET status = 'revoked' WHERE id = $1", [association]);
      await revoker.query("COMMIT");
      await rejection;
    } finally {
      await revoker.query("ROLLBACK");
      revoker.release();
    }
    await db.query("UPDATE driver_vehicle_approvals SET status = 'approved' WHERE id = $1", [association]);
    const secondBooking = (await db.query<{ id: string }>(`INSERT INTO bookings
      (ride_offer_id, created_by_user_id, passenger_id, driver_id, seats_booked,
       total_amount_paise, platform_fee_paise, status, payment_state)
      VALUES ($1, $2, $3, $2, 1, 10000, 0, 'pending', 'unpaid') RETURNING id`,
      [ride, driver, other])).rows[0].id;
    const gate = await db.connect();
    let started;
    try {
      await gate.query("BEGIN");
      await gate.query("SELECT id FROM ride_offers WHERE id = $1 FOR UPDATE", [ride]);
      setDepartureCrashHookForTests((point) => {
        if (point === "after_commit") throw new Error("synthetic departure crash after commit");
      });
      const departureAttempt = departures.start(driver, "depart-once", ride, [booking], now);
      const confirmationAttempt = confirmBooking(secondBooking, driver);
      const settled = Promise.allSettled([departureAttempt, confirmationAttempt]);
      await new Promise((resolve) => setTimeout(resolve, 30));
      await gate.query("COMMIT");
      const [departureResult, confirmationResult] = await settled;
      expect(departureResult.status).toBe("rejected");
      if (departureResult.status !== "rejected") throw new Error("Expected synthetic departure crash");
      expect(departureResult.reason).toMatchObject({ message: "synthetic departure crash after commit" });
      expect((await db.query("SELECT state FROM ride_departures WHERE ride_offer_id = $1", [ride]))
        .rows[0].state).toBe("committed");
      setDepartureCrashHookForTests((point) => {
        if (point === "after_receipt") throw new Error("synthetic departure crash after receipt");
      });
      await expect(departures.start(driver, "depart-once", ride, [booking], now))
        .rejects.toMatchObject({ code: "OPERATION_PENDING" });
      setDepartureCrashHookForTests(null);
      started = await departures.start(driver, "depart-once", ride, [booking], now);
      await db.query("UPDATE pilot_recovery_state SET mode = 'open', cause = NULL, started_at = NULL");
      const secondStatus = (await db.query("SELECT status FROM bookings WHERE id = $1", [secondBooking]))
        .rows[0].status;
      if (confirmationResult.status === "fulfilled") {
        expect(secondStatus).toBe("confirmed");
        expect((await db.query("SELECT confirmed_booking_ids FROM ride_departures WHERE id = $1",
          [started.operation_id])).rows[0].confirmed_booking_ids).toContain(secondBooking);
      } else {
        expect(secondStatus).toBe("pending");
        expect(confirmationResult.reason).toMatchObject({ code: "RIDE_NOT_BOOKABLE" });
      }
    } finally {
      await gate.query("ROLLBACK");
      gate.release();
    }
    expect(started).toMatchObject({ state: "acknowledged", boarded_booking_ids: [booking] });
    expect((await departures.start(driver, "depart-once", ride, [booking], now)).operation_id)
      .toBe(started.operation_id);
    await expect(departures.start(driver, "depart-once", ride, [], now))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_PAYLOAD_MISMATCH" });
    expect((await db.query("SELECT status FROM ride_offers WHERE id = $1", [ride])).rows[0].status)
      .toBe("departed");
    expect((await db.query("SELECT boarded FROM ride_departure_boarding WHERE booking_id = $1", [booking]))
      .rows[0].boarded).toBe(true);
    const operator = await user("departure-reviewer@example.test", true);
    await db.query("DELETE FROM ride_departure_boarding WHERE ride_offer_id = $1", [ride]);
    await db.query("DELETE FROM ride_departures WHERE ride_offer_id = $1", [ride]);
    await db.query("UPDATE ride_offers SET status = 'active' WHERE id = $1", [ride]);
    await departures.reconcileReceipts(operator);
    expect((await db.query("SELECT status FROM ride_offers WHERE id = $1", [ride])).rows[0].status)
      .toBe("departed");
    expect((await db.query("SELECT state FROM ride_departures WHERE ride_offer_id = $1", [ride]))
      .rows[0].state).toBe("recovered");
    const future = (await db.query<{ id: string }>(`INSERT INTO ride_offers
      (driver_id, vehicle_id, pickup_location, pickup_lat, pickup_lng,
       drop_location, drop_lat, drop_lng, date, time, available_seats,
       price_per_seat_paise, status)
      VALUES ($1, $2, 'College', 20, 77, 'Home', 20.1, 77.1,
        CURRENT_DATE + 1, '09:00', 3, 10000, 'active') RETURNING id`,
      [driver, car])).rows[0].id;
    const revocation = await new DriverCarReviewService(pool).decide(operator, "revoke-after-departure",
      "association", association, { outcome: "revoked", reason: "Permission withdrawn",
        review_after: null });
    expect((await db.query("SELECT status FROM ride_offers WHERE id = $1", [future]))
      .rows[0].status).toBe("held");
    expect((await db.query("SELECT priority FROM pilot_ride_incidents WHERE ride_offer_id = $1", [ride]))
      .rows[0].priority).toBe("high");
    await db.query("DELETE FROM pilot_ride_incidents WHERE review_operation_id = $1", [revocation.id]);
    await db.query("DELETE FROM ride_departure_boarding WHERE ride_offer_id = $1", [ride]);
    await db.query("DELETE FROM ride_departures WHERE ride_offer_id = $1", [ride]);
    await db.query("DELETE FROM driver_car_review_operations WHERE id = $1", [revocation.id]);
    await db.query("UPDATE ride_offers SET status = 'active' WHERE id IN ($1, $2)", [ride, future]);
    await new PauseService(pool).reconcile(operator);
    expect((await db.query("SELECT status FROM ride_offers WHERE id = $1", [ride])).rows[0].status)
      .toBe("departed");
    expect((await db.query("SELECT status FROM ride_offers WHERE id = $1", [future])).rows[0].status)
      .toBe("held");
    expect((await db.query("SELECT priority FROM pilot_ride_incidents WHERE ride_offer_id = $1", [ride]))
      .rows[0].priority).toBe("high");
  });
  it("allows a rejected licence to be resubmitted without orphaning the prior document", async () => {
    const driver = await user("resubmit-driver@example.test");
    const operator = await user("resubmit-operator@example.test", true);
    await approvedStudent(driver);
    await upsertDriverEligibility(driver, { license_number_last4: "1234", license_expires_at: "2099-12-31" });
    await uploadEvidence(driver, "driver", driver, "licence", pdf, "application/pdf");
    const reviews = new DriverCarReviewService(pool);
    await reviews.decide(operator, "licence-reject", "driver", driver,
      { outcome: "rejected", reason: "The first synthetic document is unclear", review_after: null });
    const prior = (await db.query("SELECT object_key FROM driver_car_evidence WHERE subject_id = $1", [driver]))
      .rows[0].object_key;
    await upsertDriverEligibility(driver, { license_number_last4: "1234", license_expires_at: "2099-12-31" });
    await uploadEvidence(driver, "driver", driver, "licence",
      Buffer.from("%PDF-1.4\nclear synthetic licence\n"), "application/pdf");
    expect((await db.query("SELECT status FROM driver_car_evidence WHERE subject_id = $1", [driver]))
      .rows[0].status).toBe("pending_review");
    expect((await db.query("SELECT object_key FROM driver_car_evidence_replacements WHERE object_key = $1", [prior]))
      .rows).toHaveLength(1);
    await expect(reviews.decide(operator, "licence-approve", "driver", driver,
      { outcome: "approved", reason: "The replacement synthetic licence is legible",
        review_after: "2099-12-30" })).resolves.toMatchObject({ state: "acknowledged" });
  });

  it("requires independent decisions, rejects wrong owners, and applies expiry synchronously", async () => {
    const driver = await user("driver-14@example.test");
    const other = await user("other-14@example.test");
    const operator = await user("operator-14@example.test", true);
    await approvedStudent(driver);
    await approvedStudent(other);
    await db.query(`INSERT INTO driver_eligibility (user_id, status, license_number_last4, license_expires_at)
      VALUES ($1, 'pending_review', '1234', CURRENT_DATE + 300)`, [driver]);
    const car = (await db.query<{ id: string }>(`INSERT INTO vehicles
      (owner_user_id, vehicle_type, registration_number_last4, seat_capacity)
      VALUES ($1, 'car', '6789', 4) RETURNING id`, [driver])).rows[0].id;
    await expect(classifyVehicle(other, car, { use_category: "private",
      applicable_document_required: true, insurance_expires_at: "2099-12-31", registration_expires_at: null }))
      .rejects.toMatchObject({ code: "VEHICLE_NOT_FOUND" });
    await classifyVehicle(driver, car, { use_category: "private",
      applicable_document_required: true, insurance_expires_at: "2099-12-31", registration_expires_at: null });
    const association = await submitAssociation(driver, car, "owner");
    await expect(submitAssociation(other, car, "owner"))
      .rejects.toMatchObject({ code: "PERMISSION_INVALID" });
    const reviews = new DriverCarReviewService(pool);
    await expect(reviews.decide(operator, "car-without-applicable", "vehicle", car,
      { outcome: "approved", reason: "Synthetic review before document upload", review_after: "2099-12-30" }))
      .rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
    for (const [type, id, purpose] of [
      ["driver", driver, "licence"], ["vehicle", car, "registration"],
      ["vehicle", car, "insurance"],
      ["association", association.id, "permission"],
    ] as const) await uploadEvidence(driver, type, id, purpose, pdf, "application/pdf");
    await expect(reviews.decide(operator, "car-without-applicable", "vehicle", car,
      { outcome: "approved", reason: "Synthetic review before applicable document", review_after: "2099-12-30" }))
      .rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
    await uploadEvidence(driver, "vehicle", car, "applicable", pdf, "application/pdf");
    await expect(uploadEvidence(other, "vehicle", car, "applicable", pdf, "application/pdf"))
      .rejects.toMatchObject({ code: "SUBMISSION_NOT_FOUND" });
    const access = await grantEvidenceAccess(operator, "driver", driver, "licence");
    expect((await readPrivateEvidence(operator, "driver", driver, "licence", access.token)).bytes).toEqual(pdf);
    await expect(readPrivateEvidence(operator, "driver", driver, "licence", access.token))
      .rejects.toMatchObject({ code: "EVIDENCE_ACCESS_EXPIRED" });
    const tomorrow = "2099-12-30";
    const decide = (key: string, type: "driver" | "vehicle" | "association", id: string) =>
      reviews.decide(operator, key, type, id, { outcome: "approved", reason: "Synthetic documents inspected",
        review_after: tomorrow });
    setDriverCarReviewCrashHookForTests(() => { throw new Error("synthetic crash after commit"); });
    await expect(decide("driver-1", "driver", driver)).rejects.toThrow("synthetic crash after commit");
    expect((await db.query("SELECT state FROM driver_car_review_operations WHERE idempotency_key = 'driver-1'"))
      .rows[0].state).toBe("committed");
    setDriverCarReviewCrashHookForTests(null);
    const driverDecision = await decide("driver-1", "driver", driver);
    expect(driverDecision.state).toBe("acknowledged");
    expect((await decide("driver-1", "driver", driver)).id).toBe(driverDecision.id);
    await expect(reviews.decide(operator, "driver-1", "driver", driver,
      { outcome: "rejected", reason: "Different synthetic reason", review_after: null }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_PAYLOAD_MISMATCH" });
    await expect(assertApprovedDriverCanOfferRide(driver, car))
      .rejects.toMatchObject({ code: "DRIVER_CAR_NOT_APPROVED" });
    setDriverCarReviewCrashHookForTests((point) => {
      if (point === "after_receipt") throw new Error("synthetic crash after receipt");
    });
    await expect(decide("car-1", "vehicle", car)).rejects.toMatchObject({ code: "OPERATION_PENDING" });
    setDriverCarReviewCrashHookForTests(null);
    expect((await db.query("SELECT state FROM driver_car_review_operations WHERE idempotency_key = 'car-1'"))
      .rows[0].state).toBe("committed");
    await reviews.reconcileReceipts(operator);
    await db.query("UPDATE pilot_recovery_state SET mode = 'open', cause = NULL, started_at = NULL");
    await expect(assertApprovedDriverCanOfferRide(driver, car))
      .rejects.toMatchObject({ code: "DRIVER_CAR_NOT_APPROVED" });
    await decide("permission-1", "association", association.id);
    await expect(assertApprovedDriverCanOfferRide(driver, car)).resolves.toMatchObject({ id: car });
    await db.query("UPDATE driver_vehicle_approvals SET review_after = CURRENT_DATE WHERE id = $1", [association.id]);
    await expect(assertApprovedDriverCanOfferRide(driver, car))
      .rejects.toMatchObject({ code: "DRIVER_CAR_NOT_APPROVED" });
    await db.query("UPDATE driver_vehicle_approvals SET review_after = CURRENT_DATE + 30 WHERE id = $1", [association.id]);
    await db.query("UPDATE driver_eligibility SET license_expires_at = CURRENT_DATE WHERE user_id = $1", [driver]);
    await expect(assertApprovedDriverCanOfferRide(driver, car))
      .rejects.toMatchObject({ code: "DRIVER_CAR_NOT_APPROVED" });
    await db.query("UPDATE driver_eligibility SET license_expires_at = CURRENT_DATE + 30 WHERE user_id = $1", [driver]);
    await db.query("UPDATE vehicles SET insurance_expires_at = CURRENT_DATE WHERE id = $1", [car]);
    await expect(assertApprovedDriverCanOfferRide(driver, car))
      .rejects.toMatchObject({ code: "DRIVER_CAR_NOT_APPROVED" });
    await db.query("UPDATE vehicles SET insurance_expires_at = CURRENT_DATE + 30 WHERE id = $1", [car]);
    await db.query("UPDATE student_verifications SET eligibility_ends_at = now() - interval '1 second' WHERE user_id = $1", [driver]);
    await expect(assertApprovedDriverCanOfferRide(driver, car))
      .rejects.toMatchObject({ code: "DRIVER_CAR_NOT_APPROVED" });
    await expect(uploadEvidence(driver, "vehicle", car, "applicable", pdf, "application/pdf"))
      .rejects.toMatchObject({ code: "STUDENT_VERIFICATION_INACTIVE" });
    await db.query("UPDATE student_verifications SET eligibility_ends_at = now() + interval '1 year' WHERE user_id = $1", [driver]);
    const revoked = await reviews.decide(operator, "permission-revoke", "association", association.id,
      { outcome: "revoked", reason: "Synthetic permission was withdrawn", review_after: null });
    expect(revoked.state).toBe("acknowledged");
    await expect(assertApprovedDriverCanOfferRide(driver, car))
      .rejects.toMatchObject({ code: "DRIVER_CAR_NOT_APPROVED" });
    await db.query("UPDATE operator_allowlist SET active = false WHERE user_id = $1", [operator]);
    await expect(reviews.decide(operator, "permission-revoke", "association", association.id,
      { outcome: "revoked", reason: "Synthetic permission was withdrawn", review_after: null }))
      .rejects.toMatchObject({ code: "OPERATOR_ACCESS_REVOKED" });
    expect((await db.query(`SELECT count(*)::int AS n FROM pilot_notification_events
      WHERE origin_type = 'driver_car_review' AND ready_at IS NOT NULL`)).rows[0].n).toBe(4);
    expect((await db.query(`SELECT count(*)::int AS n FROM driver_car_evidence
      WHERE status = 'retained' AND delete_after <= decision_at + interval '7 days'`)).rows[0].n).toBe(5);
    await db.query("UPDATE operator_allowlist SET active = true WHERE user_id = $1", [operator]);
    await db.query("DELETE FROM driver_vehicle_approvals WHERE id = $1", [association.id]);
    await db.query("DELETE FROM vehicles WHERE id = $1", [car]);
    await db.query("DELETE FROM driver_eligibility WHERE user_id = $1", [driver]);
    await db.query("DELETE FROM driver_car_evidence_access_grants");
    await db.query("DELETE FROM driver_car_evidence");
    await db.query("DELETE FROM driver_car_review_operations");
    await reviews.reconcileReceipts(operator);
    expect((await db.query("SELECT status FROM driver_eligibility WHERE user_id = $1", [driver]))
      .rows[0].status).toBe("approved");
    expect((await db.query("SELECT verification_status FROM vehicles WHERE id = $1", [car]))
      .rows[0].verification_status).toBe("approved");
    expect((await db.query("SELECT status FROM driver_vehicle_approvals WHERE id = $1", [association.id]))
      .rows[0].status).toBe("revoked");
    expect((await db.query("SELECT state FROM driver_car_review_operations WHERE id = $1", [revoked.id]))
      .rows[0].state).toBe("recovered");
    expect((await db.query("SELECT count(*)::int AS n FROM driver_car_evidence WHERE status = 'retained'"))
      .rows[0].n).toBe(5);
  });
});
