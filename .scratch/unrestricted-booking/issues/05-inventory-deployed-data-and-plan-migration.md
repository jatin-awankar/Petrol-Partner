# 05: Inventory deployed data and plan the migration

**What to build:** A maintainer knows the deployed baseline and has a forward-only upgrade and rollback-by-recovery plan before new schema work begins.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] Inventory deployed users and identity mappings, approvals, vehicles, offers, bookings, contribution and settlement records, and historical platform-payment orders against the actual migration history.
- [x] Specify additive policy-version and route-segment storage, old/new read behavior, constraints, deployment sequence, and representative-copy rehearsal criteria.
- [x] Preserve original identities, ownership, terms, amounts, and payment history in the plan; no deployed data was reset, reinterpreted, or migrated.

## Evidence and blockers (2026-09-29)

See `docs/operations/unrestricted-booking-migration-plan.md`. The current app database's direct Supabase hostname returned `ENOTFOUND` during a read-only inventory attempt. A separate reachable Session pooler belongs to a different project. Its restricted aggregate inventory showed 48 public tables, 3 application users, 3 auth mappings, no booking or payment rows, and no `schema_migrations` ledger; it cannot establish the deployed app baseline or be treated as a known Express migration prefix. The 2026-09-23 original-project inventory is historical and cannot replace a fresh check. The current Render target, its aggregate data and provider-side Auth mapping, migration ledger, and representative-copy rehearsal remain unverified. Keep this ticket claimed until those checks and a named baseline decision are completed.

Checks: `npm run db:migrate -- --plan` enumerated 34 files without connecting. `npm run check` passed lint (10 existing warnings) and typecheck, then stopped in tests because the Docker runtime-contract image could not run (Docker daemon unavailable); its first attempt also used a dependency symlink that Turbopack rejected. After `npm ci` installed local dependencies, the focused landing test passed, all non-Docker root tests and workspace tests passed (API 150 passed/1 skipped; worker 18 passed), and `npm run build:all` passed. PostgreSQL-dependent tests without a disposable local database were skipped; no live database was used for tests.

Review against `main`: the standards axis found no actionable violation and noted only a judgment-call risk that this issue summary duplicates the operations plan. The spec axis confirmed the forward plan covers ticket 05's design requirements and that the live deployed inventory remains incomplete. An Auth-provider export/recovery rehearsal is now explicit in the plan. The ticket stays `claimed`.
