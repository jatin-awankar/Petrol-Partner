# 06: Close legacy booking and payment entry points

**What to build:** Existing generic routes and UI paths cannot create a booking or platform payment while the new route flow is developed.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Audit every server route, worker path, and client action that can create or confirm legacy rides, bookings, collection orders, or payouts; document the reachable paths.
- [ ] Reject unsupported protected mutations at API boundaries while preserving authenticated historical reads and direct-settlement records.
- [ ] Add authenticated HTTP checks proving old endpoints cannot bypass the disabled route flow; keep real bookings disabled.
