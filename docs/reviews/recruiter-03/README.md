# Ticket 03 — connected demo request and acceptance

Implemented 2026-10-26, following merged Ticket 02 (PR #91). The landing design, real account flows, API gates and database are unchanged. No dependency or paid service was added.

## Review walkthrough

Open `/demo`, choose passenger, then Continue the sample journey. Select the preset route, choose ordered pickup/drop-off stops, inspect the simulated contribution and request one seat. The request remains pending with no allocation. Continue as driver, accept, and open the sample trip. Switch perspectives or refresh: the same accepted stops and amount remain.

Reset and select **Start with a full car** to exercise a refused acceptance and driver decline. The two default fictional occupants leave one seat; the full scenario has three. Occupancy is fixed once a request exists. The sample clock on Home closes new requests at 16:00 and expires unanswered requests at 16:30, before the 17:00 departure. Time does not imply travel or debt.

One route and one request identity are deliberate simulator bounds. Reset starts another scenario. The fixed route has cumulative distances of 0, 1,735 and 4,000 metres. The car example uses 700 paise/km with one final rounding step: the first segment is 1,215 paise. Acceptance copies route version, policy, currency, distance, stops and integer paise into a separate allocation. Exact repeated commands preserve their original result; changing terms or a terminal decision fails. These are synchronous browser simulator rules, **not PostgreSQL concurrency, authorization or recovery proof**.

Version 2 snapshots validate relationships and amounts and freeze nested state. Ticket 02's disposable version 1 snapshots recover to a fresh sample with the existing visible recovery notice; unrelated browser storage is untouched. Storage failures retain the existing explicit memory-only warning. No auth, routing, booking, payment or analytics call is introduced.

The broader screen map remains a target. This ticket implements fixed sample IDs under Find, Route, Offer, Request and Trip. Unknown IDs use the demo's missing-page view. There is no asynchronous quote provider or changing route version to simulate a stale response; the clock enforces request/decision availability synchronously. Artificial search failure/unknown-response exercises belong to later screen polishing. Journey statements and contributions remain Ticket 04.

## Verification

- `npm run lint`: passed, with the same nine existing warnings outside this change.
- `npm run typecheck`: passed for frontend and workspaces.
- `npm run build:all`: passed for Next.js, API, worker and shared types. Local build targets used an unreachable loopback API, not a deployed backend.
- Rendered frontend tests plus demo session/booking tests: 30 files, 182 tests passed. Command from `apps/api`: `../../node_modules/.bin/vitest run --pool threads --maxWorkers 1` with all non-integration `src/test/*.test.tsx`, `demo-session.test.ts` and `demo-booking.test.ts` explicitly selected.
- `node --test scripts/landing-eligibility.test.mjs`: 3 passed.
- After final copy corrections: six demo/application-frame test files rerun, 37 passed; lint and all builds passed again.
- Production-build browser walkthrough: desktop 1440×900, phone 375×812, tablet 768×1024. Selected a 1.735 km segment, requested, switched roles, accepted the final seat, opened the trip and reloaded. Full-car acceptance was disabled; decline worked. Phone and tablet had document width equal to viewport width and one main/heading.
- No local PostgreSQL suite was needed for this browser-only change; repository CI still runs its full existing database suite. Its result is recorded on the PR.

Screenshots capture real local production-build screens. The UI remains aligned with the accepted landing typography, paper/green/lime palette, square borders and hard shadows.

- [Desktop quote](desktop-quote.jpg)
- [Desktop decision](desktop-driver-decision.jpg)
- [Phone trip](phone-trip.jpg)
- [Phone frozen terms](phone-frozen-terms.jpg)
- [Phone full capacity](phone-full-capacity.jpg)
- [Tablet decline](tablet-declined.jpg)
