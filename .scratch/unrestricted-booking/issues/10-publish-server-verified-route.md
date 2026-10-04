# 10: Publish a server-verified route for a declared driver

**What to build:** A driver with current adult and driver–vehicle declarations can prepare and inspect an offer on a server-verified posted route with departure, deadline, and whole-ride capacity. Route verification does not imply verified identity or documents.

**Blocked by:** 02 (Approve route and contribution rules); 04 (Approve operating and support policy); 05 (Inventory deployed data and plan the migration); 06 (Close legacy booking and payment entry points); 08 (Register individual driver–vehicle declarations).

**Status:** claimed

- [ ] The server owns and versions the posted route and rejects invalid geometry, mode, vehicle, schedule, support window, and overlapping commitments. Implementation and synthetic checks pass; actual SOI artifact adoption remains below.
- [x] Publication, reads, and operator audit distinguish the new route policy from historical corridor offers; real-booking exposure stays disabled.
- [x] Authenticated HTTP/PostgreSQL tests cover authorization, idempotency, rollback, route-service failure, overlap, and recovery evidence.

## Implementation — 2026-10-04

The work continues on `codex/10-valhalla-route-publication` in draft [PR #83](https://github.com/jatin-awankar/Petrol-Partner/pull/83). The maintainer explicitly authorized implementing boundary rules against synthetic polygon fixtures while retaining fail-closed production behavior. This is not approval of the actual SOI artifact or a scope amendment resolving the ticket.

Implemented and exercised through authenticated HTTP/PostgreSQL:

- Self-hosted Valhalla `auto` for cars and `motorcycle` for bikes/scooters; route/engine/graph provenance, cumulative integer metres, bounded failures and explicit safe endpoint confirmation within 30 m. Local real-engine rehearsals pass for all three categories, including the provider elapsed-time field.
- Polygon and multipart containment of requested and confirmed endpoints, preservation of holes, uncertainty clearance, rejection of ambiguous/tangent/collinear/near-border crossings, and cumulative outside-state bounds across the saved route.
- Conservative excursion accounting: charge the entire saved shape-segment distance for a segment that travels outside, and the entire provider edge elapsed-time delta for any affected edge, counted once and rounded up. Reject totals above 5,000 m or 600 s. Missing, nonmonotonic or duration-inconsistent timing rejects verification; no time is inferred from distance.
- Artifact shape, normalized coordinate order/extent, checksum, provenance fields, topology and bounded computation checks. Test fixtures are invented geometry; passing these checks does not grant SOI reuse rights or install production data.
- Immutable boundary provenance and calculation version in the existing route verification snapshot, audit-linked operation and signed receipt. Successful retries and recovery preserve their original evidence. Historical rows, policy versions and receipt formats remain unchanged.

New routes retain policy versions `unrestricted-route-contribution-2026-10-03.2` and `2026-10-03.2`. Production publication still returns `BOUNDARY_UNAVAILABLE`, including when a test artifact was previously retained in memory. No client payload, environment approval flag or test metadata can enable it. Real bookings remain disabled.

## Remaining acceptance checks — artifact-dependent only

1. Establish applicable reuse rights for the selected `SOI/ABDB/VECTOR/50000/2025/STATE/INDIA` artifact and its derived, retained server-side geometry. The authorized SOI request was sent on 2026-10-03; sending is not permission. Retain the resulting licence/permission reference with the artifact.
2. Adopt a pinned deployable artifact: independently verify the complete archive and normalized-geometry SHA-256, Maharashtra attributes, actual source CRS and transformation to longitude/latitude, and full topology. The recorded local inspection is preliminary, not production adoption. Derive and justify its uncertainty band from verified accuracy; the fixtures' bands are not Maharashtra accuracy claims.
3. Load only that reviewed artifact through a production integration with fixed provenance, then run the authenticated endpoint, hole, multipart, border, crossing and cumulative distance/time cases against the actual detailed geometry and representative saved routes. Verify its topology/work bounds and uncertainty behavior at real artifact scale. Missing or mismatched artifact evidence must remain unavailable. Only this completed evidence can satisfy the remaining acceptance criterion.

Hosting, immutable production gateway, staging, external operation/rate review, release migration, deployed recovery and real-booking approval keep their existing owners; they are not added to ticket 10's remaining checklist. Passenger discovery, segment quotes, requests/acceptance and outcomes retain their existing tickets and production gates.

## Evidence and history

- [Adapter and boundary implementation contract](../../../docs/operations/valhalla-route-preparation.md).
- [Synthetic boundary implementation and validation](../../../docs/operations/evidence/ticket10-synthetic-boundary-2026-10-04.md).
- [Complete local SOI inspection, pinned Valhalla build and SOI request send record](../../../docs/operations/evidence/ticket10-local-artifacts-2026-10-03.md).

The original isolated route preparation, migration 0043, endpoint repeated-pass correction and dense-geometry regression remain in branch history. Earlier numeric boundary stubs established only limits; the 2026-10-04 tests now execute polygon geometry. Neither those tests nor the preliminary SOI inspection resolve actual-artifact adoption. Ticket 10 remains **claimed**.

## Final validation — 2026-10-04

`npm test` passed with the opt-in local Valhalla environment: **38 script checks, 407 API tests (all 208 authenticated HTTP/PostgreSQL cases), and 19 worker tests**. Ten script checks and one unrelated API live-provider check were skipped. The local graph is identified by the previously recorded immutable manifest; all database tests used a newly created disposable PostgreSQL 16 database. No deployed data was used.

`npm run typecheck`, `npm run api:build` and `git diff --check` passed. `npm run lint` passed with nine pre-existing warnings. Standards review found one uncounted topology-work path, reproduced and fixed with an authenticated red/green regression; its final review has zero actionable findings. Spec review, including the updated artifact-only checklist, has zero actionable findings. Reviews did not independently recreate the external artifact build. Ticket 10 remains claimed and the PR remains draft.

## Alternative-boundary investigation — 2026-10-04

PR #83 is now merged according to GitHub; its earlier draft wording is historical. This does not satisfy the remaining artifact criterion. Work continues on the existing ticket branch.

[Primary-source research](../../../docs/operations/evidence/ticket10-boundary-alternatives-research-2026-10-04.md) identifies geoBoundaries gbOpen/DataMeet as the strongest conditional reuse candidate. [Pinned local evaluation](../../../docs/operations/evidence/ticket10-boundary-candidate-evaluation-2026-10-04.md) passes topology/processing probes, but its unquantified positional shift and island/hole differences leave accuracy/completeness unresolved. No alternative currently satisfies the unchanged policy.

A [concrete source amendment](../../../docs/operations/evidence/ticket10-boundary-amendment-proposal-2026-10-04.md) is proposed for maintainer approval, not applied. It preserves the accuracy gate and all actual-artifact checks in this ticket. No arbitrary uncertainty band, replacement adoption, ticket-11 work, deployment or real-booking activation is authorized by this research. Status remains **claimed**.

## Candidate accuracy/completeness decision — 2026-10-04

The maintainer approved geoBoundaries for evaluation only and required evidence before any policy replacement or production integration. [The follow-up assessment](../../../docs/operations/evidence/ticket10-boundary-adoption-assessment-2026-10-04.md) finds two absent internal exclusions assigned to Karnataka in SOI, 81 entirely absent SOI components, an extra component substantially assigned to a union territory, and substantial coastal/outline differences. Primary administrative sources support enclave concerns, but no defensible candidate uncertainty band or complete corrected geometry was established.

Pinned comparison and direct checker probes pass as diagnostics; both absent-hole samples remain eligible even with a hypothetical 1,000 m band. This is evidence against adopting the candidate unchanged, not acceptance evidence. No replacement or buffer was approved or installed. Positional/completeness evidence and rights-cleared corrections remain required within ticket 10; otherwise an explicit product-scope/assurance decision is needed before further implementation. Ticket 10 remains **claimed**.
