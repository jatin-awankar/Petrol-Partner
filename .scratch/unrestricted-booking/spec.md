# Petrol Partner: unrestricted route-based bookings

Status: ready-for-agent

**Specification status:** Approved product direction, amended by the project maintainer on 2026-09-28 to use self-declaration rather than document review for unrestricted eligibility. Real-booking activation remains gated by implementation and launch evidence. This specification supersedes the controlled corridor proposal for new work. Historical policy versions and records remain intact.

## Problem Statement

Petrol Partner's controlled pilot contract restricts participation to verified adult PRMITR students, approved cars, and fixed corridor stops. The intended product is open to people who declare that they are adults, regardless of college affiliation or geography. Drivers post routes; passengers choose pickup and drop-off points on those routes. Bikes, scooters, and cars are intended vehicle categories. The existing pilot contract, API gates, and fixed-pair contribution policy cannot safely govern those bookings.

## Solution

Allow anyone to create an account using verified email ownership or Google sign-in. For this unrestricted policy, a participant declares that they are at least 18; the platform does not verify age documents before booking. A driver declares that they hold a valid licence for the chosen category and have current registration, insurance, and permission to use the vehicle; the platform does not review those documents before offering or booking. The driver registers a bike, scooter, or car and posts a route. A passenger requests one seat with pickup and drop-off points within the driver's posted route; this release has no detours. Declarations must be presented as declarations, never as independently verified facts.

Show and freeze a contribution based on a server-verified distance **along the driver's posted route segment** between the selected points: proposed ₹5/km for each bike or scooter passenger and ₹7/km for each car passenger, with no additional charges. The server must not substitute an independently chosen route between those points. If it cannot verify the posted route or segment, it must not produce an accepted price. Participants pay each other directly by cash or UPI. Petrol Partner records the contribution obligation, payment claim, receipt or dispute, and resolution; it does not move money.

Real bookings are the product goal. They remain disabled until the implementation, operating policy, external review, testing, recovery, and launch gates below are evidenced and explicitly approved.

## User Stories

1. As any person, I want to apply for an account, so that college affiliation does not prevent me from seeking access.
2. As an account holder, I want to know which declarations and restrictions apply to me, so that I understand whether I can confirm a booking.
3. As an account holder who declares they are an adult, I want to request a seat, so that I can join an offered ride.
4. As an operator, I want to restrict a participant after a credible report or known false declaration, so that new commitments stop while a case is reviewed.
5. As a driver, I want to register a supported vehicle and declare my licence and permission to use it, so that I can offer a ride under the published rules.
6. As a driver, I want to post a route with a departure time and available seats, so that passengers can find my intended journey.
7. As a passenger, I want to see the posted route, so that I can select a suitable pickup and drop-off.
8. As a passenger, I want to choose ordered points on that route, so that my booked segment matches where I will travel.
9. As a driver, I want requests outside my route rejected, so that accepting a seat does not require a detour.
10. As a passenger, I want to see the posted-route segment distance and total contribution before requesting, so that I can make an informed choice.
11. As a passenger, I want my request marked pending until accepted, so that I do not mistake it for a booking.
12. As a driver, I want to accept or reject a request by a published deadline, so that I can settle capacity.
13. As a passenger, I want the accepted route segment and contribution frozen, so that later changes do not alter my commitment.
14. As a participant, I want overlapping commitments rejected, so that I am not confirmed on incompatible rides.
15. As a participant, I want cancellations, holds, departure, boarding, and journey outcomes recorded, so that the trip history is accurate.
16. As a passenger, I want to confirm whether I travelled, so that driver completion alone does not create an obligation.
17. As a passenger, I want to pay the driver directly and record my claim, so that the platform does not handle the payment.
18. As a driver, I want to confirm or dispute receipt, so that settlement reflects what happened.
19. As an operator, I want to resolve journey and settlement disagreements with an audit trail, so that decisions are accountable.
20. As a participant, I want a working support contact and timely notices, so that I can handle changes or incidents.
21. As an existing user, I want my prior rides, contributions, and payment records preserved, so that the new policy does not rewrite history.
22. As an operator, I want to pause commitments and reconcile acknowledged actions after an outage, so that recovery does not create hidden or duplicate bookings.

## Implementation Decisions

