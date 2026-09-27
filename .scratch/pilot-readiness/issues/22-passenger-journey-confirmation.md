# 22: Confirm each passenger’s journey

**What to build:** Each passenger confirms their own completed journey, and only mutual confirmation creates the frozen contribution as an amount due.

**Blocked by:** 20 (Start a trip and record boarding).

**Status:** resolved

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 41, 42, 43, 44, 47. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Deliver driver completion and passenger travelled/completed confirmation views, preserving individual passenger outcomes within a ride.
- [x] Require a valid started-trip/boarding history and current actor authorization. Driver completion alone must not create debt or automatically confirm all passengers.
- [x] Mutual journey confirmation creates exactly one obligation at the accepted contribution, with a due time 24 hours from confirmation.
- [x] Disagreement or missing passenger confirmation for 24 hours creates a review case and visible state without manufacturing travel or debt.
- [x] Record original claims and timestamps independently of ride status; completion retries do not duplicate obligations or review work.
- [x] Apply protected acknowledgement/recovery evidence to completion and journey confirmations, with durable recipient notifications.
- [x] Test multiple passenger outcomes, future/unstarted completion rejection, duplicates, controlled-clock silence boundaries and genuine browser confirmation flows.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

Implemented driver completion and one confirmation per boarded passenger on `codex/22-passenger-journey-confirmation`. Driver and passenger claims, timestamps, review cases, obligations, and due times have separate PostgreSQL records. The driver reports every boarded passenger's outcome; no claim is inferred for another passenger. Only mutual travelled-and-completed claims create one obligation at the frozen accepted paise, currency, and policy version, due exactly 24 hours after the second claim. Matching absence, interruption, disagreement, and 24-hour silence create review cases without debt. A late passenger confirmation at the silence boundary also creates review synchronously, even if the worker is late.

Protected confirmation operations use stable idempotency keys, audit records, durable participant and operator notifications, and independent signed receipts before acknowledgement. Recovery reconciliation restores claims, obligations, audit, review work, and notifications from receipts; uncertain delivery after restore is held for review. The 24-hour silence worker uses durable PostgreSQL work and leaves operator and participant notices. Ordinary trip details expire 24 hours after driver completion, while a limited participant review status remains visible.

Verification: focused PostgreSQL integration tests passed for multiple different passenger outcomes, an unboarded passenger, wrong actors at the service and HTTP boundaries, future and unstarted completion, same-key and changed-payload retries, concurrent same-key retries on separate database connections, exact 24-hour silence boundaries, frozen amount and due time, notification delivery failure without rollback, and restoration from an older database snapshot using independent receipts. Driver and passenger React browser-flow tests passed. A real local browser session against a disposable PostgreSQL test database also completed the driver and passenger flows: driver completion left zero obligations; passenger confirmation then showed one INR 25.00 obligation, and PostgreSQL recorded 2500 paise due one day after confirmation. The synthetic browser fixture and local servers were removed afterward.

Final checks: `npm run typecheck` passed; `npm run lint` passed with 10 existing warnings and no errors; `npm test` passed (27 script tests, 4 skipped; 107 API tests, 1 skipped; 16 worker tests); `npm run build:all` passed. The two-axis `/code-review` against `main` found repository SQL-boundary issues and gaps for matching absence and review visibility after trip-detail expiry; these were corrected. The follow-up spec review found no remaining critical gap, and the final SQL-boundary correction was verified by typecheck and the full suite.

Remaining launch limits: no deployed schema or user-population inventory, live email-provider outage, or provider restore rehearsal was performed here. No deployment, migration of an existing deployment, or real-trip enablement occurred. Operator decisions on review cases and payment claims belong to later settlement/operator slices; this ticket creates no operator-imposed debt.

## Comments

PR #44 follow-up review: new driver completion and passenger confirmation now recheck current driver/car or student approval inside the protected transaction. An HTTP/PostgreSQL test demonstrated that suspended actors were previously accepted (red), then passed after the change (green). The repeated journey outcome conditions in settlement and recovery validation now use one classifier.

The reported silence-worker race was a false positive. The worker holds `pilot_recovery_state` with `FOR SHARE` during its transaction; journey confirmation requires `FOR UPDATE` on the same row before writing. PostgreSQL serializes them, so both an obligation and a silence review cannot be committed by that race. A separate-connection HTTP/PostgreSQL regression test pauses the worker with an uncommitted review and verifies the confirmation waits and creates no debt. This test was green before the code change, as expected for a false positive.

Follow-up checks: ticket 22 PostgreSQL integration tests passed (8); `npm test` passed (31 script tests, 4 skipped; 109 API tests, 1 skipped; 16 worker tests); `npm run typecheck`, `npm run lint` (10 existing warnings, zero errors), and `npm run build:all` passed. No deployment or real-trip enablement was performed.
