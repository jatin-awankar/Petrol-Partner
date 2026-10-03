# Ticket 10 synthetic boundary evidence — 2026-10-04

The maintainer authorized implementation using synthetic polygons and authenticated HTTP/PostgreSQL tests, with production remaining closed until the selected SOI artifact is verified and reusable. Ticket 10 remains claimed. No SOI geometry was installed, historical route terms rewritten, deployed migration run or real-booking capability enabled.

## Scope and calculation

`boundary-geometry.ts` performs topology, strict containment, uncertainty and route intersection checks on normalized longitude/latitude multipolygons. The fixtures are hand-built rectangles, holes, triangles and disjoint components, not approximations of Maharashtra. No provider administrative label or geographic bounding box substitutes for the polygon. The computation's broad coordinate extent only bounds its numerical assumptions.

Both the selected and confirmed routed endpoints must be inside the polygon and clear of its uncertainty band. Crossings are inspected between saved vertices, including an excursion through a hole when both vertices are inside. Touches, overlaps, vertex contacts, near-border passages and intervals not distinguishable beyond the supplied uncertainty band fail closed. Ring winding does not determine inside/outside; topology and shell/hole membership do.

The saved route's integer-metre increments are authoritative. A segment containing any outside interval is charged in full. The elapsed time of every provider edge containing any charged segment is also charged in full, rounded up and counted only once. These conservative upper bounds include the uncertain crossing portions and never derive time from distance. Totals across all excursions may not exceed 5,000 metres or 600 seconds. Entirely contained routes contribute zero, but still require complete, monotonic timing reconciled with the saved duration.

The `node.elapsed_time` response is requested explicitly from [Valhalla](https://valhalla.github.io/valhalla/api/map-matching/). The pinned local 3.9.0 engine successfully returned strictly increasing edge times reconciling with route duration for car, bike and scooter in the opt-in authenticated rehearsal. Its build header is still a test-harness attestation, not a production gateway claim; the [recorded manifest](ticket10-local-valhalla-manifest-2026-10-03.json) identifies that rehearsal.

Boundary evidence is part of the existing `route_verification` JSON snapshot and therefore the same transactional operation and independent signed receipt. It includes artifact identifiers, archive and geometry checksums, CRS/transformation, validation/reuse references, uncertainty band, effective policy version, calculation version, charged shape segments and crossing count. No schema migration is needed. Historical snapshots are unchanged.

## Authenticated regression evidence

- Inside endpoints and polygon evidence persistence; successful retries still use saved results after provider/boundary loss.
- Selected point outside but snapped point inside, and the converse; boundary points, uncertainty-band points and endpoints in holes are rejected.
- A hole crossed between saved vertices is detected. In the worked fixture only shape segment 1 is charged: 520 m and its complete 120-second provider edge, although the edge spans another inside segment.
- Disjoint multipart excursions pass at 4,999 m/599 s and at the inclusive 5,000 m/600 s upper bounds; 5,001 m or 600.1 seconds rejects. Two separate excursions accumulate, including rejection when either cumulative total exceeds its cap.
- Two excursions in one provider edge charge the edge only once: the fixture charges 1,040 m and 181 seconds, rather than twice its 180.1-second elapsed time.
- Missing, nonmonotonic and route-duration-inconsistent edge timing rejects verification.
- Wrong hashes, malformed coordinate systems/provenance, swapped coordinate order, open or self-intersecting rings, overlapping components and misplaced holes fail closed.
- Client-supplied boundary approval is rejected by HTTP validation. Retained test artifacts are rejected when the runtime is production.
- Existing all-mode persistence, private reads, authorization, concurrent overlap, audit/notice rollback and receipt restoration cases now use computed polygon evidence instead of a numeric boundary stub.
- A pathological artifact with 900 detailed disjoint squares exposed uncounted topology-containment work during Standards review. The authenticated regression failed before correction (publication succeeded), then passed with `BOUNDARY_UNAVAILABLE` once every containment ring-edge visit was charged to the same work limit.

Initial targeted run: 31 HTTP/PostgreSQL cases passed. The three actual-engine mode/timing cases passed separately. The work-budget regression passed after its red/green correction. Final suite/check results are recorded below.

## Remaining artifact-dependent checks

1. Establish the applicable reuse rights and retain their reference. The SOI permission request has been sent; a request is not a licence.
2. Adopt the actual deployable source/derived artifact with verified archive and normalized checksums, source CRS/transformation, Maharashtra attributes and topology, and derive its uncertainty band from validated accuracy. The fixtures' numerical bands provide no source-accuracy evidence.
3. Install only that pinned reviewed artifact in the production path and validate the checker against its real endpoint, border, hole, multipart and crossing geometry, representative route timing, and full-scale work bounds. Production must stay unavailable until this adoption and its tests pass.

The checker has no production loader or environment approval switch. The test-only injection and independent runtime gate prevent synthetic metadata from enabling publication. Hosting, staging, production gateway, external review, deployed restoration and real-booking approval retain their existing ticket ownership and are not appended to ticket 10's remaining acceptance checklist.

## Final validation — 2026-10-04

`npm test` passed with the opt-in local Valhalla environment: **38 script checks, 407 API tests (all 208 authenticated HTTP/PostgreSQL cases), and 19 worker tests**. Ten script checks and one unrelated API live-provider check were skipped. The local graph is identified by the previously recorded immutable manifest; all database tests used a newly created disposable PostgreSQL 16 database. No deployed data was used.

`npm run typecheck`, `npm run api:build` and `git diff --check` passed. `npm run lint` passed with nine pre-existing warnings. Standards review found one uncounted topology-work path, reproduced and fixed with an authenticated red/green regression; its final review has zero actionable findings. Spec review, including the updated artifact-only checklist, has zero actionable findings. Reviews did not independently recreate the external artifact build. Ticket 10 remains claimed and the PR remains draft.
