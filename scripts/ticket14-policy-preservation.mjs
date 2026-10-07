// Supplemental fixtures only. Run on an approved, restored local copy at 0043.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtemp, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import receiptModule from '../apps/api/src/modules/operator/receipt-store.ts';

const { SignedReceiptStore } = receiptModule;

const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.TEST_DATABASE_DISPOSABLE !== 'true' || process.env.MIGRATION_DATABASE_URL ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test'))
  throw new Error('Requires an explicitly disposable localhost _test copy and no migration override');
const db = new pg.Client({ connectionString: url.href });
const directory = await mkdtemp(join(tmpdir(), 'pp14-policy-preservation-'));
const secret = randomBytes(32).toString('hex');
const receipts = new SignedReceiptStore(join(directory, 'receipts'), secret);
function command(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(`${file} failed (details withheld; inspect the disposable database)`);
}
async function projection(client) {
  const result = {};
  for (const table of ['users', 'auth_identities', 'pilot_seat_allocations', 'pilot_contribution_obligations',
    'bookings', 'booking_settlements', 'payment_orders', 'posted_route_offers',
    'posted_route_seat_requests', 'posted_route_seat_allocations']) {
    const rows = (await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
    result[table] = { count: rows.length, digest: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  return result;
}
try {
  await db.connect();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 43);
  command('node', ['scripts/db-migrate.mjs', '--to', '0043_posted_route_verification.sql', '--check']);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM posted_route_offers')).rows[0].n, 0);
  const driver = '00000000-0000-4000-8000-000000000001';
  const passenger = '00000000-0000-4000-8000-000000000002';
  const vehicle = randomUUID();
  await db.query(`INSERT INTO unrestricted_vehicle_declarations
    (id,driver_user_id,category,registration_identifier,registration_expires_on,insurance_expires_on,
     permission_to_use,belted_passenger_seats,passenger_capacity,policy_version,declared_at,renew_after,operation_id)
    VALUES($1,$2,'car','SYNTHETIC-TICKET14', '2030-01-01','2030-01-01',true,3,3,
      'unrestricted-declared-2026-09-28.1','2026-01-01','2027-01-01',$3)`, [vehicle, driver, randomUUID()]);
  const snapshots = [];
  for (const [index, policy] of ['unrestricted-route-contribution-2026-10-03.2',
    'unrestricted-route-contribution-2026-10-04.1'].entries()) {
    const offer = randomUUID(), request = randomUUID(), allocation = randomUUID();
    const area = index === 0 ? {} : { service_area_id: 'amravati-core-v1',
      service_area_hash: 'b342438fbb8aecf2e3f5cf82cf1ddfa2ea7d6ae02343e3319a41220b1d4eb42c' };
    const terms = { route_id: offer, route_version: 1, pickup: [77.75, 20.91], dropoff: [77.76, 20.92],
      segment_meters: 2000, distance_source: 'synthetic-saved-route', vehicle_category: 'car',
      rate_paise_per_km: 700, rounding_rule: 'half-up', policy_version: policy, currency: 'INR', total_paise: 1400, ...area };
    // These rows exercise storage preservation, not provider/area approval or API publication.
    await db.query(`INSERT INTO posted_route_offers(id,driver_id,vehicle_declaration_id,policy_version,
      operating_policy_version,routing_source,routing_mode,geometry,cumulative_meters,distance_meters,duration_seconds,
      departure_at,commitment_until,request_cutoff_at,acceptance_cutoff_at,capacity,route_verification)
      VALUES($1,$2,$3,$4,$5,'synthetic-ticket14','car',$6,'[0,2000]',2000,600,
      '2026-11-01 10:00Z','2026-11-01 11:00Z','2026-11-01 08:00Z','2026-11-01 09:00Z',3,$7)`,
    [offer, driver, vehicle, policy, index === 0 ? '2026-10-03.2' : '2026-10-04.1',
      JSON.stringify([terms.pickup, terms.dropoff]), JSON.stringify({ synthetic: true, ...area })]);
    await db.query(`INSERT INTO posted_route_seat_requests(id,offer_id,passenger_id,driver_id,status,
      route_version,selection,proposed_terms,decision_deadline_at)
      VALUES($1,$2,$3,$4,'accepted',1,$5,$6,'2026-11-01 09:00Z')`,
    [request, offer, passenger, driver, JSON.stringify({ pickup: terms.pickup, dropoff: terms.dropoff }), JSON.stringify(terms)]);
    await db.query(`INSERT INTO posted_route_seat_allocations(id,request_id,offer_id,passenger_id,driver_id,
      vehicle_declaration_id,accepted_terms,departure_at,commitment_until)
      VALUES($1,$2,$3,$4,$5,$6,$7,'2026-11-01 10:00Z','2026-11-01 11:00Z')`,
    [allocation, request, offer, passenger, driver, vehicle, JSON.stringify(terms)]);
    snapshots.push({ operationId: randomUUID(), synthetic: true, allocationId: allocation, acceptedTerms: terms });
  }
  for (const snapshot of snapshots) await receipts.append(snapshot);
  const signedBefore = await receipts.list();
  const before = await projection(db);
  const backup = join(directory, 'baseline43.dump');
  command('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', backup, url.href]);
  await chmod(backup, 0o600);
  command('node', ['scripts/db-migrate.mjs']);
  assert.deepEqual(await projection(db), before);
  assert.deepEqual(await receipts.list(), signedBefore);
  const restore = new URL(url.href); restore.pathname += '_policy_restore_test';
  command('createdb', ['-h', url.hostname, '-p', url.port, restore.pathname.slice(1)]);
  command('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname', restore.href, backup]);
  const restored = new pg.Client({ connectionString: restore.href });
  try {
    await restored.connect();
    assert.deepEqual(await projection(restored), before);
    assert.deepEqual(await receipts.list(), signedBefore);
    const gates = (await restored.query(`SELECT mode='restricted' AND
      (SELECT bool_and(paused) FROM pilot_pause_state) AS closed FROM pilot_recovery_state WHERE singleton`)).rows[0];
    assert.equal(gates.closed, true);
    const terms = (await restored.query('SELECT accepted_terms FROM posted_route_seat_allocations ORDER BY accepted_terms->>\'policy_version\'')).rows;
    assert.equal('service_area_id' in terms[0].accepted_terms, false);
    assert.equal(terms[1].accepted_terms.service_area_id, 'amravati-core-v1');
    console.log(JSON.stringify({ supplementalSynthetic: true, sourceAuthContinuity: 'unproven',
      policyVersions: snapshots.map(s => s.acceptedTerms.policy_version),
      comparedTables: Object.keys(before).length, upgradePreserved: true, restorePreserved: true,
      signedFormatRoundTrips: signedBefore.length, productionReceiptStoreUsed: false,
      historicalAreaNotBackfilled: true, restoredWritesRestricted: true, artifactDirectory: directory }));
  } finally { await restored.end(); }
} finally { await db.end(); }
