# 13: Carry route bookings through cancellation and outcomes

**What to build:** Participants and operators can manage a confirmed route segment through cancellation, departure, journey decision, and direct settlement without losing its original terms.

**Blocked by:** 04 (Approve operating and support policy); 12 (Request and accept one priced seat).

**Status:** claimed

- [ ] Material route or point changes cancel affected commitments and use an auditable replacement flow; holds, cancellations, departure, and boarding preserve whole-ride seat and overlap rules.
- [ ] Reuse journey confirmation, obligation, cash/UPI claim, receipt, dispute, and operator resolution records; silence creates neither travel nor payment, and platform collection stays disabled.
- [ ] PostgreSQL HTTP tests cover transition authorization, retries, cancellation/revocation/departure races, audit and notification rollback, delivery failure, and recovery of acknowledged outcomes.

## Comments

- Synthetic route outcome tables and authenticated actions now cover pre-departure cancellation, holds, departure and boarding, mutual journey, direct payment claim, receipt or dispute, and operator decisions. Accepted amount and segment are copied into a separate obligation. These actions remain disabled outside tests.
- Synthetic material replacements now link a new route identity to an acknowledged driver cancellation and require fresh requests. Post-departure attempted cancellation and participant incident reports enter an operator queue; a reported incident prevents automatic journey obligation. Outcome mutations now serialize through their receipt acknowledgement, with a live two-connection departure/cancellation race test. Departure rechecks frozen route identity/version and active posted-route overlaps.
- Still needed: full revocation and last-seat outcome race evidence, complete operator dispute and silence review coverage, and recovery of acknowledged outcomes after database loss. Ticket 04, production routing, and real support are still open launch gates. Migrations 0040–0042 have not been deployed.
