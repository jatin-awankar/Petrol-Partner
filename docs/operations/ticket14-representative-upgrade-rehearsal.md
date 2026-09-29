# Ticket 14: disposable synthetic upgrade rehearsal

Date: 2026-09-29. **Partial evidence; ticket remains claimed.** No remote connection, deployment, or live data write was made.

## Provenance and isolation

Ticket 05's 2026-09-29 inventory of the current Render database reported the exact 0001–0003 ledger prefix and zero application and provider Auth users. No approved sanitized nonzero live copy was available. Every nonzero application row here is an explicitly synthetic fixture in `scripts/ticket14-fixtures.sql`; UUIDs, subjects, emails, and payment references are invented. The fixture uses a local superuser and `session_replication_role=replica` to load historical shapes while pilot activity is paused. The rehearsal then checks all declared FKs. This does not establish that production triggers or policy allow these historical states.

The target was a local PostgreSQL database named `pp14_test` on `127.0.0.1:55479`, initialized under `/private/tmp/pp14-pg`. The script refuses a non-local host, a name without `_test`, a missing disposable flag, or `MIGRATION_DATABASE_URL`. A separate local `pp14_test_restore_test` received the restore. Both databases and the temporary dump are disposable. This cluster used one superuser; migration/runtime role separation remains untested.

## Exact commands

Run from the repository root. The first `initdb` and loopback attempts were denied by the sandbox and then rerun with sandbox escalation; no remote fallback was used.

```sh
initdb -D /private/tmp/pp14-pg -A trust --no-instructions
pg_ctl -D /private/tmp/pp14-pg -o '-h 127.0.0.1 -p 55479' -l /private/tmp/pp14-pg.log start
createdb -h 127.0.0.1 -p 55479 pp14_test
DATABASE_URL=postgresql://127.0.0.1:55479/pp14_test TEST_DATABASE_DISPOSABLE=true node scripts/ticket14-rehearsal.mjs
```

For a repeat in the same disposable cluster only:

```sh
dropdb -h 127.0.0.1 -p 55479 pp14_test_restore_test
dropdb -h 127.0.0.1 -p 55479 pp14_test
createdb -h 127.0.0.1 -p 55479 pp14_test
DATABASE_URL=postgresql://127.0.0.1:55479/pp14_test TEST_DATABASE_DISPOSABLE=true node scripts/ticket14-rehearsal.mjs
```

The script applies the checked-in prefix through `0034_closure_recovery.sql`, loads fixtures, takes a `pg_dump -Fc` baseline, injects an error in a transaction and rolls it back, applies the remaining checked-in migrations with `scripts/db-migrate.mjs`, runs its checksum check, compares every old table's count and SHA-256 row digest, scans all declared foreign keys, restores with `pg_restore`, and compares the restored historical tables with the baseline. The temporary dump path is printed by the script; it was `/var/folders/nj/zjbh4x4n7x94yrnl30tjz0xm0000gn/T/pp14-backup-acLOqt/baseline.dump` for the final run.

## Results

- Migration ledger: 34 exact repository names/checksums before, 42 after; original 34 entries unchanged.
- Historical tables: all 104 old tables had identical row counts and row digests. Two users/profiles and mappings, one approved synthetic vehicle, one corridor offer/request/allocation/obligation, one booking, one settlement/event, one platform order/attempt/webhook, and one request operation/audit remained present. Seed policy and pricing rows were also unchanged.
- Ownership and FK shape: all 184 old and 224 new declared FKs scanned, zero orphans. The saved row digests cover all owner IDs and primary keys. Semantic cross-table ownership beyond declared FKs was not exhaustively checked.
- Frozen values: corridor allocation and obligation retained policy version 1, INR 2,500 paise; platform order and settlement retained INR 12,500 paise. The script confirms these through SQL reads. Every historical row, including other monetary fields and accepted JSON terms, was covered by row-digest equality.
- Failure: division by zero (`22012`) after a test table creation rolled back; the table was absent afterward. This simulates an uncommitted transactional failure, not a specific checked-in migration failing.
- Restore: the baseline dump restored into isolated `pp14_test_restore_test`; its ledger returned to 34 and every historical row matched the baseline. Writes were not reopened. No newer acknowledged operation was reconciled.
- New schema: posted-route offer and seat tables exist after migration. No posted-route application reads, writes, race tests, notifications, or operations were exercised in this run.

## Exceptions and cutover decisions

This is **not** an approved representative copy of deployed history. The current deployment was empty at ticket 05's snapshot, and that inventory must be refreshed before any schema write. The historical original project and the distinct unledgered pooler project remain outside this rehearsal. A maintainer must decide and record which verified source snapshot, backup, Auth export, and migration baseline are authoritative, and approve sanitization and the migration window. Do not infer that these synthetic rows occurred in deployment.

Before resolving ticket 14, rehearse an approved sanitized live-shape copy with separate runtime/migration roles; status and money aggregates; semantic ownership; old-client and new policy read routing; route revision and invalid segment cases; concurrent last-seat acceptance and retries on separate connections; notification failure; operations and audit visibility; and an older restore reconciled with newer acknowledged IDs, Auth subjects, and settlement state. Keep restored writes closed until those comparisons pass. These missing checks block cutover and real booking activation.

## Checks and review

`npm run typecheck`, `npx eslint scripts/ticket14-rehearsal.mjs`, and `node --check scripts/ticket14-rehearsal.mjs` passed. The full `npm test` was attempted once; the root test runner stalled on `landing-eligibility.test.mjs` and was interrupted after 106 seconds. It reported 34 passing, four skipped, one cancelled, and one failing test: the existing runtime-contract Docker probe returned an empty Node version in this environment. Workspace suites did not start. `npm run lint` scanned the preexisting untracked `.worktrees/` build output and reported 1,477 errors and 19,164 warnings from that material; targeted lint of the changed script passed. No repository test failure was attributed to the rehearsal files.

The standards review found and prompted a fix for URL disclosure in command errors. The spec review confirmed the synthetic upgrade and restore are partial evidence; the representative-copy, mixed-version application, recovery, and aggregate checks above remain open. No claim of ticket resolution or cutover readiness follows from this run.
