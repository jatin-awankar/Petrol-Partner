# 12: Request and accept one priced seat

**What to build:** A passenger can request one seat as pending, and the driver can accept or reject it without overbooking or conflicting commitments.

**Blocked by:** 07 (Record an adult declaration without college affiliation); 08 (Register individual driver–vehicle declarations); 11 (Quote an ordered posted-route segment).

**Status:** claimed

- [ ] Reuse the existing one-seat transaction, deadline, hold, idempotency, audit, durable-work, and independent acknowledgement patterns for the new policy.
- [ ] Revalidate current adult and driver–vehicle declarations and restrictions, route version and segment, price, capacity, and overlap at acceptance; freeze route identity/version, selected points, distance source/value, rate, rounding, policy version, currency, and paise total.
- [x] Separate-connection PostgreSQL tests cover final-seat, conflicting commitment, revocation, pause, changed payload, failed audit/work insertion, and uncertain recovery outcomes.

## Implementation note

Ticket 12 adds separate posted-route request, allocation, and protected-operation records. Requests remain pending without consuming a seat and are visibly expired at the deadline even before the worker runs. The worker persists expiry, audit, and notification work atomically. Synthetic-only authenticated endpoints accept or reject before the recorded deadline. Acceptance locks the participants and route, recomputes the saved-route segment and price, rechecks current declarations, restrictions, support coverage, pause, route version, capacity, and overlapping commitments, then records one immutable whole-ride allocation, audit, notification work, and overlapping-request withdrawals in the same transaction. Independent receipts gate acknowledgement and support same-key uncertain retries and restore. The forward-only `0038` and `0039` migrations are source only; they have not been deployed.

### Remaining acceptance and launch blockers

1. Existing-commitment hold, cancellation, departure, and journey transitions for these new allocations are not yet integrated. Ticket 13 owns the route-booking lifecycle; this ticket's first criterion remains open until the hold behavior is evidenced across those transitions.
2. A historical vehicle stores only a registration suffix, while the new declaration stores a full identifier with no verified identity mapping. Overlapping historical offers with a matching suffix now conservatively block new requests and acceptances, including for different driver IDs; this may reject distinct vehicles with the same suffix. Resolve identity and false positives during representative-copy migration before the second criterion is closed. Same-registration new declarations are serialized and conflict checked.
3. Ticket 02 selects Valhalla/OSM and the local Amravati core successor. Ticket 10 actual artifact/approval integration and ticket 11 passenger matching/stop confirmation remain prerequisites. Provider/release gates remain open; the HTTP boundary still rejects every request and decision outside synthetic tests.
4. Real route publication, passenger discovery, representative-copy migration rehearsal, provider-backed independent receipt durability, and launch approval remain open. No real trips or deployed migrations are enabled by this branch.

## Amravati core scope amendment — 2026-10-04

New request and acceptance must recheck the immutable route area ID/hash and current approval/pause state, plus requested and matched passenger points under the approved precision rule, in the protected workflow. Freeze area evidence with the accepted route/segment terms. Race approval revocation or scope pause against acceptance using separate PostgreSQL connections; reject new commitments after revocation and preserve same-key acknowledged retries and original terms. Do not reprice or reinterpret historical records. These remain this ticket's checks after ticket 10; its status is unchanged.
