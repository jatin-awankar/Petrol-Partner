# 10: Publish a server-verified route for a declared driver

**What to build:** A driver with current adult and driver–vehicle declarations can prepare and inspect an offer on a server-verified posted route with departure, deadline, and whole-ride capacity. Route verification does not imply verified identity or documents.

**Blocked by:** 02 (Approve route and contribution rules); 04 (Approve operating and support policy); 05 (Inventory deployed data and plan the migration); 06 (Close legacy booking and payment entry points); 08 (Register individual driver–vehicle declarations).

**Status:** claimed

- [ ] The server owns and versions the posted route and rejects invalid geometry, mode, vehicle, schedule, support window, and overlapping commitments.
- [ ] Publication, reads, and operator audit distinguish the new route policy from historical corridor offers; real-booking exposure stays disabled.
- [ ] Authenticated HTTP/PostgreSQL tests cover authorization, idempotency, rollback, route-service failure, overlap, and recovery evidence.

## Implementation note

Ticket 10 has an isolated, versioned server-owned route preparation model and driver-only read API on `codex/10-server-verified-routes`. The synthetic adapter is test-only. Live route publication and real-booking discovery remain disabled until the selected ticket 02 Valhalla policy is implemented and rehearsed, ticket 04 approves Maharashtra boundary enforcement and support coverage, and the migration/release gates are complete. The migration is committed as forward-only source but is not deployed.

### Remaining acceptance blockers

1. Ticket 02 now selects self-hosted Valhalla/OSM (`auto` for cars, `motorcycle` for bikes/scooters) as a policy decision. This ticket must implement the actual adapter and evidence its behavior; synthetic geometry alone is insufficient. Follow policy version `unrestricted-route-contribution-2026-10-03.2`, including confirmed snaps within 30 m, provenance, edge-distance normalization and bounded failures. No live production provider has been validated.
2. Ticket 04 has not approved an authoritative versioned Maharashtra boundary, full support coverage, or the final wider-area operating policy. The preparatory endpoint therefore cannot authorize live publication.
3. Ticket 05's deployed-data migration decision and ticket 06's legacy boundary closure require release evidence before migration 0037 can be deployed or any offer exposed to booking. Ticket 18 still controls real-booking activation.
4. Published participant discovery, request and acceptance against a posted route, safe stopping-place checks, and replacement/version transition remain unavailable. Those flows need the approved provider and policy; driver-only prepared reads are the implemented scope.
5. Recovery restoration is exercised in a local PostgreSQL test, but staging restoration and an independently configured production receipt store remain launch evidence.


## Ticket 02 implementation handoff — 2026-10-03

- [ ] Implement the selected Valhalla adapter and graph/engine/costing/normalization provenance without modifying historical route versions.
- [ ] Store requested and driver-confirmed routed endpoints separately; reject over-30-m, wrong-side and ambiguous snaps. Require a confirmed safe stopping place and preserve passenger matching rules.
- [ ] Test exact edge boundaries, sub-edge interpolation/rounding, repeated geometry, all intended modes, invalid or unavailable provider responses, timeout, concurrency limits, idempotency, audit and recovery via authenticated HTTP/PostgreSQL.
- [ ] Keep production and real-booking exposure closed until actual hosting, licence-compliance, staging and release evidence passes tickets 16–18 and pilot-readiness 07.

Ticket 02's policy resolution does not resolve this implementation ticket. TomTom is no longer a dependency.

## Operating-policy evidence handoff — ticket 04, 2026-10-03

Ticket 04 resolves policy selection only. Before production use, obtain and hash the selected SOI `SOI/ABDB/VECTOR/50000/2025/STATE/INDIA` artifact, validate CRS/transformation, topology and Maharashtra attributes, select and justify the boundary uncertainty band, and retain provenance in immutable route terms. Test fail-closed endpoint and confirmed-snap containment, border uncertainty, holes/multipart geometry and cumulative outside-state limits of 5 km/10 minutes within 50 km/90 minutes. Missing boundary data or outside-state timing rejects verification. Enforce the approved support/schedule policy through authenticated API/PostgreSQL tests. Ticket 16 owns production reuse evidence. This supersedes awaiting ticket 04 policy selection, not the missing implementation/validation. Status and live gates stay unchanged.

## Continuation — Valhalla adapter, 2026-10-03

Status remains **claimed**. The adapter, explicit preview/endpoint confirmation, immutable provenance, cumulative edge metres and forward-only migration 0043 are implemented on `codex/10-valhalla-route-publication`. New preparations use route policy `unrestricted-route-contribution-2026-10-03.2` and operating policy `2026-10-03.2`. Historical rows and signed snapshot formats are preserved. Driver-private preparation, audit, notices, idempotency and independent receipt recovery remain in place; real bookings remain disabled.

[Implementation contract and exact blockers](../../../docs/operations/valhalla-route-preparation.md) supersede the earlier notes that provider/policy selection is still undecided. The actual SOI artifact is incomplete/unverified and its derived reuse unresolved. No approved uncertainty band, topology/CRS validation, endpoint containment or cumulative outside-state crossing/timing implementation can be claimed. Production preparation fails closed with `BOUNDARY_UNAVAILABLE`. Synthetic evidence-limit tests are not Maharashtra boundary tests. No reliable Valhalla host or immutable build-attesting gateway has been validated; hosting and staging remain with their existing tickets.

Do not check off all acceptance criteria or resolve this ticket on the strength of controlled provider fixtures. Its outstanding boundary implementation and actual-provider adapter evidence remain explicit; broader hosting, external review, staging and booking approval have not been absorbed into ticket 10 or marked complete.
