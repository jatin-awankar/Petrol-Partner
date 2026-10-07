# 14: Rehearse the representative-copy upgrade

**What to build:** A maintainer can upgrade a representative copy with the completed new schema and show that historical and new records remain correct.

**Blocked by:** 05 (Inventory deployed data and plan the migration); 07 (Record an adult declaration without college affiliation); 08 (Register individual driver–vehicle declarations); 10 (Publish a server-verified route for a declared driver); 11 (Quote an ordered posted-route segment); 12 (Request and accept one priced seat); 13 (Carry route bookings through cancellation and outcomes).

**Status:** claimed

- [x] Run the forward-only upgrade against a representative copy containing historical identities, offers, bookings, contributions, settlements, and platform-payment orders.
- [ ] Assert ownership, historical policy identity, accepted terms, and amounts remain unchanged, and old/new reads, audit, operations, and recovery distinguish the policy versions.
- [x] Record migration results, exceptions, recovery procedure, and any required explicit data decision before cutover.

## Rehearsal progress (2026-09-29)

See `docs/operations/ticket14-representative-upgrade-rehearsal.md`. A wholly synthetic, isolated PostgreSQL rehearsal preserved historical rows through migrations 0035–0042, verified the exact ledger and explicit owner/money/status comparisons, exercised runner rollback, and restored its baseline into a second local database. A newer synthetic acknowledged operation was reconciled from a local receipt while writes remained restricted. Existing posted-route HTTP/PostgreSQL scenarios passed separately. This remains partial evidence: an approved sanitized copy of the verified live shape, separate roles, mixed-version application behavior on that copy, and protected provider Auth recovery are unevidenced. Keep this ticket claimed and real booking writes disabled.

## Amravati core scope amendment — 2026-10-04

Include historical corridor records, prior unrestricted `.2` route evidence and new `amravati-core-v1`/`.1` successor records in the existing authorized-copy rehearsal. Compare frozen terms, geometry, area/policy identifiers and signed receipt formats before/after migration and restore. Do not backfill old records with the new area or treat old state checks as local-area approvals. Scope approval supplies no data-reset or deployed migration authorization; status and existing copy-evidence requirements remain unchanged.

## Current audit — 2026-10-07

All dependencies 05, 07, 08, 10, 11, 12 and 13 are resolved and their completion
commits are ancestors of fetched main `7273b3c`. The requested branch was
fast-forwarded to that baseline, preserving existing work. See the
[current evidence audit](../../../docs/operations/ticket14-representative-upgrade-rehearsal.md#current-audit--2026-10-07)
for commit IDs, every acceptance gap and exact missing source/access decisions.

No approved sanitized snapshot or source approval is identified in the available
evidence; the ticket 05 referenced current-project raw inventory is absent from
this checkout. No remote database was accessed. The existing synthetic harness
was reused and its stale 42-migration assertion updated to the current 44;
all six PostgreSQL upgrade/rollback/restore checks passed on a fresh isolated
local cluster. This does not replace representative-copy evidence. Keep all
acceptance checkboxes open and status claimed pending the approved source,
restricted-role application compatibility and protected Auth/acknowledgement
recovery rehearsal. Production and real bookings remain unchanged and disabled.

## Proposed source/extraction plan — 2026-10-07

The [approval plan](../../../docs/operations/ticket14-copy-extraction-plan.md)
identifies proposed project `qqmofdocznefwpbqweud` from matching local app and
ticket 05 pooler configuration, without contacting the source. It specifies
consistent read-only inventory/export, schema/ledger provenance, sanitization,
protected local artifacts, separate-role restore and remaining Auth/independent
receipt evidence. Current Render identity still needs confirmation after source
approval. No source approval has been inferred; ticket remains claimed.

The prior test failures were reproduced as sandbox loopback/Docker socket denial.
Both test files passed unchanged with authorized local access (5/5); this focused
diagnosis is not a full-suite or representative-copy acceptance result.

## Approved extraction preflight — 2026-10-07

The maintainer approved the documented source/process and seven-day local artifact
retention. Render's current `Petrol-Partner` service was checked and its database
project reference matches `qqmofdocznefwpbqweud`; live revision is `7273b3c`.
The saved ticket 05 connection uses privileged `postgres`; the maintainer explicitly
approved its use with bounded read-only guards. The subsequent repeatable-read
inventory confirmed 30 public tables, exact 0001–0003 ledger checksums and only
three pricing seed rows, but found a newly populated Auth state (one user/identity,
with session/token/MFA records). Per the user's instruction, work stopped before
row export. Only aggregate counts and catalog/ledger metadata were read; no Auth
row values were fetched. No source mutation or copy restore occurred. The
[preflight record](../../../docs/operations/ticket14-copy-extraction-plan.md#approved-execution-preflight--2026-10-07)
records the exact Auth-scope decision needed without credentials. Status remains
claimed; all acceptance criteria remain open.

## Source-derived copy execution — 2026-10-08 IST

The maintainer approved aggregate-only source Auth and the empty public application
copy, with pricing seeds/verified ledger and separately labelled synthetic history.
The source-derived catalog/archive was verified, encrypted locally, restored and
upgraded through 0044 without changing the source. Historical identity/ownership/
financial preservation and rollback/restore checks passed. All 190 selected HTTP
cases passed under a restricted runtime distinct from fixture/migration identities;
the SELECT-only legacy HTTP check and explicit permission-denial checks passed.
Synthetic `.2` and Amravati `.1` storage/signed-envelope preservation passed across
0044 and restore. See the [execution report](../../../docs/operations/ticket14-source-copy-results.md).

Criterion 1 is supported by the approved real empty-application baseline plus
labelled supplemental historical records, not a claim of nonzero deployed history.
Criterion 3's results/exceptions and minimum remaining protected recovery plan are
recorded. Criterion 2 remains open because the adopted ticket 05 copy gate requires
protected provider Auth export/recovery and independently protected later-operation
evidence. Actual source-account continuity is unproven; no Auth rows were exported.
Ticket 17's later outage gate does not silently replace this requirement. Keep
status claimed and real bookings disabled; no production migration or deployment.
