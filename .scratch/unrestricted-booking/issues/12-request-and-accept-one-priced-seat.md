# 12: Request and accept one priced seat

**What to build:** A passenger can request one seat as pending, and the driver can accept or reject it without overbooking or conflicting commitments.

**Blocked by:** 07 (Record an adult declaration without college affiliation); 08 (Register individual driver–vehicle declarations); 11 (Quote an ordered posted-route segment).

**Status:** claimed

- [ ] Reuse the existing one-seat transaction, deadline, hold, idempotency, audit, durable-work, and independent acknowledgement patterns for the new policy.
- [x] Revalidate current adult and driver–vehicle declarations and restrictions, route version and segment, price, capacity, and overlap at acceptance; freeze route identity/version, selected points, distance source/value, rate, rounding, policy version, currency, and paise total.
- [x] Separate-connection PostgreSQL tests cover final-seat, conflicting commitment, revocation, pause, changed payload, failed audit/work insertion, and uncertain recovery outcomes.

## Implementation note

Ticket 12 adds separate posted-route request, allocation, and protected-operation records. Requests remain pending without consuming a seat. Synthetic-only authenticated endpoints accept or reject before the recorded deadline. Acceptance locks the participants and route, recomputes the saved-route segment and price, rechecks current declarations, restrictions, support coverage, pause, route version, capacity, and overlapping commitments, then records one immutable whole-ride allocation, audit, notification work, and overlapping-request withdrawals in the same transaction. Independent receipts gate acknowledgement and support same-key uncertain retries and restore. The forward-only `0038` migration is source only; it has not been deployed.

### Remaining acceptance and launch blockers

1. Existing-commitment hold, cancellation, departure, and journey transitions for these new allocations are not yet integrated. Ticket 13 owns the route-booking lifecycle; this ticket's first criterion remains open until the hold behavior is evidenced across those transitions.
2. Ticket 02 still lacks an approved production routing and stopping-place source. Ticket 04's authoritative Maharashtra boundary and full support coverage remain open. The HTTP boundary therefore rejects every request and decision outside synthetic tests.
3. Real route publication, passenger discovery, representative-copy migration rehearsal, provider-backed independent receipt durability, and launch approval remain open. No real trips or deployed migrations are enabled by this branch.
