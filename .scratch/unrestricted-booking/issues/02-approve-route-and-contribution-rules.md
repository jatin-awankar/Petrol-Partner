# 02: Approve route and contribution rules

**What to build:** The product owner has a precise rule for validating a driver's posted route, passenger segments, and the proposed contribution before implementation relies on it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [ ] Decide routing provider and travel modes, route identity and version, ordered point matching tolerances, safe pickup and drop-off checks, trip limits, and route-change behavior.
- [ ] Decide distance source, segment measurement along the posted route, integer-paise rounding, ₹5/km bike and scooter and ₹7/km car passenger rates, and zero additional charges.
- [ ] Define routing failure behavior, schedule and overlap buffers, and which changes require cancellation and replacement. An unverifiable route or segment never yields an accepted price.
