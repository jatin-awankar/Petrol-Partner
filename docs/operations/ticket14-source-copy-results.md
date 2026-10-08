# Ticket 14 source-derived copy results

Run: 2026-10-07 UTC / 2026-10-08 IST. **Partial acceptance; ticket remains claimed.**
No source mutation, Auth row export, deployment or real-booking activation occurred.

## Source and authorized scope

Render service `srv-d6qlc37afjfc73eqamd0` was verified to target Supabase project
`qqmofdocznefwpbqweud`; its live revision was `7273b3c`. The maintainer approved
bounded read-only access using the existing connection, then explicitly approved
the empty application-data public copy after the aggregate inventory found one
Auth user. Auth remained aggregate-only. No subject, identity, session, token,
password, MFA factor/challenge value or personal application row was exported.

The source public schema contains 30 tables and exactly three migration-ledger rows
and three pricing seeds; all other application tables were empty. Source catalog
comparison against an isolated 0001–0003 reference matched 30 relations, 349 columns,
157 constraints, 85 indexes, RLS state, and zero user triggers/policies/functions/
enums. Extension-owned functions were excluded from the user-function comparison.
An initial difference in UUID-default display disappeared with the same canonical
`pg_catalog,public` search path; no source schema or default was changed.

Immediately before export, a repeatable-read read-only transaction rechecked the
catalog, table populations and exact ledger against that reference. `pg_dump`
imported its exported snapshot, selected **only `public`**, omitted owner/ACL
restoration, and ran with read-only startup settings, verified TLS, statement/lock
timeouts and a bounded execution time. Auth was not included. No global roles were
exported. The archive was encrypted in memory with AES-256-GCM before local writing;
the key is outside the repository and archive directory. Plaintext and ciphertext
hashes were checked before each restore. The source transaction ended with ROLLBACK.

The encrypted archive, metadata/count inventories, schema comparisons and manifest
are ignored under `.scratch/unrestricted-booking/representative-copy/20261007T1824Z/`
(directory 0700, files 0600). These are source-derived artifacts, not reconstructed
fixtures. The seven-day limit remains in force, with a conservative removal cutoff
of **2026-10-14 18:25:25 UTC**. Do not commit these artifacts or their keys.

## Local targets and migration preservation

A new loopback-only PostgreSQL 17 cluster was initialized at
`/private/tmp/pp14-copy.XWYMxm/pg`, port 55488, with a private local socket. Targets
were new `pp14_copy_*_test` databases. No existing database was reset. One first
restore failed transactionally because its empty template already contained the
`public` schema; a new empty target was used with clean/if-exists restore to replace
only that newly created default schema. This was not a source or existing-data reset.

The final preservation target was `pp14_copy_final_test`. The reused harness now
accepts an independently verified source manifest, rejects expired/incorrect
manifests and unexpected application rows, validates the restored ledger/counts,
and checks source pricing seeds remain byte-equivalent through expansion. Archive
hash/source provenance verification occurs in the approved extraction/restore step;
the harness's manifest check alone does not authenticate an arbitrary copy.

Sequence: actual source 0001–0003 → 0034 → separately labelled historical fixture
load → rollback-injection check → 0044. Every nonzero historical user, mapping,
approval, vehicle, offer, booking, contribution, settlement and platform-payment
record was synthetic. They were never described as deployed records.

- All 104 historical tables retained identical row counts/digests through 0035–0044.
  The 184 pre-expansion and 226 post-expansion declared FKs had zero orphans.
- Explicit ownership, stable IDs, policy/accepted terms, status and currency/paise
  comparisons passed. Corridor accepted contribution/obligation stayed 2,500 paise (INR 25.00);
  the platform order and historical settlement retained 12,500 paise. The legacy
  settlement's absent currency remains `not_stored`, not an inferred currency.
- The actual runner's injected failing migration rolled back its partial table
  and ledger entry without changing history. All 44 current checksums then passed.
