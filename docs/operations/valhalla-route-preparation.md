# Ticket 10 Valhalla route preparation

Implementation uses route policy `unrestricted-route-contribution-2026-10-03.2` and operating policy `2026-10-03.2` for newly prepared routes only. It does not enable discovery or real bookings. Ticket 10 remains claimed: actual Maharashtra boundary enforcement cannot yet be evidenced.

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

## Exact remaining blockers

1. A complete SOI archive has now been downloaded, hashed and inspected: Maharashtra attributes, multipart/hole topology and the actual source-WKT transformation passed initial checks. See the [dated artifact evidence and prepared permission request](evidence/ticket10-local-artifacts-2026-10-03.md). The maintainer has no existing permission, and dataset-specific reuse rights remain unresolved. No reusable application artifact or justified uncertainty band is available. Do not install the temporary inspection geometry, a bounding box or an OSM/geocoder administrative label. Production preparation returns `BOUNDARY_UNAVAILABLE` after confirmation.
2. Endpoint containment for requested **and** routed points, boundary/uncertainty rejection, holes, multipart geometry, crossing intersections and cumulative outside-state geometry/timing remain unimplemented and unverified pending that artifact. The test-only boundary dependency exercises evidence limits (5,000 m and 600 seconds inclusive), not actual containment. Missing timing fails closed; no proportional duration estimate is approved for crossings. Ticket 10 cannot resolve without these tests and evidence.
3. A pinned local Valhalla engine and western-India graph are now inventoried for an opt-in actual-response compatibility rehearsal. The test harness supplies the build header; this is not evidence of a production gateway or reliable host. Pilot-readiness 07 owns hosting; ticket 16 owns actual-provider, road restriction, gateway, licence/attribution and staging evidence; ticket 17 owns deployed outage/rebuild/restoration evidence. No public demo fallback or new paid infrastructure was used.
4. Ticket 03 retains external operating/rate review; ticket 18 retains the explicit real-booking decision. This change does not deploy a migration or alter those tickets. Passenger quote/booking APIs retain their existing production gates.

The existing `synthetic-test` adapter and the boundary fixture setter are restricted to `NODE_ENV=test`. Synthetic legacy lifecycle fixtures remain usable without inventing production boundary evidence.

## Review and validation

The implementation was reviewed against `main` using separate Standards and Spec reviews. Review found an endpoint repeated-pass gap; an authenticated regression reproduced it. A first correction exposed false rejection of dense straight geometry; a second regression reproduced that. The final endpoint-specific check passes both regressions and leaves passenger segment matching unchanged. Both reviewers report no remaining actionable findings; the boundary and real-provider blockers above remain uncompleted requirements.

`npm run typecheck`, `npm run api:build`, and `git diff --check` pass. `npm run lint` passes with nine pre-existing warnings. HTTP/PostgreSQL checks run only against a newly created disposable local PostgreSQL 16 instance, never a deployed database. They use controlled Valhalla HTTP responses and an explicitly test-only boundary dependency. The existing protected route tests also exercise saved-route segment interpolation/rounding, authorization, schedule/support limits, overlapping commitments, notifications, audit and receipt restoration.

Before the local-artifact continuation, `npm test` (wrapped in `caffeinate -i` to avoid idle suspension) passed: 38 script checks, 379 API tests and 19 worker tests; 10 script checks and one API live-provider test were skipped. The final API run includes all 180 authenticated HTTP/PostgreSQL cases. Earlier runs experienced a connection reset and unusually long wall-clock timeouts; the final complete run exited zero. That earlier result did not cover an actual Valhalla engine or SOI geometry inspection. Current continuation evidence is recorded below; production hosting and boundary containment still remain unverified.

## Local artifact continuation

The [2026-10-03 inspection](evidence/ticket10-local-artifacts-2026-10-03.md) supersedes the earlier incomplete-download and no-current-local-provider observations. The optional actual-provider cases exercise all three modes, cumulative metres, explicit endpoint confirmation, ambiguous and side-filter fallback rejection, and fail-closed publication without boundary evidence through authenticated HTTP/PostgreSQL. They do not use the synthetic boundary dependency. The original controlled-provider persistence, retries, rollback, audit and recovery tests remain in place. No production verification rule was relaxed.

Final continuation validation: `npm test` with the opt-in local Valhalla environment passed **38 script checks, 382 API tests (including all 183 authenticated HTTP/PostgreSQL cases), and 19 worker tests**; ten script checks and one unrelated API live-provider check were skipped. Root typechecking, API build and whitespace checks passed; lint passed with nine pre-existing warnings. The preceding full run encountered one `ECONNRESET` in an existing acceptance test; that case passed in isolation and the complete final rerun exited zero. Standards and Spec continuation reviews each reported zero actionable findings. The reviewers inspected code/evidence but did not independently reproduce the artifact build. Ticket 10 remains claimed and real bookings remain disabled.
