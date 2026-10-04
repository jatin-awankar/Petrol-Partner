# Ticket 10 — Amravati core implementation and local validation

## Decision and remaining gate

The maintainer explicitly approved implementation and local validation of the Amravati core successor scope on 2026-10-04. This supersedes statewide coverage for this release only. It does **not** attest completion of the meeting-place or local-route review. Ticket 10 remains **claimed**; `operator-review.json` remains `pending`, so normal route publication fails with `BOUNDARY_UNAVAILABLE`. Real bookings remain disabled independently.

The [single operator checklist](ticket10-amravati-operator-review-2026-10-04.html) combines all coverage, meeting-place, route and edge previews. Its form only prepares text for the operator to send back; it cannot write an approval or enable the application. The operator must actually review the named examples, supply local place names and review basis/date, record concerns or rejection, and explicitly approve the exact area/hash/rule and evidence bundle if satisfactory. If candidates are unsuitable, replace and re-preview them before final sign-off. No approval has been inferred from implementation authorization.

## Artifact and enforcement

- Artifact: `apps/api/src/modules/posted-routes/service-area/amravati-core-v1.json`, exactly 113 UTF-8 bytes, no newline. SHA-256 `b342438fbb8aecf2e3f5cf82cf1ddfa2ea7d6ae02343e3319a41220b1d4eb42c`.
- Original numerical business limits, independently authored in the approved proposal: west/east 77.73/77.83; south/north 20.89/20.97. OGC:CRS84 longitude/latitude; identity transformation; one convex rectangular shell, no holes or components omitted from this **business definition**. It is neither an administrative dataset nor a claim about actual-ground positional accuracy. No SOI/geoBoundaries geometry or licence is used for this artifact. The repository owner approved using these original coordinates for this implementation; no third-party boundary attribution/share-alike obligation is introduced by them.
- Exact bytes are packaged by the API build and checked at runtime against the hard-coded hash. No network acquisition, paid service, rolling dataset or environment approval flag is involved. The original approved bytes in the proposal and repository permit reproducible acquisition without a third-party download. Changes to any limit require a new area/version decision.
- New route policy `unrestricted-route-contribution-2026-10-04.1`; operating policy `2026-10-04.1`; area identity `amravati-core-v1`; calculation `amravati-convex-microdegree-envelope-2026-10-04.1`.
- Requested selections use exact decimal arithmetic over the canonical parsed number spelling to enclose `[floor(10^6*x)-1, ceil(10^6*x)+1]`. Decoded polyline6 points must have exact integer-microdegree representation before ±1. Both axes' entire envelopes must be strictly inside. No binary floating-point multiplication decides threshold eligibility.
- Both requested and confirmed endpoints and every saved vertex pass. Convexity of the immutable rectangle proves containment of every linear saved segment and its interpolated envelope. This proof is deliberately inapplicable to a changed concave polygon/hole/component definition. Zero exit/re-entry, edge touch or overlap is allowed. A one-quantum-inside point rejects; two quanta inside can pass. The guard is numerical precision only, not a GPS, road-map or administrative error band.
- At most 5,000 route vertices and 4,999 provider edges; O(n) vertex/timing work, bounded number spellings, fixed 113-byte geometry. No expensive polygon repair, reprojection, external geometry library or new infrastructure. Provider normalization/timing integrity, 30 m endpoint confirmation, 50,000 m / 5,400 s inclusive caps and existing business controls remain unchanged.
- The review record must name the exact area, geometry, calculation, review-evidence hash, approver, timestamp, all three categories and actual coverage/meeting-place/route/limitations acknowledgements plus the actual review notes (including place names and review basis). Missing, malformed or mismatched records reject. Test approvals are labelled `synthetic-test-only` and consulted only in the test runtime; retaining them in memory cannot enable production.
- Evidence is frozen in the existing route verification JSON, audit-linked operation snapshot and independent signed receipt. The preview digest also binds the service-area identity/rule. Existing operation retries bypass new calculation and preserve their original result. No schema/data migration or recalculation of historical rows was added.

## Actual local previews and operator evidence

Packaged review evidence: `apps/api/src/modules/posted-routes/service-area/review-evidence.json`, SHA-256 `facb093f9b25e7ea2a6bb883d5c5cbe7549a950702acf679f951cc65cad034c2`. Prepared from the pinned local engine, not synthetic geometry or invented route responses. It contains five central/quarter candidate map selections, eight full application-adapter previews (five candidate routes plus car/bike/scooter M1→M5), and four actual-engine rejected edge illustrations. All three category previews are **6,298 m / 417 s**, with 146 saved vertices. Other candidate routes extend into the other quarters. All eight saved application shapes pass the actual pinned-area checker.

Candidate points are suggestions for operator choice, not claimed legal/safe meeting places. The unchanged adapter rejected ambiguous or wrong-side trial points; these were not forced through. Raw edge illustrations cross west/east/south/north and are ineligible; they are clearly distinguished from successful application previews and do not attest their other endpoint checks. The checklist shows exact requested/routed coordinates, complete saved shapes and contextual map links. Field/local review is still absent. This finite sample establishes neither every road's suitability nor actual-ground containment.

