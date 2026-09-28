# Petrol Partner pilot operating policy

**Version:** `pilot-development-2026-09-28.1`  
**Status:** Maintainer-approved intended real-trip policy direction; launch blocked by incomplete policy and readiness evidence. This version is usable only for synthetic development.  
**Basis:** Ten student conversations on 21–26 September 2026 and the maintainer's subsequent decisions, recorded in [`operations/ticket05-corridor-findings.md`](operations/ticket05-corridor-findings.md).

## Cohort and geography

The intended pilot serves verified adult PRMITR students only. The maintainer chose to include approved private bikes/scooters and cars. Current server eligibility still supports cars/SUVs only; two-wheelers remain disabled until their own specification, evidence rules, implementation, tests, and external determinations are complete.

Amravati University is not a pickup or drop-off point in this revised proposal. The inbound stop order is Gadge Nagar → Dastur Nagar → Tapovan → PRMITR. The outbound order is PRMITR → Sai Nagar → Dastur Nagar → Gadge Nagar. Only these six area-level pairs are intended:

- Gadge Nagar → PRMITR
- Dastur Nagar → PRMITR
- Tapovan → PRMITR
- PRMITR → Sai Nagar
- PRMITR → Dastur Nagar
- PRMITR → Gadge Nagar

Each selectable stop must be a short, operator-approved list of exact landmarks. Students cannot enter arbitrary pickup or drop-off locations. Exact map pins, safe stopping positions, PRMITR access, and road distances remain unapproved. Existing records using the former University–PRMITR policy must remain intact; any implementation uses a forward-only policy/schema migration and a new version.

## Seats, timing, and support

A bike or scooter may offer one passenger seat. A car may offer at most three passenger seats and never more than its individually approved free-seat capacity. Every confirmed passenger occupies one seat for the whole trip; no segment re-use is allowed.

The reported outbound-to-college departure period is 10:00–10:30 IST before an 11:00 start. Return departures follow either a 15:30 or 17:30 finish. The provisional schedule uses 20 minutes expected trip duration plus a 15-minute commitment buffer; a representative road rehearsal must confirm or revise this before launch.

Requests close 60 minutes before departure. The driver must accept or reject by 30 minutes before departure. A driver may start from 15 minutes before through 30 minutes after the scheduled departure, subject to current eligibility and support coverage. No automatic cancellation or no-show charge applies.

The intended support window is weekdays 09:00–18:00 IST, continuing until every active trip ends. The maintainer deferred a public support contact during development. Therefore the window is **not published as real-trip coverage**, and real bookings remain closed.

## Direct contribution proposal

Students pay each other directly by UPI or cash; Petrol Partner does not collect, hold, or distribute money. The maintainer proposed a ₹5/km cap for the whole bike/scooter trip and a ₹7/km cap for the whole car trip. The car cap is divided by the number of passenger seats offered when the ride is published, even if some seats remain empty. Each accepted passenger's amount is frozen and never repriced when another seat fills.

These rates are **not approved charges**. The six exact road distances, fuel price, vehicle mileage, toll assumptions, paise rounding, and fixed amount per stop pair and vehicle category remain to be established. The final table must approximate shared fuel and disclosed tolls with no platform fee, and ticket 06 must establish the external treatment of the proposed model. The application must not infer a city-wide price from a live map result or charge dynamically at booking time.

## Conditions before real-trip approval

The maintainer must verify safe exact landmarks and road distances for the six pairs, measure at least one representative journey, approve the contribution table and its cost basis, and provide a monitored public fallback contact. Ticket 06 must resolve category-specific transport, insurer, and PRMITR access questions. Two-wheeler eligibility and mixed-vehicle booking behavior require server-side implementation and PostgreSQL tests, and the separate provider/recovery launch gates remain open. Until then this version is for synthetic development only.

On 2026-09-28, the maintainer stated an intention to approve real trips immediately. That intent is recorded as an operator decision, **not as evidence that the listed gates passed**. No deployment, real-trip policy activation, or permission to accept real bookings follows from it. The ticket and launch-readiness status remain open.
