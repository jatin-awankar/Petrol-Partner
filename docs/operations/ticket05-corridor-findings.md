# Ticket 05: corridor interviews and policy decisions

**State: findings recorded; corridor and operating policy not approved.** This record contains aggregate information supplied by the maintainer on 2026-09-28. It contains no participant names or contact details. The interview notes were not independently reviewed.

## Reported student findings

- Ten students were spoken with between 2026-09-21 and 2026-09-26. Seven of ten reportedly make the journey regularly.
- The reported travel/departure period is 10:00–17:30 IST. The usual direction and departure peaks remain to be confirmed.
- The main reported problem is waiting for rickshaws. Most of the students use bikes or scooters. No available car driver was reported in this group; a bike has one spare seat.
- The maintainer suggested Gadge Nagar, Dastur Nagar, Tapovan, and PRMITR as pickup points, and PRMITR, Sai Nagar, Dastur Nagar, and Gadge Nagar as drop-off points. Direction, stop order, and which stop pairs are permitted remain undecided.
- The maintainer estimated an average trip duration of about ten minutes, varying by stop pair. This is an interview estimate, not a measured routing or schedule buffer.
- UPI is reportedly used more often than cash. No contribution amount, fuel/toll basis, or stop-pair table has yet been approved.

## 2026-09-28 scope decision and its boundary

The maintainer explicitly chose to add bikes and scooters **while retaining cars**. They also stated that roughly one in twenty students has a car; whether that is a separate observed count or an estimate remains to be confirmed. The ten interviews do not establish a regular car driver with an unused seat.

The current approved specification and implemented server eligibility still admit only private cars/SUVs. This human scope decision does **not** activate two-wheelers. The specification, vehicle evidence and approval rules, rider capacity, overlapping-vehicle commitments, confirmed-trip identification, contribution policy, tests, and ticket 06 transport/insurance/institutional determinations must be revised before a two-wheeler can offer a real ride. Existing car behavior remains subject to all current launch gates. No real booking is enabled by this decision.

The repository currently rejects bikes/scooters in `verification.schema.ts` and `pilot-eligibility.sql.ts`, describes car capacity in the offer service, and exposes car-specific details in confirmed-trip responses and pages. The driver/car approval, offer, booking, departure, revocation, recovery, and staging tests were written for cars. A follow-on implementation plan must preserve existing records and approvals, add category-specific evidence and capacity constraints, and test both modes end to end. Updating only the UI or an input enum would leave server-side safety gaps.

The maintainer indicated approval of the proposed timing/no-automatic-penalty rules, subject to clarifying the support windows. The exact directional stops, expected duration and buffer, category-specific capacity, contribution table, public support contact and published support hours, and policy version remain open. Ticket 06's external determination must still review the contribution model before real trips. No real-trip booking or support window is enabled by this record.
