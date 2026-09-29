# 15: Verify the integrated route flow

**What to build:** The full unrestricted route journey passes its critical server and database checks while excluded capabilities remain closed.

**Blocked by:** 06 (Close legacy booking and payment entry points); 09 (Provide monitored support and notices); 12 (Request and accept one priced seat); 13 (Carry route bookings through cancellation and outcomes); 14 (Rehearse the representative-copy upgrade).

**Status:** claimed

- [ ] Exercise authenticated HTTP flows against PostgreSQL from account creation and declarations through route posting, segment pricing, request, acceptance, cancellation, journey, settlement, support, and operator review.
- [ ] Use separate connections for seat, overlap, cancellation, revocation, pause, and departure races; verify retries, changed payloads, rollback, notification failure, and acknowledged-action recovery.
- [ ] Verify generic booking, collection, payout, matching, chat, live tracking, and push boundaries remain disabled; no real bookings are enabled.

## Progress (2026-09-29)

Added one authenticated synthetic HTTP/PostgreSQL journey in `apps/api/src/test/http-postgres.integration.test.ts`. It joins declarations, prepared route, driver-owned quote, request and acceptance, departure, mutual travel, frozen obligation, UPI claim, dispute, durable notice, and operator decision. A historical booking and payment order retain their original policy identity and paise amount. The test also checks idempotency and disabled legacy and push HTTP entry points. Push device listing, registration, and deletion were closed at their route boundary.

The existing posted-route group supplies separate-connection final-seat, overlap, cancellation, revocation, pause, and departure races, plus audit/notification rollback, delivery failure, and recovery scenarios. All 44 tests in that group passed on a fresh local `pp15_test` PostgreSQL database at `127.0.0.1:55479`. Typecheck and targeted ESLint passed.

## Follow-up TDD (2026-09-29)

The authenticated seam now includes two HTTP-registered accounts with synthetic provider email verification, HTTP login, declarations, route preparation, quote, request, acceptance, departure, mutual journey decisions, cash claim, receipt, and a participant-visible durable notice. An additional HTTP/PostgreSQL scenario covers cancellation followed by a fresh cash seat; the existing scenario covers UPI dispute, operator review, and recorded outreach. Historical settlement ownership and ₹25.00 due remain unchanged beside the new ₹7.04 route obligation. Disabled-capability checks now have their own test. The older driver/car test harness applies the current migration history so its recovery checks can run in the full suite.

Checks on explicitly disposable local PostgreSQL databases: the four ticket 15 tests passed, targeted driver/car integration passed (3/3), typecheck and targeted ESLint passed, and `npm test` passed on fresh `pp15_full_test` (root scripts 41 passed/6 skipped, API 220 passed/1 skipped, worker 19 passed). The previous full-suite failures did not recur on this fresh target.

Keep this ticket claimed: a representative sanitized deployed copy, historical cutover decision, and mixed-version provider-auth recovery remain ticket 14 gaps. Ticket 09 has not published a public support contact or approved a separately reachable active-trip escalation path, so an actual participant support-contact request cannot be exercised. The route race, rollback, failed-delivery, and recovery checks pass in separate PostgreSQL tests; they are not all repeated within the one account-to-settlement journey. Real booking activation remains disabled.
