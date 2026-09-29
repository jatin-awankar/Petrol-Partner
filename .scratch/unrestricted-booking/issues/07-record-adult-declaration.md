# 07: Record an adult declaration without college affiliation

**What to build:** Any account holder can declare adult status without college affiliation and see its current state, while protected route-booking actions require a current declaration and no restriction. A declaration is never described as verified age.

**Blocked by:** 01 (Approve broader eligibility and vehicle rules); 05 (Inventory deployed data and plan the migration).

**Status:** resolved

- [x] Reuse stable application-user identities and protected mutation, audit, and recovery patterns without requiring college enrollment or pre-booking identity documents.
- [x] Record an explicit adult declaration with policy version and expiry; show current, expired, withdrawn, and restricted states without presenting self-declaration as independent verification.
- [x] PostgreSQL HTTP tests cover missing, current, stale, withdrawn, and restricted declarations, historical PRMITR-only status, authorization, retries, and recovery-evidence failure.

## Answer (2026-09-29)

Migration `0035_adult_declarations.sql` adds a separate application-user keyed self-declaration and idempotent operation history under policy `unrestricted-declared-2026-09-28.1`. It does not alter historical PRMITR reviews. The API and account page expose missing, current, expired, withdrawn, and restricted states, label the record as a self-declaration, and allow declaration, twelve-calendar-month renewal, and withdrawal without college or document fields. The server-side `assertCurrentAdultDeclaration` gate checks current policy, expiry, withdrawal, and both travel-restriction scopes for future unrestricted protected actions; no unrestricted booking mutation exists in ticket 07, and all existing real-booking launch gates remain closed. Driver and vehicle declarations remain ticket 08.

The HTTP/PostgreSQL tests and PostgreSQL participation-gate case in `apps/api/src/test/http-postgres.integration.test.ts` cover authentication, missing/current/expired/withdrawn/restricted and PRMITR-only states, policy version, renewal, cross-account isolation, idempotent and concurrent retries, audit, and independent-receipt failure entering restricted recovery mode. Business state, audit, and notification work commit together. Receipts precede acknowledgement. A disposable local PostgreSQL cluster was used; the deployed database was not migrated or modified.

Checks: `npm run lint` passed with ten existing warnings; `npm run typecheck` passed; focused ticket 07 HTTP/PostgreSQL tests passed (6); `npm test` passed after updating the migration-plan fixture and installing worktree-local dependencies (API 158 passed/1 skipped, worker 19 passed). Final `npm test` passed after the page edits (API 158 passed/1 skipped, worker 19 passed). `npm run api:build` passed after review fixes, and `npm run build:all` passed before them with network access for the configured Google font; the sandboxed attempt could not fetch that font.

Review against `origin/main`: the standards axis found SQL in the service and the spec axis found a missing disabled-account check in the protected participation gate. Both were fixed before the final test run. The operation rows retain each declaration and withdrawal decision; the current-state row is replaced on renewal, leaving PRMITR history untouched.

## Post-review fix evidence (2026-09-29)

The follow-up review found two gaps: operator reconciliation did not include declaration receipts, and a suspended account could display a current declaration even though the protected-action gate rejected it. Both are fixed. Suspended accounts now display `restricted` with `restriction_source: account_status`; the page explains that declaring again does not restore access. Display and server gate share one state classifier.

The operator recovery registry now verifies declaration receipts, reconstructs acknowledged operations after an older snapshot, restores audit and notification records, and suppresses uncertain restored email delivery. After a receipt-store outage, a current MFA operator can inspect the committed transaction, attach independent evidence, reconcile it, and explicitly reopen protected writes. Recovery refuses a withdrawal whose preceding declaration evidence is absent. HTTP/PostgreSQL tests were written red first for suspended-account status, acknowledged receipt replay, pending receipt completion, and orphan withdrawal rejection; each passed after its focused fix. No deployed database was accessed or migrated.

Final checks after the fixes: `npm run lint` passed with ten pre-existing warnings, `npm run typecheck` passed, ticket 07 focused HTTP/PostgreSQL tests passed (10), `npm test` passed (API 162 passed/1 skipped; worker 19 passed), and `npm run build:all` passed. The remaining launch gates and ticket 08 driver/vehicle declarations still block real bookings.
