import pg from 'pg';

const connectionString = process.env.RECOVERY_DATABASE_URL;
if (!connectionString) throw new Error('RECOVERY_DATABASE_URL is required for a restored read-only database');

const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const [recovery, capabilities, counts] = await Promise.all([
    client.query('SELECT mode, started_at, reconciled_at FROM pilot_recovery_state WHERE singleton = true'),
    client.query('SELECT capability, paused FROM pilot_pause_state ORDER BY capability'),
    client.query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM ride_offers) AS offers,
      (SELECT count(*)::int FROM ride_requests) AS requests,
      (SELECT count(*)::int FROM bookings) AS bookings,
      (SELECT count(*)::int FROM pilot_pause_operations WHERE state IN ('acknowledged', 'recovered')) AS evidenced_operator_actions`),
  ]);
  await client.query('COMMIT');
  console.log(JSON.stringify({ recovery: recovery.rows[0] ?? null, capabilities: capabilities.rows, counts: counts.rows[0] }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}
