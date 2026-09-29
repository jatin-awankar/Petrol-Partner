import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
try {
  const existing = await rows("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");
  if (existing[0].n !== 0) throw new Error('Disposable target must start empty');
  command('node', ['scripts/db-migrate.mjs', '--to', '0034_closure_recovery.sql']);
  await pool.query(await readFile('scripts/ticket14-fixtures.sql', 'utf8'));
  const before = await snapshot();
  const beforeFks = await orphanCounts();
  const beforeLedger = await rows('SELECT name,checksum FROM schema_migrations ORDER BY name');
  const backupDir = await mkdtemp(join(tmpdir(), 'pp14-backup-'));
  const backup = join(backupDir, 'baseline.dump');
  command('pg_dump', ['-Fc', '-f', backup, url.href]);
  report.backup = backup;

  // A transactionally failed migration cannot change history or application state.
  const failure = await pool.connect();
  await failure.query('BEGIN');
  try {
    await failure.query('CREATE TABLE ticket14_failed_migration (id integer)');
    await failure.query('SELECT 1/0');
  } catch (error) {
    report.failedMigration = error.code;
    await failure.query('ROLLBACK');
  } finally { failure.release(); }
  if ((await rows("SELECT to_regclass('ticket14_failed_migration') IS NULL AS clean"))[0].clean !== true)
    throw new Error('Failed migration left a table');

  command('node', ['scripts/db-migrate.mjs']);
  command('node', ['scripts/db-migrate.mjs', '--check']);
  const after = await snapshot();
  const afterFks = await orphanCounts();
  const afterLedger = await rows('SELECT name,checksum FROM schema_migrations ORDER BY name');
  const changed = Object.keys(before).filter(table => JSON.stringify(before[table]) !== JSON.stringify(after[table]));
  if (changed.length) throw new Error(`Historical table changed: ${changed.join(', ')}`);
  if (Object.values(beforeFks).some(Boolean) || Object.values(afterFks).some(Boolean))
    throw new Error('Foreign key orphan detected');
  if (afterLedger.length !== 42 || JSON.stringify(afterLedger.slice(0, 34)) !== JSON.stringify(beforeLedger))
    throw new Error('Migration ledger divergence');
  report.before = Object.fromEntries(Object.entries(before).filter(([, value]) => value.count).map(([k,v]) => [k,v.count]));
  report.after = Object.fromEntries(Object.entries(after).filter(([, value]) => value.count).map(([k,v]) => [k,v.count]));
  report.preservedHistoricalTables = Object.keys(before).length;
  report.foreignKeys = { before: Object.keys(beforeFks).length, after: Object.keys(afterFks).length, orphans: 0 };
  report.ledger = { before: beforeLedger.length, after: afterLedger.length };
  report.reads = {
    corridor: (await rows(`SELECT a.policy_version,a.contribution_paise,a.currency,o.amount_paise,
      r.offer_id FROM pilot_seat_allocations a JOIN pilot_contribution_obligations o ON o.allocation_id=a.id
      JOIN pilot_seat_requests r ON r.id=a.request_id`))[0],
    platformPayment: (await rows(`SELECT b.total_amount_paise,p.amount_paise,p.currency,
      s.total_due_paise FROM bookings b JOIN payment_orders p ON p.booking_id=b.id
      JOIN booking_settlements s ON s.booking_id=b.id`))[0],
    unrestrictedTables: (await rows("SELECT to_regclass('posted_route_offers') IS NOT NULL AS offers, to_regclass('posted_route_seat_allocations') IS NOT NULL AS seats"))[0],
  };
  if (report.reads.corridor.contribution_paise !== 2500 || report.reads.corridor.amount_paise !== 2500 ||
      report.reads.platformPayment.amount_paise !== 12500) throw new Error('Frozen amount changed');

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
    report.restore = { database: restoreName, ledger: check.rows[0].n,
      historicalRowsIdentical: true, status: 'isolated baseline restored; writes remain closed' };
  } finally { await restored.end(); }
  console.log(JSON.stringify(report, null, 2));
} finally { await pool.end(); }
