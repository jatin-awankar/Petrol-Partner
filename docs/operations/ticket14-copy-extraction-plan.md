# Ticket 14 representative-copy extraction plan

Date: 2026-10-07. **Proposed; awaiting maintainer source/process approval.**
Ticket 14 remains claimed. No live database, Auth provider or receipt store was
contacted while preparing this plan. Approval of this plan authorizes only the
read-only source work described here and local disposable-copy work, not source
migration, role creation, configuration changes, data reset, deployment or bookings.

## Intended source and decision boundary

Proposed source: Supabase project **`qqmofdocznefwpbqweud`**, database `postgres`.
The local app configuration names `db.qqmofdocznefwpbqweud.supabase.co`; ticket 05's
existing inventory configuration names the same project through the Session pooler
`aws-1-ap-northeast-2.pooler.supabase.com`. Only non-secret host/project identifiers
were extracted from those local files; no connection or credential output occurred.
Use the Session pooler for a session-pinned snapshot, not a transaction pooler.

Ticket 05 records this project as the Render target on 2026-09-29 at 05:19:16 UTC:
PostgreSQL 17.6, 30 public tables, three pricing rows, exact migration prefix
0001–0003, no application or Auth users and no booking/payment history, with zero
orphans across 50 FKs. This is historical evidence, not a current source assertion.
Its referenced raw JSON is absent from this checkout. The original 29-table project
and the separate unledgered 48-table project are excluded; no fallback to either.

After approval, first obtain a read-only view of the current Render deployment's
project reference and deployed application commit/artifact identity. Compare only
the project reference with this proposal and the configured Auth issuer. Do not
print secret environment values. If these cannot be confirmed, or differ, stop
before any row export and return the discrepancy for a source decision. A DNS or
permission failure also stops; do not search other database credentials/targets.

## Evidence to reuse and refresh

