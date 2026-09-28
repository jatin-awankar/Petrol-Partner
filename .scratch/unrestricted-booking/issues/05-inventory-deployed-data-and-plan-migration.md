# 05: Inventory deployed data and plan the migration

**What to build:** A maintainer knows the deployed baseline and has a forward-only upgrade and rollback-by-recovery plan before new schema work begins.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Inventory deployed users and identity mappings, approvals, vehicles, offers, bookings, contribution and settlement records, and historical platform-payment orders against the actual migration history.
- [ ] Specify additive policy-version and route-segment storage, old/new read behavior, constraints, deployment sequence, and representative-copy rehearsal criteria.
- [ ] Preserve original identities, ownership, terms, amounts, and payment history; do not reset, reinterpret, or migrate deployed data without an explicit decision.
