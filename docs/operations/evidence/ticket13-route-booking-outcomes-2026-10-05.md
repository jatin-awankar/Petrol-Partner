# Ticket 13 route booking outcome evidence — 2026-10-05

## Baseline and scope

Work started from fetched, up-to-date main `14c45278f0c77a42a9b81a078a5ebaca2f43aa8c` on `codex/13-route-booking-outcomes`. Ticket 04 and ticket 12 both have resolved status; their required changes are ancestors of main (`6c28595` and `f12154b`, respectively; ticket 12 merged in PR 86). The existing branch had no unique unmerged work and was fast-forwarded. Existing untracked `.worktrees/` was preserved.

The implementation reuses posted-route publication, quote, acceptance, outcome operations, direct-settlement records, protected transactions, independent signed receipts and notification delivery. Historical pilot records are not reclassified. Migration 0044 adds outcome evidence and durable timer markers, extends allowed eligibility actions, and allows a later recipient receipt alongside an original dispute without overwriting either. No previously shipped migration is rewritten.

## Acceptance evidence

Tests are in `apps/api/src/test/http-postgres.integration.test.ts`, using authenticated HTTP requests and real PostgreSQL transactions. Published-route fixtures exercise the completed preview/publication/quote/acceptance interfaces, controlled Valhalla responses and recorded Amravati area evidence. Historical synthetic route variants remain covered.

- **Capacity, holds, departure and frozen terms:** Existing cancellation tests demonstrate one-time capacity release, cancelled request history and same-key retries. Acceptance/cancellation and departure/passenger-cancellation use separate PostgreSQL connections. New passenger, driver and vehicle revocation/departure races observe two blocked backend sessions before releasing their shared serialization lock. Future passenger commitments hold their seat; driver/vehicle revocation holds the whole route; revocation after departure creates an incident and preserves allocations. Material vehicle changes also hold existing commitments. Departure checks current area evidence, full frozen commitments and overlapping participants/vehicles, including held offers without passengers and conservative historical registration collisions. The obligation retains the full accepted-term snapshot, not a recomputed segment or price.
- **Material replacement:** A published replacement before cancellation is rejected. Audited driver cancellation records affected bookings and pending requests, then a replacement gets a new route identity and requires a fresh quote/request/acceptance. No commitment is transferred. Held and cancelled routes reconcile through the full operator endpoint without rewriting original publication or request history.
- **Journey and incidents:** Boarding never creates an obligation. Both journey claims are required for automatic contribution creation; an existing incident or silence review keeps operator review authoritative. A late second confirmation cannot bypass that review. Driver and passenger cancellation attempts after departure become incidents, and incident recipients include current operators. Active journey and settlement actions remain available while new bookings are paused. Closing a case is separate from asserting travel or payment.
- **Direct settlement:** Cash/UPI payer claims are separate from recipient receipt. An operator's `recipient_confirmed` Boolean and evidence reference alone are rejected; an affirmative resolution requires an acknowledged authenticated driver receipt for the same allocation. A driver may append receipt after a dispute; both records survive. A passenger cannot author that receipt. Same-key retries preserve identities. Operator resolutions retain reason, actor, timestamp, evidence references and operation linkage; affirmative settlement also links the recipient confirmation operation.
- **Authorization and rollback:** Existing participant ownership, current-operator authorization and AAL1 rejection tests cover all operator outcome endpoints. Route incidents can support an authorized account restriction. Injected failures in audit, notification-event and email-job insertion roll back declaration withdrawal and its holds together. Timer work failure rolls back its marker, review, audit and notices; retry produces one logical event. Post-commit delivery failure leaves business state intact and uses existing bounded retry/operator recovery behavior.
- **Durable timers:** The worker produces delayed-departure notices after +30 minutes, journey-silence review 24 hours after an unanswered journey claim, overdue-payment notices at the obligation deadline, and receipt-silence review after a claim remains unanswered for 24 hours. Tests advance each cutoff, run the actual producer and deliver through the real worker with a controlled transport, asserting exact affected participant/operator recipients. Repeated sweeps do not duplicate logical events. Time alone never starts, cancels, travels, creates debt or confirms payment.
- **Acknowledgement and recovery:** Outcomes snapshot exact downstream records into independent signed receipts before success. The full authenticated operator reconciliation restores lost operations, claims, obligations, receipts, audit and notification records from those receipts after explicit disposable-fixture loss, then repeats safely. IDs, amounts, accepted terms and timestamps remain identical; no duplicate obligation or receipt appears. Lost holds and obligations trigger restricted recovery rather than silent success. Uncertain acknowledgement completes the same operation on retry; current booking pause does not erase a previously acknowledged result. A hold → release → driver revocation regression verifies that the later eligibility hold supersedes the earlier release during evidence verification.

## Recovery and delivery semantics

The local rehearsal removes downstream rows and returns the offer/boarding state to the accepted baseline. It is receipt-backed record-loss recovery, not a deployed database backup/restore rehearsal. Publication and seat evidence restore prerequisites first. Unknown conflicting state fails closed. Historical receipts without the new snapshots cannot invent missing downstream records and require manual recovery evidence.

