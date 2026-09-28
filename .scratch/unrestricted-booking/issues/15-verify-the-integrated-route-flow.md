# 15: Verify the integrated route flow

**What to build:** The full unrestricted route journey passes its critical server and database checks while excluded capabilities remain closed.

**Blocked by:** 06 (Close legacy booking and payment entry points); 09 (Provide monitored support and notices); 12 (Request and accept one priced seat); 13 (Carry route bookings through cancellation and outcomes); 14 (Rehearse the representative-copy upgrade).

**Status:** ready-for-agent

- [ ] Exercise authenticated HTTP flows against PostgreSQL from account creation and declarations through route posting, segment pricing, request, acceptance, cancellation, journey, settlement, support, and operator review.
- [ ] Use separate connections for seat, overlap, cancellation, revocation, pause, and departure races; verify retries, changed payloads, rollback, notification failure, and acknowledged-action recovery.
- [ ] Verify generic booking, collection, payout, matching, chat, live tracking, and push boundaries remain disabled; no real bookings are enabled.
