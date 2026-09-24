# Ticket 08 staging cutover and recovery rehearsal

Date: 2026-09-24. Scope: isolated Supabase staging source and the maintainer-designated
non-production restore project. The deployed Vercel/Render application and its database
were not switched. No real student or financial data was used.

## Identity and cutover

- Ticket 02's inventoried original seven application accounts were classified by the
  maintainer as test-only and excluded from the clean pilot baseline. None was silently
  linked or marked verified. The new baseline began with zero application and provider
  users. The controlled claim path was exercised through public HTTP and disposable
  PostgreSQL with a verified provider identity, an existing stable `users.id`, a
  revoked legacy refresh token, and an identity audit event.
- The staging source has all six current checksummed migrations and an authorized
  `auth_cutover_state` with `active_provider='supabase'` and
  `legacy_login_enabled=false`. Running the local API against this state with
  `AUTH_PROVIDER=legacy` returned HTTP 503 `LEGACY_AUTH_DISABLED` for both login and
  registration. Managed registration, verification, login, logout, recovery, and
  revocation were exercised through the browser/API and the dated live provider proof.
- The first read-only staging inventory found two disabled synthetic application
  mappings retained for audit, zero active mappings, zero provider users, zero
  bookings, vehicles, settlements, payment orders, and approvals, no missing or
  duplicate emails, and no unmapped relationship owners. The two synthetic provider
  users were removed. Synthetic application history was disabled and retained for audit.
- The representative PostgreSQL HTTP test claims a verified identity while preserving
  the existing user ID, vehicle and approval owners, booking participant and creator
  IDs, settlement payer/payee IDs and amount, and historical payment owner and amount.
  A separate concurrent claim test sends the competing subject to review.

## Restore and rollback

- Before the rehearsal, both source and designated target public schemas were exported
  in custom format using libpq 18.6. The ignored local archives are
  `.scratch/backups/ticket08-source-final.dump` (SHA-256
  `66dd12ba5fedcb31dd6f82f759f8cbbae4f5d87f504c46bf24d234bf3aefc34f`)
  and `.scratch/backups/ticket08-restore-before.dump` (SHA-256
  `5d6016ef58ae001199bc7749d2700646ed9875e19949f6d68a6f5da8219beae9`).
  These are local rehearsal archives, not an approved off-site pilot backup arrangement.
- The designated target was confirmed to have 30 public tables, three migrations,
  zero application users, bookings, payment orders, settlements, and provider users.
  The source public schema was restored there with `pg_restore --single-transaction`.
  Source and target then matched exactly on 41 table row counts, column definitions,
  constraints, migration names/checksums, zero provider users, and zero orphaned
  booking, vehicle, settlement, and payment owners. Both held two disabled synthetic
  application mappings.
- The target public schema was then replaced from its pre-rehearsal archive. A final
  read-only check found its original 30 tables, three migrations, and zero application
  users, bookings, payment orders, settlements, and provider users. The source was not
  restored over or reset.
- To prove recovery of an active identity, a fresh synthetic account completed actual
  email verification through Mailtrap and Supabase password login. Public HTTP login
  against the staging source created one active mapping; the returned stable
  application ID was recorded privately. A second custom-format public-schema archive
  with that mapping (`.scratch/backups/ticket08-active-mapping.dump`, SHA-256
  `be5bf3c4283f1293481867651b10052f39613d7b111b4944809d594611e9726d`)
  was restored into the designated target. The local API was pointed to the restored
  PostgreSQL target while continuing to validate the same Supabase provider account.
  Public HTTP password login returned 200 and the *same* application ID as the source.
  This rehearses database restoration with the provider project still available;
  restoring a lost provider project and its secrets remains a broader release gate.
- The synthetic provider account was deleted, and its source mapping was disabled with
  an audit event. The target was returned again from its pre-rehearsal archive. Final
  read-only counts were: source 41 public tables, six migrations, zero provider users,
  zero active and three disabled synthetic mappings; target 30 public tables, three
  migrations, zero application users, and zero provider users.

## Checks and boundary

`npm run auth:feasibility:live` passed email verification, login, online identity
validation, account recovery, operator MFA, current-session revocation, and stale-token
rejection. `npm run auth:feasibility:application` passed all seven public-HTTP policy
checks. The corrected redirect acceptance is recorded in
`ticket08-redirect-2026-09-24.md`. `npm run test:integration` passed 8/8; `npm run check`
passed lint (zero errors, 10 existing warnings), typecheck, 27 script tests, 45 API
tests, six worker tests, and web/API/worker builds. The ignored local archives and
staging proof do not authorize production migration, pilot launch, or real trips.
Production SMTP, independent ongoing backup, deployment, and launch approval remain
separate release gates.