- An older baseline restored into another new local target with identical history.
  One later synthetic acknowledged operation was identified and reconciled from
  the existing local receipt mechanism; two synthetic provider mappings stayed
  attached to the same application IDs. Restored writes remained restricted.

## Role separation and application behavior

`pp14_copy_roles_test` was independently restored from the same verified archive.
Target-only nonlogin owner `pp14_owner`, login migrator, runtime, old reader and
verifier roles have no superuser, CREATEDB, CREATEROLE or BYPASSRLS privileges.
Database/public-schema privileges were revoked from PUBLIC. The migrator assumes
the owner role; runtime/readers cannot. The actual migration runner used distinct
migration/runtime URLs with `TEST_DATABASE_DISPOSABLE=false`, so its production
role-separation checks ran even though the target was local and disposable.

The runtime received explicit application-table DML/read grants, not schema-wide
write grants. Historical platform-payment tables are SELECT-only; schema_migrations
is inaccessible to runtime. An isolated verifier can read tables; the old-reader
identity has SELECT-only grants for legacy projections. Runtime CREATE TABLE,
ledger UPDATE and payment-order INSERT failed with SQLSTATE 42501; reader/verifier
UPDATE failed too. Historical SELECTs succeeded. No forbidden operation committed.

The HTTP harness now optionally separates its fixture/DDL connection from the
application connection, requiring both to address the same explicitly disposable
localhost database. This does not change application authorization or production
configuration. Historical fixtures and test setup use the owner; HTTP business
operations use restricted runtime. Only the fixture/verification identity received
`pg_read_all_stats` to observe separate runtime backend sessions in race tests.

All **190 selected HTTP cases passed** under restricted runtime: historical reads
and disabled legacy mutations, adult declarations, published/private routes,
selection/price validation, acceptance, holds/revocations, replacement, departures,
journey/settlement, operator authorization, audit/work rollback, notification
failure, separate-connection races and signed-receipt reconciliation. A separate
SELECT-only old-reader run passed the legacy HTTP scenario (294 unrelated cases
filtered). Initial runs exposed missing explicit read/reopen grants and backend
statistics visibility; the completed rerun passed without widening runtime schema,
ledger or platform-payment write privileges.

The deployed application revision and current branch's production application code
are identical; only rehearsal/tests/docs changed. These runs verify that revision's
legacy/new projections on the expanded copy. They do not claim an unidentified
older binary was tested or authorize downgrading after new-format accepted actions.
The HTTP suites reset their synthetic fixture state on the disposable test copies;
historical byte-preservation was measured separately before those fixture resets.

## Policy versions and recovery limits

`scripts/ticket14-policy-preservation.mjs` runs only on a disposable 0043 copy with
the historical fixture prerequisites. It adds labelled synthetic `.2` and Amravati
`.1` storage records, including geometry, accepted price and area ID/hash. It checks
ten identity/financial/route tables across 0044 and a fresh older-snapshot restore.
All comparisons passed; `.2` gained no Amravati area and `.1` retained its exact
area evidence. Restored writes stayed restricted. These storage fixtures do not
pretend to have passed real routing/provider approval.

Two synthetic payloads round-tripped unchanged through the application's actual
SignedReceiptStore before/after migration and restore. This checks signed envelope
preservation, not historical production-receipt authenticity. Actual current route,
seat and outcome receipt/reconciliation behaviors are covered by the HTTP cases.
Local fsynced receipts do not establish an independent provider failure domain.

Existing ticket 08 evidence remains applicable to synthetic stable mapping and
application-database restore while the original provider remains online; its three
local archive hashes were verified. The new HTTP runs additionally exercise
synthetic mapping/recovery behavior. **Continuity of the actual source Auth account
and recovery after loss of its provider remain unproven.** No live Auth export or
account change was attempted. The prior ticket 11 B2 drill remains dated evidence
of encrypted backup and later pause recovery; it is not a fresh verification of
current source/provider/key custody. No new B2 upload or remote restore was made.

