# Ticket 15 integrated route-flow evidence — 2026-10-08

## Scope and dependency provenance

Started from fetched, up-to-date main `ebd89d459d7926c8e60ce6377ad34a9d7f7d1caa` on `codex/15-integrated-route-flow`. The existing ticket branch contained no commits absent from main and was fast-forwarded; untracked `.worktrees/` and other worktrees were preserved.

All five prerequisite tickets have `Status: resolved`. Their completion merges are ancestors of the baseline, verified with `git merge-base --is-ancestor`:

- 06: `68a6a67`, PR 59, legacy booking/payment boundaries and historical reads.
- 09: `e3d62b8`, PR 82, support publication, durable notices and operator delivery handling.
- 12: `14c4527`, PR 86, published-route requests and atomic priced acceptance.
- 13: `7273b3c`, PR 87, cancellation, outcomes, incidents, timers and downstream receipt recovery.
- 14: `ebd89d4`, PR 88, approved empty source-application copy plus separately labelled synthetic history/Auth and protected receipt recovery.

Ticket 15's September blocker notes are historical. Support contacts and the passenger publication/discovery/quote producers now exist. Ticket 14 is resolved within its explicitly approved scope: **actual source-account continuity remains unproven**, and retained-artifact deletion/scoped-key cleanup requires its separate verification. This work neither accesses those artifacts nor declares cleanup complete.

## Application path and controlled boundaries

The primary seam remains authenticated Express HTTP plus real PostgreSQL durable state in `apps/api/src/test/http-postgres.integration.test.ts`. Routes validate authentication, CSRF, payloads and operator MFA; `posted-routes.service`, `seat-booking.service` and `outcomes.service` enforce policy/authorization and protected transactions; their repositories own SQL. Existing migrations through 0044, signed operation receipts and the PostgreSQL email worker are reused. No production code or migration is changed.

The account-to-cash scenario registers two accounts through `/v1/auth/register`, rejects unverified email login, logs in after controlled provider email verification, reads `/auth/me`, and records adult and driver–vehicle declarations through HTTP. Publication uses the real Valhalla adapter, preview digest, explicit snapped endpoints, confirmed stopping places and the packaged Amravati artifact/operator review. The passenger discovers `/posted-routes`, reads `/published/:id`, selects those returned ordered stops and requests their own server quote before requesting a seat. No driver-private quote, synthetic routing adapter, stop-check override or policy bypass supplies the integrated price. The 1,560 m fixture produces 1,092 paise at 700 paise/km, with zero extra charges.

Controlled boundaries are explicit:

- Auth provider registration/email verification/token validation is an in-memory external-provider adapter. HTTP sessions, stable user mapping and CSRF remain real application behavior; this is not deployed Supabase or source-account continuity evidence.
- `valhallaFixture` controls external route/trace/locate HTTP responses and build identity. Adapter parsing, saved-route normalization, area validation, stop validation and pricing execute normally. This is not actual road-graph or hosted-provider evidence.
- Email delivery uses the real durable worker with controlled success/failure transport. No email is sent, and `sent` never proves human receipt.
- Receipt storage is a signed local filesystem fixture, not independent production storage. Existing reconciliation tests deliberately remove local synthetic records to model loss. The outcome clock advances without rewriting frozen departures.
- Negative area tests inject revoked/hash-mismatched approval and a narrowly scoped filesystem read failure, restoring each injection afterward. They do not change the packaged artifact or approve a new area.

Support is a Next.js page, not an invented API endpoint. The participant-shell rendered test verifies a trip participant can reach `/support`, then renders that actual page and checks both mailto contacts, coverage and closed-booking language. The existing support-page test covers response targets and shared-provider limitations. This is local component/navigation evidence, not a browser-to-provider contact rehearsal.

## Acceptance evidence map

All named HTTP cases below are in the existing integration file; related rendered-page and worker tests run in the full suite. Separate cases deliberately cover incompatible terminal outcomes rather than pretending a single seat can both cancel and complete.

### Authenticated journey, immutable terms and history

