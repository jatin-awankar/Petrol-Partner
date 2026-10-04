# 10: Publish a server-verified route for a declared driver

**What to build:** A driver with current adult and driver–vehicle declarations can prepare and inspect an offer on a server-verified posted route with departure, deadline, and whole-ride capacity. Route verification does not imply verified identity or documents.

**Blocked by:** 02 (Approve route and contribution rules); 04 (Approve operating and support policy); 05 (Inventory deployed data and plan the migration); 06 (Close legacy booking and payment entry points); 08 (Register individual driver–vehicle declarations).

**Status:** claimed

- [ ] The server owns and versions the posted route and rejects invalid geometry, mode, vehicle, schedule, support window, and overlapping commitments. The pinned Amravati core and no-exit implementation are present; actual operator review and its final checks remain below.
- [x] Publication, reads, and operator audit distinguish the new route policy from historical corridor offers; real-booking exposure stays disabled.
- [x] Authenticated HTTP/PostgreSQL tests cover authorization, idempotency, rollback, route-service failure, overlap, and recovery evidence.

## Implementation — 2026-10-04

**Historical pre-Amravati implementation record.** The successor decision and current status follow below.

The work continues on `codex/10-valhalla-route-publication` in draft [PR #83](https://github.com/jatin-awankar/Petrol-Partner/pull/83). The maintainer explicitly authorized implementing boundary rules against synthetic polygon fixtures while retaining fail-closed production behavior. This is not approval of the actual SOI artifact or a scope amendment resolving the ticket.

Implemented and exercised through authenticated HTTP/PostgreSQL:

- Self-hosted Valhalla `auto` for cars and `motorcycle` for bikes/scooters; route/engine/graph provenance, cumulative integer metres, bounded failures and explicit safe endpoint confirmation within 30 m. Local real-engine rehearsals pass for all three categories, including the provider elapsed-time field.
- Polygon and multipart containment of requested and confirmed endpoints, preservation of holes, uncertainty clearance, rejection of ambiguous/tangent/collinear/near-border crossings, and cumulative outside-state bounds across the saved route.
- Conservative excursion accounting: charge the entire saved shape-segment distance for a segment that travels outside, and the entire provider edge elapsed-time delta for any affected edge, counted once and rounded up. Reject totals above 5,000 m or 600 s. Missing, nonmonotonic or duration-inconsistent timing rejects verification; no time is inferred from distance.
- Artifact shape, normalized coordinate order/extent, checksum, provenance fields, topology and bounded computation checks. Test fixtures are invented geometry; passing these checks does not grant SOI reuse rights or install production data.
- Immutable boundary provenance and calculation version in the existing route verification snapshot, audit-linked operation and signed receipt. Successful retries and recovery preserve their original evidence. Historical rows, policy versions and receipt formats remain unchanged.

New routes retain policy versions `unrestricted-route-contribution-2026-10-03.2` and `2026-10-03.2`. Production publication still returns `BOUNDARY_UNAVAILABLE`, including when a test artifact was previously retained in memory. No client payload, environment approval flag or test metadata can enable it. Real bookings remain disabled.

## Remaining acceptance checks — Amravati core scope

1. The approved original `amravati-core-v1` geometry is now packaged exactly, with pinned SHA-256, CRS84 order, one-shell/no-hole definition and original authorship/rights. **Pending:** retain the actual operator coverage-review approval bound to the exact hash, rule and review bundle; a synthetic approval fixture or environment flag is insufficient.
2. The implementation now enforces the scope decision's strict endpoint and complete-route containment using validated coordinate-precision envelopes. Reject every outside segment, exit/re-entry, touch or ambiguity; preserve requested/confirmed endpoint checks, 30 m confirmation, timing integrity, 50 km/90-minute caps and existing business controls. Do not install SOI/geoBoundaries or assert administrative/physical-location accuracy.
3. The pinned artifact is integrated through a fail-closed production boundary path; approval remains pending and real bookings disabled. Local authenticated HTTP/PostgreSQL cases cover for interior/border/outside/precision/snap cases, all modes, failures, version/hash tampering, authorization, idempotency, concurrency, audit/notice rollback and receipt recovery. Preserve old snapshots/policy versions and reject unavailable/mismatched evidence for new operations.

The exact scope, numerical rule, operator review and acceptance matrix are in the [Amravati core decision](../../../docs/operations/proposals/amravati-core-service-area-2026-10-04.md). The administrative-state dataset requirement is superseded only for new local routes by an explicit product-scope change. Statewide research is retained unresolved; none of these three acceptance checks is transferred to ticket 11 or staging. Status remains **claimed** until all pass.

Hosting, immutable production gateway, staging, external operation/rate review, release migration, deployed recovery and real-booking approval keep their existing owners; they are not added to ticket 10's remaining checklist. Passenger discovery, segment quotes, requests/acceptance and outcomes retain their existing tickets and production gates.

## Evidence and history

- [Adapter and boundary implementation contract](../../../docs/operations/valhalla-route-preparation.md).
- [Synthetic boundary implementation and validation](../../../docs/operations/evidence/ticket10-synthetic-boundary-2026-10-04.md).
- [Complete local SOI inspection, pinned Valhalla build and SOI request send record](../../../docs/operations/evidence/ticket10-local-artifacts-2026-10-03.md).

The original isolated route preparation, migration 0043, endpoint repeated-pass correction and dense-geometry regression remain in branch history. Earlier numeric boundary stubs established only limits; the 2026-10-04 tests now execute polygon geometry. Neither those tests nor the preliminary SOI inspection resolve actual-artifact adoption. Ticket 10 remains **claimed**.

## Historical pre-Amravati validation — 2026-10-04

`npm test` passed with the opt-in local Valhalla environment: **38 script checks, 407 API tests (all 208 authenticated HTTP/PostgreSQL cases), and 19 worker tests**. Ten script checks and one unrelated API live-provider check were skipped. The local graph is identified by the previously recorded immutable manifest; all database tests used a newly created disposable PostgreSQL 16 database. No deployed data was used.

`npm run typecheck`, `npm run api:build` and `git diff --check` passed. `npm run lint` passed with nine pre-existing warnings. Standards review found one uncounted topology-work path, reproduced and fixed with an authenticated red/green regression; its final review has zero actionable findings. Spec review, including the updated artifact-only checklist, has zero actionable findings. Reviews did not independently recreate the external artifact build. Ticket 10 remains claimed and the PR remains draft.

## Alternative-boundary investigation — 2026-10-04

PR #83 is now merged according to GitHub; its earlier draft wording is historical. This does not satisfy the remaining artifact criterion. Work continues on the existing ticket branch.

[Primary-source research](../../../docs/operations/evidence/ticket10-boundary-alternatives-research-2026-10-04.md) identifies geoBoundaries gbOpen/DataMeet as the strongest conditional reuse candidate. [Pinned local evaluation](../../../docs/operations/evidence/ticket10-boundary-candidate-evaluation-2026-10-04.md) passes topology/processing probes, but its unquantified positional shift and island/hole differences leave accuracy/completeness unresolved. No alternative currently satisfies the unchanged policy.

A [concrete source amendment](../../../docs/operations/evidence/ticket10-boundary-amendment-proposal-2026-10-04.md) is proposed for maintainer approval, not applied. It preserves the accuracy gate and all actual-artifact checks in this ticket. No arbitrary uncertainty band, replacement adoption, ticket-11 work, deployment or real-booking activation is authorized by this research. Status remains **claimed**.

## Candidate accuracy/completeness decision — 2026-10-04

The maintainer approved geoBoundaries for evaluation only and required evidence before any policy replacement or production integration. [The follow-up assessment](../../../docs/operations/evidence/ticket10-boundary-adoption-assessment-2026-10-04.md) finds two absent internal exclusions assigned to Karnataka in SOI, 81 entirely absent SOI components, an extra component substantially assigned to a union territory, and substantial coastal/outline differences. Primary administrative sources support enclave concerns, but no defensible candidate uncertainty band or complete corrected geometry was established.

Pinned comparison and direct checker probes pass as diagnostics; both absent-hole samples remain eligible even with a hypothetical 1,000 m band. This is evidence against adopting the candidate unchanged, not acceptance evidence. No replacement or buffer was approved or installed. Positional/completeness evidence and rights-cleared corrections remain required within ticket 10; otherwise an explicit product-scope/assurance decision is needed before further implementation. Ticket 10 remains **claimed**.

## Amravati core successor decision — 2026-10-04

The approved successor implementation scope is **Amravati core (`amravati-core-v1`)**, the independently authored WGS84 rectangle west/east 77.73/77.83 E and south/north 20.89/20.97 N. Geometry SHA-256: `b342438fbb8aecf2e3f5cf82cf1ddfa2ea7d6ae02343e3319a41220b1d4eb42c`. Both requested and confirmed endpoints and the entire saved route must pass the exact coordinate-precision rule in the [scope decision](../../../docs/operations/proposals/amravati-core-service-area-2026-10-04.md); **zero outside-area travel** is allowed. This verifies a business service area, not municipal/state boundaries or actual-ground location accuracy. Retain 50 km/90 minutes and all other eligibility, provider, rates, schedule, support, audit/recovery and real-booking gates. New implementation versions are route `unrestricted-route-contribution-2026-10-04.1` and operating `2026-10-04.1`; old terms remain frozen. This dated successor supersedes prior statewide source/accuracy/transit requirements for new local routes only; it does not establish that statewide research passed.

Historical SOI and geoBoundaries findings above retain their original meaning. The current implementation now uses the successor for new routes; actual operator coverage review remains pending and is not inferred from implementation approval.

## Approved local implementation — operator review pending

The maintainer explicitly authorized implementation and local validation of the Amravati core scope, while withholding any attestation that meeting-place/local-route review had occurred. The policy amendment is applied. The exact 113-byte artifact is packaged, and strict requested/routed endpoint and whole-route precision containment are implemented with immutable provenance, zero outside allowance and the unchanged 50 km/90-minute caps. New route versions are `unrestricted-route-contribution-2026-10-04.1` / `2026-10-04.1`. No historical data migration was performed.

[Implementation and validation evidence](../../../docs/operations/evidence/ticket10-amravati-implementation-2026-10-04.md) links the **single concrete operator checklist** with five candidate meeting places, full actual local-engine previews for all three vehicle categories and four rejected edge examples. The packaged operator record remains `pending`; only explicitly synthetic test approvals permit acceptance-test publication. Normal publication fails closed and real bookings remain disabled.

Remaining completion action: the operator must actually review that bundle and provide place names, review basis/date, concerns and an exact-hash decision. Record satisfactory actual review and rerun the authenticated approval/recovery checks before resolving. **Status remains claimed.** No part of this criterion is transferred to ticket 11 or staging.

Final local validation: **38 script checks, 451 API tests including all 226 authenticated HTTP/PostgreSQL cases, and 19 worker tests passed** with the opt-in actual local Valhalla environment. Ten unrelated script checks and one API live-provider test skipped. Typecheck, API build and diff whitespace checks passed; lint passed with nine pre-existing warnings. Built artifact and review bundle match the pinned source hashes; production-mode publication remains unavailable with the pending review. See the linked evidence for commands and test distinctions. This does not resolve the actual operator-review criterion.

## Operator approval received — review record supplement needed

Jatin supplied an explicit overall approval bound to the exact geometry/evidence/calculation hashes and marked all checklist items reviewed. The [attestation record](../../../docs/operations/evidence/ticket10-amravati-operator-attestation-2026-10-04.md) preserves the supplied notes and interprets the final approval as overriding the generated pending label. Do not request approval again. The required actual review date, contextual map/provider and M1–M5 local names/review bases were not supplied; request that record supplement without inventing it. Packaged verification remains pending, and ticket 10 remains **claimed** until the record is complete and actual-approval integration checks pass.

## Synthetic sample received — actual evidence still pending

The user explicitly labelled the latest [review sample](../../../docs/operations/evidence/ticket10-amravati-synthetic-review-sample-2026-10-04.md) **SYNTHETIC SAMPLE — NOT OPERATOR EVIDENCE**, approving only simulated checks and stating that all real-world locations and route suitability remain unverified. Preserve earlier correspondence, but do not use this sample to fill or satisfy the actual-review record. The outstanding requirement is actual operator evidence, not merely replacing sample names or adding a date. Ticket 10 remains **claimed** and the publication gate remains pending. No deployed state or booking capability changes.