- **Existing behavior:** The approved pilot specification remains a car-only, PRMITR fixed-corridor contract. The current pilot offer service prices predefined stop pairs from a fixed policy. The generic ride API is disabled at its boundary. The existing browser Mapbox code draws a route line but does not supply a verified distance to pilot pricing. Completed pilot work on identity mapping, one-seat acceptance, journey decisions, direct settlement, audit, and recovery should be reused where its invariants still apply.
- **Eligibility:** Anyone may create an account; college affiliation and student verification are not required. Require verified email ownership or Google sign-in, an explicit adult declaration for each participant, and a driver declaration of a valid category-appropriate licence, current registration and insurance, and permission to use the selected vehicle. No government identity, age, licence, registration, insurance, or permission document is reviewed for this policy before booking. The application must not describe self-declared status as verified or badge a driver or vehicle as independently approved. The server checks current account status, declarations, restrictions, and the supported vehicle category for protected actions. A known false declaration, expired declaration, reported safety issue, or restriction blocks new protected actions and triggers review. Existing PRMITR approvals remain historical and receive a fresh assessment under this policy; they do not silently become unrestricted approval.
- **Route ownership:** The driver posts the route. Passenger pickup and drop-off must be ordered points on that posted route. The server validates this at request and acceptance. No detour, route extension, or passenger-authored route is included. A material change to the posted route or accepted points cancels affected commitments under an auditable replacement flow rather than silently moving them.
- **Distance and price:** The server verifies the driver's posted route and calculates distance along its selected passenger segment. It must not calculate the accepted contribution from an independent shortest, fastest, or otherwise chosen route between the pickup and drop-off. Accepted terms record the posted-route identity and version, segment points, distance source and value, rate and policy version, currency, rounding method, and integer-paise total. Neither client-provided distance nor the displayed map line is authoritative. An unverifiable posted route or segment, or routing-service failure, prevents an accepted price and acceptance until an approved failure policy exists.
- **Proposed contribution:** ₹5/km per bike or scooter passenger and ₹7/km per car passenger, with no base charge, booking charge, toll add-on, platform fee, or other charge. The previous ₹7/km whole-car cap applies only to its historical proposal and records. At three car passengers, the new proposal can total ₹21 per vehicle-kilometre. Its cost basis and external treatment remain unresolved launch questions; this specification does not deem the amount approved for live use.
- **Capacity and lifecycle:** Preserve the one-seat request and atomic acceptance model. A bike or scooter offers at most one passenger seat and both riders must wear helmets. A car cannot offer more than its declared, individually recorded belted passenger-seat count, excluding the driver; the platform does not independently inspect those seats. Confirmed passengers consume a seat for the whole ride unless a separately specified segment-reuse policy is approved. Preserve account, declaration, restriction, hold, overlap, deadline, idempotency, cancellation, journey, and settlement checks at the server and database boundaries.
- **Review and revocation:** Reconfirm adult and driver–vehicle declarations every 12 months or at the earliest declared document expiry, whichever comes first. Suspend eligibility for new protected actions immediately on known expiry, loss of permission, material vehicle change, credible safety concern, or a known false declaration. Apply recorded holds, cancellation, incident, and audit behavior to existing commitments and active trips. This timing is a product rule, not a claim that documents have been authenticated.
- **Direct settlement:** Participants pay each other. The platform never creates a new collection order or payout for this flow. Journey outcome, obligation, claim, receipt, dispute, and operator resolution remain distinct records; silence does not manufacture travel or payment.
- **Migration and compatibility:** Inventory deployed users, identity mappings, approvals, vehicles, offers, bookings, contributions, settlements, and historical platform-payment records. Use forward-only migrations and a new policy version. Retain original terms and payment history; never reprice or reinterpret old records under the new rates or eligibility rules. Keep old and new policy records distinguishable in reads, audits, operations, and recovery. Rehearse the upgrade on a representative copy before cutover.
- **Operating controls:** Keep server-side pause, restricted recovery mode, durable notifications, independent acknowledgement evidence, and explicit operator reopening. Establish a monitored support contact and coverage policy for the broader service. `support@pp.com` is not controlled by the maintainer and is not an operational contact.

## Testing Decisions

- Use authenticated HTTP requests through the existing API against PostgreSQL as the primary seam. Test externally visible API responses and durable database state rather than private helper behavior. Extend the existing HTTP/PostgreSQL integration suite; use separate database connections for races. Give the server-side routing dependency controlled success and failure responses at this seam.
- Cover account creation versus confirmed-booking eligibility, absent/stale declarations, known false declarations, restrictions and revocations, vehicle categories and capacity, ordered points on the posted route, off-route and detour rejection, and route changes. Assert that API/UI language never represents declarations as verified evidence.
- Cover server verification of the posted route and its passenger segment, distance along that segment rather than an independently routed path, paise rounding boundaries, ₹5/₹7 category selection, zero additional charges, immutable accepted terms, and rejection when route or segment verification fails.
- Use separate connections for last-seat acceptance, conflicting commitments, cancellation, revocation, pause, and departure races.
- Verify idempotent retries, changed-payload rejection, rollback on failed audit or notification-work insertion, delivery failure after commit, and recovery of acknowledged actions.
- Rehearse migration with historical offers, bookings, settlements, and platform-payment orders; assert that their ownership, terms, and amounts remain unchanged.

## Out of Scope

Detours, automatic matching, passenger-posted routes or ride requests, segment seat reuse, platform collection and payouts, platform fees, chat, live tracking, and push notifications are outside this release. Publishing this specification does not activate real bookings.

## Further Notes

The earlier corridor interviews, six candidate stop pairs, weekday support proposal, provisional travel timing, and whole-car contribution cap are historical development evidence. They do not automatically apply to the unrestricted product. The existing pilot specification and development operating policy remain the record for old policy versions and records until an approved cutover.

The following decisions and launch blockers remain open:

1. The maintainer chose no pre-booking document review for adults, drivers, or vehicles, a fresh review of historical PRMITR status, one helmeted passenger maximum on bikes/scooters, declared belted-seat capacity for cars, and twelve-month or earliest-expiry declaration renewal. Confirm through ticket 03's external review whether real operation with these unverified declarations is permissible and insurable; this specification makes no such finding.
2. Obtain external review of the ₹7/km per-car-passenger model, including its possible ₹21/km aggregate, and of the proposed activity for bikes, scooters, cars, and unrestricted geography. Document the cost basis rather than inferring approval from the rate choice.
3. Specify posted-route and segment verification, point-matching tolerances, safe pickup/drop-off validation, routing provider and travel modes, distance and paise rounding, route-service outage behavior, maximum trip limits, and schedule/overlap buffers. An unverifiable route or segment cannot yield an accepted price.
4. Approve request, acceptance, departure, cancellation, incident, retention, and support policies for the broader geography. The corridor's weekday 09:00–18:00 IST window and fixed landmarks do not automatically apply.
5. Provide and test a monitored public support contact. Complete provider capacity, notification, backup, restore, privacy, staging, and real-trip launch evidence.
6. Complete the forward migration and server-side implementation, pass critical PostgreSQL tests, then make an explicit launch decision before enabling real bookings.
