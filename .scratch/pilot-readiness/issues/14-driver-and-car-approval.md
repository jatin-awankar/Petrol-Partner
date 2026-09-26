# 14: Driver and car approval

**What to build:** An approved student can apply to drive a specific car, and the operator can separately review driver, car and permission-to-use eligibility.

**Blocked by:** 12 (Student and adult eligibility review).

**Status:** resolved

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 10, 11, 12, 13. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Deliver licence review and car registration/insurance/applicable-document submission, with a distinct driver-car association and permission-to-use evidence.
- [x] Reuse private evidence access/deletion from student review. Preserve minimal decision records, status, expiry/review date, reviewer and reason.
- [x] Restrict pilot vehicle categories to eligible private cars; reject motorcycles, taxis, rentals and cars not approved for that driver at server entry points.
- [x] Require current approved student status and keep driver approval independent of car/association approval. An optional phone number does not grant or block eligibility.
- [x] Apply protected idempotent decision recording, audit and applicant notifications for approval, rejection and eligibility changes.
- [x] Expose a single current eligibility check consumed by offer/acceptance/departure; expired or revoked approval fails synchronously regardless of worker progress.
- [x] Demonstrate applicant and operator flows plus independent status, expiry-boundary, wrong-owner and evidence-deletion tests. Later booking holds extend revocation handling, not the basic eligibility rule.

## Answer

Completed on `codex/14-driver-car-approval`. Applicants can submit separate driver, private-car, and driver-car permission evidence. Operators can privately access evidence and make independent protected decisions; the API records minimal decisions, audit history, durable notifications, and recovery receipts. Evidence deletion reuses the student review machinery. The shared PostgreSQL eligibility check is used at offer publication, booking acceptance, and protected departure. Departure also checks the approved support window, passenger eligibility, and overlapping commitments. Revocation holds future rides and raises an incident for a departed ride.

PostgreSQL tests exercise independent status and expiry boundaries, wrong-owner access, deletion, HTTP applicant/operator flows, decision retries and receipt recovery, notification failure, and separate-connection acceptance/departure and revocation/departure races. Final spec and standards reviews found no remaining ticket 14 acceptance gap.

Checks: `npm run typecheck` passed; `npm test` passed against a disposable local PostgreSQL database (root script checks, 76 API tests passed with one skipped, 16 worker tests passed); `npm run lint` passed with 10 existing warnings; `npm run build:all` passed. `git diff --check` passed.

Production evidence intake still requires provider and independent receipt retention verification. The configured conflict policy and support window require operator approval, and other pilot launch gates remain open. No real trips, deployed data migration, or external contact occurred. Later booking hold states remain outside this ticket as specified.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.
