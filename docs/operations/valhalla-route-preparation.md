# Ticket 10 Valhalla route preparation

The approved successor implementation target is route policy `unrestricted-route-contribution-2026-10-04.1`, operating `2026-10-04.1` and `amravati-core-v1`. The runtime now packages the original service geometry and enforces coordinate-precision containment and zero route exit. The actual operator map review is recorded and the final local checks passed; eligible private route preparation can now pass the area gate. See the [implementation evidence and combined operator checklist](evidence/ticket10-amravati-implementation-2026-10-04.md) and [local scope contract](proposals/amravati-core-service-area-2026-10-04.md). It does not enable discovery or real bookings; ticket 10 is resolved for the approved local scope.

The sections below record the existing `.2` implementation and its historical SOI/synthetic evidence. Their state-artifact and 5 km/600 s requirements are superseded for the new local version by the linked contract, not claimed complete. Retain those historical checks and evidence for their original versions; do not relabel them as tests of the successor.

## Provider contract

The adapter uses the [Valhalla route API](https://valhalla.github.io/valhalla/api/route/api-reference/), [edge-walk trace attributes](https://valhalla.github.io/valhalla/api/map-matching/) and [locate API](https://valhalla.github.io/valhalla/api/locate/). Car maps to `auto`; bike and scooter map to `motorcycle`. There is no provider or costing fallback. Empty costing options mean the defaults of the pinned engine/configuration, not an unversioned rolling deployment.

Configure an operator-controlled `VALHALLA_URL` (HTTPS, or HTTP on loopback for local development). No URL comes from a participant. Redirects are rejected. `VALHALLA_BUILD_MANIFEST` is a JSON object with these exact keys in this order:

```json
{
  "engineVersion": "actual engine version",
  "imageDigest": "64 lowercase SHA-256 hex characters, without sha256: prefix",
  "osmExtractDate": "YYYY-MM-DD",
  "osmExtractSha256": "64 lowercase SHA-256 hex characters",
  "graphBuildId": "immutable build identifier",
  "graphSha256": "64 lowercase SHA-256 hex characters",
  "configSha256": "64 lowercase SHA-256 hex characters"
}
```

The deployment must pin these independently inventoried artifacts. An operator-controlled gateway must attach `X-Petrol-Routing-Build` to **every** route, trace and locate response. Its value is SHA-256 of UTF-8 `JSON.stringify` of the validated manifest in the order above, with no whitespace. This is an additional Petrol Partner deployment contract, **not a stock Valhalla header**. The gateway must serve an immutable graph/engine/configuration and derive its manifest from the actual artifacts; a manually copied header on a mutable service does not establish provenance. Every response is checked against the configured pin, including requests spanning a deployment change. HTTPS authenticates the configured host; this header is an operator attestation, not independent cryptographic proof of the graph's contents. No production gateway has been validated here. The local real-engine rehearsal described below supplies this header only inside its test harness.

There is a ten-second deadline across all three provider calls, two in-flight jobs per API process, no queue, a two-million-byte limit per response and at most 5,000 geometry points. Multiple API processes would multiply the limit; the hosting ticket must enforce the total routing-instance budget at its gateway or use a single API process. Non-success HTTP, missing/mismatched build headers, redirects, timeout, warnings, malformed data and unreconciled distances fail closed. An unavailable provider never modifies existing accepted terms.

The normalized distance is summed rounded edge metres, allocated to saved shape segments with the policy's reconciliation guards. Persist engine/OSM/graph/configuration provenance, costing, normalization version, edge-to-shape correspondence, geometry, cumulative metres, original selections and confirmed endpoints in the same protected operation as the route, audit and notification work. Migration 0043 adds nullable evidence without updating historical records. Snapshot serialization omits this new key when NULL, preserving the equality of historical signed receipts; restoration of older snapshots populates NULL.

## Driver confirmation

Authenticated `POST /v1/posted-routes/preview` accepts the existing preparation fields, checks the driver's declarations and schedule, and returns private route geometry, provenance and a `preview_digest`. It makes no durable offer or boundary-approval claim. `boundary_verified` is false. The driver must inspect the actual routed endpoints and confirm safe, legal stopping places on the correct side and direction; bike/scooter stops also require helmet space. This is a declaration, not independent certification of a stopping place.

Preparation uses the same input plus:

```json
{
  "endpoint_confirmation": {
    "preview_digest": "digest from the preview",
    "origin": [77.75, 20.9],
    "destination": [77.765, 20.9],
    "safe_stopping_places": true,
    "correct_side_and_direction": true,
    "helmet_space": true
  }
}
```

The coordinates shown here are examples, not approved stops. The server reroutes and requires the digest and endpoints to match. A changed graph, geometry, duration or provenance requires a new preview/confirmation. The request idempotency digest includes the confirmation; successful retries read the existing operation even if routing is later unavailable. The preview digest binds content; it is not an authorization token. The protected transaction rechecks current declarations, support coverage, holds and overlapping commitments.

Both selected endpoints must be no more than 30 spherical metres from their routed positions. Locate candidates must identify one physical way/projected position; opposing directed edges at the same position are collapsed, while competing ways/projections are rejected. The route's side-of-street must agree with its endpoint edge's driving side. Missing side information is tolerated only within 0.2 m of the saved point to account for polyline precision. The saved geometry must also make a single continuous pass away from each endpoint: short adjacent shape segments are permitted, but a return toward the stop or re-entry into its 30 m neighbourhood is rejected. Both requested and routed points are checked. Passenger matching remains unchanged. These deliberately conservative checks may reject stops near intersections; choose a new point rather than relax them without evidence. A map match cannot establish legal stopping safety.

## Synthetic boundary implementation

The checker now executes the approved geometry rules using invented Polygon-as-single-part and MultiPolygon fixtures. It validates closed non-degenerate rings, rejects intersections/overlapping components and misplaced/nested holes, preserves islands inside holes, and indexes boundary segments for local clearance/intersection checks. Both requested and confirmed routed endpoints must be strictly inside and outside the artifact's uncertainty band. Longitude/latitude coordinates are normalized to `OGC:CRS84`; the supported computation extent is 70–85 E, 10–25 N. That extent bounds numerical behavior and is not an authoritative state boundary.

Clearance uses a conservative 100,000 metres per coordinate degree within that extent, expanding the supplied uncertainty band relative to local geographic axis scales. Fixture values are not an approved Maharashtra uncertainty band. A route vertex on or near the boundary, a collinear overlap, tangency, vertex crossing, near-border passage or excursion too narrow to classify beyond the band fails closed. Proper transverse crossings may proceed when the separated intervals can be classified unambiguously.

Every shape segment with an outside interval contributes its **entire saved cumulative-metre delta**. Every provider edge covering any such segment contributes its **entire elapsed-time delta**, rounded upward and counted once, including all its inside portions and transition time. This is an upper bound, not interpolated time or an exact measurement of the outside portion. It may conservatively reject an otherwise shorter excursion. All excursions accumulate; limits are inclusive at 5,000 m and 600 s. The existing 50 km/90 minute route caps remain unchanged.

The adapter requests and retains `node.elapsed_time` from [Valhalla trace attributes](https://valhalla.github.io/valhalla/api/map-matching/). Polygon verification requires complete contiguous edge coverage, positive elapsed-time increments and a final rounded time equal to the saved route duration. Missing or inconsistent timing rejects publication even for an otherwise contained route. Old saved evidence is never recalculated. New evidence uses calculation version `boundary-whole-segment-upper-bounds-2026-10-04.1` and retains archive/geometry hashes, source/normalized CRS, transformation, validation/reuse references, uncertainty band and affected segment indexes.

Artifact processing and route computation have bounded work. Invalid/missing artifacts fail with `BOUNDARY_UNAVAILABLE`; unverifiable route geometry, timing or exceeded excursion limits fail with `BOUNDARY_INVALID`. Full-scale acceptance still requires testing the selected SOI artifact within those bounds.

There is **no production artifact loader or approval flag** in this change. The fixture setter requires `NODE_ENV=test`; verification independently checks that runtime condition, so retained fixtures cannot enable production. The legacy numeric test dependency remains for its original limit-contract regression only. The existing Valhalla persistence, rollback, audit and recovery tests now use computed polygon evidence.

## Remaining ticket 10 checks — artifact-dependent only

1. Establish and retain reuse rights for the selected SOI source and its derived server-side artifact. The [authorized request](evidence/ticket10-local-artifacts-2026-10-03.md#permission-request-send-record) was sent; no permission is inferred.
2. Approve the deployable artifact's exact archive/normalized checksums, source CRS and coordinate transformation, Maharashtra attributes, complete topology, and justified uncertainty band. Initial local inspection is recorded but is not production approval.
3. Integrate that reviewed, pinned artifact and validate real endpoint/border/hole/multipart/crossing cases, cumulative upper bounds and bounded processing at actual geometry scale through authenticated HTTP/PostgreSQL. Reject missing or mismatched evidence before any new publication.

Ticket 10 remains claimed. Hosting, production gateway, staging, external review, deployed recovery and the real-booking decision retain their existing tickets. No migration is deployed and passenger booking gates remain closed.

## Review and validation

The implementation was reviewed against `main` using separate Standards and Spec reviews. Review found an endpoint repeated-pass gap; an authenticated regression reproduced it. A first correction exposed false rejection of dense straight geometry; a second regression reproduced that. The final endpoint-specific check passes both regressions and leaves passenger segment matching unchanged. Both reviewers report no remaining actionable findings; the boundary and real-provider blockers above remain uncompleted requirements.

`npm run typecheck`, `npm run api:build`, and `git diff --check` pass. `npm run lint` passes with nine pre-existing warnings. HTTP/PostgreSQL checks run only against a newly created disposable local PostgreSQL 16 instance, never a deployed database. They use controlled Valhalla HTTP responses and an explicitly test-only boundary dependency. The existing protected route tests also exercise saved-route segment interpolation/rounding, authorization, schedule/support limits, overlapping commitments, notifications, audit and receipt restoration.

Before the local-artifact continuation, `npm test` (wrapped in `caffeinate -i` to avoid idle suspension) passed: 38 script checks, 379 API tests and 19 worker tests; 10 script checks and one API live-provider test were skipped. The final API run includes all 180 authenticated HTTP/PostgreSQL cases. Earlier runs experienced a connection reset and unusually long wall-clock timeouts; the final complete run exited zero. That earlier result did not cover an actual Valhalla engine or SOI geometry inspection. Current continuation evidence is recorded below; production hosting and boundary containment still remain unverified.

## Local artifact continuation

The [2026-10-03 inspection](evidence/ticket10-local-artifacts-2026-10-03.md) supersedes the earlier incomplete-download and no-current-local-provider observations. The optional actual-provider cases exercise all three modes, cumulative metres, explicit endpoint confirmation, ambiguous and side-filter fallback rejection, and fail-closed publication without boundary evidence through authenticated HTTP/PostgreSQL. They do not use the synthetic boundary dependency. The original controlled-provider persistence, retries, rollback, audit and recovery tests remain in place. No production verification rule was relaxed.

Final continuation validation: `npm test` with the opt-in local Valhalla environment passed **38 script checks, 382 API tests (including all 183 authenticated HTTP/PostgreSQL cases), and 19 worker tests**; ten script checks and one unrelated API live-provider check were skipped. Root typechecking, API build and whitespace checks passed; lint passed with nine pre-existing warnings. The preceding full run encountered one `ECONNRESET` in an existing acceptance test; that case passed in isolation and the complete final rerun exited zero. Standards and Spec continuation reviews each reported zero actionable findings. The reviewers inspected code/evidence but did not independently reproduce the artifact build. Ticket 10 remains claimed and real bookings remain disabled.

## Synthetic polygon continuation — 2026-10-04

See the [dated boundary evidence](evidence/ticket10-synthetic-boundary-2026-10-04.md) for the current cases and verification results. This supersedes the earlier statement that polygon logic was unimplemented. Actual SOI adoption remains the only ticket 10 acceptance dependency; preliminary artifact inspection and synthetic fixtures do not satisfy it.

## Final validation — 2026-10-04

`npm test` passed with the opt-in local Valhalla environment: **38 script checks, 407 API tests (all 208 authenticated HTTP/PostgreSQL cases), and 19 worker tests**. Ten script checks and one unrelated API live-provider check were skipped. The local graph is identified by the previously recorded immutable manifest; all database tests used a newly created disposable PostgreSQL 16 database. No deployed data was used.

`npm run typecheck`, `npm run api:build` and `git diff --check` passed. `npm run lint` passed with nine pre-existing warnings. Standards review found one uncounted topology-work path, reproduced and fixed with an authenticated red/green regression; its final review has zero actionable findings. Spec review, including the updated artifact-only checklist, has zero actionable findings. Reviews did not independently recreate the external artifact build. Ticket 10 remains claimed and the PR remains draft.
