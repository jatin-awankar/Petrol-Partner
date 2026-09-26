# 16: Request a seat without reserving it

**What to build:** A verified passenger requests one seat without reserving capacity, sees pending/rejected/expired outcomes, and can rely on the offer terms remaining unchanged.

**Blocked by:** 15 (Publish and discover a corridor offer).

**Status:** claimed

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 17, 18, 19, 20, 26, 28, 29. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Deliver one-seat self-request and driver rejection through participant views and HTTP. Reject guests, multi-seat requests, self-booking and duplicate active requests.
- [ ] Require current relevant eligibility; a pending request consumes no slot and is clearly not a confirmed booking. A phone number is not required.
- [ ] Enforce T−60 request cutoff and T−30 driver-decision cutoff synchronously. Unanswered requests are logically expired at acceptance cutoff even with the worker stopped; due processing materializes notifications idempotently.
- [ ] Freeze all material offer fields after its first request, including driver, car, stops, time, price and capacity. A request/edit race cannot capture changed or mixed terms.
- [ ] Publish contact-sharing and cancellation terms before request. Material changes require a new offer after the cancellation workflow exists.
- [ ] Record scoped idempotency outcomes, audit and recipient-specific rejection/expiry events using durable delivery. Evaluate protected requirements for every new mutation instead of bypassing the established protocol.
- [ ] Remove temporary-hold behavior for the pilot path; legacy jobs cannot reserve/release capacity for these pending requests.
- [ ] Test all cutoff boundaries, unchanged capacity, competing requests, freeze races, wrong-owner rejection and browser pending states.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Comments

- Implemented the pilot request and rejection HTTP flow, separate from legacy bookings, with one-seat validation, current student and driver-car checks, unchanged capacity, offer freeze, idempotency, audit, durable notifications, and independent recovery receipts. Due processing emits recipient-specific expiry notices without changing capacity.
- PostgreSQL HTTP integration covers competing requests, request/edit race, duplicate and self requests, cutoff checks, wrong-owner rejection, logical expiry, notification rollback, and idempotent expiry delivery. `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build:all` passed on 2026-09-26. Lint has ten pre-existing warnings.
- A focused recovery rehearsal restored four request/rejection operations from independent receipts after deleting their database rows. Ticket remains claimed pending browser-state test evidence. No deployed schema or user population was migrated or inventoried.
