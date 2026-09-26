# 21: Revocation holds and active-trip incidents

**What to build:** Eligibility loss stops future affected travel and creates an actionable incident when a trip is already active, while preserving support records.

**Blocked by:** 20 (Start a trip and record boarding).

**Status:** resolved

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 8, 10, 13, 36, 37, 38, 40, 61. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Integrate student/driver/car revocation with existing commitments. Block affected offer/request/acceptance/departure actions immediately; changing an optional phone number does not revoke eligibility.
- [x] Passenger revocation holds future bookings without releasing their seats until recorded cancellation. Driver/car revocation holds all affected future rides.
- [x] Safety suspension prevents departure; expired required approval cannot be overridden by an administrative review.
- [x] Revocation during an active trip creates a high-priority incident and preserves passenger, driver and trip visibility needed for operator support.
- [x] Provide operator hold/incident views, explicit valid resolutions and recorded participant outreach. Preserve original decisions and reasons.
- [x] Use the same locking/conflict strategy as acceptance/departure and protect all state-changing decisions with idempotency, audit, independent recovery evidence and notifications.
- [x] Test revocation against simultaneous acceptance/start, held capacity, future-versus-active behavior and operator incident access.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

Implemented student, driver, car, and association revocation effects for pilot commitments. A future passenger booking becomes held while its allocation keeps occupying capacity; driver or car revocation holds future offers with their accepted seats intact. Active trips remain visible and receive a high-priority incident. Operator views show open holds and incidents, and resolution requires recorded outreach to all trip participants. A hold needs a recorded cancellation; an incident needs either a completed offer or an acknowledged interruption report. The original review/revocation decisions and reasons remain recorded.

Revocation, acceptance, and departure coordinate through the existing advisory actor locks and row locks. Mutations use stable idempotency keys, transactional audit and durable notification rows, and signed receipts that can be reconciled independently. The migration is forward-only and does not erase historical payment data. Optional phone changes do not enter the eligibility checks. Existing current-approval checks still reject expired required approval, including after administrative review.

Evidence: `npm run typecheck` passed; `npm run lint` passed with 10 pre-existing warnings and no errors; focused PostgreSQL integration tests passed (7 ticket 21 cases, 30 skipped); `npm test` passed (27 script tests, 4 skipped; 98 API tests, 1 skipped; 16 worker tests). `npm run build:all` passed after allowing its existing Google Fonts fetch. Code review found route/service SQL boundary issues and premature incident closure; both were corrected before the final suite. Tests cover separate-connection acceptance and departure races, held capacity, future and active effects, retries, participant outreach, authorization/MFA, notification persistence, and independent receipt replay.

Remaining launch gates: the deployed schema and user population have not been inventoried, so migration 0026 has not been applied to a deployed database. Live backup/restore and provider outage rehearsals, along with the other launch gates in `docs/pilot-spec.md`, remain required before real trips. No deployment or live trips were enabled.
