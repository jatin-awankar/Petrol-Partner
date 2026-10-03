# 18: Decide real-booking readiness

**What to build:** The owner makes an evidenced go/no-go decision for real unrestricted bookings under stated operating conditions.

**Blocked by:** 03 (Obtain external operation and rate review); 04 (Approve operating and support policy); 16 (Rehearse the unrestricted release in staging); 17 (Rehearse outage, restore, and reconciliation).

**Status:** ready-for-human

- [ ] Review external conditions, rate cost basis, adopted declaration and vehicle rules, monitored support, provider capacity, privacy, migration, PostgreSQL checks, staging, and recovery evidence.
- [ ] Record unresolved critical findings and explicit operating limits; do not treat this ticket or the specification as automatic activation.
- [ ] Require a separate explicit authorization and controlled action before enabling any real booking.


## Routing readiness gate — ticket 02 handoff, 2026-10-03

Ticket 02 resolves provider/policy selection only. Before a go decision, require ticket 10's actual Valhalla adapter and endpoint confirmation evidence, pilot-readiness 07's accessible zero-cost host, ticket 16's mode, licence/attribution, capacity and failure rehearsals, and ticket 17's graph/route recovery proof. None is waived by resolving ticket 02. The external/rate review and operating-policy gates also remain unchanged.
