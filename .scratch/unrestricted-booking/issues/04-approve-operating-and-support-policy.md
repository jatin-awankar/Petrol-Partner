# 04: Approve operating and support policy

**What to build:** Participants and operators have an approved operating contract for route bookings beyond the fixed corridor.

**Blocked by:** 01 (Approve broader eligibility and vehicle rules); 02 (Approve route and contribution rules).

**Status:** ready-for-human

- [ ] Set request, acceptance, departure, cancellation, incident, support coverage, escalation, and retention rules for the wider geography.
- [ ] Define a monitored public support contact, coverage owner, response expectations, and fallback; exclude the uncontrolled support@pp.com address.
- [x] Record which historical corridor rules remain specific to historical records rather than applying automatically to new bookings.

## Proposed decision record — not resolved

**Policy version:** `2026-09-29.1`. **Decision date:** 2026-09-29. **Policy approver and proposed primary on-duty operator:** Jatin Awankar. The maintainer confirmed the complete proposed record on 2026-09-29, including its unresolved launch dependencies. See [the operating policy](../../../docs/operations/unrestricted-booking-operating-policy.md).

The proposed record covers weekday 09:00–18:00 IST departures with coverage through active-trip outcome, 2-hour-to-7-day posting, 60-minute request and 30-minute acceptance cutoffs, −15/+30-minute departure checks, cancellation and incident handling, fail-closed outage recovery, provisional retention, and historical-policy separation. It proposes a versioned Amravati-area launch polygon and 50 km/90-minute caps; the exact boundary has **not** been approved and the geographic restriction changes ticket 02's earlier recorded choice. Proposed 15-minute urgent acknowledgement and one-business-day routine response targets are **not** published promises.

The third acceptance criterion is evidenced by the historical-policy section of the operating document. The first two remain open: the precise geography and complete retention schedule are still undecided; no controlled public contact or independent fallback has been provided or tested, no backup or credible active-trip escalation is approved, and response targets have not been rehearsed. `support@pp.com` is uncontrolled. Ticket 02's provider gate, ticket 03 external review, ticket 09 publication, deployed-data/provider retention inventory, staging and recovery evidence, and ticket 18 launch decision remain separate blockers. Real bookings stay disabled.
