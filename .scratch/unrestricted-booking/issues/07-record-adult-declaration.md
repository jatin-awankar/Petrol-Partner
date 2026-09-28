# 07: Record an adult declaration without college affiliation

**What to build:** Any account holder can declare adult status without college affiliation and see its current state, while protected route-booking actions require a current declaration and no restriction. A declaration is never described as verified age.

**Blocked by:** 01 (Approve broader eligibility and vehicle rules); 05 (Inventory deployed data and plan the migration).

**Status:** ready-for-agent

- [ ] Reuse stable application-user identities and protected mutation, audit, and recovery patterns without requiring college enrollment or pre-booking identity documents.
- [ ] Record an explicit adult declaration with policy version and expiry; show current, expired, withdrawn, and restricted states without presenting self-declaration as independent verification.
- [ ] PostgreSQL HTTP tests cover missing, current, stale, withdrawn, and restricted declarations, historical PRMITR-only status, authorization, retries, and recovery-evidence failure.
