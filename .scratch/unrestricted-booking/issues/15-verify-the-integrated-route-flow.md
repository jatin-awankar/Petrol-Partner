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

This remains claimed because the integrated test seeds authenticated users directly in PostgreSQL instead of creating accounts through the HTTP auth flow; it does not join cancellation, cash receipt, a support-contact request, or every race and failure mode into the single journey. It covers a synthetic historical booking and payment order, not a historical settlement or upgrade on a representative deployed copy. The full `npm test` run had 215 passing API tests and two failures: `driver-car.integration.test.ts` expected `adult_declaration_operations` in a setup that lacks migration 0035, and the existing departure/cancellation race reported `socket hang up` in the full suite. A representative sanitized deployed copy and mixed-version auth recovery remain open under ticket 14. Real booking activation remains disabled.
