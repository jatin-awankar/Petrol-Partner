# 17: Accept a seat without overbooking or overlap

**What to build:** A driver's acceptance confirms exactly one identified seat with fixed terms, without overbooking a car or double-booking a participant.

**Blocked by:** 16 (Request a seat without reserving it).

**Status:** ready-for-agent

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 20, 21, 22, 23, 24, 25, 27, 30, 62, 63. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Deliver acceptance and confirmed-booking views, atomically rechecking both participants, car/association, current approvals, holds, cutoffs, capacity and frozen terms; no phone ownership check applies.
- [ ] Allocate exactly one whole-ride slot; persist confirmed contribution/currency/version without creating a due debt before journey confirmation.
- [ ] Use consistent database conflict protection for passenger and driver roles and vehicle commitments. Coordinate relevant eligibility updates with acceptance, not just a stale pre-transaction check.
- [ ] Withdraw incompatible pending requests in the same transaction and inform the passenger which requests ended and why.
- [ ] Commit allocation, commitment, audit, result and notification work together; publish success only after required independent recovery evidence. Unknown outcomes remain queryable under the original operation ID.
- [ ] Prove last-seat and overlapping-acceptance races with separate PostgreSQL connections. Exactly one competing allocation/commitment wins; rejected operations create no false confirmation.
- [ ] Test repeated clicks, lost responses, changed-payload key reuse, deadline edges, suspended/revoked actors, car limits and driver/passenger role overlap through HTTP and a browser acceptance flow.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.
