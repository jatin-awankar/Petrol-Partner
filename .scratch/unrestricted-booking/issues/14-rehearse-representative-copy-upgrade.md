# 14: Rehearse the representative-copy upgrade

**What to build:** A maintainer can upgrade a representative copy with the completed new schema and show that historical and new records remain correct.

**Blocked by:** 05 (Inventory deployed data and plan the migration); 07 (Record an adult declaration without college affiliation); 08 (Register individual driver–vehicle declarations); 10 (Publish a server-verified route for a declared driver); 11 (Quote an ordered posted-route segment); 12 (Request and accept one priced seat); 13 (Carry route bookings through cancellation and outcomes).

**Status:** claimed

- [ ] Run the forward-only upgrade against a representative copy containing historical identities, offers, bookings, contributions, settlements, and platform-payment orders.
- [ ] Assert ownership, historical policy identity, accepted terms, and amounts remain unchanged, and old/new reads, audit, operations, and recovery distinguish the policy versions.
- [ ] Record migration results, exceptions, recovery procedure, and any required explicit data decision before cutover.

## Rehearsal progress (2026-09-29)

See `docs/operations/ticket14-representative-upgrade-rehearsal.md`. A wholly synthetic, isolated PostgreSQL rehearsal preserved historical rows through migrations 0035–0042, verified the exact ledger and explicit owner/money/status comparisons, exercised runner rollback, and restored its baseline into a second local database. A newer synthetic acknowledged operation was reconciled from a local receipt while writes remained restricted. Existing posted-route HTTP/PostgreSQL scenarios passed separately. This remains partial evidence: an approved sanitized copy of the verified live shape, separate roles, mixed-version application behavior on that copy, and protected provider Auth recovery are unevidenced. Keep this ticket claimed and real booking writes disabled.
