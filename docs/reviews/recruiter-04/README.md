# Ticket 04 — journey completion and contribution outcomes

Implemented 2026-10-26 from merged PR #92. This extends the same isolated, fictional `/demo` scenario through boarding, journey statements, contribution, claim and receipt. The final landing design, real APIs, database, auth and production gates are unchanged. No dependency or paid provider was added.

## Walkthrough

1. Choose passenger at `/demo`, select the sample route and ordered stops, request a seat, switch to driver and accept.
2. Open the sample trip. Advance the sample clock twice by one hour to 17:00. Start with Mira aboard.
3. Confirm completion as Arjun. No contribution exists yet. Switch to Mira and confirm travel and completion.
4. Continue to the contribution. Record a simulated cash or UPI claim. It is explicitly awaiting receipt, not paid.
5. Switch to Arjun and confirm receipt. The timeline retains separate statements, obligation, claim and receipt. Reload the page: all remain.

Alternative outcomes are explicit actions: cancel before departure, start with Mira absent, report an interruption, choose **Journey did not complete**, or dispute the payment claim. The shared clock can advance 24 hours to show missing-statement review, overdue contribution or missing-receipt review. Reset clears all demo records and preserves unrelated browser storage. Review is an unresolved fictional record; there is no operator permission or invented review decision.

## State rules and limits

- `lib/demo/session.ts` remains the single browser-session interface. `lib/demo/journey.ts` contains pure lifecycle transitions, deadline handling and persisted-record validation. Tests exercise the public session interface, not a mock repository.
- Separate departure/boarding, participant statements, cancellation, obligation, claim, receipt, dispute and review records preserve meaning. The original accepted allocation is retained as history. Cancellation releases its capacity exactly once through the cancellation record; an interruption after start does not release it or create a charge.
- Only the driver can start, record boarding or respond to a payment claim. Only the passenger can claim payment. Each role records its own journey statement. Both completion statements create the fixed integer-paise obligation. Either role can cancel before actual departure or report interruption before mutual completion.
- Example departure window is 16:45 inclusive to 17:30 exclusive. Late clock movement leaves a delayed unstarted scenario; the user can cancel or reset, not silently backdate departure.
- Once the first completion statement is submitted, the other has 24 sample hours. A negative statement or absence opens review without debt. The obligation is due 24 sample hours after mutual confirmation. A missing claim becomes overdue without changing its amount; a late explicit claim is still allowed. The driver has 24 sample hours after a claim to confirm or dispute receipt. At the deadline, silence opens review and never implies receipt.
- Exact repeated actions preserve the original result. Changed boarding, statements, claim method or receipt decision fail. Frozen accepted stops, currency and paise are never repriced. Clock movement creates no departure, travel statement, obligation or receipt.
- The bounded clock is now 72 hours so both response windows can be explored. Version 3 snapshots validate chronology and relationships and freeze nested records. Older disposable demo versions visibly recover to a fresh scenario, as in prior tickets. No real data is migrated.
- One route, one passenger and one acceptance remain deliberate bounds. The other sample occupants are a fixed capacity illustration, not additional simulated journeys. Review resolution, real notifications, payment transfers, and backend/operator integration are out of scope.

These are browser simulator checks, **not proof of PostgreSQL concurrency, authorization, durability, recovery or money movement**. No server behavior changed. Production launch approval remains independent.

## Verification

- `npm run lint`: passed with nine existing warnings outside this work.
- `npm run typecheck`: passed for web and workspaces.
- `npm run build:all`: passed for Next.js, API, worker and shared types. Local build used unreachable loopback API targets.
- Frontend and demo suite: 32 files, 200 tests passed. From `apps/api`, run `../../node_modules/.bin/vitest run --pool threads --maxWorkers 1` with all non-integration `src/test/*.test.tsx` and `src/test/demo-*.test.ts` explicitly selected.
- `node --test scripts/landing-eligibility.test.mjs`: 3 passed.
- New rules cover cash/UPI happy paths, each role, statement order, exact retries and changed-payload rejection, early/late departure, cancellation by either role, absence, interruption, disagreement, missed responses, overdue contribution, refresh continuity, invalid snapshots and reset isolation.
- Rendered screen tests complete a UPI claim and separate receipt with `fetch` configured to throw. They also exercise cancellation across trip/request screens, disagreement, and overdue copy.
- Production-build browser: completed the 1.735 km / 1,215-paise flow, refreshed receipt, reset and opened a disagreement review with no obligation. Inspected desktop 1440×900, phone 375×812 and tablet 768×1024. Phone/tablet document width equalled viewport width, with one h1 and one main. Keyboard skip link focused `demo-content`. Reset defaulted focus to Keep exploring.
- The PR records the full existing CI and deployed preview results. No local PostgreSQL execution was required for this browser-only change.

## Screenshots

- [Desktop departure controls](desktop-departure.jpg)
- [Completed receipt](desktop-complete.jpg)
- [Phone unconfirmed payment claim](phone-payment-claim.jpg)
- [Phone receipt after refresh](phone-receipt.jpg)
- [Tablet disagreement review](tablet-review.jpg)
