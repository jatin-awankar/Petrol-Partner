#!/usr/bin/env node
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  const summary = (await pool.query(`
    SELECT
      count(*)::int AS application_users,
      count(*) FILTER (WHERE email IS NULL OR btrim(email) = '')::int AS missing_emails,
      count(*) FILTER (WHERE email_verified_at IS NOT NULL)::int AS verified_emails,
      count(*) FILTER (WHERE password_hash IS NOT NULL)::int AS legacy_password_users
    FROM users
  `)).rows[0];
  const duplicates = (await pool.query(`
    SELECT lower(btrim(email)) AS normalized_email, count(*)::int AS count
      FROM users GROUP BY lower(btrim(email)) HAVING count(*) > 1 ORDER BY normalized_email
  `)).rows;
  const mappings = (await pool.query(`
    SELECT count(*) FILTER (WHERE disabled_at IS NULL)::int AS active_mappings,
      count(*) FILTER (WHERE disabled_at IS NOT NULL)::int AS disabled_mappings
    FROM auth_identities
  `)).rows[0];
  const relationships = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM bookings) AS bookings,
      (SELECT count(*)::int FROM vehicles) AS vehicles,
      (SELECT count(*)::int FROM booking_settlements) AS settlements,
      (SELECT count(*)::int FROM payment_orders) AS payment_orders,
      (SELECT count(*)::int FROM student_verifications) AS approvals
  `)).rows[0];
  const unmappedOwners = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM bookings b
        WHERE NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = b.passenger_id AND i.disabled_at IS NULL)
           OR NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = b.driver_id AND i.disabled_at IS NULL)) AS bookings,
      (SELECT count(*)::int FROM vehicles v WHERE NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = v.owner_user_id AND i.disabled_at IS NULL)) AS vehicles,
      (SELECT count(*)::int FROM booking_settlements s
        WHERE NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = s.payer_user_id AND i.disabled_at IS NULL)
           OR NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = s.payee_user_id AND i.disabled_at IS NULL)) AS settlements,
      (SELECT count(*)::int FROM payment_orders p WHERE NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = p.user_id AND i.disabled_at IS NULL)) AS payment_orders,
      (SELECT count(*)::int FROM student_verifications s WHERE NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = s.user_id AND i.disabled_at IS NULL)) AS approvals
  `)).rows[0];
  const report = { generated_at: new Date().toISOString(), summary, duplicates, mappings, relationships, unmapped_relationship_owners: unmappedOwners };
  console.log(JSON.stringify(report, null, 2));
  if (summary.missing_emails > 0 || duplicates.length > 0) process.exitCode = 2;
} finally {
  await pool.end();
}
