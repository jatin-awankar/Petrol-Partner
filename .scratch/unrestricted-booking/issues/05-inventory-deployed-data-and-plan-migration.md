# 05: Inventory deployed data and plan the migration

**What to build:** A maintainer knows the deployed baseline and has a forward-only upgrade and rollback-by-recovery plan before new schema work begins.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Inventory deployed users and identity mappings, approvals, vehicles, offers, bookings, contribution and settlement records, and historical platform-payment orders against the actual migration history.
- [x] Specify additive policy-version and route-segment storage, old/new read behavior, constraints, deployment sequence, and representative-copy rehearsal criteria.
- [x] Preserve original identities, ownership, terms, amounts, and payment history in the plan; no deployed data was reset, reinterpreted, or migrated.

## Evidence and blockers (2026-09-29)

See `docs/operations/unrestricted-booking-migration-plan.md`. The current app database's direct Supabase hostname returned `ENOTFOUND` during an initial read-only inventory attempt. A separate reachable Session pooler belonged to a different project; its 48-table, unledgered shape did not establish the deployed baseline. The 2026-09-23 original-project inventory is historical.

The maintainer subsequently supplied a Session pooler URL whose project reference matches the current Render `DATABASE_URL` and local app configuration. A fresh aggregate-only read-only inventory at 2026-09-29 05:19:16 UTC found PostgreSQL 17.6, 30 public tables, zero application users, profiles, approvals, vehicles, offers, requests, bookings, contributions, settlements and historical platform-payment rows. Only three pricing seed rows and three migration-ledger rows exist. All 50 declared foreign keys have zero orphan rows. A separate read-only query found zero Supabase Auth users and no `auth_identities` table. The ledger is an exact name-and-checksum prefix of repository migrations `0001`–`0003` out of 34. The restricted raw inventory is Git-ignored at `.scratch/unrestricted-booking/evidence/deployed-inventory-2026-09-29.json`; no credentials or personal records were recorded.

Checks: `npm run db:migrate -- --plan` enumerated 34 files without connecting. `npm run check` passed lint (10 existing warnings) and typecheck, then stopped in tests because the Docker runtime-contract image could not run (Docker daemon unavailable); its first attempt also used a dependency symlink that Turbopack rejected. After `npm ci` installed local dependencies, the focused landing test passed, all non-Docker root tests and workspace tests passed (API 150 passed/1 skipped; worker 18 passed), and `npm run build:all` passed. PostgreSQL-dependent tests without a disposable local database were skipped; no live database was used for tests.

Review against `main`: the standards axis found no actionable violation and noted only a judgment-call risk that this issue summary duplicates the operations plan. The initial spec review confirmed the forward plan covered ticket 05's design requirements but identified the then-missing deployed inventory; that inventory and Auth count were subsequently completed. An Auth-provider export/recovery rehearsal is explicit in the plan for later deployment work.

## Answer

The current deployed baseline is the exact `0001`–`0003` Express migration prefix with no application or provider-Auth users and no booking or payment history in that project. The forward-only plan specifies policy-version and route-segment storage, compatibility, constraints, deployment order, recovery, and representative-copy rehearsal criteria. The older 29-table original project and separate unledgered 48-table project are not this Render target; their records remain untouched. Reconfirm the target, checksum prefix, aggregates, backup, and accountable maintainer decision immediately before any schema migration. Ticket 14 owns the actual representative-copy upgrade rehearsal.
