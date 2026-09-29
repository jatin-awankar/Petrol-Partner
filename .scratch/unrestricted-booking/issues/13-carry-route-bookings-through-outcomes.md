# 13: Carry route bookings through cancellation and outcomes

**What to build:** Participants and operators can manage a confirmed route segment through cancellation, departure, journey decision, and direct settlement without losing its original terms.

**Blocked by:** 04 (Approve operating and support policy); 12 (Request and accept one priced seat).

**Status:** claimed

- [ ] Material route or point changes cancel affected commitments and use an auditable replacement flow; holds, cancellations, departure, and boarding preserve whole-ride seat and overlap rules.
- [ ] Reuse journey confirmation, obligation, cash/UPI claim, receipt, dispute, and operator resolution records; silence creates neither travel nor payment, and platform collection stays disabled.
- [ ] PostgreSQL HTTP tests cover transition authorization, retries, cancellation/revocation/departure races, audit and notification rollback, delivery failure, and recovery of acknowledged outcomes.

## Comments

- Synthetic route outcome tables and authenticated actions now cover pre-departure cancellation, holds, departure and boarding, mutual journey, direct payment claim, receipt or dispute, and operator decisions. Accepted amount and segment are copied into a separate obligation. These actions remain disabled outside tests.
- Still needed: a complete audited material-change replacement workflow, post-departure incident handling, silence review work, and representative operator dispute tests. Revocation, departure, and last-seat race tests and full recovery of acknowledged outcomes after database loss remain unevidenced. Ticket 04, production routing, and real support are still open launch gates. Migration 0040 has not been deployed.
