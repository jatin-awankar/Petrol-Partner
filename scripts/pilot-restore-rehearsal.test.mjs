import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';
import pg from 'pg';

const enabled = process.env.TEST_DATABASE_DISPOSABLE === 'true' && Boolean(process.env.DATABASE_URL);

test('restore rehearsal fences ordinary writers on a fresh disposable target', { skip: !enabled }, async () => {
  const adminUrl = new URL(process.env.DATABASE_URL);
  const name = `pilot_restore_${randomUUID().replaceAll('-', '')}_test`;
  const targetUrl = new URL(adminUrl);
  targetUrl.pathname = `/${name}`;
  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, 'pilot-restore-rehearsal.mjs'), '--fence-only'], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: targetUrl.href, TEST_DATABASE_DISPOSABLE: 'true' },
    });
    assert.equal(result.status, 0, result.stderr);
    const writer = new pg.Client({ connectionString: targetUrl.href });
    await writer.connect();
    try {
      await assert.rejects(writer.query('CREATE TABLE should_not_exist (id integer)'), /read-only transaction/i);
    } finally {
      await writer.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
});