- Reuse [ticket 05's migration plan](unrestricted-booking-migration-plan.md) for
  immutable identities/terms, prefix validation and deployment/recovery order.
  Refresh the source timestamp, schema, complete ledger, counts, roles and Auth
  linkage. The current repository has 44 migrations, not the original 34.
- Reuse [ticket 14's synthetic rehearsal](ticket14-representative-upgrade-rehearsal.md)
  for migration failure injection, historical comparisons and separate-target
  restore. It passed six checks through 0044, but constructs its own baseline and
  runs as owner. It must not be pointed at the source or mistaken for an importer.
- [Auth restore proof, 2026-09-23](evidence/auth-restore-proof-2026-09-23.json)
  proves matching public schema/ledger and zero Auth aggregates at that time.
  [Ticket 08's recovery](evidence/ticket08-cutover-recovery-2026-09-24.md) additionally
  proves that one synthetic provider identity retained its application ID after
  an application-database restore while the original provider remained available.
  Neither proves recovery of a lost provider project. Archive existence, checksums,
  source identity and custody must be rechecked before reuse; old archives are not
  the current source snapshot.
- [Ticket 11's B2 drill](evidence/ticket11-synthetic-backup-restore-2026-09-25.md)
  proves encrypted backup readback and later signed pause reconciliation in a
  synthetic namespace. Reuse its verifier/reconciliation approach, not its counts
  or source identity. Its recorded receipt retention expires 2026-10-25; historical
  evidence does not prove present availability, custody or current protection.
- [Ticket 13](evidence/ticket13-route-booking-outcomes-2026-10-05.md) proves local
  signed outcome record-loss recovery, including prerequisites and notification
  suppression. It does not prove complete backup restoration on a representative
  copy or independent provider recovery. Reuse the HTTP scenarios on the copy.

## Read-only inventory and export

Use an existing authorized reader with schema/SELECT access to approved public
tables and narrowly scoped Auth aggregates. Do not create or grant a source role.
If only a privileged connection is available, stop for a specific access decision;
transaction read-only is useful defense, but not a substitute for the agreed role.
Use verified TLS and keep connection settings in the existing local secret channel,
never command arguments, logs, committed files or chat.

The extractor will use a single pinned connection and this transaction setup:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SELECT current_database(), current_setting('server_version'),
       current_setting('transaction_read_only'),
       current_setting('transaction_isolation');
SELECT pg_export_snapshot();
SELECT name, checksum FROM public.schema_migrations ORDER BY name;
```

Keep the snapshot session alive only for the bounded export, with a five-minute
overall deadline; rollback/close on timeout. Separate schema-export sessions import
that snapshot. Copy data with explicit column lists and read-only SELECT/COPY TO,
never COPY FROM, migrations, DDL or business APIs on the source. No advisory locks
or source backup-attempt records are needed. No source functions with business
side effects may be invoked. PostgreSQL's normal read locks are bounded by timeout.

Inventory `pg_catalog`/`information_schema` for all public tables, ordered columns,
types/defaults, constraints, FKs, indexes, triggers, sequences, extensions and RLS.
Record effective SELECT coverage so permission-hidden tables cannot be called
absent. Confirm RLS does not silently filter the approved export; inability to
establish complete coverage blocks the copy. Record roles/grants as metadata only,
never global role/password exports. Review schema definitions for embedded secrets
or personal literals before retaining a schema-only export.

For every approved table record count and status breakdown; for every FK count
orphans, including composite keys. Use aggregate email-quality checks such as
`count(*) FILTER (...)` and duplicate-group counts, never email values. Count
missing/disabled/duplicate provider mappings and owner mismatches. Record integer
paise totals grouped by currency/status for bookings, accepted contributions,
obligations, settlements, payment orders and linked attempts. Mark missing tables
**absent**, not zero; mark unstored currency **not_stored**, not inferred INR.

`scripts/db-inventory.mjs` supplies useful query patterns but its standalone
READ COMMITTED snapshot and schema output need review for this consistent export.
Do not use `scripts/auth-identity-inventory.mjs` unchanged: it prints duplicate
email values and assumes later tables exist. Do not run `pilot-backup.mjs` against
the source: it INSERTs/UPDATEs backup-attempt rows. No source `pg_dumpall` is planned.

Before row extraction compare every ledger name/checksum to repository bytes at
the recorded commit. Require an exact prefix, plus a schema comparison to an
isolated clean installation of that prefix; a matching ledger alone does not rule
out drift. Missing ledger, checksum drift, unexpected schema/columns/triggers,
inaccessible tables, unknown source records or unreviewed sensitive fields stop
the process. Do not stamp a ledger, infer migrations from table names, or silently
extend the approved sanitization rules.

For the expected empty baseline, verify every application table is empty and retain
the actual source schema, ledger and three pricing rows. This is a real empty-source
copy. If new nonzero categories appear, first record only aggregates and review the
column-level sanitization/coverage map before exporting their rows. Full in-scope
tables are preferred over samples to retain all relationships and rare states.

## Record coverage and sanitization contract

Include all public business records and their dependency closure: users/profiles,
identity mappings/events/claim reviews, historical student/driver approvals,
vehicles/declarations, policy/rate/area records, historical offers/requests/bookings,
corridor allocations/obligations, posted routes/publications/quotes/requests/frozen
allocations, journeys/reviews, contributions/claims/receipts/disputes/settlements,
platform orders/attempts/webhooks, operations/idempotency/audit records, holds,
restrictions, incidents, notification/work state, closure/deletion records and
recovery/pause state. The source inventory determines which actually exist.

Keep source-derived data and supplemental fixtures in separate manifests and
baselines. For absent categories, add labeled synthetic corridor, unrestricted
`.2`, and Amravati `amravati-core-v1`/`.1` cases only after restoring and proving
the real baseline. Do not borrow rows from an unrelated project. No fixture is
evidence that a source booking or payment existed.

Sanitize in memory before writing row files. Do not first create an unsanitized
data dump. Use explicit reviewed column/JSON-path allowlists and fail closed on
unknown fields. Preserve NULL versus empty, duplicate/equality classes and existing
invalid-state cases; do not clean up historical anomalies while copying.

- Keep stable opaque application UUIDs, PK/FKs, operation IDs and ownership links
  within the protected copy; never publish them. This allows exact pre/post identity
  comparisons. They remain linkable pseudonymous data, so the copy is not public
  or claimed anonymous. If opaque IDs are disallowed by the maintainer, a separately
  approved deterministic mapping must cover every FK and JSON/receipt reference.
- Replace names, email addresses, phones, addresses, registration identifiers,
  provider subjects, payment-provider references and evidence/storage references
  using a per-run keyed mapping. Use `.invalid` email domains and preserve duplicate
  normalized-email groups and mapping conflicts. Preserve registration equality
  and suffix collisions without inventing a full historical vehicle mapping.
  Apply the same map across users, Auth linkage, nested terms and recovery evidence.
- Remove passwords/hashes, bearer/session/refresh tokens, MFA secrets, OAuth
  credentials and raw documents. Preserve only necessary presence/status aggregates;
  local authentication uses synthetic credentials. Required nonnull placeholders
  must be inert and explicitly recorded as transformed, never usable credentials.
- Keep policy family/version, currency, exact integer financial values, statuses,
  accepted pricing/rounding/distance, state-transition timestamps and relational
  ordering unchanged. Scrub free text, contact content, notification bodies/URLs,
  device/network identifiers and raw webhook/provider payloads. Preserve selected
  semantic fields and payload shape only where explicitly required by the tests.
- Frozen geometry and area identifiers/hashes must remain exact for before/after
  policy checks. Geometry and precise timestamps can be identifying even without
  names: if any real location/travel data is present, stop for explicit restricted
  inclusion approval. Do not silently shift coordinates, move routes into Amravati,
  assign a new policy, reprice, or claim shifted geometry proves historical parity.

Sanitization necessarily changes some source bytes. Produce a protected
source-to-sanitized comparison of invariant fields, counts and relationships, and
a transformation manifest listing changed field classes. Hash sensitive source
values with the per-run key rather than publishing reversible low-entropy hashes.
Then compare the sanitized baseline exactly through migration and restore, allowing
only documented new nullable schema fields. Any invariant difference blocks success.

## Protected artifacts and isolated restore

Proposed artifact directory:
`.scratch/unrestricted-booking/representative-copy/<UTC-run-id>/` under this repo.
The existing `.gitignore` ignores it; verify with `git check-ignore` before use.
Create with `umask 077`, directories 0700 and files 0600. Require a protected local
volume; encrypt retained archives with a key held outside this directory and Git.
No cloud sync, application uploads or external notifications. Restricted files:
approval/provenance manifest, aggregate inventory, schema/ledger, sanitization map,
coverage report, sanitized snapshot and checksums, and private restore reports.
Commit only reviewed non-personal summaries and scripts. Remove intermediate row
files after archive verification; proposed local retention is seven days after the
completed rehearsal unless the maintainer records an extension. Do not delete
existing archives or alter provider retention under this approval.

Use a newly initialized PostgreSQL 17 cluster (refresh version after inventory),
private socket and loopback-only unused port, with no remote credentials available
to local migration/test subprocesses. Targets are fresh random names
`pp14_copy_<run>_test` and `pp14_restore_<run>_test`. Guard host, port, cluster marker,
database names, explicit disposable flag, expected emptiness and absence of any
migration-URL override. Refuse reuse or overwrite. Never restore global roles.

Create target-only roles: a nonlogin schema owner, separate migrator, restricted
old/new runtime identities and SELECT-only verifier/recovery reader, all without
superuser/CREATEDB/CREATEROLE/BYPASSRLS. Reproduce reviewed runtime grants/RLS, not
blanket grants. Grant CONNECT only to those roles, fence all external writers and
transports, and prove runtime identities cannot DDL or write migration history.
Read-only recovery state/defaults supplement role restrictions; they are not the
sole fence. Restore/import privileges stay with the isolated loader/migrator.

Record project reference, approval identity/time, deployed app artifact, repository
commit, extraction start/end, server/client versions, snapshot token, isolation,
schema fingerprint, ledger/checksums, source/retained counts, transformation version,
coverage exceptions and archive SHA-256. Verify archive hashes before each restore,
then independently compare restored inventory, ownership, amounts and ledger.
Snapshot tokens establish one consistent database view, not a permanent backup.

## Exact Auth recovery evidence

First obtain read-only aggregate counts for available `auth.users`, `auth.identities`,
sessions, refresh tokens and MFA state, along with active/disabled application
mapping coverage, conflicts and orphans. Access to these tables is not implied by
public-schema access. Export only the approved sanitized subject-to-user mapping
and verification/disabled state needed for relational tests; no live sessions,
passwords, recovery tokens or MFA seeds enter the application copy.

Separately identify an existing approved protected provider backup/configuration
export: provider project/snapshot ID, time, integrity check, supported restore
procedure, encryption/custody, independent access and retention. Confirm it is
recoverable when the original provider is unavailable. A public-schema dump and
the 2026-09-24 still-online-provider login do not satisfy this requirement.

Demonstrate in an approved non-production provider recovery environment that the
same provider subject maps to the same stable application user and historical
owners after restore, with duplicate/conflicting mappings rejected and old sessions
invalidated appropriately. If provider restoration necessarily changes subjects,
stop for an explicit audited remapping decision; do not silently relink by email.
Real Auth users must not be created, deleted, recovered or logged into on the source.
If current source/Auth populations are zero, prove that from this snapshot and label
nonzero identity recovery as supplemental synthetic-provider evidence. A suitable
provider recovery target and its authorization remain separate prerequisites; this
plan does not authorize modifying an existing remote project.

## Exact independent acknowledgement evidence

Inventory the configured backend/prefix and receipt families for the verified
source without printing secrets or reading unrelated prefixes. Obtain a separate
recovery-reader identity and access to the verifier key from an independent secret
channel. Record versioned-object listing completeness, deletion markers/conflicting
versions, encryption, signature verification and retention, using current code's
checks. Include all relevant historical and new families, especially publication,
seat acceptance and outcomes, plus declaration, pause/reopen and settlement evidence.

For original receipts verify exact bytes/signatures in their protected location.
Sanitizing payloads invalidates signatures: never present a transformed receipt as
an original signed receipt. Record original-verification results separately, then
create consistent sanitized test receipts signed with a distinct rehearsal key,
retaining family/version, operation ordering, result shape and financial facts.
Original payloads/keys do not enter committed evidence. Historical outcome receipts
without reconstructable snapshots require explicit exception/manual evidence.

On the sanitized copy, take a baseline backup, acknowledge later operations through
the actual restricted-role application/recovery protocol, and persist their signed
receipts outside the database failure domain. Destroy only the disposable copy's
availability, restore the older backup into the second fresh target, and list all
receipts from the conservative snapshot lower bound through a recorded end marker.
Reconcile prerequisites and later operations through the authenticated operator
path, including repeat reconciliation, missing/corrupt evidence and conflict cases.
Compare IDs, users, frozen terms, seats, journeys, settlements, audit and logical
notification IDs. Suppress uncertain external delivery; do not send real email.

The known `synthetic-recovery-receipts` B2 bucket is historical evidence only. A
fresh independent-store rehearsal requires a specifically approved synthetic
namespace, reader/writer scopes, verifier-key custody and retention/no-cost decision.
Until those are supplied, local signed files prove logic but not independent
provider recovery. Do not upload source data, create paid services, or alter bucket
policies under source-extraction approval.

## Upgrade sequence and acceptance gate

Capture the deployed old application artifact before choosing its compatibility
tests; do not equate current main with old deployed code. Restore source baseline,
verify it, then add separately labeled coverage fixtures. Apply the exact remaining
forward migrations to the copy with the migrator. Verify old reads and disabled
writes with old runtime credentials, current dual reads with new credentials, and
new synthetic-only API operations with transport isolation. Preserve real-booking
gates. If the documented dual-read sequence cannot be supported by the actual old
artifact, report a deployment decision rather than inventing compatibility.

Run corridor/`.2`/Amravati comparisons, invalid/reversed segment and route revision
cases, separate-connection last-seat races, retries, notification failure and audit
rollback on the upgraded copy. Repeat frozen-value/geometry/receipt checks after
backup restore and reconciliation. Record exceptions and elapsed recovery time.
No ticket resolution until every acceptance criterion, including role separation
and protected Auth/independent evidence, is demonstrated. Keep restored writes
restricted; production cutover and reopening remain separate decisions.

## Local test-failure investigation

`node --test --test-timeout=20000 scripts/landing-eligibility.test.mjs scripts/runtime-contract.test.mjs`
reproduced the prior failures in the sandbox. The landing setup emitted
`listen EPERM ... 127.0.0.1`; its listen promise has no error rejection, causing the
unbounded previous run to hang. Docker independently reported socket permission
denied. The version assertion then saw empty stdout, masking that prerequisite error.

The same two test files ran unchanged with authorized local loopback/process/Docker
socket access and a 30-second test bound: **5/5 passed in approximately 3.1 seconds**.
No product or assertion change was needed. Final verification must run in that
permitted local environment with explicit disposable PostgreSQL settings and no
source credentials. The full suite is not claimed passed by this focused diagnosis.

## Approval requested

Approve project `qqmofdocznefwpbqweud` as the proposed source and the bounded read-only
inventory, expected-empty export and protected local-copy process above. Approval
includes refresh of deployment identity; mismatch, new nonzero sensitive coverage
or unknown schema stops for a revised decision before row extraction. Confirm or
amend the proposed seven-day artifact retention. No credentials or personal data
should be supplied in chat. Provider Auth restoration and new independent-store
writes need their specifically identified safe targets before that phase proceeds.
