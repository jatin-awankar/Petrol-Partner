# Existing-data migration baseline

Status: **candidate repository baseline; deployed baseline unresolved** (investigated 2026-09-23).

No live database was modified during this investigation. The locally configured Supabase direct database host, `db.qqmofdocznefwpbqweud.supabase.co`, failed DNS resolution during an authorized read-only connection attempt. Access needs to be restored with a current read-only connection string (direct or pooler) for the actual deployed database. Until that inventory is captured and reviewed, nobody may adopt a migration baseline or run these migrations against a non-empty shared database.

## Histories found in the repository

Three independent schema histories exist:

1. `lib/db-schema` is the oldest Supabase/Clerk-oriented schema. It uses `user_profiles.id` as the application identity and includes offers, requests, bookings, Razorpay `payments`, `transactions`, reviews, emergency contacts, conversations/messages, RLS, and triggers. Its comments refer to `clerk_id`, but its checked-in `user_profiles` definition does not create that column. Git provenance begins in October 2025.
2. `lib/db-schema-new` is a later untracked-by-runner SQL draft. It introduces `users.id`, `user_details`, refresh tokens, a different ride/booking shape, chat, emergency contacts, and vehicles. Git provenance begins in October 2025. `lib/migrations/002_add_booking_payment_columns.sql` adds Razorpay columns to that booking shape and was committed in February 2026.
3. `apps/api/src/db/migrations/0001_init.sql` through `0003_chat.sql` are the migrations used by the current Express API. They were introduced from March through April 2026. This is the **candidate forward history for clean installations only**. It preserves platform-payment history in separate orders, attempts, webhook events, booking payment state, settlements, and events, but it is not declared authoritative for an existing deployment.

The histories are structurally incompatible. In particular, the identity primary key, column names, money units, statuses, and payment tables differ. `CREATE TABLE IF NOT EXISTS` cannot reconcile those differences safely. The migration runner therefore refuses a non-empty database that has no checksum ledger instead of guessing which history was applied.

## Operator commands

`npm run db:inventory` connects using `DATABASE_URL`, begins a read-only transaction, applies a 30-second statement timeout, and emits JSON containing only schema metadata and aggregates. It reports table and status counts, missing/duplicate-email totals, provider-mapping coverage, financial totals, every foreign key's orphan count, and any checksummed migration history. Redirect the JSON only to an approved restricted location; do not commit a deployment inventory because even aggregates may be operationally sensitive.

`npm run db:migrate -- --plan` prints the ordered filenames and SHA-256 checksums without connecting. `npm run db:migrate` takes a PostgreSQL advisory lock, verifies the applied history is an exact prefix with matching checksums, and applies each pending file transactionally. `npm run db:migrate -- --check` verifies that the database is current without applying SQL. Previously applied migration files are immutable.

`TEST_DATABASE_DISPOSABLE=true DATABASE_URL=<localhost-test-url> npm run db:rehearse` destroys only a localhost database explicitly marked disposable. It demonstrates a clean install, installs through `0002`, loads a synthetic representative snapshot, upgrades through `0003`, and verifies application identities, row counts, foreign-key-backed relationships, a historical payment total, and a settlement total. Synthetic evidence exercises the mechanism but does not replace the missing deployed inventory.

## Demonstrated rehearsal

Against PostgreSQL 17.6 on 2026-09-23:

- Clean install produced 30 tables including the checksum ledger; `--check` verified all three checksums.
- The representative upgrade preserved 2 users, 2 profile-to-user identity mappings, 1 booking, a 12,500-paise historical platform-payment order, and a 12,500-paise settlement.
- `0003_chat.sql` created exactly 1 chat room for the confirmed historical booking.
- The aggregate inventory found zero orphan rows for every declared foreign key, zero missing or duplicate synthetic emails, 2 verified eligibility records, and the expected offer, booking, settlement, and payment status counts.

## Required deployment decision and runbook

Before touching existing data, an authorized maintainer must:

1. Restore read-only deployed-database access and save an approved restricted inventory from `db:inventory`. Also inventory provider-side authentication identities if they are not stored in PostgreSQL.
2. Classify the deployed schema against all three histories, review every user/relationship and payment aggregate, and list each missing or ambiguous authentication-provider mapping. Resolve duplicate/missing emails without putting values in the ticket.
3. Choose and record one expansion/backfill plan. Preserve stable application UUIDs and old payment/transaction rows; add new nullable structures first, backfill in restartable batches, validate, then add constraints. Do not rename/drop legacy structures in the same release.
4. Obtain an explicit migration decision naming the inventory, snapshot time, chosen baseline, reviewed exceptions, migration checksums, maintenance window, and accountable operator.
5. Take and verify a provider-native backup immediately before migration. Record backup identifier/time, encryption/location, retention, restore permissions, and a restore rehearsal result. A backup without a tested restore is not a prerequisite met.
6. Run the sanitized representative rehearsal, then staging. Compare pre/post row counts, normalized-email exceptions, primary keys, every foreign-key orphan count, active ride/request/booking states, eligibility statuses, settlement totals, and every historical payment table total.
7. Deploy with one migration runner. If an expansion fails, roll back its transaction and remain on the old application. After a committed backfill or contract step, roll forward with a corrective migration; never edit an applied file or restore over newer accepted writes. A database restore requires reconciliation before writes reopen.

### Unresolved identity exceptions

The deployed count and mapping are unknown. Repository evidence shows at least three possible provider representations (`user_profiles.clerk_id` in comments/policies, `users.google_id` in the current schema, and email/password-only users). The deployed inventory and provider export must establish a one-to-one mapping to stable application-user IDs and explicitly list missing, duplicate, or conflicting mappings before authentication migration work can proceed.
