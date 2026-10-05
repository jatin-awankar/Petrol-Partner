# 12: Request and accept one priced seat

**What to build:** A passenger can request one seat as pending, and the driver can accept or reject it without overbooking or conflicting commitments.

**Blocked by:** 07 (Record an adult declaration without college affiliation); 08 (Register individual driver–vehicle declarations); 11 (Quote an ordered posted-route segment).

**Status:** resolved

- [x] Reuse the existing one-seat transaction, deadline, hold, idempotency, audit, durable-work, and independent acknowledgement patterns for the new policy.
- [x] Revalidate current adult and driver–vehicle declarations and restrictions, route version and segment, price, capacity, and overlap at acceptance; freeze route identity/version, selected points, distance source/value, rate, rounding, policy version, currency, and paise total.
- [x] Separate-connection PostgreSQL tests cover final-seat, conflicting commitment, revocation, pause, changed payload, failed audit/work insertion, and uncertain recovery outcomes.

## Implementation note

Ticket 12 adds separate posted-route request, allocation, and protected-operation records. Requests remain pending without consuming a seat and are visibly expired at the deadline even before the worker runs. The worker persists expiry, audit, and notification work atomically. Synthetic-only authenticated endpoints accept or reject before the recorded deadline. Acceptance locks the participants and route, recomputes the saved-route segment and price, rechecks current declarations, restrictions, support coverage, pause, route version, capacity, and overlapping commitments, then records one immutable whole-ride allocation, audit, notification work, and overlapping-request withdrawals in the same transaction. Independent receipts gate acknowledgement and support same-key uncertain retries and restore. The forward-only `0038` and `0039` migrations are source only; they have not been deployed.

### Historical acceptance and launch blockers (superseded by the current audit below)

1. Existing-commitment hold, cancellation, departure, and journey transitions for these new allocations are not yet integrated. Ticket 13 owns the route-booking lifecycle; this ticket's first criterion remains open until the hold behavior is evidenced across those transitions.
2. A historical vehicle stores only a registration suffix, while the new declaration stores a full identifier with no verified identity mapping. Overlapping historical offers with a matching suffix now conservatively block new requests and acceptances, including for different driver IDs; this may reject distinct vehicles with the same suffix. Resolve identity and false positives during representative-copy migration before the second criterion is closed. Same-registration new declarations are serialized and conflict checked.
3. Ticket 02 selects Valhalla/OSM and the local Amravati core successor. Ticket 10 actual artifact/approval integration and ticket 11 passenger matching/stop confirmation remain prerequisites. Provider/release gates remain open; the HTTP boundary still rejects every request and decision outside synthetic tests.
4. Real route publication, passenger discovery, representative-copy migration rehearsal, provider-backed independent receipt durability, and launch approval remain open. No real trips or deployed migrations are enabled by this branch.

## Amravati core scope amendment — 2026-10-04

New request and acceptance must recheck the immutable route area ID/hash and current approval/pause state, plus requested and matched passenger points under the approved precision rule, in the protected workflow. Freeze area evidence with the accepted route/segment terms. Race approval revocation or scope pause against acceptance using separate PostgreSQL connections; reject new commitments after revocation and preserve same-key acknowledged retries and original terms. Do not reprice or reinterpret historical records. These remain this ticket's checks after ticket 10; its status is unchanged.

## Current audit and dependency correction — 2026-10-05

Fetched origin and started from merged main `0f0369e` (PR #85) on `codex/12-priced-seat-acceptance`. Ancestry checks confirm ticket 10 completion `eedef3b` (PR #84) and ticket 11 completion `677193a` are merged. Both tickets and direct declaration dependencies 07/08 are resolved. Their historical pending notes do not override their Answers. The existing ticket 12 branch had no unique unmerged commits and was fast-forwarded; untracked worktrees were preserved.

The stale synthetic-source-only acceptance path now consumes ticket 11's acknowledged passenger publication and confirmed stopping-place quote contract. It recomputes saved-route terms, verifies current provider/graph and area approval, freezes requested/matched points, stop identities and full area evidence, and rechecks deadlines and declaration expiry after provider I/O. Independent publication evidence is required for new operations. Existing test-only synthetic harnesses remain isolated; no production activation is authorized.

**Concrete dependency correction:** ticket 12 owns pending one-seat requests, atomic acceptance/rejection and the integration of accepted allocations with the already implemented hold/release/cancellation operations. Its verification must prove that held seats retain whole-ride capacity and overlap, new acceptance rejects held routes, release checks eligibility, cancellation releases once, and frozen terms survive these actions. It does not wait for ticket 13 to be resolved: ticket 13 already depends on ticket 12. This corrects the circular wording in historical blocker 1 without deleting either ticket's acceptance criterion. Ticket 13 retains complete replacement/departure/boarding, declaration-revocation effects on existing commitments/active trips, journey/settlement, timers and recovery of downstream outcomes. Passing acceptance/hold/cancellation cases here is not evidence of complete ticket 13 behavior.

**Historical vehicle identity:** a suffix is not a verified full registration mapping. Both request and acceptance conservatively reject overlapping historical active/held/departed offers with a matching suffix, even under another driver. New full-registration declarations serialize together. False positives remain intentional; no identity inference, automatic merge, historical rewrite or live migration is performed. Ticket 14 already owns representative-copy identity/data decisions. Its unresolved copy/cutover evidence remains a launch gate, not an unfinishable local identity-proof requirement in ticket 12. Any future relaxation requires an explicit inventory and mapping decision.

The completed validation and review are recorded in the Answer below.

## Answer

**Resolved for the local, launch-gated server/API scope.** Existing one-seat transactions, expiry, hold/cancellation, audit, durable notification work and independent receipt recovery were reused. Protected requests and acceptance now consume ticket 11's published route/confirmed-stop interface, revalidate current terms and freeze full segment/price/area evidence. Historical suffix ambiguity remains an explicit conservative rejection, with no inferred identity mapping or historical rewrite.

[Acceptance and review evidence](../../../docs/operations/evidence/ticket12-priced-seat-acceptance-2026-10-05.md) records the two red/green fixes, authenticated HTTP/PostgreSQL tests, separate-connection races, immutable terms, rollback, uncertain acknowledgements, receipt restoration and hold/cancellation integration. The complete affected route group passed **152 tests**. The final unchanged full suite passed **38 script checks, 489 API tests and 19 worker tests**. Earlier socket and setup-hook interruptions, their passing unchanged retries, and all opt-in skips are recorded separately. Typecheck, API build, lint (nine existing warnings) and whitespace checks passed. Independent Standards and Spec reviews have **zero outstanding findings**.

All three acceptance criteria are evidenced here. The concrete dependency correction above removes the circular ticket-13 wording without claiming completion of its downstream lifecycle, automatic revocation effects, timers or outcome restoration. Representative-copy migration, external/rate review, configured provider/support/staging/recovery and explicit activation remain separate launch requirements. Tests used only a fresh local disposable PostgreSQL 17 database and controlled provider/local receipt fixtures. No deployment, live-data change or real-booking activation occurred.
