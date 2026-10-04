# Ticket 10 local candidate evaluation — 2026-10-04

Evaluation only. No production source, policy constant, database, loader or booking gate changed. Work continued on `codex/10-valhalla-route-publication`; pre-existing untracked worktrees were preserved. GitHub reports [PR #83](https://github.com/jatin-awankar/Petrol-Partner/pull/83) **MERGED**, contrary to its stale draft wording. Its remaining artifact checklist is still incomplete; merging did not resolve ticket 10.

## Reproduce acquisition and checks

Use the full commit below, not the mutable metadata API. The ordinary raw endpoint returned a Git LFS pointer; its object ID and byte size independently matched the downloaded media. The standalone GeoJSON is the acquisition unit for this evaluation; the advertised ZIP was not downloaded or adopted and no ZIP checksum is claimed.

```sh
curl -fL --retry 2 'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09592ced973a3448cf66b6100b741b64c0d/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1.geojson' -o /private/tmp/ticket10-india.geojson
node --import tsx scripts/evaluate-ticket10-boundary.ts /private/tmp/ticket10-india.geojson
```

The checked-in evaluator rejects incorrect source size/hash, CRS, feature identity or normalized hash before running geometry checks. Node v24.20.0 and repository tsx 4.21.0 were used. Input size 46,170,854 bytes; SHA-256 `47aa0acb6f69868daee49143276f3ce323f18905ba7d38d0a86816b405028736`. Normalize by selecting exactly one `shapeISO=IN-MH`, checking `shapeID=1811400B15614733245507`, retaining all coordinates without rounding, simplification or repair, wrapping Polygon if necessary in MultiPolygon, and UTF-8 `JSON.stringify({type:'MultiPolygon',coordinates})` with no trailing newline. Result SHA-256 `71ed889b914ce89fb134533c8c9f209dfbbc46f403db10744cca530906f7667d`.

Source explicitly declares `urn:ogc:def:crs:OGC:1.3:CRS84`; identity normalization retains longitude/latitude, with no reprojection. Bounds: 72.6546083840756–80.89835690879893 E, 15.606134148758692–22.033931074456316 N. Selected name is `Mahārāshtra`, administrative type ADM1. There are 72,274 vertices, 3 components and zero holes. Independent Shapely 2.0.7 `is_valid`/`explain_validity` returned true / Valid Geometry. No topology repair was attempted.

## Observed local results

- Full unmodified feature passed the current production geometry algorithm's compilation within its existing five-million-operation bound. Measured compile times for sensitivity runs were approximately 21–33 ms; these are local observations, not service latency guarantees.
- At each hypothetical 10, 100 and 1,000 m band: Amravati (77.75,20.9) and Mumbai (72.8777,19.076) passed; Hyderabad (78.4867,17.385) failed; one exact vertex from each component failed endpoint clearance.
- The invented straight Amravati segment remained inside with zero crossings. A dense 4,999-segment subdivision also completed within the per-route work budget at all three bands. This does not establish worst-case border-route throughput.
- Separate invented shell/hole geometry rejected a point in the hole, counted two transverse crossings, and rejected collinear ambiguity. The candidate contains no holes; synthetic holes cannot establish that omitted real holes are correct.
- Source bytes and normalized pins were verified by the executable evaluator. The downloaded geometry remains only in temporary storage; it is not an application artifact.

No hypothetical band establishes accuracy. The source's shift warning and structural differences from SOI prevent claiming that requested or routed endpoints are definitively inside Maharashtra near disputed/misaligned features. Actual-border route and timed-excursion HTTP/PostgreSQL acceptance remains pending source/accuracy approval and integration. The previously recorded authenticated suite has not been rerun or claimed as fresh actual-artifact evidence in this research-only change.

See the [primary-source research](ticket10-boundary-alternatives-research-2026-10-04.md) and [concrete pending amendment](ticket10-boundary-amendment-proposal-2026-10-04.md). Ticket 10 remains claimed; ticket 11 remains blocked by it.

## Change verification

`node --import tsx scripts/evaluate-ticket10-boundary.ts /private/tmp/petrol-ticket10-alternatives/india.geojson` passed all assertions. `npm run typecheck`, `npx eslint scripts/evaluate-ticket10-boundary.ts`, and `git diff --check` passed. No runtime implementation was changed; authenticated PostgreSQL actual-artifact checks remain unrun pending the stated decisions. No production data or external contact was used.
