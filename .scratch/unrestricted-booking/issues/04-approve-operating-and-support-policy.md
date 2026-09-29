# 04: Approve operating and support policy

**What to build:** Participants and operators have an approved operating contract for route bookings beyond the fixed corridor.

**Blocked by:** 01 (Approve broader eligibility and vehicle rules); 02 (Approve route and contribution rules).

**Status:** ready-for-human

- [ ] Set request, acceptance, departure, cancellation, incident, support coverage, escalation, and retention rules for the wider geography.
- [ ] Define a monitored public support contact, coverage owner, response expectations, and fallback; exclude the uncontrolled support@pp.com address.
- [x] Record which historical corridor rules remain specific to historical records rather than applying automatically to new bookings.

## Proposed decision record — not resolved

**Policy version:** `2026-09-29.1`. **Decision date:** 2026-09-29. **Policy approver and proposed primary on-duty operator:** Jatin Awankar. The maintainer confirmed the complete proposed record on 2026-09-29, including its unresolved launch dependencies. See [the operating policy](../../../docs/operations/unrestricted-booking-operating-policy.md).

The proposed record covers weekday 09:00–18:00 IST departures with coverage through active-trip outcome, 2-hour-to-7-day posting, 60-minute request and 30-minute acceptance cutoffs, −15/+30-minute departure checks, cancellation and incident handling, fail-closed outage recovery, provisional retention, and historical-policy separation. Jatin Awankar subsequently selected Maharashtra as the launch service area on 2026-09-29, replacing the proposed Amravati-area limit; both endpoints must be inside, with brief verified-route travel outside permitted. The exact boundary dataset remains undecided. The 50 km/90-minute caps remain proposed. This geographic restriction changes ticket 02's earlier recorded choice. Proposed 15-minute urgent acknowledgement and one-business-day routine response targets are **not** published promises.

The third acceptance criterion is evidenced by the historical-policy section of the operating document. The first two remain open: the authoritative boundary and complete retention schedule are still undecided. Jatin Awankar nominated `jatinawankar23@gmail.com` as the primary inbox and `supportpp@gmail.com` as the fallback on 2026-09-29, but neither has receipt/acknowledgement rehearsal evidence. Both use the same provider and sole operator, so independent reachability and active-trip escalation are not established; Jatin Awankar confirmed there is no backup human. Response targets have not been rehearsed. `support@pp.com` is uncontrolled. Ticket 02's provider gate, ticket 03 external review, ticket 09 publication, deployed-data/provider retention inventory, staging and recovery evidence, and ticket 18 launch decision remain separate blockers. Real bookings stay disabled.

The Survey of India administrative-boundary database is a free official geometry candidate, not a selected production dataset: edition, checksum, geometry accuracy, and reuse permission have not been verified. The existing account-closure flow has no provider deletion runner or restore-safe deletion manifest. These findings prevent claiming that a complete retention or boundary-enforcement policy is ready.
