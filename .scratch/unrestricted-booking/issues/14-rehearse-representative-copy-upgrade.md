# 14: Rehearse the representative-copy upgrade

**What to build:** A maintainer can upgrade a representative copy with the completed new schema and show that historical and new records remain correct.

**Blocked by:** 05 (Inventory deployed data and plan the migration); 07 (Record an adult declaration without college affiliation); 08 (Register individual driver–vehicle declarations); 10 (Publish a server-verified route for a declared driver); 11 (Quote an ordered posted-route segment); 12 (Request and accept one priced seat); 13 (Carry route bookings through cancellation and outcomes).

**Status:** claimed

- [ ] Run the forward-only upgrade against a representative copy containing historical identities, offers, bookings, contributions, settlements, and platform-payment orders.
- [ ] Assert ownership, historical policy identity, accepted terms, and amounts remain unchanged, and old/new reads, audit, operations, and recovery distinguish the policy versions.
- [ ] Record migration results, exceptions, recovery procedure, and any required explicit data decision before cutover.

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
