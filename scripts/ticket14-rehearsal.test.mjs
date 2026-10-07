import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const base = process.env.TICKET14_TEST_DATABASE_URL;
if (base) {
  const url = new URL(base);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('TICKET14_TEST_DATABASE_URL must be a localhost _test database');
  }
}

function command(file, args, env = process.env) {
  const result = spawnSync(file, args, { encoding: 'utf8', env, timeout: 30_000 });
  if (result.status !== 0) throw new Error(`${file} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function runRehearsal() {
  const url = new URL(base);
  const database = `pp14_${randomUUID().replaceAll('-', '').slice(0, 12)}_test`;
  const restore = `${database}_restore_test`;
  url.pathname = `/${database}`;
  command('createdb', ['-h', url.hostname, '-p', url.port, database]);
  try {
    const output = command('node', ['scripts/ticket14-rehearsal.mjs'], {
      ...process.env, DATABASE_URL: url.href, TEST_DATABASE_DISPOSABLE: 'true', MIGRATION_DATABASE_URL: '',
    });
    return JSON.parse(output);
  } finally {
    command('dropdb', ['-h', url.hostname, '-p', url.port, '--if-exists', restore]);
    command('dropdb', ['-h', url.hostname, '-p', url.port, '--if-exists', database]);
  }
}

test('fixture load keeps foreign keys enforced and restores restricted pilot state', { skip: !base }, () => {
  assert.deepEqual(runRehearsal().fixtureIntegrity, {
    foreignKeysEnforced: true,
    invalidReferenceRejected: true,
    pilotStateRestrictedAfterSeed: true,
  });
});

test('upgrade explicitly compares statuses, paise, owner links, and stable IDs', { skip: !base }, () => {
  const comparison = runRehearsal().comparison;
  assert.deepEqual(comparison?.before, comparison?.after);
  assert.deepEqual(comparison?.before?.statuses, {
    bookings: { confirmed: 1 },
    corridorAllocations: { confirmed: 1 },
    platformOrders: { paid: 1 },
    paymentAttempts: { captured: 1 },
    paymentWebhooks: { processed: 1 },
    settlements: { settled: 1 },
  });
  assert.deepEqual(comparison?.before?.money, {
    corridorAccepted: [{ currency: 'INR', status: 'confirmed', count: 1, amountPaise: 2500 }],
    corridorObligations: [{ currency: 'INR', status: 'confirmed', count: 1, amountPaise: 2500 }],
    platformOrders: [{ currency: 'INR', status: 'paid', count: 1, amountPaise: 12500 }],
    paymentAttemptsLinkedOrders: [{ currency: 'INR', status: 'captured', count: 1, amountPaise: 12500 }],
    settlements: [{ currency: 'not_stored', status: 'settled', count: 1, amountPaise: 12500 }],
  });
  assert.equal(comparison?.before?.ownerMismatches, 0);
  assert.deepEqual(comparison?.before?.idCounts, { users: 2, bookings: 1, allocations: 1 });
  for (const digest of Object.values(comparison?.before?.idDigests ?? {}))
    assert.match(digest, /^[a-f0-9]{64}$/);
});

test('rehearsal report does not expose record identifiers', { skip: !base }, () => {
  assert.doesNotMatch(JSON.stringify(runRehearsal()), /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
});

test('older restore identifies and reconciles a newer acknowledged operation before reopening', { skip: !base }, () => {
  assert.deepEqual(runRehearsal().recovery, {
    newerAcknowledged: 1,
    missingBeforeReconcile: 1,
    reconciled: 1,
    stableAuthMappings: 2,
    writesRestricted: true,
  });
});

test('upgrade starts from the verified deployed 0001–0003 checksum prefix', { skip: !base }, () => {
  assert.deepEqual(runRehearsal().migrationSequence, {
    deployedPrefix: 3,
    historicalPrefix: 34,
    expandedPrefix: 44,
  });
});

test('a failed migration runner transaction preserves its ledger and historical rows', { skip: !base }, () => {
  assert.deepEqual(runRehearsal().migrationFailure, {
    runnerRejected: true,
    ledgerUnchanged: true,
    historicalRowsUnchanged: true,
    partialTableAbsent: true,
  });
});
