# 12: Request and accept one priced seat

**What to build:** A passenger can request one seat as pending, and the driver can accept or reject it without overbooking or conflicting commitments.

**Blocked by:** 07 (Record an adult declaration without college affiliation); 08 (Register individual driver–vehicle declarations); 11 (Quote an ordered posted-route segment).

**Status:** ready-for-agent

- [ ] Reuse the existing one-seat transaction, deadline, hold, idempotency, audit, durable-work, and independent acknowledgement patterns for the new policy.
- [ ] Revalidate current adult and driver–vehicle declarations and restrictions, route version and segment, price, capacity, and overlap at acceptance; freeze route identity/version, selected points, distance source/value, rate, rounding, policy version, currency, and paise total.
- [ ] Separate-connection PostgreSQL tests cover final-seat, conflicting commitment, revocation, pause, changed payload, failed audit/work insertion, and uncertain recovery outcomes.
