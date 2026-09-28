import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const parsedUrl = new URL(databaseUrl);
const databaseName = parsedUrl.pathname.slice(1);
if (process.env.TEST_DATABASE_DISPOSABLE !== "true"
    || !["127.0.0.1", "localhost"].includes(parsedUrl.hostname)
    || !databaseName.endsWith("_test")) {
  throw new Error(
    "Rehearsal is destructive and requires TEST_DATABASE_DISPOSABLE=true, a localhost host, and a database name ending in _test",
  );
}

const projectRoot = resolve(import.meta.dirname, "..");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const run = (...args) => {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "db-migrate.mjs"), ...args], {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const error = new Error(`Migration command failed with status ${result.status}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }
  return result.stdout;
};

async function reset() {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
}

try {
  await reset();
  await pool.query("CREATE TABLE legacy_untracked_data (id integer PRIMARY KEY)");
  let untrackedRefusal = false;
  try {
    run();
  } catch (error) {
    untrackedRefusal = /Refusing to infer a baseline/.test(`${error.stderr ?? ""}${error.stdout ?? ""}${error.message}`);
  }
  if (!untrackedRefusal) throw new Error("Migration runner did not refuse an untracked non-empty database");

  await reset();
  run();
  run("--check");
  const cleanTables = Number((await pool.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
  )).rows[0].count);

  await reset();
  run("--to", "0002_profile_settings.sql");
  await pool.query(`
    INSERT INTO users (id, email) VALUES
      ('00000000-0000-4000-8000-000000000001', 'driver@example.test'),
      ('00000000-0000-4000-8000-000000000002', 'passenger@example.test');
    UPDATE users SET password_hash = 'synthetic-legacy-hash'
      WHERE id = '00000000-0000-4000-8000-000000000002';
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES ('70000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002', 'synthetic-token-hash', now() + interval '1 day');
    INSERT INTO user_profiles (user_id, full_name, phone, college) VALUES
      ('00000000-0000-4000-8000-000000000001', 'Synthetic Driver', '0000000001', 'Synthetic College'),
      ('00000000-0000-4000-8000-000000000002', 'Synthetic Passenger', '0000000002', 'Synthetic College');
    INSERT INTO student_verifications
      (id, user_id, provider, status, institution_name, eligibility_ends_at)
    VALUES
      ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'manual_review', 'verified', 'Synthetic College', now() + interval '1 year'),
      ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'manual_review', 'verified', 'Synthetic College', now() + interval '1 year');
    INSERT INTO vehicles
      (id, owner_user_id, vehicle_type, registration_number_last4, seat_capacity, verification_status)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'car', '0001', 3, 'approved');
    INSERT INTO ride_offers
      (id, driver_id, vehicle_id, pickup_location, pickup_lat, pickup_lng, drop_location, drop_lat, drop_lng, date, time, available_seats, price_per_seat_paise, status)
    VALUES
      ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Origin', 20, 77, 'Destination', 20.1, 77.1, current_date + 1, '09:00', 2, 12000, 'active');
    INSERT INTO ride_requests
      (id, passenger_id, pickup_location, pickup_lat, pickup_lng, drop_location, drop_lat, drop_lng, date, time, seats_required, price_per_seat_paise, status)
    VALUES
      ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Origin', 20, 77, 'Destination', 20.1, 77.1, current_date + 1, '09:00', 1, 12000, 'active');
    INSERT INTO bookings
      (id, ride_offer_id, created_by_user_id, passenger_id, driver_id, seats_booked, total_amount_paise, platform_fee_paise, status, payment_state, confirmed_at)
    VALUES
      ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 1, 12500, 500, 'confirmed', 'paid_escrow', now());
    INSERT INTO payment_orders
      (id, booking_id, user_id, provider, provider_order_id, amount_paise, currency, status, idempotency_key)
    VALUES
      ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'historical-razorpay', 'synthetic-order', 12500, 'INR', 'paid', 'synthetic-key');
    INSERT INTO booking_settlements
      (id, booking_id, payer_user_id, payee_user_id, ride_fare_paise, platform_fee_paise, total_due_paise, paid_amount_paise, preferred_payment_method, status)
    VALUES
      ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 12000, 500, 12500, 12500, 'online', 'settled');
  `);

  const before = (await pool.query(`SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM bookings) AS bookings,
    (SELECT count(*)::int FROM ride_requests WHERE status = 'active') AS active_requests,
    (SELECT coalesce(sum(amount_paise), 0)::bigint FROM payment_orders) AS payment_total,
    (SELECT coalesce(sum(total_due_paise), 0)::bigint FROM booking_settlements) AS settlement_total`)).rows[0];
  run();
  run("--check");
  const after = (await pool.query(`SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM bookings) AS bookings,
    (SELECT count(*)::int FROM ride_requests WHERE status = 'active') AS active_requests,
    (SELECT coalesce(sum(amount_paise), 0)::bigint FROM payment_orders) AS payment_total,
    (SELECT coalesce(sum(total_due_paise), 0)::bigint FROM booking_settlements) AS settlement_total,
    (SELECT count(*)::int FROM chat_rooms WHERE booking_id = '40000000-0000-4000-8000-000000000001') AS migrated_chat_rooms,
    (SELECT count(*)::int FROM user_profiles WHERE user_id IN ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')) AS stable_identities,
    (SELECT count(*)::int FROM ride_requests request
      JOIN users passenger ON passenger.id = request.passenger_id
      WHERE request.status = 'active') AS preserved_request_passengers`)).rows[0];

  if (before.users !== after.users || before.bookings !== after.bookings
      || before.active_requests !== after.active_requests
      || before.payment_total !== after.payment_total || before.settlement_total !== after.settlement_total
      || after.migrated_chat_rooms !== 1 || after.stable_identities !== 2
      || after.preserved_request_passengers !== 1) {
    throw new Error(`Representative upgrade invariant failed: ${JSON.stringify({ before, after })}`);
  }

  const claimedUserId = "00000000-0000-4000-8000-000000000002";
  const claim = await pool.connect();
  let precommitRollbackPreservedLegacyState = false;
  try {
    await claim.query("BEGIN");
    await claim.query(`UPDATE users SET password_hash = NULL WHERE id = $1`, [claimedUserId]);
    await claim.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1`, [claimedUserId]);
    await claim.query(`INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email)
      VALUES ('supabase', 'synthetic-passenger-subject', $1, 'passenger@example.test')`, [claimedUserId]);
    await claim.query("ROLLBACK");
    const rolledBack = (await claim.query(`SELECT
      app_user.password_hash IS NOT NULL AS legacy_password_preserved,
      token.revoked_at IS NULL AS legacy_token_preserved,
      NOT EXISTS (SELECT 1 FROM auth_identities WHERE provider_subject = 'synthetic-passenger-subject') AS mapping_absent,
      state.active_provider = 'legacy' AND state.legacy_login_enabled AS legacy_mode_preserved
      FROM users app_user JOIN refresh_tokens token ON token.user_id = app_user.id
      CROSS JOIN auth_cutover_state state WHERE app_user.id = $1`, [claimedUserId])).rows[0];
    precommitRollbackPreservedLegacyState = rolledBack?.legacy_password_preserved === true
      && rolledBack.legacy_token_preserved === true && rolledBack.mapping_absent === true
      && rolledBack.legacy_mode_preserved === true;
    if (!precommitRollbackPreservedLegacyState) throw new Error("Precommit rollback lost legacy state");

    await claim.query("BEGIN");
    await claim.query(`UPDATE users SET email_verified_at = now(), password_hash = NULL WHERE id = $1`, [claimedUserId]);
    await claim.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [claimedUserId]);
    await claim.query(`INSERT INTO auth_identities (provider, provider_subject, user_id, provider_email)
      VALUES ('supabase', 'synthetic-passenger-subject', $1, 'passenger@example.test')`, [claimedUserId]);
    await claim.query(`UPDATE auth_cutover_state SET active_provider = 'supabase',
      legacy_login_enabled = false, authorized_at = now(), authorized_by = 'synthetic-rehearsal'
      WHERE singleton = true`);
    await claim.query("COMMIT");
  } catch (error) {
    await claim.query("ROLLBACK");
    throw error;
  } finally {
    claim.release();
  }
  const authCutover = (await pool.query(`SELECT
    identity.user_id AS mapped_application_user_id,
    booking.passenger_id AS historical_booking_passenger_id,
    token.revoked_at IS NOT NULL AND app_user.password_hash IS NULL AS legacy_session_revoked,
    state.active_provider = 'supabase' AND state.authorized_at IS NOT NULL AS managed_cutover_authorized,
    NOT state.legacy_login_enabled AS legacy_login_disabled
    FROM auth_identities identity
    JOIN users app_user ON app_user.id = identity.user_id
    JOIN bookings booking ON booking.passenger_id = app_user.id
    JOIN refresh_tokens token ON token.user_id = app_user.id
    CROSS JOIN auth_cutover_state state
    WHERE identity.provider = 'supabase' AND identity.provider_subject = 'synthetic-passenger-subject'`)).rows[0];
  if (!authCutover || authCutover.mapped_application_user_id !== claimedUserId
      || authCutover.historical_booking_passenger_id !== claimedUserId
      || !authCutover.legacy_session_revoked || !authCutover.managed_cutover_authorized
      || !authCutover.legacy_login_disabled) {
    throw new Error("Representative auth cutover invariant failed");
  }

  console.log(JSON.stringify({
    safety: { refusedUntrackedNonEmptyDatabase: untrackedRefusal },
    cleanInstall: { tables: cleanTables },
    representativeUpgrade: { before, after },
    representativeAuthCutover: {
      mappedApplicationUserId: authCutover.mapped_application_user_id,
      historicalBookingPassengerId: authCutover.historical_booking_passenger_id,
      legacySessionRevoked: authCutover.legacy_session_revoked,
      managedCutoverAuthorized: authCutover.managed_cutover_authorized,
      legacyLoginDisabled: authCutover.legacy_login_disabled,
      precommitRollbackPreservedLegacyState,
      postCommitLegacyRollbackUnsafe: authCutover.legacy_session_revoked && authCutover.legacy_login_disabled,
    },
  }, null, 2));
} finally {
  await pool.end();
}
