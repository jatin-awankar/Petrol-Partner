# 13: Carry route bookings through cancellation and outcomes

**What to build:** Participants and operators can manage a confirmed route segment through cancellation, departure, journey decision, and direct settlement without losing its original terms.

**Blocked by:** 04 (Approve operating and support policy); 12 (Request and accept one priced seat).

**Status:** ready-for-agent

- [ ] Material route or point changes cancel affected commitments and use an auditable replacement flow; holds, cancellations, departure, and boarding preserve whole-ride seat and overlap rules.
- [ ] Reuse journey confirmation, obligation, cash/UPI claim, receipt, dispute, and operator resolution records; silence creates neither travel nor payment, and platform collection stays disabled.
- [ ] PostgreSQL HTTP tests cover transition authorization, retries, cancellation/revocation/departure races, audit and notification rollback, delivery failure, and recovery of acknowledged outcomes.