## Exact remaining requirement and minimum approval plan

Ticket 14 criterion 2 requires recovery to distinguish policy versions. Its adopted
[ticket 05 representative-copy gate](unrestricted-booking-migration-plan.md#representative-copy-upgrade-gate)
additionally requires a “separately protected Auth-provider export/recovery rehearsal”
and reconciliation of restored subjects to the same application-user IDs before
write reopening. The ticket's existing progress record also names protected Auth
recovery as unevidenced. This is not silently reassigned to ticket 17. Ticket 17's
separate broader outage/identity-reconciliation criteria and ticket 18's release
decision remain additional gates, not substitutes.

The source currently has no application users/mappings, so there is no established
source application ID to invent for its provider account. The minimum next plan is:

1. Identify a specifically approved disposable provider-recovery target and an
   existing protected provider backup/configuration artifact, with snapshot/project
   identifiers, hash, supported restoration mechanism, access/retention and key
   custody independent of the lost provider. Do not create a paid service or change
   any source account. No target is inferred from the unrelated historical projects.
2. Use an isolated synthetic identity and application mapping to rehearse genuine
   provider loss, not merely a mocked outage or reuse of a still-online provider.
   Verify recovered subject → same application ID, conflict rejection and session
   invalidation. If subjects change, obtain an explicit audited mapping decision.
3. Continue excluding all actual source Auth rows under the current instruction.
   If actual-account continuity must be demonstrated, obtain separate explicit
   approval for a provider-supported protected backup/restore, with the named
   artifact/destination and custody controls, outside this public-schema copy.
   No account email/subject, token or MFA secret belongs in chat or Git.
4. Identify an approved independent synthetic receipt namespace, scoped reader/
   writer access, signing-key recovery channel and retention/no-cost decision.
   Verify current protection and all retained versions, then rehearse later
   declaration/publication/seat/outcome receipts against an older copy using the
   actual reconciliation endpoint, with repeat/conflict checks and uncertain
   delivery suppressed. Never upload source Auth or enable external trip notices.

Until the protected provider/independent-evidence portion passes, criterion 2 stays
open and ticket 14 stays claimed. Local tests and aggregate-only source Auth do
not waive it. Before cutover, also refresh the source inventory, settle historical
vehicle-identity ambiguities, approve writer fencing/backup/corrective-migration
and application rollback conditions, and explicitly decide reopening separately.

## Validation

The final source-derived preservation run passed. Seven standalone rehearsal
regressions passed, including the new existing-baseline path. Typecheck and scoped
lint passed. The first complete run passed 42 root checks, 514 API tests and 19
worker tests, with opt-in skips. A subsequent all-root-enabled run passed 49 root
checks and 19 worker tests but hit one API `ECONNRESET` (513 passed, 7 skipped);
the unchanged boundary case passed its focused retry. The final full rerun passed
49 root checks, 514 API tests (7 skipped) and 19 worker tests. No failed attempt is
counted as a full-suite pass.

The seven-check run also had an earlier cleanup timeout; its unchanged rerun with
sleep inhibited passed. The policy script initially failed at its module import
before mutation; correcting the CommonJS import allowed the check to pass. Logs
and synthetic backup/receipt artifacts are private under the run's temporary
directories; source archive/key material remains excluded from Git.

Standards review found one reporting-unit error (paise versus rupees), corrected
above; no other actionable standards findings. Spec review found no mismatch and
confirmed criteria 1 and 3 may be checked under the amended approval while
criterion 2 and ticket completion remain open.


## Protected recovery completion — 2026-10-08

The previously open criterion 2 is now supported by the
[protected recovery results](ticket14-protected-recovery-results.md), including
actual isolated provider loss, independent B2 recovery and snapshot overlap.
Ticket 14 is resolved under the explicit synthetic Auth approval. Actual source
account continuity remains unproven; source Auth remains excluded. Retention-dependent
remote cleanup is separately pending with an active follow-up.
