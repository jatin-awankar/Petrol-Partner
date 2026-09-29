# 11: Quote an ordered posted-route segment

**What to build:** A passenger can inspect the posted route, choose ordered pickup and drop-off points on it, and see a server-verified segment distance and contribution before requesting.

**Blocked by:** 02 (Approve route and contribution rules); 10 (Publish a server-verified route for a declared driver).

**Status:** claimed

- [ ] The server matches safe points to the posted route and measures only the segment along that route, never an independently selected point-to-point route or client-supplied distance.
- [ ] Show route version, distance, category rate, rounding, currency, integer-paise total, and zero additional charges; reject off-route, reversed, unsafe, stale, and unverifiable selections.
- [ ] HTTP/PostgreSQL tests use controlled routing success and failure, including a case where independent point-to-point distance differs and rounding boundaries.

## Implementation note

The saved, versioned synthetic route now supports a driver-private test quote. The server matches ordered points against saved cumulative metres, rejects off-route and repeated-pass matches, checks the 30 m tolerance and 500 m minimum, and computes integer paise at the recorded category rate with half-paise-up rounding. The HTTP quote boundary remains disabled outside tests; no passenger discovery or booking is enabled.

### Remaining acceptance blockers

1. Ticket 02 has no approved production routing provider or mode-specific retention, display, quota, and failure evidence. The test-only stop checker is not a production source of driver-confirmed, legal, correctly sided, helmet-ready stopping places.
2. Ticket 10 has no live route publication or passenger-visible read. Its prepared offers remain driver-private and synthetic-only.
3. A versioned route replacement and accepted booking flow do not exist. Ticket 12 must revalidate and freeze this quote inside its protected acceptance transaction; a preview alone cannot authorize a commitment.
