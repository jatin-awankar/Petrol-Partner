import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

vi.mock("../queues", () => ({
  bookingExpiryQueueName: "booking-expiry",
  settlementOverdueQueueName: "settlement-overdue",
  paymentReconcileQueueName: "payment-reconcile",
  redisConnection: {},
  paymentReconcileQueue: { add: vi.fn() },
  settlementOverdueQueue: { getJob: vi.fn() },
}));

import { expireBooking } from "./booking-expiry.job";
import { markSettlementOverdue } from "./settlement-overdue.job";
import { reconcilePayment } from "./payment-reconcile.job";

const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeAll(async () => {
  for (const migration of ["0001_init.sql", "0020_corridor_offers.sql"]) {
    await db.query(await readFile(resolve(import.meta.dirname, "../../../api/src/db/migrations", migration), "utf8"));
  }
});
afterAll(async () => { await db.end(); });

it("leaves a pilot-linked legacy booking and payment unchanged on repeated queued jobs", async () => {
  await db.query("UPDATE pilot_pause_state SET paused=false,operation_id=NULL");
  await db.query("INSERT INTO pilot_recovery_state(singleton,mode) VALUES(true,'open') ON CONFLICT(singleton) DO UPDATE SET mode='open',cause=NULL");
  const driver = (await db.query<{id: string}>(
    "INSERT INTO users(email) VALUES($1) RETURNING id", [`legacy-driver-${randomUUID()}@example.test`])).rows[0].id;
  const passenger = (await db.query<{id: string}>(
    "INSERT INTO users(email) VALUES($1) RETURNING id", [`legacy-passenger-${randomUUID()}@example.test`])).rows[0].id;
  const policy = (await db.query<{id: string}>(
    "SELECT id FROM pilot_corridor_policies WHERE version=1")).rows[0].id;
  const offer = (await db.query<{id: string}>(`INSERT INTO ride_offers
    (driver_id,pickup_location,pickup_lat,pickup_lng,drop_location,drop_lat,drop_lng,date,time,
     available_seats,price_per_seat_paise,pilot_policy_id)
    VALUES($1,'University',20.9386,77.76,'PRMITR',20.93,77.75,current_date,'09:00',1,2500,$2)
    RETURNING id`, [driver, policy])).rows[0].id;
  const booking = (await db.query<{id: string}>(`INSERT INTO bookings
    (ride_offer_id,created_by_user_id,passenger_id,driver_id,seats_booked,total_amount_paise,
     status,payment_state,expires_at)
    VALUES($1,$2,$2,$3,1,2500,'pending','order_created',now()-interval '1 hour') RETURNING id`,
    [offer,passenger,driver])).rows[0].id;
  const settlement = (await db.query<{id: string}>(`INSERT INTO booking_settlements
    (booking_id,payer_user_id,payee_user_id,ride_fare_paise,total_due_paise,status,due_at)
    VALUES($1,$2,$3,2500,2500,'due',now()-interval '1 hour') RETURNING id`,
    [booking,passenger,driver])).rows[0].id;
  const order = (await db.query<{id: string}>(`INSERT INTO payment_orders
    (booking_id,user_id,provider,provider_order_id,amount_paise,status,idempotency_key)
    VALUES($1,$2,'razorpay',$3,2500,'created',$4) RETURNING id`,
    [booking,passenger,`order_${randomUUID()}`,randomUUID()])).rows[0].id;

  for (let attempt = 0; attempt < 2; attempt++) {
    expect(await expireBooking(booking)).toEqual({outcome: "pilot_scope_disabled"});
    expect(await markSettlementOverdue(settlement)).toEqual({outcome: "pilot_scope_disabled"});
    expect(await reconcilePayment({paymentOrderId: order})).toEqual({outcome: "payment_order_missing"});
  }
  expect((await db.query("SELECT status,payment_state FROM bookings WHERE id=$1",[booking])).rows)
    .toEqual([{status:"pending",payment_state:"order_created"}]);
  expect((await db.query("SELECT available_seats FROM ride_offers WHERE id=$1",[offer])).rows)
    .toEqual([{available_seats:1}]);
  expect((await db.query("SELECT status FROM booking_settlements WHERE id=$1",[settlement])).rows)
    .toEqual([{status:"due"}]);
  expect((await db.query("SELECT status FROM payment_orders WHERE id=$1",[order])).rows)
    .toEqual([{status:"created"}]);
  for (const table of ["booking_status_events","settlement_events","outstanding_balances"]) {
    expect((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE booking_id=$1`,[booking])).rows[0].n).toBe(0);
  }
  expect((await db.query("SELECT count(*)::int AS n FROM payment_attempts WHERE payment_order_id=$1",[order])).rows[0].n).toBe(0);
});