Logical notification event IDs are deterministic per operation, recipient and action; timer markers and events are unique per entity and kind. The existing email worker provides bounded at-least-once delivery: a crash after external send but before acknowledgement may repeat an email. Reconciliation preserves available delivery history; restored outcome jobs without sent history are marked exhausted for explicit operator review/retry, rather than blindly replaying uncertain external delivery. No exactly-once external-email promise is made.

## TDD and validation

Product regressions were observed before fixes for revoked area at departure, absent withdrawal effects, missing timer production, route-based restriction sources, missing downstream restoration, frozen snapshot loss, overlapping held offers, paused active outcomes, and both review findings. Fixtures now advance the outcome clock instead of rewriting frozen departure fields. The mutation guard uses a dedicated PostgreSQL connection so a caller with a single-slot pool cannot deadlock itself.

Only newly initialized disposable PostgreSQL 17 databases on loopback port 55435 were used: `pp_ticket13_outcomes_test` for HTTP/worker tests and `pp_ticket13_migration_test` for clean-install/synthetic-upgrade checks. The cluster is `/private/tmp/pp-ticket13-outcomes-pg`. No configured remote database or live data was accessed. Local signed filesystem receipts and controlled provider/email transports do not establish deployed provider durability or actual-engine acceptance.

The focused retry of both transport-interrupted cases and all parameter variants passed (5 tests). A later full run's two `ECONNRESET` / `socket hang up` interruptions had no assertion evidence; their underlying cause is not established and no assertion or timeout was relaxed. The old dispute test was also updated to reject a duplicate dispute while allowing the newly required appended recipient receipt. Final unchanged full-suite run passed: **38 script checks, 514 API tests and 19 worker tests**. Ten opt-in script checks and seven API checks (six actual-engine rehearsals and one external live-provider check) skipped in this run. Separately, all eight migration-plan/credential/clean-install/synthetic-upgrade/inventory tests passed with the disposable flag enabled. Those synthetic upgrade checks do not replace ticket 14's representative deployed-copy rehearsal.

Commands and outcomes:

```sh
# HTTP/worker suites: DATABASE_URL explicitly set to the disposable outcomes database above.
npm --workspace @petrol-partner/api run test:integration -- -t 'ticket 10 isolated'
npm --workspace @petrol-partner/api test -- -t 'ticket 13 (preserves acknowledged hold|operator settlement)'
caffeinate -i npm --workspace @petrol-partner/api run test:integration -- -t 'blocks a new request when an overlapping legacy offer|ticket 13 rolls back withdrawal'
caffeinate -i npm test
# Separate empty disposable migration database; TEST_DATABASE_DISPOSABLE=true.
node --test --test-concurrency=1 scripts/db-migrate.test.mjs scripts/db-rehearsal.test.mjs
npm run typecheck
npm run lint
npm run build:all
npm run api:build
npm run worker:build
git diff --check
```

Typecheck, builds and whitespace checks passed. Lint passed with nine pre-existing warnings and no errors. The complete build passed; API and worker builds passed again after review fixes. Opt-in actual-engine and external live-provider checks were not executed. Final full-suite log: `/private/tmp/ticket13-full-verified.log`; migration log: `/private/tmp/ticket13-migration.log`. These local logs are supplementary; the checked-in tests and this evidence record are the durable deliverables. Earlier runs exposed an integration fixture replaying migration 0042's old constraint over eligibility actions, and lifecycle fixtures rewriting frozen departure fields; those fixtures were corrected. The initial sandboxed Turbopack build could not bind a local port; the same local build succeeded with process/port access. These earlier runs are not counted as clean final validation.

## Code review

The implement skill's code-review workflow ran independent Standards and Spec agents against main `14c4527`, reviewing implementation commits `2716ca5` and `278d468` (the latter reviewed as a working diff). Neither reviewer ran database tests concurrently with the root suite.

### Standards

Initial finding: business recovery SELECTs belonged in the repository, not worker orchestration. They now reside in `posted-route-outcomes.repo.ts`; orchestration retains transaction control. Re-review: no remaining actionable findings or additional smell findings.

### Spec

Initial findings: whole-offer eligibility holds were omitted from latest-action verification, and operator assertion alone did not establish recipient confirmation. Both were fixed with authenticated red/green regressions. Re-review: no remaining actionable findings or scope creep.

Review totals: Standards 0 remaining; Spec 0 remaining; no worst outstanding issue in either axis.

## Remaining release gates

Ticket 04 policy selection, ticket 09 support completion and tickets 10–12 local implementation are resolved; older ticket 13 blocker prose is historical. This local completion does not satisfy external operation/insurance/rate review (03), representative deployed-baseline inventory and migration decisions (14), provider hosting/licence compliance, configured staging/support/recovery (16/17), privacy-retention execution, or explicit activation (18). The sole-operator policy does not establish independent active-trip escalation staffing.

Real route bookings and outcomes remain disabled at API boundaries outside tests. Platform collection, payouts and other excluded capabilities remain disabled. No deployment, live migration, external contact, spending or booking activation occurred.
