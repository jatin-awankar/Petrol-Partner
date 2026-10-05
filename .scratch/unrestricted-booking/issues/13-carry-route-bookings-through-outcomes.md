# 13: Carry route bookings through cancellation and outcomes

**What to build:** Participants and operators can manage a confirmed route segment through cancellation, departure, journey decision, and direct settlement without losing its original terms.

**Blocked by:** 04 (Approve operating and support policy); 12 (Request and accept one priced seat).

**Status:** resolved

- [x] Material route or point changes cancel affected commitments and use an auditable replacement flow; holds, cancellations, departure, and boarding preserve whole-ride seat and overlap rules.
- [x] Reuse journey confirmation, obligation, cash/UPI claim, receipt, dispute, and operator resolution records; silence creates neither travel nor payment, and platform collection stays disabled.
- [x] PostgreSQL HTTP tests cover transition authorization, retries, cancellation/revocation/departure races, audit and notification rollback, delivery failure, and recovery of acknowledged outcomes.

## Comments

- Synthetic route outcome tables and authenticated actions now cover pre-departure cancellation, holds, departure and boarding, mutual journey, direct payment claim, receipt or dispute, and operator decisions. Accepted amount and segment are copied into a separate obligation. These actions remain disabled outside tests.
- Synthetic material replacements now link a new route identity to an acknowledged driver cancellation and require fresh requests. Post-departure attempted cancellation and participant incident reports enter an operator queue; a reported incident prevents automatic journey obligation. Outcome mutations now serialize through their receipt acknowledgement, with a live two-connection departure/cancellation race test. Departure rechecks frozen route identity/version and active posted-route overlaps.
- Still needed: full revocation and last-seat outcome race evidence, complete operator dispute and silence review coverage, and recovery of acknowledged outcomes after database loss. Ticket 04, production routing, and real support are still open launch gates. Migrations 0040–0042 have not been deployed.
- Added an authenticated UPI dispute and operator-resolution regression. It passed on 2026-09-29 against an explicitly disposable local PostgreSQL 17 database (`pp_ticket13_test`); one test passed, 144 unrelated cases were skipped by the focused name filter. The configured remote database was not used. Revocation, silence, race, and restore evidence above remain open.

## Ticket 09 notice handoff — 2026-10-03

Ticket 09 now verifies notice delivery for existing outcome producers. Its completion pass added HTTP MFA guards and AAL1 regression coverage for hold, release-hold, resolve-journey and resolve-settlement, so the earlier missing-MFA follow-up is completed. This ticket still owns any absent new-route delayed-departure, silent-journey and overdue-payment producers and their notice generation. Next tests: advance each cutoff, run its actual producer, pass resulting durable events through the existing worker, assert exact recipients and no invented travel/debt/receipt. Ticket 09 resolution does not resolve this ticket or enable bookings.

## Amravati core scope amendment — 2026-10-04

For an Amravati core scope withdrawal or material area update, use existing audited holds and cancellation/replacement for affected future commitments. Preserve original area/version and accepted terms in journey/settlement records; do not silently reclassify them under a new polygon. Active trips retain visibility and incident support rather than automatic cancellation or location-based enforcement. Recheck applicable holds/approval at departure without rewriting the route. Test revocation/departure races and receipt restoration in this ticket; no live tracking or scope-activation authority is added. Status remains unchanged.

## Ticket 12 dependency clarification — 2026-10-05

Ticket 12's historical requirement to wait for all ticket 13 transitions would be circular because this ticket depends on 12. Ticket 12 verifies acceptance's integration with existing holds and cancellation: held capacity remains reserved, release rechecks eligibility, recorded cancellation releases once, competing acceptance stays valid and accepted terms remain frozen. This does not resolve any checkbox here or transfer its criteria.

This ticket still owns complete material replacement, departure/boarding and area checks, automatic declaration withdrawal/revocation/restriction effects on existing commitments (future holds and active-trip incidents), the full revocation/departure race matrix, journey/settlement/timer producers and recovery of acknowledged downstream outcomes. Current declaration services block new protected actions; that alone does not demonstrate automatic hold/incident generation for existing route allocations. Do not cite ticket 12's seat-receipt restore as downstream outcome-loss recovery.

Ticket 04 policy selection, ticket 09 support completion and tickets 10/11 local route/publication work are now resolved; their older open-blocker language is historical. Provider deployment, representative upgrade, configured staging/recovery and real-booking authorization remain distinct launch gates. Status stays claimed.


## Answer

Completed on 2026-10-05 from updated main `14c4527` on `codex/13-route-booking-outcomes`, reusing the existing route, quote, acceptance and outcome interfaces. Tickets 04 and 12 are resolved and their required changes are merged into that baseline (PRs 81 and 86). Earlier comments naming policy selection, production-adapter implementation or local support completion as open implementation blockers are historical; they are superseded by the current dependency evidence.

Cancellation, holds, departure/boarding, material replacement, eligibility withdrawal/revocation/restriction effects, incidents, journey and direct settlement now preserve frozen accepted terms and auditable state. Departure rechecks saved area evidence and overlaps. The actual delayed-departure, silent-journey, overdue-payment and receipt-silence producers create durable recipient-specific work without inferring travel, debt or receipt. Affirmative operator settlement requires an acknowledged authenticated recipient receipt; a later receipt supplements rather than overwrites an original dispute.

Independent signed outcome receipts restore acknowledged downstream record loss through the authenticated operator reconciliation endpoint without duplicate obligations, receipts or logical notices. Unknown conflicts remain restricted. Email retains documented bounded at-least-once semantics; restored uncertain delivery requires operator review/retry. Separate-connection races, MFA/authorization, retries, invalid transitions, atomic audit/work rollback, delivery failure and receipt-backed recovery are evidenced in the [completion report](../../../docs/operations/evidence/ticket13-route-booking-outcomes-2026-10-05.md).

Final full suite passed: 38 script checks, 514 API tests and 19 worker tests. Eight separate disposable migration checks also passed. Typecheck, builds and whitespace checks passed; lint passed with nine pre-existing warnings. Independent Standards and Spec reviews have zero remaining findings after fixes. The evidence report records prior failed runs, their corrections, seven skipped opt-in API checks and the exact local-test limitations.

Ticket resolution is local implementation acceptance, not launch authorization. External review, representative deployed-copy migration, configured provider/staging/support/recovery, privacy-retention execution and ticket 18's explicit readiness decision remain release gates. Historical records are preserved; platform collection, payouts and real bookings remain disabled. No deployment or live-data modification occurred.
