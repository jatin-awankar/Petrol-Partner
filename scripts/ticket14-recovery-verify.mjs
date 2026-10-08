// Read-only final assertions for the approved synthetic recovery target.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(process.env.TEST_DATABASE_DISPOSABLE, 'true');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55488');
assert.equal(url.pathname, '/pp14_receipts_restored_test');
const database = new pg.Client({ connectionString: url.href });
await database.connect();
try {
  await database.query('BEGIN READ ONLY');
  const ledger = (await database.query('SELECT name, checksum FROM schema_migrations ORDER BY name')).rows;
  const migrations = (await readdir('apps/api/src/db/migrations')).filter(name => name.endsWith('.sql')).sort();
  assert.equal(ledger.length, migrations.length);
  for (const [index, name] of migrations.entries()) {
    const checksum = createHash('sha256').update(await readFile(`apps/api/src/db/migrations/${name}`)).digest('hex');
    assert.ok(ledger[index].name === name && ledger[index].checksum === checksum, 'Migration ledger mismatch');
  }
  const role = (await database.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname='pp14_runtime'")).rows[0];
  assert.ok(role && Object.values(role).every(value => value === false));
  const privileges = (await database.query(`SELECT
    has_schema_privilege('pp14_runtime','public','CREATE') AS ddl,
    has_table_privilege('pp14_runtime','schema_migrations','INSERT,UPDATE,DELETE') AS ledger,
    has_table_privilege('pp14_runtime','payment_orders','INSERT,UPDATE,DELETE') AS payments`)).rows[0];
  assert.ok(Object.values(privileges).every(value => value === false));
  const state = (await database.query('SELECT mode FROM pilot_recovery_state')).rows[0];
  assert.equal(state.mode, 'restricted');
  const operations = {};
  for (const table of ['adult_declaration_operations','unrestricted_declaration_operations','posted_route_operations','posted_route_seat_operations','posted_route_outcome_operations']) {
    const result = (await database.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE state NOT IN ('recovered','acknowledged'))::int AS unrecovered,
      count(*) FILTER (WHERE (SELECT count(*) FROM audit_logs a WHERE a.metadata->>'operationId'=o.id::text) <> 1)::int AS invalid_audits
      FROM ${table} o`)).rows[0];
    assert.ok(result.total > 0 && result.unrecovered === 0 && result.invalid_audits === 0, `${table}: incomplete recovery or duplicate audit`);
    operations[table] = result.total;
  }
  const email = (await database.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE status <> 'exhausted' OR lease_until IS NOT NULL)::int AS unsafe FROM pilot_email_jobs`)).rows[0];
  assert.ok(email.total > 0 && email.unsafe === 0, 'Restored email delivery was not suppressed');
  const originFenced = (await database.query("SELECT count(*)=3 AND bool_and(NOT datallowconn) AS fenced FROM pg_database WHERE datname IN ('pp14_recovery_origin_test','pp14_receipts_origin_test','pp14_receipts_overlap_origin_test')")).rows[0].fenced;
  assert.equal(originFenced, true);
  await database.query('COMMIT');
  const runtimeUrl = new URL(url);
  runtimeUrl.username = 'pp14_runtime';
  runtimeUrl.password = '';
  runtimeUrl.searchParams.set('options', '-c default_transaction_read_only=off');
  const runtime = new pg.Client({ connectionString: runtimeUrl.href });
  await runtime.connect();
  try {
    for (const sql of ['CREATE TABLE public.ticket14_denied_probe(id integer)',
      'DELETE FROM schema_migrations WHERE false', 'DELETE FROM payment_orders WHERE false']) {
      await runtime.query('BEGIN');
      let code;
      try { await runtime.query(sql); } catch (error) { code = error.code; }
      finally { await runtime.query('ROLLBACK'); }
      assert.equal(code, '42501', 'Runtime write restriction failed');
    }
  } finally { await runtime.end(); }
  console.log(JSON.stringify({ deniedSqlChecks: 3, ledger: ledger.length, restrictedRole: true, originFenced, operations, suppressedEmailJobs: email.total, writesRestricted: true }));
} finally { await database.end(); }
