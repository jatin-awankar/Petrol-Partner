# Existing-data migration baseline

Status: **clean baseline established in a separate Supabase project; application cutover pending** (reviewed 2026-09-23).

The original deployed database was inventoried through Supabase's Session pooler after its direct host could not be resolved locally. It contains test data and has no migration checksum ledger. The operator confirmed that all of its records are test data and may be retired. Rather than stamp unknown history onto that non-empty database, the operator created a separate empty Supabase project and installed the current API migrations there. The Render application still points at the original test database; no database switch or destructive action has occurred.

## Histories found in the repository

Three independent schema histories exist:

1. `lib/db-schema` is the oldest Supabase/Clerk-oriented schema. It uses `user_profiles.id` as the application identity and includes offers, requests, bookings, Razorpay `payments`, `transactions`, reviews, emergency contacts, conversations/messages, RLS, and triggers. Its comments refer to `clerk_id`, but its checked-in `user_profiles` definition does not create that column. Git provenance begins in October 2025.
2. `lib/db-schema-new` is a later untracked-by-runner SQL draft. It introduces `users.id`, `user_details`, refresh tokens, a different ride/booking shape, chat, emergency contacts, and vehicles. Git provenance begins in October 2025. `lib/migrations/002_add_booking_payment_columns.sql` adds Razorpay columns to that booking shape and was committed in February 2026.
3. `apps/api/src/db/migrations/0001_init.sql` through `0003_chat.sql` are the migrations used by the current Express API. They were introduced from March through April 2026. This is the **candidate forward history for clean installations only**. It preserves platform-payment history in separate orders, attempts, webhook events, booking payment state, settlements, and events, but it is not declared authoritative for an existing deployment.

The histories are structurally incompatible. In particular, the identity primary key, column names, money units, statuses, and payment tables differ. `CREATE TABLE IF NOT EXISTS` cannot reconcile those differences safely. The migration runner therefore refuses a non-empty database that has no checksum ledger instead of guessing which history was applied.

## Deployed inventory and baseline decision

A restricted aggregate inventory of the original Supabase database on 2026-09-23 found PostgreSQL 17.6, 29 public application tables, 7 application users with profiles, 3 ride offers, 4 ride requests, 6 bookings, and 4 settlement rows. It found no missing or duplicate application emails, no foreign-key orphans, and no `schema_migrations` ledger. All 7 `users.google_id` fields are empty. The operator checked Supabase Authentication separately: `auth.users` has zero rows. The operator confirmed all 7 accounts and related records are test data, with no real participant or financial history to migrate. These findings and the private inventory are retained locally under `.scratch/pilot-readiness/`; no identifiers or credentials are in this document.

**Decision:** Use a new, separate Supabase project as the clean forward baseline for future pilot work. Do not backfill, stamp, or apply the current migration runner to the original non-empty test database. Retain the original project until a separately approved application cutover is verified; retiring it later is a distinct decision. The current API migration history (`0001_init.sql` through `0003_chat.sql`) is authoritative for the new project only. This replaces the representative upgrade of the old dataset because the operator explicitly chose not to migrate its test rows. It does not waive backup, recovery, or identity-continuity requirements once real pilot accounts and trips exist.

The new project was inventoried empty before installation (zero public tables). The migration runner then applied the three files in order, and `--check` verified their checksums. A post-install read-only inventory found 30 public tables, including `schema_migrations` with the same three checksums, zero application users and bookings, and no foreign-key orphans. The only nonempty application table is `pricing_rate_cards` with three seed rows. The new project is not yet serving traffic.

## Operator commands

`npm run db:inventory` connects using `DATABASE_URL`, begins a read-only transaction, applies a 30-second statement timeout, and emits JSON containing only schema metadata and aggregates. It reports table and status counts, missing/duplicate-email totals, provider-mapping coverage, financial totals, every foreign key's orphan count, and any checksummed migration history. Redirect the JSON only to an approved restricted location; do not commit a deployment inventory because even aggregates may be operationally sensitive.

`npm run db:migrate -- --plan` prints the ordered filenames and SHA-256 checksums without connecting. `npm run db:migrate` takes a PostgreSQL advisory lock, verifies the applied history is an exact prefix with matching checksums, and applies each pending file transactionally. `npm run db:migrate -- --check` verifies that the database is current without applying SQL. Previously applied migration files are immutable.

`TEST_DATABASE_DISPOSABLE=true DATABASE_URL=<localhost-test-url> npm run db:rehearse` destroys only a localhost database explicitly marked disposable. It demonstrates a clean install, installs through `0002`, loads a synthetic representative snapshot, upgrades through `0003`, and verifies application identities, row counts, foreign-key-backed relationships, a historical payment total, and a settlement total. Synthetic evidence exercises the mechanism but does not replace the missing deployed inventory.

## Demonstrated rehearsal

Against PostgreSQL 17.6 on 2026-09-23:

- Clean install produced 30 tables including the checksum ledger; `--check` verified all three checksums.
- The representative upgrade preserved 2 users, 2 profile-to-user identity mappings, 1 active request with its passenger relationship, 1 booking, a 12,500-paise historical platform-payment order, and a 12,500-paise settlement.
- `0003_chat.sql` created exactly 1 chat room for the confirmed historical booking.
- The aggregate inventory found zero orphan rows for every declared foreign key, 2 verified eligibility records, and the expected offer, request, booking, settlement, and payment status counts. A separate legacy-shape fixture demonstrated one missing email, one case-insensitive duplicate, boolean eligibility decisions, and booking-level Razorpay history without exporting identifier values.

## Required deployment decision and runbook

Before touching existing data, an authorized maintainer must:

1. Restore read-only deployed-database access and save an approved restricted inventory from `db:inventory`. Also inventory provider-side authentication identities if they are not stored in PostgreSQL.
2. Classify the deployed schema against all three histories, review every user/relationship and payment aggregate, and list each missing or ambiguous authentication-provider mapping. Resolve duplicate/missing emails without putting values in the ticket.
3. Choose and record one expansion/backfill plan. Preserve stable application UUIDs and old payment/transaction rows; add new nullable structures first, backfill in restartable batches, validate, then add constraints. Do not rename/drop legacy structures in the same release.
4. Obtain an explicit migration decision naming the inventory, snapshot time, chosen baseline, reviewed exceptions, migration checksums, maintenance window, and accountable operator.
5. Take and verify a provider-native backup immediately before migration. Record backup identifier/time, encryption/location, retention, restore permissions, and a restore rehearsal result. A backup without a tested restore is not a prerequisite met.
6. Run the sanitized representative rehearsal, then staging. Compare pre/post row counts, normalized-email exceptions, primary keys, every foreign-key orphan count, active ride/request/booking states, eligibility statuses, settlement totals, and every historical payment table total.
7. Deploy with one migration runner. If an expansion fails, roll back its transaction and remain on the old application. After a committed backfill or contract step, roll forward with a corrective migration; never edit an applied file or restore over newer accepted writes. A database restore requires reconciliation before writes reopen.

### Identity-mapping result

The original database has 7 custom application users, all with profiles and no `google_id`; Supabase Auth has zero users. The operator classified all 7 as test accounts and chose not to transfer them to the new baseline. Ticket 08 must create a controlled account-claim path for any future real application users and must not assume that a Supabase Auth count matches `public.users`. If the original project's data classification changes, this baseline decision must be reopened before cutover.