- `ticket 15 creates two verified accounts ...`: complete account/declaration, preview/publication, passenger discovery/detail/quote, request/acceptance, boarding/departure, mutual journey, cash claim and recipient receipt. Actual worker delivery covers acceptance and receipt; participant durable reads show the accepted notice. Full accepted terms compare unchanged after settlement.
- `ticket 15 carries cancellation into a fresh cash seat ...`: published-route passenger cancellation releases capacity for a fresh request; the cancelled seat creates no obligation, and the completed seat retains the quoted amount.
- `ticket 15 connects the authenticated route journey ...`: passenger quote, retry and changed-payload rejection, accepted price, mutual travel, UPI claim, dispute, MFA operator decision and recorded outreach. Complete historical offer, booking, payment-order and settlement rows compare equal before/after; the historical 2,500-paise amount and owners coexist with the 1,092-paise new obligation. Accepted route/segment/price terms also compare equal after review.
- Reused ticket 09 producer scenarios now use published routes: request/rejection, acceptance, holds/releases, passenger/driver cancellation, material replacement with fresh endpoint/stop confirmation, expiry, boarding, journey disagreement, incident handling, cash receipt, UPI dispute and operator outcome notices.
- Ticket 13's published material-replacement test asserts new identity, no transferred allocation, fresh requests and unchanged cancelled terms. Its timer tests establish that delayed departure, silence and overdue states create neither travel nor receipt. Its recipient-evidence test preserves an original dispute when a later authenticated receipt is appended.

### Policy, authorization and failure checks

- Existing Amravati cases cover interior routes, all three vehicle categories, outward-rounded boundary precision, outside selection, cross-edge snapping and whole-route exit/re-entry. Ticket 11 tests ordered, off-route, unconfirmed, ambiguous and unsafe stops; saved-segment pricing, 500/700-paise rates, rounding and provider failure. Ticket 12 revalidates price, support, declarations, route evidence and area approval at acceptance.
- New ticket 15 negative cases reject quotes, requests and acceptance when approval is revoked, its geometry hash is stale or the actual artifact reader fails. Pending request rows remain byte-for-byte equivalent as decoded PostgreSQL values, with zero allocations.
- Existing declaration/route/outcome tests cover wrong owners, absent/stale/false declarations, restrictions, holds, MFA and invalid transitions; exact retries return one logical action and changed payloads fail.
- Existing published-route variants cover final-seat and overlapping passenger/vehicle commitments, revocation and pause using separate database connections. Cancellation/acceptance and departure/cancellation now run for both historical synthetic fixtures and published Valhalla-backed fixtures. Departure/cancellation observes two active backend PIDs; ticket 13 separately covers passenger/driver/vehicle revocation versus departure.
- Existing request/publication/outcome tests inject audit, notification-event and email-job insertion failures and assert atomic rollback. Ticket 09's published-route worker failures preserve accepted/cancelled state, exhaust bounded retries, redact private failure details, enforce participant-only reads and permit audited operator retry without duplicate logical notices.
- Existing publication, seat and ticket 13 downstream recovery tests cover uncertain acknowledgement, same-key continuation, missing/conflicting evidence, restricted writes, older-state restoration and reconciliation of frozen terms, journey, obligation, receipt, audit and suppressed notices. Ticket 14's protected-provider drill remains separate inherited evidence, not a drill repeated here.

### Excluded capabilities

Ticket 15's authenticated boundary test rejects generic bookings, platform collection/payout, matching, chat, tracking, legacy ride publication and push registration/list/deletion. Existing production-mode route tests keep passenger publication/discovery/quote, requests/acceptance and outcomes disabled. Historical reads remain participant-scoped. No deployment, live-data mutation or booking activation occurs.

## Verification and review

Verification is in progress; final results and independent Standards/Spec review will be recorded before resolution.

The first regression moved the old integrated quote to the passenger and failed with `ROUTE_NOT_FOUND` (404). Replacing the stale private-route harness with actual publication/discovery made it pass without changing application policy. The filesystem-failure test initially failed to intercept a native named import; synchronizing Node's builtin exports corrected the injection, after which all three negative variants passed. These were harness/coverage gaps, not evidence that production policy needed weakening.

A sandboxed test could not connect to loopback (`EPERM`); the authorized local rerun reached the intended regression. One attempted focused UI command used the workspace's additive `src` script and unintentionally selected the API suite with its default localhost test URL; database/socket checks failed under the sandbox. That run is not counted as acceptance evidence; the corrected direct Vitest command selects the two UI files explicitly.

## Remaining release gates

Ticket 16 owns actual configured staging, routing host/graph behavior and capacity/cost/licence evidence, provider-backed notices/receipt, monitor and support execution, privacy/retention and deployed backup/readiness checks. Ticket 17 owns deployed outage/restore/reconciliation evidence. Ticket 03 external activity/insurance/rate review and ticket 18's explicit activation decision remain required. Ticket 14's actual source-account continuity limitation and separately tracked retained-artifact/scoped-key cleanup remain unchanged. Local integration success authorizes none of those actions.
