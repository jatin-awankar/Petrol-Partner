# 16: Rehearse the unrestricted release in staging

**What to build:** The maintainer runs a versioned synthetic release with the actual approved provider arrangement, support contact, and complete route-booking flow.

**Blocked by:** 09 (Provide monitored support and notices); 14 (Rehearse the representative-copy upgrade); 15 (Verify the integrated route flow); pilot-readiness 07 (Choose a feasible provider arrangement), 28 (Enforce operational retention and account closure), and 29 (Run the pilot without legacy payment and Redis dependencies).

**Status:** ready-for-agent

- [ ] Deploy and smoke-test synthetic applicants, vehicles, route offers, segment quotes, bookings, journeys, direct settlement, operator support, and provider-backed notices.
- [ ] Verify privacy, capacity, worker, backup, pause, recovery-readiness, and disabled-capability behavior with the actual configuration.
- [ ] Record evidence and unresolved findings; external legal/rate review is not a staging blocker and no real booking is allowed.


## Routing provider evidence transferred from ticket 02 — 2026-10-03

- [ ] Run the actual self-hosted Valhalla/OSM adapter in the approved provider topology for cars (`auto`) and bikes/scooters (`motorcycle`); document representative local road restrictions and safe-stop/endpoint confirmation outcomes.
- [ ] Verify MIT notices, visible OSM and Mapbox attribution, ODbL treatment of graph and stored route data and any applicable derivative-data/access obligations, plus Mapbox display/geocoding rights and private-record separation. Document retention and deletion of route data and backups.
- [ ] Exercise the 10-second timeout, two-job per-instance limit, overload, invalid responses, graph mismatch and retries; prove visible recoverable failures and unchanged accepted prices.
- [ ] Measure memory/disk, graph build/update, cold start, request latency, availability and usage costs on the actual host. No paid account, public demo dependency or operator-laptop production dependency is authorized by ticket 02.

These requirements are transferred uncompleted. Ticket 02 is a completed policy decision; its resolution does not satisfy this rehearsal or authorize real bookings.

## Operating-policy evidence handoff — ticket 04, 2026-10-03

Ticket 04's policy-only resolution transfers unperformed production evidence here: reconcile reuse terms for the actual selected SOI boundary/derived geometry; exercise versioned boundary and crossing checks; validate both Gmail support channels, response targets and missed-contact behavior; inspect real provider copies, finite retention and actual deletion outcomes under policy `2026-10-03.2`. Coordinate retention implementation with pilot-readiness 28. Synthetic staging may demonstrate and record a missing independent escalation path, but cannot treat that as real-trip readiness. Ticket 18 must retain that blocker. No staging deployment is authorized by this handoff; this ticket's status is unchanged.
