# Ticket 12 — protected priced-seat acceptance

## Baseline and dependencies

Fetched origin, verified `main` at `0f0369eca54847df6a427d2120b801bebf0887a9` (PR #85), and fast-forwarded the existing `codex/12-priced-seat-acceptance` branch from its ancestor. It had no unique unmerged commits. The pre-existing untracked `.worktrees/` directory was preserved. `git merge-base --is-ancestor eedef3b main` and the same check for `677193a` passed: ticket 10's actual-review completion and ticket 11's publication/quote completion are merged. Tickets 07, 08, 10 and 11 have resolved status. No prior synthetic operator sample is substituted for ticket 10's actual recorded map review.

## Implementation and acceptance evidence

The existing request, allocation, operation, audit, notice, expiry and receipt implementation is retained. The missing integration was the synthetic-source-only booking verifier. Published Valhalla routes now use ticket 11's passenger publication/quote contract inside the protected acceptance transaction. New operations require independently acknowledged publication evidence. A private preparation cannot be requested by a passenger.

The authenticated HTTP/PostgreSQL seam verifies:

- A requested seat remains pending with no allocation. Driver ownership is enforced for decisions; self-booking is rejected. Same-key request and acceptance retries return the original logical result; changed selection or action under the key is rejected.
- Acceptance recomputes the segment along the saved route, rechecks ordered confirmed stopping places, requested/matched service-area positions, route/version/policy, current approval, provider/graph availability, declarations, account restrictions, support, deadlines, capacity and overlaps. Unconfirmed/outside selections, revoked/changed area evidence, provider outage or graph change, changed requested price, withdrawn declaration, disabled account, stale route version and closed support reject.
- A published 1,560 m car segment freezes 1,092 INR paise at 700 paise/km, nearest-paise-half-up and zero extra charges. The snapshot freezes route ID/version, requested/matched points, stop IDs, saved distance source, category/rate/rounding/policy, area identity and full recorded approval evidence. Preview-only expiry/activation fields are omitted. Existing database immutability constraints remain in effect.
- The first new regression returned `SEGMENT_UNVERIFIABLE` for a valid publication before the integration fix, then passed. A second red/green regression showed acceptance incorrectly succeeding when the acceptance deadline elapsed during provider verification. The fix rechecks deadlines, support and current declaration expiry after that I/O. Current area evidence is also revalidated after provider verification.
- Existing final-seat, overlapping passenger, same-registration, revocation/pause, audit/notification/email-work rollback, uncertain receipt, receipt restoration, hold and cancellation tests now run against both the old isolated synthetic route harness and the published Valhalla contract. Concurrent HTTP operations use the API connection pool; tests additionally inspect separate backend PIDs or hold independent database transactions. The area-revocation test explicitly observes acceptance waiting on a separate connection's route lock, revokes approval, commits the blocker and verifies no allocation.
- Same-key acknowledged acceptance survives current approval revocation, provider outage and acceptance pause with its original result. The receipt-failure case keeps business state committed, reports `pending_unknown` through the stable operation ID, restricts recovery mode and creates exactly one allocation after same-key retry. Seat restoration recreates the original accepted terms and audit from independent local signed evidence.
- Held seats retain whole-ride capacity and frozen terms. New acceptance rejects a held offer; release requires current eligibility and does not free capacity. Audited cancellation releases exactly once, including a concurrent acceptance. Rollback of cancellation and post-commit notification delivery failure preserve the correct business state.
- An overlapping historical offer with the same registration suffix blocks both request and acceptance, including a different historical driver. The suffix is treated as ambiguous, not as proof of identity. Same full-registration declarations are serialized. No historical data is reclassified or modified outside disposable fixtures.

## Scope and dependency correction

Ticket 12's old text waited for ticket 13's entire lifecycle even though 13 depends on 12. The corrected boundary keeps ticket 12's original hold/cancellation integration criterion here and verifies it using existing operations. Ticket 13 remains claimed for complete material replacement, departure/boarding and area rechecks, automatic declaration withdrawal/revocation/restriction effects on existing commitments and active trips, journey/settlement/timer producers, and acknowledged downstream-outcome restoration. The tests here do not establish those missing behaviors. In particular, checking current declarations for new actions does not prove automatic holds/incidents on existing commitments.

The old demand to prove full historical vehicle identity before closing ticket 12 also confused conservative local enforcement with ticket 14's representative-copy migration decision (14 already depends on 12). This implementation explicitly rejects suffix collisions. False positives remain intentional until an inventoried mapping decision authorizes a change. No migration, identity inference or downstream rehearsal is claimed.

## Validation environment and commands

Only a newly initialized disposable PostgreSQL 17 cluster at `/private/tmp/pp-ticket12-pg`, loopback port 55434, database `pp_ticket12_test`, was used. API requests use local authenticated test identities. Valhalla responses are controlled external-provider fixtures with the packaged recorded area approval; these tests are not new real-engine or production-provider evidence. Signed receipts are independent local filesystem fixtures, not evidence of deployed provider durability. No configured remote database or live data was accessed.

Commands used `DATABASE_URL=postgresql://jatinawankar@127.0.0.1:55434/pp_ticket12_test` for tests:

```sh
npm --workspace @petrol-partner/api run test:integration -- -t 'ticket 12 accepts a published'
npm --workspace @petrol-partner/api run test:integration -- -t 'deadline passes during'
npm --workspace @petrol-partner/api run test:integration -- -t 'published=|ticket 12'
npm --workspace @petrol-partner/api run test:integration -- -t 'ticket 12 holds'
npm --workspace @petrol-partner/api run test:integration -- -t 'allows two whole-ride seats'
npm test
caffeinate -i npm --workspace @petrol-partner/api run test:integration -- -t 'ticket 10 isolated'
caffeinate -i npm test
npm run typecheck
npm run lint
npm run api:build
git diff --check
```

Focused published/reused checks passed (30 cases), followed by the additional hold/cancellation/acceptance race (1 case). The first full suite passed 38 script checks, 488 API tests and 19 worker tests but had one `socket hang up` in the old synthetic overlapping-passenger race. Both variants of that unchanged test then passed on focused retry. The interruption's underlying cause is not established; no assertion or timeout was relaxed. The unchanged full-suite retry again passed 38 script checks, 488 API tests and 19 worker tests, with a different interruption: a pre-existing polygon test timed out in the global 10-second setup hook before its assertion. The entire unchanged affected-route group then passed **152 tests**, with 112 unrelated cases excluded by the filter and six opt-in actual-engine cases skipped, under `caffeinate -i`. Neither preceding full run is recorded as clean. The final unchanged full-suite run under `caffeinate -i` passed: **38 script checks, 489 API tests and 19 worker tests**. Ten opt-in script checks and seven API checks (six actual local-engine rehearsals and one external live-provider check) skipped. The clean run establishes final validation without assigning an unproven cause to the earlier interruptions.

Typecheck, API build and whitespace checks passed; lint passed with nine pre-existing warnings. Opt-in actual-engine and external live-provider checks are not represented as executed.

## Code review

The implement skill's code-review workflow ran independent Standards and Spec agents against merged main `0f0369e`, reviewing implementation commit `63ef306`. The Spec reviewer additionally checked the current ticket 12/13 dependency correction. Neither reviewer reran tests concurrently with the root agent's suite.

### Standards

No actionable findings. Service/repository boundaries, reuse, launch gate and PostgreSQL concurrency/rollback/recovery coverage are preserved. Repeated eligibility checks surround provider I/O for a correctness purpose.

### Spec

No outstanding findings, including the explicit noncircular dependency correction. Published quote validation, freezing, independent acknowledgement, conservative historical identity handling and existing hold/cancellation integration match the local scope. The final validation above satisfies the local ticket acceptance scope.

Review totals: Standards 0; Spec 0; no worst outstanding issue in either axis.

## Remaining release gates

Ticket 13 and representative migration, external operation/insurance/rate review, provider hosting/licence compliance, configured support/staging/recovery and ticket 18's explicit activation decision remain separate requirements. Production publication/discovery/quotes/bookings/outcomes stay disabled. No deployment, live migration, external contact or real-booking activation occurred.
