# 20: Start a trip and record boarding

**What to build:** A driver starts an eligible trip in its allowed window, identifies boarded passengers and explicitly resolves delays.

**Blocked by:** 19 (Cancel bookings and replace cancelled offers).

**Status:** claimed

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 13, 33, 34, 35, 36, 40, 60. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Deliver departure/boarding views for confirmed passengers only. Recording boarding neither creates a passenger nor changes a contribution.
- [ ] Enforce T−15 through T+30 departure window, current driver/car/association/student eligibility, expiry, holds, support policy and relevant pause state server-side.
- [ ] Recheck early-start and still-active-trip conflicts across people and car. Atomically coordinate departure with eligibility changes and cancellation.
- [ ] After the allowed window, show an unstarted ride as delayed, notify participants and require explicit resolution; time alone cannot start, complete or cancel it.
- [ ] Provide an audited operator late-departure resolution that still validates eligibility and conflicts. Unsupported unsafe resolution remains blocked.
- [ ] After start, reject ordinary cancellation and record absence/interruption signals for review; full incident handling follows in ticket 21 and journey decisions in ticket 23.
- [ ] Record protected idempotent trip/boarding actions with independent evidence and durable notifications.
- [ ] Test exact time boundaries, worker outage, stale approval, cancellation/start races, repeated boarding and driver/passenger browser state.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

Implemented a pilot-specific departure operation on `codex/20-departure-boarding`. It records the selected confirmed allocations as boarded, records absence review signals for the others, and preserves the accepted contribution. The server enforces T−15 through T+30 inclusively, current student/driver/car/association and passenger eligibility, holds, the support window, pilot pause and restricted recovery mode, scheduled conflicts, and trips that are still departed. The pilot action uses a stable idempotency key and an independent signed receipt before acknowledgement. The legacy departure endpoint rejects pilot offers.

After T+30, reads show an unstarted active ride as delayed. A durable sweep notifies the driver and confirmed passengers without changing ride or journey state. An allowlisted operator can resolve a late departure with an audited reason; eligibility and conflicts are checked again. Attempted cancellation after departure uses the existing review case path. A reported interruption also uses that review path. Driver and passenger confirmed-trip views show boarding and delayed state.

Verification: `npm run typecheck` passed; `npm run lint` passed with 10 pre-existing warnings; focused PostgreSQL departure integration and confirmed-trip browser tests passed. `npm test` passed after updating the migration-plan expectation: 27 script tests passed, 4 skipped; API 90 passed, 1 skipped; worker 16 passed. The PostgreSQL test uses separate connections for the cancellation/start race, checks both exact departure boundaries, stale driver approval, late resolution, delayed notification with the worker invoked after the time threshold, repeated boarding, pending email work, an absence review signal, and frozen contribution.

The full backup/restore crash rehearsal and a live worker-delivery outage were not run for this ticket. Deployment, migration of any deployed database, and real-trip enablement were not attempted. A review against `main` is still pending before resolution.
