# 06: Close legacy booking and payment entry points

**What to build:** Existing generic routes and UI paths cannot create a booking or platform payment while the new route flow is developed.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Audit every server route, worker path, and client action that can create or confirm legacy rides, bookings, collection orders, or payouts; document the reachable paths.
- [x] Reject unsupported protected mutations at API boundaries while preserving authenticated historical reads and direct-settlement records.
- [x] Add authenticated HTTP checks proving old endpoints cannot bypass the disabled route flow; keep real bookings disabled.

## Answer

The generic route path is `apiRouter` → legacy rides, bookings, matching, settlements, payments or webhook router → controller → service → repository. Its `/v1/rides` writes (offers, requests, updates, departure), `/v1/bookings` writes (create, confirm, status, cancel, complete), matching recompute, legacy settlement writes, Razorpay order and verification intake, and Razorpay webhook are blocked by the root API gate before controllers run. Legacy booking and settlement GETs now pass through authenticated, participant-scoped handlers. Booking payment status remains an authenticated GET. Pilot history and direct settlement routes remain available without data migration.

The separate `/v1/corridor-offers` and `/v1/seat-requests` routes implement the existing supervised pilot state machine. Their publication, request and acceptance writes are distinct from the generic legacy path; they continue to depend on current eligibility, pause, recovery and launch controls. This ticket does not activate unrestricted bookings or change their data. The operator launch gates in `docs/pilot-spec.md` remain unsatisfied.

Legacy browser actions live in `hooks/rides/useRideOffers.ts`, `hooks/rides/useRideRequests.ts`, `hooks/bookings/useBookRide.ts`, `app/search-rides/[id]/page.tsx`, and the `lib/api/backend.ts` calls to generic rides/bookings. They cannot bypass the API gate. `app/payments/page.tsx` previously opened Razorpay checkout through `/v1/payments/orders`; the online action is removed, while historical status display remains. The older offline settlement actions remain API-disabled; the direct-settlement UI and records are preserved.

Worker inventory: `booking-expiry.job.ts`, `settlement-overdue.job.ts`, and `payment-reconcile.job.ts` can update old booking/payment state, and have pilot-linked record guards. Reconciliation can still process historical non-pilot orders, preserving prior payment facts; it creates no collection order. `maintenance.job.ts` can enqueue those jobs but cannot create a booking or order. `payout.job.ts` was an inert placeholder and now rejects any queued payout job explicitly. `worker/src/index.ts` starts only the PostgreSQL pilot sweeps, not a payout worker.

Evidence: authenticated HTTP/PostgreSQL test covers generic mutation routes, legacy settlement writes, and historical booking/settlement/payment reads for a participant and unrelated user; worker payout test covers queued rejection. `npm run typecheck` passed. Focused HTTP and worker tests passed. After linking the fresh worktree to the repository's installed tools, the complete API suite passed (151 passed, one skipped) and the worker suite passed (19 passed). Lint passed with 10 existing warnings. The root `npm test` script run was interrupted after a worktree tooling test hung; its runtime-contract test also assumed the repository root was the worktree. `npm run build:all` could not fetch Google Poppins during the Next.js build. No migration or data deletion was performed. Two-axis review against `AGENTS.md` and this ticket found no remaining hard standard or spec violation after adding the historical fixture, settlement mutation checks, and accurate settlement status metadata; the legacy payment view model still computes an unused online-action flag.

Remaining gaps: no real-booking launch approval or unrestricted route implementation; the existing supervised pilot endpoints and historical non-pilot payment reconciliation require separate launch and operations decisions. No payout provider is invoked by the current worker entry point.
