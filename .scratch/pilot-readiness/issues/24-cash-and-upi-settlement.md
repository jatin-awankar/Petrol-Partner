# 24: Record direct cash or UPI settlement

**What to build:** A passenger reports direct cash/UPI payment, and the driver confirms receipt while the application accurately shows what remains owed.

**Blocked by:** 22 (Confirm each passenger’s journey).

**Status:** resolved

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 44, 45, 46, 47, 57. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Deliver due/overdue obligation, passenger payment-claim and driver receipt-confirmation views; no platform charge, collection, escrow, payout or fee participates.
- [x] Permit claims only for an established contribution and keep the accepted amount/currency immutable.
- [x] A passenger claim never marks receipt or settlement complete. Only authorized driver receipt confirmation establishes the normal settled outcome.
- [x] After 24 hours without a claim, show overdue visibility. A claim starts a separate 24-hour driver response window; silence or dispute opens review without automatic restrictions.
- [x] Keep obligation, claim, receipt and settlement state distinct. Repeated claims/confirmations return the original logical result and cannot duplicate receipt records.
- [x] Apply recovery-protected transactions, current participant authorization, audit and durable notification work to all settlement changes.
- [x] Test driver/passenger role reversal, absent obligation, deadline boundaries, lost-response retries, evidence-store failure and the direct-settlement browser journey.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

Implemented a direct cash/UPI settlement slice on `codex/24-direct-settlement`. A frozen pilot contribution obligation remains independent of a passenger claim, a driver confirmation or dispute, and a review case. A claim leaves the obligation unpaid; only the driver's receipt confirmation produces the normal settled view. Due and overdue status is computed at the exact 24-hour boundary. Driver silence opens a durable review case through a protected API sweep; a dispute opens one in the protected transaction. No automatic account restriction is applied.

Evidence: PostgreSQL-backed HTTP tests cover wrong actors, absent obligations, frozen amount/currency, idempotent claims and confirmations, payload mismatch, exact deadline boundaries, dispute, durable silence-review retries, operator queue, failed email retry, evidence-store failure with restricted mode, and restoration from independent claim and silence-review receipts. A rendered browser journey sends real HTTP requests to the API against PostgreSQL and verifies the passenger claim stays unpaid until driver confirmation. An exact-boundary component test verifies that response actions disappear when the driver window ends. `npm run lint` passed with 10 pre-existing warnings; `npm run typecheck`, `npm test`, and `npm run build:all` passed. The final `npm test` run reported 27 script passes with 4 skips, 120 API passes with 1 skip, and 16 worker passes.

Code review against `main`: the Standards pass found SQL in a service and worker; it was moved into settlement repositories. The Spec pass found silence-review writes without independent recovery, mocked browser evidence, and expired driver actions; these were corrected and tested.

Remaining limits: the browser test renders the actual React page in jsdom and forwards its API calls to Express/PostgreSQL; it does not drive a graphical browser. The deployed schema and user population were not inventoried or migrated. No real trips, platform money movement, or deployment were enabled.

## Comments

2026-09-27 — Follow-up code review: moved the dispute-to-review policy choice from the settlement repository into the service, combined duplicate audit and review SQL in repository operations, and named the 24-hour driver response window in the API and page. Kept claim/receipt and silence-review recovery flows separate because they have distinct operation records and independent evidence. Focused PostgreSQL HTTP tests passed after the change.
