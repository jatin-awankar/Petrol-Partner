# 11: Quote an ordered posted-route segment

**What to build:** A passenger can inspect the posted route, choose ordered pickup and drop-off points on it, and see a server-verified segment distance and contribution before requesting.

**Blocked by:** 02 (Approve route and contribution rules); 10 (Publish a server-verified route for a declared driver).

**Status:** ready-for-agent

- [ ] The server matches safe points to the posted route and measures only the segment along that route, never an independently selected point-to-point route or client-supplied distance.
- [ ] Show route version, distance, category rate, rounding, currency, integer-paise total, and zero additional charges; reject off-route, reversed, unsafe, stale, and unverifiable selections.
- [ ] HTTP/PostgreSQL tests use controlled routing success and failure, including a case where independent point-to-point distance differs and rounding boundaries.
