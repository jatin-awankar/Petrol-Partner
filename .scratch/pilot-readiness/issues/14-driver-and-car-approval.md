# 14: Driver and car approval

**What to build:** An approved student can apply to drive a specific car, and the operator can separately review driver, car and permission-to-use eligibility.

**Blocked by:** 12 (Student and adult eligibility review).

**Status:** ready-for-agent

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 10, 11, 12, 13. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Deliver licence review and car registration/insurance/applicable-document submission, with a distinct driver-car association and permission-to-use evidence.
- [ ] Reuse private evidence access/deletion from student review. Preserve minimal decision records, status, expiry/review date, reviewer and reason.
- [ ] Restrict pilot vehicle categories to eligible private cars; reject motorcycles, taxis, rentals and cars not approved for that driver at server entry points.
- [ ] Require current approved student status and keep driver approval independent of car/association approval. An optional phone number does not grant or block eligibility.
- [ ] Apply protected idempotent decision recording, audit and applicant notifications for approval, rejection and eligibility changes.
- [ ] Expose a single current eligibility check consumed by offer/acceptance/departure; expired or revoked approval fails synchronously regardless of worker progress.
- [ ] Demonstrate applicant and operator flows plus independent status, expiry-boundary, wrong-owner and evidence-deletion tests. Later booking holds extend revocation handling, not the basic eligibility rule.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.