Road-derived previews retain © OpenStreetMap contributors attribution and the [ODbL reference](https://www.openstreetmap.org/copyright). They remain separate from the original business rectangle. Provider/geospatial reuse findings and original source acquisition details remain in [the local artifacts evidence](ticket10-local-artifacts-2026-10-03.md). No third-party map imagery was copied into the checklist; its diagram is a coordinate plot. The contextual links allow the operator to inspect current streets, with differences recorded rather than treated as accuracy proof.

Reproduction (from repository root, with the retained pinned local graph serving on loopback port 18002):

```sh
node_modules/.bin/tsx scripts/prepare-ticket10-amravati-review.ts
python3 scripts/render-ticket10-amravati-review.py
```

The preparation script refuses to overwrite an already approved review bundle. Rerunning while pending changes the prepared timestamp/evidence hash and requires presenting the regenerated checklist; never silently replace the bundle named in a review. The engine-version check and locally supplied manifest header are rehearsal evidence only, not a production gateway attestation.

Retained artifacts rehashed in this validation: tiles `5fae44074a40b2bef27fd4adf9360bf2f46d7343053bbfd9bd548df9f4b0ee40`; admins SQLite `16573d861401d27c9a784fba70457f33eedeb921556a52649ef7b3d9804db725`; config `3c480f41c0f0d07e596463f633d92b6198aa82d9dbb6c268c2f3e824acdcc5e4`. The [immutable engine/graph manifest](ticket10-local-valhalla-manifest-2026-10-03.json) and image digest remain unchanged. Containers use loopback-only ports and the routing graph is mounted read-only; no live traffic archive exists.

## Validation record

The built API was also checked in `NODE_ENV=production`: all eight recorded actual routes passed coordinate/timing evaluation in 5.36 ms total in one local smoke run (observation, not a performance guarantee); the packaged pending review correctly returned `BOUNDARY_UNAVAILABLE`. Source and built artifact/evidence hashes match byte-for-byte. The checklist route selector and pending-note preparation were exercised in the browser; no operator boxes were checked or actual review submitted.

Final results on 2026-10-04:

- `npm test` with the opt-in local Valhalla environment: **38 script checks, 451 API tests (including all 226 authenticated HTTP/PostgreSQL cases), 19 worker tests passed**. Ten unrelated opt-in script checks and one unrelated API live-provider test were skipped.
- `npm run typecheck`, `npm run api:build`, source/built SHA-256 comparison and `git diff --check` passed. `npm run lint` passed with nine pre-existing warnings.
- New area tests cover all three modes with both controlled responses and actual local Valhalla, requested/routed endpoints, whole-route exit/re-entry/touch/precision rejection, outside selections snapped inside, exact edge/one-quantum rejection and two-quantum acceptance, invalid pins/review/version/rule, retained test approvals in production, original-result retries, full historical booking-row preservation, timing integrity and unchanged distance/time caps. Existing authorization, concurrent overlap, audit/notice rollback and signed-receipt restoration cases now also exercise the actual area with synthetic approval. Historical synthetic administrative-geometry tests remain separate evidence.
- Initial test runs exposed assertion mistakes (provenance is obtained through the authenticated read, the booking-enabled flag is a response field, and retries preserve the existing 201 response). These assertions were corrected; the final complete run exited zero. No product behavior was loosened to make the tests pass.

Final full-suite invocation, using only the newly created disposable local test database:

```sh
DATABASE_URL=postgresql://postgres:ticket10-local@127.0.0.1:55432/petrol_partner_test \
VALHALLA_REHEARSAL_URL=http://127.0.0.1:18002 \
VALHALLA_REHEARSAL_MANIFEST="$PWD/docs/operations/evidence/ticket10-local-valhalla-manifest-2026-10-03.json" \
npm test
```

All database execution uses the newly created, disposable `petrol-ticket10-amravati-db` PostgreSQL 16 container, never a deployed database. Approval-success cases use an explicitly synthetic review fixture; they are not the missing operator attestation.

## Exact next action

Jatin reviews the **single operator checklist**, returns actual per-place/per-route/edge notes and a decision bound to the displayed hashes. After a satisfactory actual review is recorded, bind that record to the exact evidence bundle, rerun the authenticated gate/recovery checks, and resolve ticket 10 only if every remaining criterion passes. A generic implementation approval cannot substitute for that review. No deployment, real-booking activation, ticket-11 implementation or external contact is part of this work.

## Subsequent operator attestation

The [operator has now explicitly approved and marked the checklist reviewed](ticket10-amravati-operator-attestation-2026-10-04.md). This supersedes the earlier statement that no actual operator review was attested. Required review metadata remains incomplete (date, contextual map/provider, M1–M5 names and review basis), so the packaged gate remains pending and ticket 10 claimed. Approval itself need not be repeated.

## Latest clarification — synthetic sample only

The latest [user submission](ticket10-amravati-synthetic-review-sample-2026-10-04.md) is explicitly synthetic and states that all real-world locations and route suitability remain unverified. It does not satisfy actual operator evidence or merely complete its metadata. The original pinned artifact and review-bundle hashes remain unchanged. Ticket 10 stays claimed; publication remains unavailable and real bookings disabled.

## Actual map review supplied subsequently

Jatin has now supplied the [actual map-based review](ticket10-amravati-actual-review-2026-10-04.md), dated 4 October 2026 at 12:00 PM IST, naming Google Maps, all five places, category/edge findings and approval. No field visit is asserted. This supersedes earlier statements that real review evidence remains missing; synthetic samples remain separately labelled and unused as real evidence. The actual packaged record passed its final local acceptance checks; ticket 10 is now resolved for Amravati core. See the linked actual-review evidence.
