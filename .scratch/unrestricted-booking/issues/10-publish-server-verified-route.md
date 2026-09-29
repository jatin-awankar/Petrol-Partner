# 10: Publish a server-verified route for a declared driver

**What to build:** A driver with current adult and driver–vehicle declarations can prepare and inspect an offer on a server-verified posted route with departure, deadline, and whole-ride capacity. Route verification does not imply verified identity or documents.

**Blocked by:** 02 (Approve route and contribution rules); 04 (Approve operating and support policy); 05 (Inventory deployed data and plan the migration); 06 (Close legacy booking and payment entry points); 08 (Register individual driver–vehicle declarations).

**Status:** claimed

- [ ] The server owns and versions the posted route and rejects invalid geometry, mode, vehicle, schedule, support window, and overlapping commitments.
- [ ] Publication, reads, and operator audit distinguish the new route policy from historical corridor offers; real-booking exposure stays disabled.
- [ ] Authenticated HTTP/PostgreSQL tests cover authorization, idempotency, rollback, route-service failure, overlap, and recovery evidence.

## Implementation note

Ticket 10 has an isolated, versioned server-owned route preparation model and driver-only read API on `codex/10-server-verified-routes`. The synthetic adapter is test-only. Live route publication and real-booking discovery remain disabled until ticket 02 selects and rehearses a provider and modes, ticket 04 approves Maharashtra boundary enforcement and support coverage, and the migration/release gates are complete. The migration is committed as forward-only source but is not deployed.
