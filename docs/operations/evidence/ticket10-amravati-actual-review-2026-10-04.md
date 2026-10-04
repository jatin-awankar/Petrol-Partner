# Amravati core — actual operator review and acceptance

## Actual review record

Jatin Awankar explicitly supplied an **actual** operator review, dated **4 October 2026, 12:00 PM IST** (`2026-10-04T06:30:00.000Z`). Provider: **Google Maps**. Basis: **map review; no field visit asserted**. This completes the actual-review supplement to the earlier exact-hash checklist/rules approval. It supersedes the outstanding-evidence statements following the separately preserved synthetic sample; that sample remains synthetic and is not used as evidence.

Operator-reported findings, preserved without independent geocoding or field-verification claims:

- Coverage includes the intended journeys; no concerns reported.
- M1: Rahat Hospital. M2: New Prabhat Colony. M3: Futka Talao. M4: Gajanan Maharaj Mandir. M5: Camp Road.
- Car, motorcycle and scooter routes reviewed; no concerns reported. “Motorcycle” corresponds to the application's bike category using Valhalla motorcycle costing; the categories remain car/bike/scooter.
- Edge examples 1–4 all match intended coverage rules.
- Remaining unverified items: none **reported by the operator**. Decision: **Approved**.

These are the operator's map-based observations concerning the existing M1–M5 selections, not agent-verified place coordinates, safe/legal-stop certification, a field survey, physical-position accuracy evidence or state-border verification. Existing driver confirmation, external-operation and launch gates still apply. No Google map imagery or geometry was copied into the artifact. The service geometry remains independently authored; the original road-data attribution remains intact.

## Frozen references

- Area: `amravati-core-v1`.
- Geometry SHA-256: `b342438fbb8aecf2e3f5cf82cf1ddfa2ea7d6ae02343e3319a41220b1d4eb42c`.
- Existing preview/review bundle SHA-256: `facb093f9b25e7ea2a6bb883d5c5cbe7549a950702acf679f951cc65cad034c2`.
- Calculation: `amravati-convex-microdegree-envelope-2026-10-04.1`.
- Actual packaged approval: `apps/api/src/modules/posted-routes/service-area/operator-review.json`, SHA-256 `f48c05479ad5cd5abe73cd8c120d0540450546a8506b10fb7d6e92217375b44a`.

The geometry and preview bundle were not regenerated. The packaged approval contains the operator's actual timestamp, notes, names/basis and decision, bound to the exact existing artifact/rule/evidence. The approved rule/authorship/limitations acknowledgements carry forward the earlier “rules: reviewed” exact-hash approval. This is not a synthetic test approval.

## Local validation

The authenticated actual-engine tests explicitly clear the test approval override and use the packaged real review, verifying `approvalEvidenceKind: recorded-operator-review` for all three categories. Audit/notice rollback, concurrency, retry and signed-receipt restoration exercise the same real approval record with controlled provider responses. The complete historical booking-row preservation test also uses the real record. Deliberately pending/malformed test approvals still prove fail-closed behavior; production-mode tests prove retained fixtures are ignored in favor of the packaged real review.

**Final results:** 114 authenticated HTTP/PostgreSQL cases passed in the targeted ticket-10 group (112 other cases intentionally excluded by the test-name filter); all 26 service-area unit checks passed. The actual local Valhalla car/bike/scooter cases used the packaged real review, with exact saved-shape comparison. Typecheck and API build passed. Production-mode built-artifact smoke checks verified the actual review for all three categories, and all three source/built JSON hashes matched. No synthetic approval was used in that smoke check. The previously recorded complete suite remains regression evidence; it is not represented as rerun here. No deployed database is accessed. The new containers `petrol-ticket10-review-db` and `petrol-ticket10-review-routing` are disposable local PostgreSQL and read-only pinned Valhalla rehearsals, bound only to loopback. The build header used by the actual-engine harness is a local attestation, not evidence of a deployed immutable gateway.

## Scope of completion

Ticket 10 is resolved for the approved local scope: the actual operator-review record and all remaining local acceptance checks now pass. The area-specific verifier can accept eligible private route preparation using the real recorded review. It does not enable discovery, passenger requests, real bookings, deployment or live operations. SOI/geoBoundaries statewide research remains retained and unresolved for statewide use. The 50 km/90-minute limits, zero exit/touch rule and numerical precision guard remain unchanged. Ticket 11 is not started by this work.

Validation invocation (with the fresh disposable PostgreSQL URL and retained local Valhalla manifest set as in the prior implementation evidence):

```sh
npm run test:integration --workspace @petrol-partner/api -- -t 'ticket 10 isolated'
npm run typecheck
npm run api:build
```

The 26 unit checks were run directly with Vitest against `service-area.test.ts` and `service-area-artifact.test.ts`. `git diff --check` passed.

Record/completion finalized **5 October 2026 IST**; the operator's supplied actual review time remains **4 October 2026, 12:00 PM IST**. Lint passed with the same nine pre-existing warnings. No application enforcement code or geometry changed in this follow-through; changes are the real approval record, corresponding acceptance assertions, review display and completion documentation.
