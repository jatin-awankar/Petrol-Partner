# 02: Approve route and contribution rules

**What to build:** The product owner has a precise rule for validating a driver's posted route, passenger segments, and the proposed contribution before implementation relies on it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human (provider gate outstanding)

- [ ] Decide routing provider and travel modes, route identity and version, ordered point matching tolerances, safe pickup and drop-off checks, trip limits, and route-change behavior.
- [x] Decide distance source, segment measurement along the posted route, integer-paise rounding, ₹5/km bike and scooter and ₹7/km car passenger rates, and zero additional charges.
- [x] Define routing failure behavior, schedule and overlap buffers, and which changes require cancellation and replacement. An unverifiable route or segment never yields an accepted price.

## Decision record — confirmed, provider gate outstanding

**Decision date:** 2026-09-28. **Policy version:** `unrestricted-route-contribution-2026-09-28.1`. **Reviewer:** Project maintainer (role supplied by the decision maker; personal name not supplied). The maintainer confirmed this record on 2026-09-28. It defines product rules for implementation; it does not approve a routing provider or enable real bookings.

### Route provider and vehicle modes

No provider is approved. Evaluate bike, scooter, and car independently; different providers may serve different categories if their route versions and terms remain internally consistent. For each category, require evidence that its provider permits production use and the offered vehicle mode, display of the route in the intended UI, and storage of the route data needed to verify and audit accepted bookings for the required retention period. An expiring provider route handle alone is insufficient. Require a controlled no-payment-information rehearsal of routes, quota exhaustion, and fail-closed behavior. A free tier is not proof of guaranteed zero cost or availability. Do not present Mapbox cycling or driving as verified motorcycle routing. Keep real bookings closed for a category until its provider gate passes.

HERE is a candidate, not an approval: its `scooter` mode covers scooters and motorcycles, but the Limited Plan excludes broadly defined Asset Management, and the platform terms constrain storage of results beyond 30 days except for stated purposes whose application to this product is unresolved. Its no-payment-information plan lists 1,000 daily requests and 10 requests per second for scooter and car routing; that is not evidence of a production SLA or a guaranteed hard spending cap. Review exact use, retention, attribution, and display rights before selecting it. [HERE scooter routing](https://docs.here.com/routing/docs/routing-v8-scooter-routing), [HERE Limited Plan restrictions](https://www.here.com/get-started/pricing/limited-plan-restrictions), [HERE plan limits](https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases), [HERE Platform Terms](https://legal.here.com/us-en/terms/here-platform-terms).

TomTom is also a candidate, not an approval. Its v1 routing API documents `motorcycle` (beta) and `car`, India coverage, a no-card free allowance, and `429` on exhausted free quota. Scooter equivalence, durable route-result retention, display on the existing Mapbox map, and full failure-mode rehearsal remain unverified. See [TomTom provider research](../../../docs/operations/evidence/ticket02-tomtom-provider-research-2026-09-28.md).

A [synthetic TomTom route rehearsal](../../../docs/operations/evidence/ticket02-tomtom-synthetic-rehearsal-2026-09-28.md) returned car and motorcycle routes with distance progression. It did not establish provider licence rights, scooter coverage, display permission, or quota-failure behavior. TomTom remains unapproved.

### Posted route, segment, and safe stops

The driver posts one server-verified route with an immutable, numbered version. Save the route data permitted by the chosen provider, including geometry and distance progression needed to verify a segment; bind every quote and accepted booking to its exact version. Do not rely on a provider route handle as the durable record. Before the first request, a material edit creates a new verified version and invalidates earlier quotes. Preserve earlier versions only as provider terms permit; the provider gate must permit the durable accepted-booking evidence this policy requires.

Pickup and drop-off are specific stopping places confirmed by the driver. They must match unambiguous forward positions, in order, on the posted route, no more than 30 metres from it and at least 500 metres apart along it. Verify direction and correct side. Reject crossings, repeated passes, opposite-carriageway or otherwise ambiguous matches; do not infer safe stopping from a map match. Reject a place where stopping is prohibited or identified as unsafe. For a bike or scooter pickup, require space for the passenger to put on a helmet before departure. Passenger selection authorizes no detour or route extension.

### Trip, schedule, and commitment limits

There is no restriction on which geographic area a trip starts in. One posted trip is limited to 50 km and 90 minutes of server-verified routed travel; these are provisional operating limits, not a corridor. Post from 2 hours to 7 days before departure. Requests close 60 minutes before departure; driver acceptance closes 30 minutes before departure. Recheck declarations, restrictions, and support coverage at acceptance and departure. For driver, vehicle, and passenger, reject conflicting confirmed commitments over the interval from departure through verified expected arrival plus one 30-minute buffer. The 90-minute trip limit excludes that buffer; no separate 15-minute gap applies.

### Distance, contribution, and failure

Measure the passenger segment in integer metres along the saved posted route version, never by independently routing between its endpoints. The proposed rate is 500 paise per kilometre for each bike or scooter passenger and 700 paise per kilometre for each car passenger. Compute `segment_metres × rate_paise_per_km ÷ 1000` using integer arithmetic and round once to the nearest paise, with an exact half-paise rounded up. There is no base charge, minimum, toll add-on, booking charge, platform fee, or other charge. At acceptance, freeze route identity/version, matched points and stopping places, measured metres and distance source, vehicle category, INR currency, rate, rounding rule, policy version, and total integer paise. Quotes identify their route version and expire when it changes.

If the server cannot verify the posted route and selected segment, no new accepted price or acceptance is available. This includes routing timeout, invalid or missing response, unavailable provider, or exhausted quota. A displayed client quote never suffices. Permit retry after recovery; keep already accepted points and amounts intact and do not reprice or cancel them merely because routing is unavailable.

### Changes and replacement

Once any request exists, a change to route geometry, origin, destination, schedule, vehicle or category, capacity, stopping places, or contribution terms requires audited cancellation and a replacement offer, with notices and fresh passenger requests. Do not silently transfer requests or bookings or reprice accepted terms. Only clearly nonmaterial text that does not change meeting instructions, safety, time, route, or price may be edited in place. A passenger changing a pending segment withdraws and resubmits it against the current route version. Changing an accepted segment cancels the booking and requires a new request, capacity check, and driver acceptance; preserve the original points and amount in the audit record. After departure, handle changes through the trip incident workflow rather than replacing the offer.

### Outstanding gates

**Ticket 02 remains unresolved:** provider selection and its production mode, route-data retention, display, quota, and controlled no-payment-information rehearsal evidence are outstanding. The first acceptance criterion is incomplete; do not mark this ticket resolved until it is evidenced for the vehicle categories intended for launch. The technical route and contribution decisions above answer the remaining policy questions, subject to that provider gate.

**Separate real-booking blocker:** Ticket 03 must document the cost basis and external permissibility of the proposed ₹5/km bike/scooter and ₹7/km per-car-passenger rates, including the possible ₹21/km aggregate for three car passengers and the broader operation. This policy does not settle those questions. Real bookings remain disabled pending that review and all other launch gates.

## Comments

- 2026-09-29: The project maintainer reported submitting a TomTom support case asking about production booking use, scooter coverage, route-result retention, display over Mapbox, and applicable restrictions. The case response and identifier have not been provided; no provider permission is inferred from submission.
