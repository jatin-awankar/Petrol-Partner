# 21: Revocation holds and active-trip incidents

**What to build:** Eligibility loss stops future affected travel and creates an actionable incident when a trip is already active, while preserving support records.

**Blocked by:** 20 (Start a trip and record boarding).

**Status:** ready-for-agent

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 8, 10, 13, 36, 37, 38, 40, 61. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Integrate student/driver/car revocation with existing commitments. Block affected offer/request/acceptance/departure actions immediately; changing an optional phone number does not revoke eligibility.
- [ ] Passenger revocation holds future bookings without releasing their seats until recorded cancellation. Driver/car revocation holds all affected future rides.
- [ ] Safety suspension prevents departure; expired required approval cannot be overridden by an administrative review.
- [ ] Revocation during an active trip creates a high-priority incident and preserves passenger, driver and trip visibility needed for operator support.
- [ ] Provide operator hold/incident views, explicit valid resolutions and recorded participant outreach. Preserve original decisions and reasons.
- [ ] Use the same locking/conflict strategy as acceptance/departure and protect all state-changing decisions with idempotency, audit, independent recovery evidence and notifications.
- [ ] Test revocation against simultaneous acceptance/start, held capacity, future-versus-active behavior and operator incident access.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.
