import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, open, mkdir, readdir, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.TEST_DATABASE_DISPOSABLE !== 'true' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !url.pathname.endsWith('_test') || process.env.MIGRATION_DATABASE_URL) {
  throw new Error('Ticket 14 requires a localhost _test database, TEST_DATABASE_DISPOSABLE=true, and no migration override');
}
const pool = new pg.Pool({ connectionString: url.href, max: 3 });
const report = { provenance: 'Entirely synthetic fixtures; deployed inventory on 2026-09-29 had zero application rows',
  database: url.pathname.slice(1), exceptions: [] };
function command(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8', env: process.env });
  if (result.status !== 0) {
    const safeArgs = args.map(arg => arg.startsWith('postgresql://') ? '[local database URL]' : arg);
    const detail = (result.stderr || result.stdout).replace(/postgresql:\/\/[^\s'" ]+/g, '[local database URL]');
    throw new Error(`${file} ${safeArgs.join(' ')}: ${detail}`);
  }
  return result.stdout.trim();
}
async function rows(sql, db = pool) { return (await db.query(sql)).rows; }
async function snapshot(db = pool) {
  const tables = (await rows(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename`, db)).map(r => r.tablename);
  const result = {};
  for (const table of tables) {
    const data = await rows(`SELECT * FROM public."${table}"`, db);
    result[table] = { count: data.length, digest: createHash('sha256')
      .update(JSON.stringify(data.map(row => JSON.stringify(row)).sort())).digest('hex') };
  }
  return result;
}
async function orphanCounts() {
  const fks = await rows(`SELECT conname, conrelid::regclass::text AS source, confrelid::regclass::text AS target,
    (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(conkey) WITH ORDINALITY k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.attnum) AS source_cols,
    (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(confkey) WITH ORDINALITY k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.attnum) AS target_cols
    FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conname`);
  const result = {};
  for (const fk of fks) {
    const join = fk.source_cols.map((col, i) => `s."${col}"=t."${fk.target_cols[i]}"`).join(' AND ');
    const present = fk.source_cols.map(col => `s."${col}" IS NOT NULL`).join(' AND ');
    const count = await rows(`SELECT count(*)::int AS n FROM ${fk.source} s WHERE ${present} AND NOT EXISTS (SELECT 1 FROM ${fk.target} t WHERE ${join})`);
    result[`${fk.source}.${fk.conname}`] = count[0].n;
  }
  return result;
}
async function aggregateComparison() {
  const statusSources = {
    bookings: ['bookings', 'status'], corridorAllocations: ['pilot_seat_allocations', 'status'],
    platformOrders: ['payment_orders', 'status'], paymentAttempts: ['payment_attempts', 'status'],
    paymentWebhooks: ['payment_webhook_events', 'processing_status'], settlements: ['booking_settlements', 'status'],
  };
  const statuses = {};
  for (const [label, [table, column]] of Object.entries(statusSources)) {
    statuses[label] = Object.fromEntries((await rows(`SELECT ${column} AS status,count(*)::int AS count FROM ${table} GROUP BY ${column} ORDER BY ${column}`))
      .map(({ status, count }) => [status, count]));
  }
  const moneySources = {
    corridorAccepted: `SELECT a.currency,a.status,a.contribution_paise AS amount FROM pilot_seat_allocations a`,
    corridorObligations: `SELECT o.currency,a.status,o.amount_paise AS amount FROM pilot_contribution_obligations o
      JOIN pilot_seat_allocations a ON a.id=o.allocation_id`,
    platformOrders: `SELECT currency,status,amount_paise AS amount FROM payment_orders`,
    paymentAttemptsLinkedOrders: `SELECT o.currency,a.status,o.amount_paise AS amount
      FROM payment_attempts a JOIN payment_orders o ON o.id=a.payment_order_id`,
    settlements: `SELECT 'not_stored'::text AS currency,status,total_due_paise AS amount FROM booking_settlements`,
  };
  const money = {};
  for (const [label, source] of Object.entries(moneySources)) {
    money[label] = (await rows(`SELECT currency,status,count(*)::int AS count,sum(amount)::int AS amount_paise
      FROM (${source}) amounts GROUP BY currency,status ORDER BY currency,status`))
      .map(({ currency,status,count,amount_paise }) => ({ currency,status,count,amountPaise: amount_paise }));
  }
  const idCounts = {};
  const idDigests = {};
  for (const [label, table] of Object.entries({ users: 'users', bookings: 'bookings', allocations: 'pilot_seat_allocations' })) {
    const ids = (await rows(`SELECT id FROM ${table} ORDER BY id`)).map(row => row.id);
    idCounts[label] = ids.length;
    idDigests[label] = createHash('sha256').update(JSON.stringify(ids)).digest('hex');
  }
  const ownerMismatches = (await rows(`SELECT
    (SELECT count(*) FROM auth_identities i JOIN users u ON u.id=i.user_id
      WHERE lower(i.provider_email)<>lower(u.email)) +
    (SELECT count(*) FROM ride_offers o JOIN vehicles v ON v.id=o.vehicle_id
      WHERE o.driver_id<>v.owner_user_id) +
    (SELECT count(*) FROM pilot_seat_requests r JOIN ride_offers o ON o.id=r.offer_id
      WHERE r.driver_id<>o.driver_id) +
    (SELECT count(*) FROM pilot_seat_allocations a
      JOIN pilot_seat_requests r ON r.id=a.request_id JOIN ride_offers o ON o.id=a.offer_id
      WHERE a.offer_id<>r.offer_id OR a.passenger_id<>r.passenger_id OR
        a.driver_id<>o.driver_id OR a.vehicle_id<>o.vehicle_id) +
    (SELECT count(*) FROM bookings b JOIN ride_offers o ON o.id=b.ride_offer_id
      WHERE b.driver_id<>o.driver_id OR b.created_by_user_id<>b.passenger_id) +
    (SELECT count(*) FROM payment_orders p JOIN bookings b ON b.id=p.booking_id
      WHERE p.user_id<>b.passenger_id) +
    (SELECT count(*) FROM booking_settlements s JOIN bookings b ON b.id=s.booking_id
      WHERE s.payer_user_id<>b.passenger_id OR s.payee_user_id<>b.driver_id)
    AS count`))[0].count;
  return { statuses, money, ownerMismatches: Number(ownerMismatches), idCounts, idDigests };
}
try {
  const existing = await rows("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");
  if (existing[0].n !== 0) throw new Error('Disposable target must start empty');
  command('node', ['scripts/db-migrate.mjs', '--to', '0003_chat.sql']);
  command('node', ['scripts/db-migrate.mjs', '--to', '0003_chat.sql', '--check']);
  const deployedPrefix = (await rows('SELECT count(*)::int AS n FROM schema_migrations'))[0].n;
  if (deployedPrefix !== 3) throw new Error('Deployed migration prefix mismatch');
  command('node', ['scripts/db-migrate.mjs', '--to', '0034_closure_recovery.sql']);
  await pool.query(await readFile('scripts/ticket14-fixtures.sql', 'utf8'));
  const integrity = await pool.connect();
  let invalidReferenceRejected = false;
  try {
    await integrity.query('BEGIN');
    await integrity.query('SAVEPOINT invalid_reference');
    try {
      await integrity.query(`INSERT INTO auth_identities(provider,provider_subject,user_id,provider_email)
        VALUES ('supabase','synthetic-invalid','ffffffff-ffff-4fff-8fff-ffffffffffff','invalid@example.test')`);
    } catch (error) {
      invalidReferenceRejected = error.code === '23503';
      await integrity.query('ROLLBACK TO SAVEPOINT invalid_reference');
    }
    await integrity.query('ROLLBACK');
  } finally { integrity.release(); }
  report.fixtureIntegrity = {
    foreignKeysEnforced: (await rows("SELECT current_setting('session_replication_role')='origin' AS enabled"))[0].enabled,
    invalidReferenceRejected,
    pilotStateRestrictedAfterSeed: (await rows(`SELECT mode='restricted' AND
      (SELECT bool_and(paused) FROM pilot_pause_state) AS restricted
      FROM pilot_recovery_state WHERE singleton=true`))[0].restricted,
  };
  if (Object.values(report.fixtureIntegrity).some(value => value !== true))
    throw new Error('Fixture integrity failed');
  const before = await snapshot();
  const beforeComparison = await aggregateComparison();
  const beforeFks = await orphanCounts();
  const beforeLedger = await rows('SELECT name,checksum FROM schema_migrations ORDER BY name');
  const backupDir = await mkdtemp(join(tmpdir(), 'pp14-backup-'));
  const backup = join(backupDir, 'baseline.dump');
  command('pg_dump', ['-Fc', '-f', backup, url.href]);
  report.backup = backup;

  // Give the real runner an exact 0001–0034 prefix followed by one disposable failing file.
  const failureRoot = await mkdtemp(join(tmpdir(), 'pp14-failing-migration-'));
  let runnerRejected = false;
  try {
    const migrationDirectory = join(failureRoot, 'apps/api/src/db/migrations');
    await mkdir(migrationDirectory, { recursive: true });
    const originals = (await readdir('apps/api/src/db/migrations')).filter(name => /^00(0[1-9]|[12][0-9]|3[0-4])_.*\.sql$/.test(name));
    for (const name of originals)
      await symlink(resolve('apps/api/src/db/migrations', name), join(migrationDirectory, name));
    if (originals.length !== 34) throw new Error('Failing migration fixture has an incomplete prefix');
    await writeFile(join(migrationDirectory, '0035_ticket14_forced_failure.sql'),
      'CREATE TABLE ticket14_failed_migration (id integer); SELECT 1/0;\n');
    const failed = spawnSync(process.execPath, [resolve('scripts/db-migrate.mjs')],
      { cwd: failureRoot, encoding: 'utf8', env: process.env });
    runnerRejected = failed.status !== 0 && /division by zero/.test(failed.stderr);
  } finally { await rm(failureRoot, { recursive: true, force: true }); }
  report.migrationFailure = {
    runnerRejected,
    ledgerUnchanged: JSON.stringify(await rows('SELECT name,checksum FROM schema_migrations ORDER BY name')) === JSON.stringify(beforeLedger),
    historicalRowsUnchanged: JSON.stringify(await snapshot()) === JSON.stringify(before),
    partialTableAbsent: (await rows("SELECT to_regclass('ticket14_failed_migration') IS NULL AS clean"))[0].clean,
  };
  if (Object.values(report.migrationFailure).some(value => value !== true))
    throw new Error('Migration-runner rollback invariant failed');

  command('node', ['scripts/db-migrate.mjs']);
  command('node', ['scripts/db-migrate.mjs', '--check']);
  const after = await snapshot();
  const afterComparison = await aggregateComparison();
  const afterFks = await orphanCounts();
  const afterLedger = await rows('SELECT name,checksum FROM schema_migrations ORDER BY name');
  const changed = Object.keys(before).filter(table => JSON.stringify(before[table]) !== JSON.stringify(after[table]));
  if (changed.length) throw new Error(`Historical table changed: ${changed.join(', ')}`);
  if (JSON.stringify(beforeComparison) !== JSON.stringify(afterComparison) || beforeComparison.ownerMismatches !== 0)
    throw new Error('Historical aggregate or ownership comparison failed');
  if (Object.values(beforeFks).some(Boolean) || Object.values(afterFks).some(Boolean))
    throw new Error('Foreign key orphan detected');
  if (afterLedger.length !== 44 || JSON.stringify(afterLedger.slice(0, 34)) !== JSON.stringify(beforeLedger))
    throw new Error('Migration ledger divergence');
  report.before = Object.fromEntries(Object.entries(before).filter(([, value]) => value.count).map(([k,v]) => [k,v.count]));
  report.after = Object.fromEntries(Object.entries(after).filter(([, value]) => value.count).map(([k,v]) => [k,v.count]));
  report.preservedHistoricalTables = Object.keys(before).length;
  report.foreignKeys = { before: Object.keys(beforeFks).length, after: Object.keys(afterFks).length, orphans: 0 };
  report.ledger = { before: beforeLedger.length, after: afterLedger.length };
  report.migrationSequence = { deployedPrefix, historicalPrefix: beforeLedger.length, expandedPrefix: afterLedger.length };
  report.comparison = { before: beforeComparison, after: afterComparison };
  report.reads = {
    corridor: (await rows(`SELECT a.policy_version,a.contribution_paise,a.currency,o.amount_paise
      FROM pilot_seat_allocations a JOIN pilot_contribution_obligations o ON o.allocation_id=a.id
      JOIN pilot_seat_requests r ON r.id=a.request_id`))[0],
    platformPayment: (await rows(`SELECT b.total_amount_paise,p.amount_paise,p.currency,
      s.total_due_paise FROM bookings b JOIN payment_orders p ON p.booking_id=b.id
      JOIN booking_settlements s ON s.booking_id=b.id`))[0],
    unrestrictedTables: (await rows("SELECT to_regclass('posted_route_offers') IS NOT NULL AS offers, to_regclass('posted_route_seat_allocations') IS NOT NULL AS seats"))[0],
  };
  if (report.reads.corridor.contribution_paise !== 2500 || report.reads.corridor.amount_paise !== 2500 ||
      report.reads.platformPayment.amount_paise !== 12500) throw new Error('Frozen amount changed');

  // This local receipt is independent of the database snapshot, but is not a provider Auth export.
  const acknowledged = (await pool.query(`INSERT INTO pilot_settlement_operations
    (obligation_id,actor_id,idempotency_key,payload_digest,kind,method,recorded_at,state,acknowledged_at)
    VALUES ('34000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
      'synthetic-newer-claim','synthetic-digest','claim','upi',now(),'acknowledged',now())
    RETURNING id,obligation_id,actor_id,idempotency_key,payload_digest,kind,method,recorded_at`)).rows[0];
  const journalPath = join(backupDir, 'newer-acknowledged-operation.json');
  const journal = await open(journalPath, 'wx', 0o600);
  try {
    await journal.writeFile(JSON.stringify(acknowledged));
    await journal.sync();
  } finally { await journal.close(); }
  const receipt = JSON.parse(await readFile(journalPath, 'utf8'));

  // Restore is isolated: create a second local database and compare exact historical rows.
  const restoreName = `${url.pathname.slice(1)}_restore_test`;
  command('createdb', ['-h', url.hostname, '-p', url.port, restoreName]);
  const restoreUrl = new URL(url.href); restoreUrl.pathname = `/${restoreName}`;
  command('pg_restore', ['--no-owner', '--dbname', restoreUrl.href, backup]);
  const restored = new pg.Pool({ connectionString: restoreUrl.href });
  try {
    const check = await restored.query('SELECT count(*)::int AS n FROM schema_migrations');
    if (check.rows[0].n !== 34) throw new Error('Restore ledger mismatch');
    if (JSON.stringify(await snapshot(restored)) !== JSON.stringify(before)) throw new Error('Restored historical rows differ from baseline');
    const missing = (await restored.query('SELECT count(*)::int AS n FROM pilot_settlement_operations WHERE id=$1', [receipt.id])).rows[0].n === 0;
    const stableMappings = (await restored.query(`SELECT count(*)::int AS n FROM auth_identities i
      JOIN users u ON u.id=i.user_id WHERE i.provider='supabase' AND
      ((u.id='00000000-0000-4000-8000-000000000001' AND i.provider_subject='synthetic-driver-subject') OR
       (u.id='00000000-0000-4000-8000-000000000002' AND i.provider_subject='synthetic-passenger-subject'))`)).rows[0].n;
    if (!missing || stableMappings !== 2) throw new Error('Restore reconciliation prerequisites failed');
    await restored.query(`INSERT INTO pilot_settlement_operations
      (id,obligation_id,actor_id,idempotency_key,payload_digest,kind,method,recorded_at,state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'recovered')`,
    [receipt.id,receipt.obligation_id,receipt.actor_id,receipt.idempotency_key,
      receipt.payload_digest,receipt.kind,receipt.method,receipt.recorded_at]);
    const recovered = (await restored.query(`SELECT count(*)::int AS n FROM pilot_settlement_operations
      WHERE id=$1 AND state='recovered'`, [receipt.id])).rows[0].n;
    const restricted = (await restored.query(`SELECT mode='restricted' AND
      (SELECT bool_and(paused) FROM pilot_pause_state) AS restricted
      FROM pilot_recovery_state WHERE singleton=true`)).rows[0].restricted;
    report.recovery = { newerAcknowledged: 1, missingBeforeReconcile: Number(missing),
      reconciled: recovered, stableAuthMappings: stableMappings, writesRestricted: restricted };
    if (recovered !== 1 || !restricted) throw new Error('Restore reconciliation failed');
    report.restore = { database: restoreName, ledger: check.rows[0].n,
      historicalRowsIdentical: true, status: 'isolated baseline restored and synthetic receipt reconciled; writes remain closed' };
  } finally { await restored.end(); }
  console.log(JSON.stringify(report, null, 2));
} finally { await pool.end(); }
