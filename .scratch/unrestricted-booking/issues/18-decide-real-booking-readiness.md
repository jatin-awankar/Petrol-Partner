# 18: Decide real-booking readiness

**What to build:** The owner makes an evidenced go/no-go decision for real unrestricted bookings under stated operating conditions.

**Blocked by:** 03 (Obtain external operation and rate review); 04 (Approve operating and support policy); 16 (Rehearse the unrestricted release in staging); 17 (Rehearse outage, restore, and reconciliation).

**Status:** ready-for-human

- [ ] Review external conditions, rate cost basis, adopted declaration and vehicle rules, monitored support, provider capacity, privacy, migration, PostgreSQL checks, staging, and recovery evidence.
- [ ] Record unresolved critical findings and explicit operating limits; do not treat this ticket or the specification as automatic activation.
- [ ] Require a separate explicit authorization and controlled action before enabling any real booking.


## Routing readiness gate — ticket 02 handoff, 2026-10-03

Ticket 02 resolves provider/policy selection only. Before a go decision, require ticket 10's actual Valhalla adapter and endpoint confirmation evidence, pilot-readiness 07's accessible zero-cost host, ticket 16's mode, licence/attribution, capacity and failure rehearsals, and ticket 17's graph/route recovery proof. None is waived by resolving ticket 02. The external/rate review and operating-policy gates also remain unchanged.

## Operating-policy evidence handoff — ticket 04, 2026-10-03

Ticket 04 is resolved only for implementation under an explicitly approved scope amendment. Before any real-booking go decision require ticket 10 boundary artifact and enforcement evidence; ticket 16 actual SOI reuse and provider/support/retention evidence; pilot-readiness 28 historical-record retention decisions, provider deletion and finite-copy implementation; and ticket 17 restore suppression and outage reconciliation. Require a separately reachable active-trip escalation arrangement and missed-contact rehearsal despite the current sole-operator demo model. Both Gmail inboxes and the same sole operator do not satisfy that requirement. Retain ticket 03 external review, all other gates and separate activation authorization. These are open launch requirements, not satisfied evidence; status stays ready-for-human.
