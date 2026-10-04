# Ticket 11 — passenger route quote acceptance

## Baseline and dependency evidence

Work began on `codex/11-passenger-route-quotes` from freshly fetched `origin/main` at `66d565c` (PR #84). `git merge-base --is-ancestor eedef3b origin/main` and the same check against the ticket branch passed. Ticket 10's actual-review completion is merged, not merely present on a local feature branch.

Recomputed packaged SHA-256 values match ticket 10's recorded evidence:

- Original area: `b342438fbb8aecf2e3f5cf82cf1ddfa2ea7d6ae02343e3319a41220b1d4eb42c`.
- Actual operator review: `f48c05479ad5cd5abe73cd8c120d0540450546a8506b10fb7d6e92217375b44a`.
- Review bundle: `facb093f9b25e7ea2a6bb883d5c5cbe7549a950702acf679f951cc65cad034c2`.

The [actual-review record](ticket10-amravati-actual-review-2026-10-04.md) remains map-based operator evidence, not field/legal-stop certification. The earlier synthetic sample is not used as actual evidence. Ticket 02's selected provider/modes and integer pricing, ticket 04's Amravati successor, and ticket 09's maintainer-accepted support completion supersede earlier blocker notes. Their downstream release requirements remain separate.

## Implemented acceptance

The [API contract](../posted-route-quotes.md) describes the driver preview → explicit actual-point/stop confirmation → opt-in protected publication → authorized passenger discovery/detail → quote workflow. Existing driver-private preparation, cumulative-distance matcher, paise calculation, transaction, audit and independent receipts were extended, not replaced. No migration was added or applied to deployed data.

Authenticated HTTP/PostgreSQL tests establish:

- Private preparations stay hidden; published details are separately authorized and exclude driver IDs, vehicle declaration IDs, contacts and provider/recovery internals. Missing/withdrawn adult declarations, disabled accounts and self-quotes reject.
- Only explicitly driver-confirmed safe/legal stopping places with correct side/direction and two-wheeler helmet space can be quoted. Requested and exact matched points are distinct; incorrect confirmation, arbitrary unconfirmed points and client price/safety overrides reject.
- Dense continuous route geometry succeeds; repeated passes remain ambiguous. Off-route, reversed, sub-500 m (retained tests), outside/precision-boundary and stale selections reject. An outside passenger selection cannot be rescued by a match within 30 m of an interior route.
- Full-route 1,560 m quotes cost 1,092 car paise or 780 bike/scooter paise. A confirmed interior stop measures 1,045 m and costs 732 car paise, even when the provider's independent route response would be shorter. Car boundary examples 1,564/1,565/1,566 m yield 1,095/1,096/1,096 paise. Existing synthetic rounding and minimum-segment regressions also remain.
- Quotes use saved cumulative distances, not provider rerouting. Pinned-graph road correspondence is independently checked without asking for a new distance. Provider outage, malformed response, graph/header mismatch and multiple roads reject. Shared routing safeguards retain bounded concurrency, 10-second timeout, response limits and no fallback.
- Area revocation/unavailability, changed approval, tampered saved distance, vehicle revocation, expired cutoff, pause, restricted recovery and missing independent publication evidence reject. A separate-connection hold race waits then rejects the held offer.
- Publication and confirmed stops survive idempotent retry and receipt restoration. Changed payloads reject. Publication audit/notification insertion failures roll back; competing overlapping publications yield one success. New publication respects booking/offers pause while completed retries retain the original result.
- Quote calls create no request or allocation. Production publication, passenger discovery/detail and quote activation remain hard-disabled. Ticket 12's acceptance implementation is untouched.

Missing behavior was exercised red before green at the authenticated HTTP/PostgreSQL seam: discovery, passenger publication/quote, provider failure, quote pause, dense matching, explicit matched-stop preview, hold race and publication pause. This includes real PostgreSQL constraints/transactions and separate connections for concurrency. Provider answers are controlled external HTTP fixtures using the packaged real area approval; these are not new road-quality or production-provider rehearsals.

## Checks

Only fresh disposable PostgreSQL 16 databases in the local `petrol-ticket11-db` container were used: `petrol_partner_test` and `petrol_ticket11_review_test`, exposed on loopback port 55432. No deployed database, historical user population, external inbox or paid provider was accessed. The safety guard rejected an initially misnamed review database before any tests ran; the corrected disposable `_test` database was used.

Commands use the corresponding loopback `DATABASE_URL`:

```sh
npm test
npm --workspace @petrol-partner/api run test:integration -- -t 'ticket 11|Valhalla publication|Valhalla.*timeout|Valhalla.*invalid|Valhalla.*overload'
npm --workspace @petrol-partner/api run test:integration -- -t 'ticket 10 isolated'
npm run typecheck
npm run lint
npm run api:build
git diff --check
```

Full suite: **38 script checks, 467 API tests and 19 worker tests passed**. Ten opt-in script checks and seven API checks skipped: six actual local-engine category rehearsals and one external live-provider check. The full suite preceded the review refactor and final three edge-case regressions. The final targeted passenger/publication selection then passed **26 cases**. The first final affected-route group run had 131 passes and two interruptions: a 10-second setup-hook timeout (with a 54-second gap in request logs) and a socket hang-up. Both cases passed unchanged on immediate retry; no assertion or timeout was relaxed, and the underlying interruption cause was not established. **The complete unchanged affected-group rerun passed all 133 selected HTTP/PostgreSQL tests**, with 112 unrelated cases excluded by the filter and six opt-in actual-engine cases skipped. This final run includes the shared provider refactor, publication pause fix and all final regressions. Typecheck, API build and whitespace checks passed on the final code; lint passed with the same nine pre-existing warnings.

## Code review

The implement skill's code-review workflow used independent Standards and Spec agents against merged main `66d565c`. Standards found no documented-rule violation and one P3 duplication concern in Valhalla request safeguards; shared configuration/request-job helpers resolved it, and the reviewer confirmed no remaining finding. Spec found no missing/incorrect requirement or scope creep and confirmed the final pause/boundary/recovery follow-up. Neither reviewer claimed to have run the tests. **Final review: Standards 0 outstanding; Spec 0 outstanding.**

## Separate downstream requirements

This evidence completes the local server/API quote scope only. Ticket 12 must revalidate and freeze terms during protected request/acceptance; ticket 15 must connect and verify the browser flow. Actual configured hosting/gateway, attribution/licence compliance, external operation/insurance/rate review, representative upgrade, staging, outage/restore and the explicit ticket 18 activation decision retain their existing owners. Skipped actual-engine/live-provider tests are not represented as rerun or as production evidence. No deployment, live migration, real booking or release activation occurred.
