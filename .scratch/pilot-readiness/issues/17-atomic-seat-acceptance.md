# 17: Accept a seat without overbooking or overlap

**What to build:** A driver's acceptance confirms exactly one identified seat with fixed terms, without overbooking a car or double-booking a participant.

**Blocked by:** 16 (Request a seat without reserving it).

**Status:** resolved

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 20, 21, 22, 23, 24, 25, 27, 30, 62, 63. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Deliver acceptance and confirmed-booking views, atomically rechecking both participants, car/association, current approvals, holds, cutoffs, capacity and frozen terms; no phone ownership check applies.
- [x] Allocate exactly one whole-ride slot; persist confirmed contribution/currency/version without creating a due debt before journey confirmation.
- [x] Use consistent database conflict protection for passenger and driver roles and vehicle commitments. Coordinate relevant eligibility updates with acceptance, not just a stale pre-transaction check.
- [x] Withdraw incompatible pending requests in the same transaction and inform the passenger which requests ended and why.
- [x] Commit allocation, commitment, audit, result and notification work together; publish success only after required independent recovery evidence. Unknown outcomes remain queryable under the original operation ID.
- [x] Prove last-seat and overlapping-acceptance races with separate PostgreSQL connections. Exactly one competing allocation/commitment wins; rejected operations create no false confirmation.
- [x] Test repeated clicks, lost responses, changed-payload key reuse, deadline edges, suspended/revoked actors, car limits and driver/passenger role overlap through HTTP and a browser acceptance flow.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

Implemented driver acceptance and participant confirmed-booking views. Acceptance locks the offer and shared commitment actors, rechecks current driver, passenger, car and association approvals, account status, offer terms, the decision deadline and car/offer capacity, then records one whole-ride allocation with frozen paise, INR, offer and policy versions. No contribution debt is created. It withdraws overlapping pending requests held by the accepted passenger or driver and records recipient-specific notices and withdrawal audit rows. An accepted operation is acknowledged only after its independent receipt is durable; committed uncertain outcomes remain queryable and reconciled by operation ID. Confirmed trip detail access ends 24 hours after completion or cancellation.

PostgreSQL HTTP coverage uses separate connections for last-seat and overlapping-offer acceptance races; only one allocation wins each race. It also covers wrong owner, suspended driver and passenger, disabled account, eligibility update during acceptance, held offer, exact deadline, changed terms, reduced car capacity, driver/passenger role overlap, duplicate confirmed requests, changed-key payload, retry, notification-transaction rollback, withdrawal recipients, signed-receipt restoration and an uncertain acceptance recovered under its original operation ID. A browser DOM test exercises the acceptance action and confirmed contribution state.

Checks on 2026-09-26: `npm run lint` passed with 11 warnings and no errors; `npm run typecheck` passed; `npm test` passed (82 API tests, one skipped, 16 worker tests, plus repository script tests); `npm run build:all` passed. The two-axis review against `main` found notification duplication, role withdrawal, detail retention and uncertain-outcome coverage gaps; all were corrected and rechecked.

No deployed schema or user population was inventoried or migrated. Real trips remain subject to the launch gates in `docs/pilot-spec.md`. No operator decision is required to close this technical slice.

## Review follow-up (2026-09-26)

Recovery now compares accepted allocation identity and frozen terms with the independent receipt before protected writes proceed. Reconciliation restores a missing allocation when the operation survives in the database; the PostgreSQL regression test proves both behaviors. Confirmed-booking views now show the car's make, model, colour, registration suffix, pickup location, and passenger stop pair. Phone numbers remain hidden by explicit maintainer decision until a later ticket establishes phone ownership verification and updates the contact-sharing notice. The phone portion of the broader pilot contact contract remains a launch dependency.
