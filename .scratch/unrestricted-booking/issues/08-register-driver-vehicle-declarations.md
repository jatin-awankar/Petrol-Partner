# 08: Register individual driver–vehicle declarations

**What to build:** An account holder with a current adult declaration can register a specific bike, scooter, or car and declare the required licence, vehicle documents, permission, and passenger capacity. No document review or independent approval is implied.

**Blocked by:** 01 (Approve broader eligibility and vehicle rules); 05 (Inventory deployed data and plan the migration); 07 (Record an adult declaration without college affiliation).

**Status:** resolved

- [x] Record driver and per-vehicle declarations, category, declared document expiries, permission, policy version, audit, and recovery behavior; distinguish them from historical PRMITR approvals without silently promoting either status.
- [x] Enforce at most one passenger seat for a bike or scooter and no more than the car's individually declared belted passenger-seat capacity at the database and service boundaries; do not label that capacity inspected or approved.
- [x] HTTP/PostgreSQL tests cover wrong owner, unsupported category, missing or expired declaration, known false declaration, restriction, changed capacity, and revocation races.

## Answer

Added separate driver and per-vehicle self-declaration records and authenticated API endpoints. The current-declaration gate checks the adult declaration, account restrictions, document expiries, category and declared capacity under transaction locks. Audit, durable notification work, independent acknowledgement receipts and operator recovery are recorded for each mutation. Historical PRMITR approvals are untouched. Real bookings remain disabled.

Verification: focused ticket 08 HTTP/PostgreSQL tests, full `npm test`, typecheck, lint (excluding the unrelated untracked `.worktrees/` directory), migration tests, and API/worker builds passed. The aggregate web build could not fetch the existing Poppins font from Google Fonts in this environment; web build completion is unverified.
