# 11: Quote an ordered posted-route segment

**What to build:** A passenger can inspect the posted route, choose ordered pickup and drop-off points on it, and see a server-verified segment distance and contribution before requesting.

**Blocked by:** 02 (Approve route and contribution rules); 10 (Publish a server-verified route for a declared driver).

**Status:** resolved

- [x] The server matches safe points to the posted route and measures only the segment along that route, never an independently selected point-to-point route or client-supplied distance.
- [x] Show route version, distance, category rate, rounding, currency, integer-paise total, and zero additional charges; reject off-route, reversed, unsafe, stale, and unverifiable selections.
- [x] HTTP/PostgreSQL tests use controlled routing success and failure, including a case where independent point-to-point distance differs and rounding boundaries.

## Historical partial implementation note

The saved, versioned synthetic route now supports a driver-private test quote. The server matches ordered points against saved cumulative metres, rejects off-route and repeated-pass matches, checks the 30 m tolerance and 500 m minimum, and computes integer paise at the recorded category rate with half-paise-up rounding. A shared validator checks route shape at preparation and quote time. The synthetic stop contract requires distinct driver-confirmed places, legal stopping, correct side and direction, and helmet space for two-wheelers. HTTP/PostgreSQL tests cover an independent shorter route response, rounding boundaries, unsafe evidence, and a malformed saved route. The HTTP quote boundary remains disabled outside tests; no passenger discovery or booking is enabled.

### Historical remaining acceptance blockers (superseded by the current work below)

1. Ticket 02 selects Valhalla/OSM and the Amravati core successor rules. This ticket still needs production passenger point matching, explicit stop confirmation and saved-route segment verification; a test-only stop checker is insufficient.
2. Ticket 10 must complete the actual approved Amravati core artifact and route preparation evidence. Its driver-private preparation does not establish passenger discovery/read exposure or this ticket's passenger quote acceptance.
3. Ticket 12 must revalidate and freeze the quote inside protected acceptance; a preview alone cannot authorize a commitment. Existing version/replacement/launch gates remain.

## Amravati core scope amendment — 2026-10-04

Check both requested passenger pickup/drop-off and their matched saved-route positions against the route's pinned `amravati-core-v1` identity/hash, current approval and coordinate-precision rule. Preserve order, 30 m matching, 500 m minimum, safe-stop declarations and exact saved-route distance/price rules. Unavailable/revoked/mismatched area evidence rejects a new quote; historical frozen results remain unchanged. Add authenticated PostgreSQL boundary/snap/stale-area cases when implementing this ticket. Ticket 10 dependency and claimed status remain; no implementation or passenger exposure is implied by the scope amendment.

## Current dependency and implementation audit — 2026-10-05

Fetched origin and verified main `66d565c` contains merged PR #84 and ticket 10 completion commit `eedef3b`. The actual operator Google Maps review, exact packaged area/review hashes and recorded authenticated local evidence are in `docs/operations/evidence/ticket10-amravati-actual-review-2026-10-04.md`. The synthetic review sample is not operator evidence. Ticket 10's current Answer supersedes its historical pending notes; none of its acceptance work is transferred here.

Ticket 02's Valhalla/motorcycle and pricing choices and ticket 04's approved Amravati successor policy govern this implementation. Ticket 09's maintainer-accepted support completion supersedes old missing-support decision notes, while configured production producers and release rehearsals remain separate. Ticket 12 is a downstream consumer of this preview, not a blocker to ticket 11 completion.

The partial implementation has been reused: existing saved cumulative distances, integer-paise pricing, protected preparation, audit and receipt recovery remain the foundation. The [passenger preview contract](../../../docs/operations/posted-route-quotes.md) records the new opt-in publication, explicit requested/matched driver stop confirmation, separate passenger discovery/detail, eligibility, area and provider rechecks. Driver-private preparations are not exposed. Production activation remains closed. Final validation and review are recorded in the Answer below.

## Answer

**Resolved for the local, launch-gated server/API scope.** Ticket 10's completion and exact recorded artifact/review hashes were verified on updated merged main before work began. Existing partial route matching, saved-distance pricing and protected preparation were reused. The implementation now supplies opt-in driver-confirmed publication, passenger-authorized discovery and separate detail, actual matched-stop confirmation, saved-route segment quotes, integer-paise details, and fail-closed eligibility, ordering, ambiguity, safety, graph, area, pause and recovery checks. Driver-private preparations remain private. No quote creates a request or allocation.

[Acceptance and review evidence](../../../docs/operations/evidence/ticket11-passenger-route-quotes-2026-10-05.md) records red/green HTTP/PostgreSQL work, controlled provider responses, the packaged actual area approval, separate-connection concurrency, audit/notice rollback, idempotency and receipt restoration. Full suite: **38 script checks, 467 API tests and 19 worker tests passed**. Following review refinements, the final complete affected route group passed **133 tests**; all **26 selected passenger/publication regressions** also passed. The evidence distinguishes opt-in skips and an earlier hook/socket interruption from the clean final rerun. Typecheck, API build, lint (nine existing warnings) and whitespace checks passed. Standards and Spec reviews have **zero outstanding findings** after resolving the duplicated-provider-safeguards concern.

All three ticket acceptance criteria are evidenced. Ticket 12's protected acceptance/freezing and ticket 15's integrated browser flow remain separate downstream implementation. External/rate review, production hosting/gateway and licence compliance, representative upgrade, staging/recovery and ticket 18's explicit activation decision remain separate launch requirements. Real production discovery/publication/quotes and bookings stay disabled. No deployment, live migration, external contact or real booking occurred.
