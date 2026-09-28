# 14: Rehearse the representative-copy upgrade

**What to build:** A maintainer can upgrade a representative copy with the completed new schema and show that historical and new records remain correct.

**Blocked by:** 05 (Inventory deployed data and plan the migration); 07 (Record an adult declaration without college affiliation); 08 (Register individual driver–vehicle declarations); 10 (Publish a server-verified route for a declared driver); 11 (Quote an ordered posted-route segment); 12 (Request and accept one priced seat); 13 (Carry route bookings through cancellation and outcomes).

**Status:** ready-for-agent

- [ ] Run the forward-only upgrade against a representative copy containing historical identities, offers, bookings, contributions, settlements, and platform-payment orders.
- [ ] Assert ownership, historical policy identity, accepted terms, and amounts remain unchanged, and old/new reads, audit, operations, and recovery distinguish the policy versions.
- [ ] Record migration results, exceptions, recovery procedure, and any required explicit data decision before cutover.
