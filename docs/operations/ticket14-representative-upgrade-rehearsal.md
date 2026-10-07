# Ticket 14: disposable synthetic upgrade rehearsal

## Current audit — 2026-10-07

**Still partial; ticket 14 remains claimed.** Fetched `origin` and fast-forwarded
`codex/14-representative-upgrade-rehearsal` to merged main `7273b3c` (PR #87).
The branch had no unique commits; the existing untracked `.worktrees/` was preserved.
All required dependency tickets are resolved, and `git merge-base --is-ancestor`
confirmed their completion commits on this baseline: 05 `0f7c443`, 07 `0ce85e4`,
08 `542b96d`, 10 `eedef3b`, 11 `677193a`, 12 `f12154b`, 13 `918df00`.
Historical pending comments in those tickets do not override their current Answers.

### Source gate and exact missing inputs

The migration plan and prior rehearsal identify no approved representative copy.
The referenced `.scratch/unrestricted-booking/evidence/deployed-inventory-2026-09-29.json`
is unavailable in this checkout. The older `.scratch/pilot-readiness/deployed-inventory.json`
belongs to the historical project and is not a substitute. A ticket 05 connection
configuration file exists, but its existence is not snapshot provenance or copy
approval; it was not opened or used. No remote database was accessed in this pass.

Before the representative run can proceed, the maintainer must supply:

- An approved sanitized snapshot or an explicitly identified isolated safe-copy
  target, its snapshot time and checksum, and an accountable approval linking it
  to the freshly verified current Render database. Include the fresh aggregate
  inventory, exact migration name/checksum ledger and schema shape. Do not send
  credentials or personal records through the issue or chat.
- Sanitization/provenance evidence preserving stable ID/FK relationships and a
  coverage manifest distinguishing source rows, absent tables/categories and
  supplemental synthetic rows. If the source is still empty, approve that actual
  empty snapshot as the representative baseline; nonzero synthetic history remains
  supplemental evidence, never deployed history.
- The approved backup/restore artifact and protected provider-Auth export/recovery
  access, plus independently protected acknowledgement evidence and verifier
  configuration for later operations. Record access restrictions, retention and
  how sanitized provider subjects map consistently to stable application users.
- The old application revision and deployment-sequence decision, along with
  restricted runtime/read roles and a separate migration role for the disposable
  target. Source selection must not silently include either unrelated project.

These are missing evidence/access and source decisions, not permission to migrate
production. The user was asked for the approved artifact location and approval
record. No representative-copy claim can be made until these inputs are available.

### Acceptance review

1. **Forward-only representative upgrade: incomplete.** The reusable synthetic
   harness now runs all 44 current migrations, including 0043 verification evidence
   and 0044 outcome evidence. It still constructs its own 0001–0003 baseline and
   0034 historical fixture; it does not import or establish source provenance.
   The approved source inventory, ledger and coverage must be established before
   any representative migration.
2. **History, policy, compatibility and recovery: incomplete.** The six existing
   PostgreSQL checks pass for synthetic identities, ownership, statuses, frozen
   terms, currency/paise, payment records, FK integrity, transaction rollback and
   older-backup restoration with one local receipt. They run as the disposable
   cluster owner. They do not prove restricted-role old/new application reads or
   writes, provider Auth restoration, or independently protected later-operation
   reconciliation on the representative copy. The source coverage must include
   corridor history and, where present, prior unrestricted `.2` records; labeled
   supplemental Amravati `amravati-core-v1`/`.1` records must exercise geometry,
   policy/area identifiers, frozen terms and signed receipt compatibility before
   and after upgrade and restore. No historical area backfill is authorized.
   Route revision, invalid/reversed segments, last-seat concurrency, retries,
   notification failure, audit and operator visibility must run on that upgraded
   copy, not merely be inferred from dependency suites.
3. **Results, exceptions and cutover decisions: partial.** This audit records the
   missing inputs and current local results. Representative exceptions and the
   restore/reconciliation outcome cannot yet be recorded. Historical registration
   suffix ambiguity remains conservative rejection; any identity mapping or
   relaxation needs an explicit inventory-backed decision. No reopening or cutover
   decision has been made.

Keep writes restricted during restore and reconcile stable identities, all later
acknowledged operation IDs, allocations, journey/settlement state, notifications,
deletions and payment history before an explicit reopening decision. An uncommitted
migration failure rolls back; a committed expansion needs a forward corrective
migration. Application rollback is conditional on proven old-reader compatibility
and absence of new-format accepted actions. Restore to another isolated target,
never over newer acknowledged state. The existing migration plan remains the
deployment/recovery sequence; this audit authorizes no production operation.

### Current local validation

Created a fresh PostgreSQL cluster under `/private/tmp/pp14-20261007.E8y1vj/pg`,
bound to `127.0.0.1:55487` with its socket in the same private temporary directory.
The existing tests create random `pp14_*_test` databases, require the disposable
flag, reject a migration URL override, and remove their databases afterward.
No existing database was reset. Temporary dumps contain only invented fixtures
and remain outside Git.

The unchanged focused prefix test first failed with `Migration ledger divergence`:
the harness applied current migrations but still required 42 ledger entries.
Updated the explicit expected count in the harness and its existing test to 44.
Then `TICKET14_TEST_DATABASE_URL=postgresql://127.0.0.1:55487/pp14_test node --test scripts/ticket14-rehearsal.test.mjs`
passed **6/6**, with no skips. Every test independently performs the upgrade,
historical comparisons, rollback injection and restore. This is refreshed synthetic
evidence only. The 2026-09-29 results below remain historical rather than being
rewritten as a representative run.

Date: 2026-09-29. **Partial evidence; ticket remains claimed.** No remote connection, deployment, or live data write was made.

## Provenance and isolation

Ticket 05's 2026-09-29 inventory of the current Render database reported the exact 0001–0003 ledger prefix and zero application and provider Auth users. No approved sanitized nonzero live copy was available. Every nonzero application row here is an explicitly synthetic fixture in `scripts/ticket14-fixtures.sql`; UUIDs, subjects, emails, and payment references are invented. The fixture briefly opens the **disposable** pilot guard to load historical shapes, then restores restricted mode. It keeps normal FK enforcement active and proves this by attempting an invalid mapping, which PostgreSQL rejects. This does not establish that production policy permits these synthetic historical states.

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

The script applies and checksum-checks the verified deployed `0001`–`0003` prefix, then advances through `0034_closure_recovery.sql`. It loads fixtures, takes a `pg_dump -Fc` baseline, gives the actual migration runner a disposable failing `0035` file, verifies transactional rollback, then applies checked-in `0035`–`0042`. It compares every old table's count and SHA-256 row digest, scans all declared foreign keys, and restores with `pg_restore`. A separately fsynced local receipt records a newer synthetic acknowledged settlement operation; after restoring the older snapshot, the script identifies the missing operation and reconciles it with state `recovered`, checks the two synthetic Auth mappings, and keeps writes restricted. The temporary dump and receipt paths are printed or placed under the report's backup directory. Neither is a provider-native backup or independently protected Auth export.

After the TDD changes, the final standalone run used `createdb -h 127.0.0.1 -p 55479 pp14_final3_test` followed by `DATABASE_URL=postgresql://127.0.0.1:55479/pp14_final3_test TEST_DATABASE_DISPOSABLE=true node scripts/ticket14-rehearsal.mjs > /private/tmp/pp14-final3-report.json`. Its aggregate-only JSON report is local and uncommitted. The corresponding restore database is `pp14_final3_test_restore_test`.

## Results

- Migration ledger: 34 exact repository names/checksums before, 42 after; original 34 entries unchanged.
- Historical tables: all 104 old tables had identical row counts and row digests. Two users/profiles and mappings, one approved synthetic vehicle, one corridor offer/request/allocation/obligation, one booking, one settlement/event, one platform order/attempt/webhook, and one request operation/audit remained present. Seed policy and pricing rows were also unchanged.
- Ownership and FK shape: all 184 old and 224 new declared FKs scanned, zero orphans. Explicit synthetic owner joins across identity, vehicle, offer, request, allocation, booking, order and settlement found zero mismatches before and after. The report includes stable user, booking and allocation ID counts and SHA-256 digests, without exposing record IDs. The saved row digests cover every owner ID and primary key.
- Frozen values: corridor allocation and obligation retained policy version 1, INR 2,500 paise; the platform order retained INR 12,500 paise. The payment attempt has no amount column, so its grouped amount is explicitly the **linked order** amount. The legacy settlement retained 12,500 paise; its table has no currency column, so the report marks currency `not_stored` rather than inferring INR. Explicit booking, allocation, order, attempt, webhook and settlement status counts and currency/status paise sums match before and after. Every historical row, including accepted JSON terms, was also covered by row-digest equality.
- Failure: the actual `db-migrate.mjs` runner rejected a disposable failing `0035` SQL file after it created a test table then divided by zero. The ledger stayed at 34, all historical row digests stayed identical, and the test table was absent. Checked-in migration files were not changed.
- Restore: the baseline dump restored into isolated `pp14_test_restore_test`; its ledger returned to 34 and every historical row matched. The older snapshot lacked one newer acknowledged synthetic settlement claim; its local fsynced receipt identified and reconciled the claim while two synthetic Auth mappings stayed stable. Writes remained restricted. This local receipt is not an approved independent production recovery channel.
- New schema: posted-route offer and seat tables exist after migration. No posted-route application reads, writes, race tests, notifications, or operations were exercised **on the upgraded copy**. Separately, the existing posted-route HTTP/PostgreSQL test group passed 43 scenarios on a fresh disposable localhost database, covering quotes, invalid routes, final-seat concurrency, retries, notifications, route replacement, journeys and settlement. Its first group run had one `ECONNRESET`; that scenario passed alone and the full selected group passed on rerun.

## Exceptions and cutover decisions

This is **not** an approved representative copy of deployed history. The current deployment was empty at ticket 05's snapshot, and that inventory must be refreshed before any schema write. The historical original project and the distinct unledgered pooler project remain outside this rehearsal. A maintainer must decide and record which verified source snapshot, backup, Auth export, and migration baseline are authoritative, and approve sanitization and the migration window. Do not infer that these synthetic rows occurred in deployment.

Before resolving ticket 14, rehearse an approved sanitized live-shape copy with separate runtime/migration roles; old-client and new policy read routing on that copy; route revision and invalid segment cases; concurrent last-seat acceptance and retries on separate connections; notification failure; and operations and audit visibility against the upgraded copy. Reconcile an older restore against independently protected newer acknowledgement evidence and a protected provider Auth export, including subjects and settlement state. Keep restored writes closed until those comparisons pass. These missing checks block cutover and real booking activation.

## Checks and review

The six ticket 14 CLI/PostgreSQL integration tests passed with `TICKET14_TEST_DATABASE_URL=postgresql://127.0.0.1:55479/pp14_tdd_test node --test scripts/ticket14-rehearsal.test.mjs`. The existing posted-route HTTP/PostgreSQL group ran with `DATABASE_URL=postgresql://127.0.0.1:55479/pp14_api_rerun_test TEST_DATABASE_DISPOSABLE=true npm --workspace @petrol-partner/api run test:integration -- -t 'ticket 10 isolated posted route preparation'` and passed 43 tests; 102 were skipped by the name filter. `npm run typecheck`, `npx eslint scripts/ticket14-rehearsal.mjs scripts/ticket14-rehearsal.test.mjs`, and syntax checks passed after the changes. The prior full `npm test` was attempted once; the root test runner stalled on `landing-eligibility.test.mjs` and was interrupted after 106 seconds. It reported 34 passing, four skipped, one cancelled, and one failing test: the existing runtime-contract Docker probe returned an empty Node version in this environment. Workspace suites did not start. The prior `npm run lint` scanned the preexisting untracked `.worktrees/` build output and reported 1,477 errors and 19,164 warnings from that material.

The standards review found and prompted a fix for URL disclosure in command errors. The spec review confirmed the synthetic upgrade and restore are partial evidence; the representative-copy, mixed-version application, recovery, and aggregate checks above remain open. No claim of ticket resolution or cutover readiness follows from this run.
