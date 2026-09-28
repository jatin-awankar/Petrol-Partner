# Ticket 30 synthetic release evidence — 2026-09-28

Status: **partial preparation; rehearsal incomplete; real trips blocked**. Source baseline: local `main` at `7f40786`, which merged ticket 29 PR #51. Work branch: `codex/30-release-staging-rehearsal`. This record contains no deployed provider inventory, provider credentials, personal data, or launch approval.

## Dependency audit

- 07 `claimed`: zero recurring cost selected; OCI synthetic candidate inaccessible without a supported payment card. No selected live arrangement, measured provider limits, or approved staging topology.
- 18 `claimed`: endpoint and rendered-page checks exist; actual two-role browser pickup exception and published operator support contact/window remain open.
- 23 `resolved`: journey review, separate obligation decision, protected audit/recovery and PostgreSQL checks recorded by its ticket; no provider-backed release rehearsal.
- 26 `resolved`: restriction and reversal slice with PostgreSQL checks; live provider and actual incident evidence not claimed.
- 27 `claimed`: synthetic stall/outreach evidence exists; independent live paging, operator receipt, and credential custody remain open.
- 28 `claimed`: closure request/hold tracking and recovery exist; 30/90-day destructive expiry, provider/backup erasure, restore suppression and notice remain open.
- 29 `claimed` despite merged code: pilot no longer requires Redis/Razorpay at runtime; live paging dependency and rollout proof remain open.

## Synthetic checks performed

| Check | Observed result | Limit |
| --- | --- | --- |
| `git status --short --branch` at start | Clean `main`, tracking `origin/main` | Remote freshness was not independently fetched. |
| `git log -6 --oneline` | `7f40786` merged PR #51 for ticket 29 | No deployed-code comparison. |
| `node --version`; `npm --version` | 24.20.0; 11.19.0 | Local toolchain only. |
| `node --check scripts/release-artifact.mjs` | Exit 0 | Syntax only. |
| `npm run db:migrate -- --plan` | Exit 0, 34 ordered migrations through `0034_closure_recovery.sql`, each with SHA-256 | Does not connect to staging or establish its ledger. |
| `npm run release:artifact -- /tmp/petrol-partner-release-t30` before commit | Refused dirty tree, exit 1 as designed | Committed artifact result recorded below after commit. |
| `npm run typecheck` | Exit 0: root, API, worker | Static checks only. |
| `npm run lint` | Exit 0: 10 existing warnings, 0 errors | Existing warnings remain. |
| `npm run api:build`; `npm run worker:build` | Both exit 0 | Local compilation, no provider runtime. |
| `npm run build:all` | Exit 1: Next.js could not fetch Google Poppins font from `fonts.googleapis.com` | Network-dependent web build remains unverified in this environment. No build failure was bypassed. |
| `npm test` | Interrupted after 160 seconds: 34 script tests passed, 4 skipped, 1 failed, 1 cancelled | Docker API is unavailable (`docker info`: permission denied); the runtime-contract Docker test lacked a version result. `landing-eligibility` remained pending. Workspace suites did not start. |
| Four rendered-page jsdom test files | 4 files, 14 tests passed in 1.57 seconds | Synthetic UI rendering for coordination, direct settlement, case review and restrictions. No real browser, onboarding, mobile viewport or keyboard accessibility proof. |
| `node --test scripts/install-hooks.test.mjs` | 2 passed in 0.53 seconds | Demonstrates local main-commit guard and hook preservation in temporary repositories, not remote branch protection. |
| `release:artifact` after commit `0cb7d0a` | Two independently generated tar files, each 6,400,000 bytes and SHA-256 `c9dbc4ced2f7a965109d8807feb6f62c3bf90c3ba4c4cb51c3c56f63e8a037d8` | This verifies deterministic source packaging for that commit; it is not a deployed image or provider release. Regenerate for the final PR head. |

The release runbook and artifact command are reviewable in this branch. The initial full test run did not pass and must be repeated with Docker and a disposable PostgreSQL test database. The additional local database and browser checks below address part of that gap. The old `smoke:staging` script uses legacy credentials and vehicle assumptions and is not accepted as pilot browser proof. `.github/workflows/checks.yml` currently defines one `checks` job on pull requests and branch pushes, running `npm run check`; this inspection is not proof of repository protection settings.

## Additional disposable local rehearsal — 2026-09-28

The maintainer approved the public browser flows and migration CLI against disposable local `_test` databases as the test seams. PostgreSQL 17.11 ran from a new temporary cluster at `127.0.0.1:55439`; no existing cluster, deployed schema, or user population was touched. `petrol_release30_test` was reserved for destructive migration rehearsal and `petrol_browser30_test` for the browser. Both names end in `_test`. The API and web used localhost ports 43130 and 43131 with fabricated accounts and fixture approvals. The browser database received all 34 forward migrations. Its recovery state was opened solely for synthetic actions, then set to restricted for a denial check. A test-only API process clock was advanced through the journey; this did not alter database time or prove real scheduling and paging.

| Check | Measured local result | Limit |
| --- | --- | --- |
| Test-first `node --test scripts/db-rehearsal.test.mjs` | Expected red on absent auth cutover and rollback fields, then 3 tests passed in 0.80 seconds on the final run | Disposable local PostgreSQL only. |
| Migration CLI on representative legacy rows | Refused an untracked non-empty schema; clean install and `--check` passed; forward upgrade retained 2 users, 1 booking, 1 active request, historical payment and settlement totals, and stable booking/passenger IDs | The synthetic old schema and values do not inventory a deployed database. |
| Auth cutover transaction | Historical booking passenger remained `00000000-0000-4000-8000-000000000002` after a managed identity was linked to the same application user ID; legacy password was cleared, refresh token revoked, managed provider activated and legacy login disabled | Synthetic database state transition only; no real provider session, email, reset, MFA or code-version compatibility was exercised. |
| Precommit reversal | A transaction that cleared the password, revoked the token and inserted a managed identity was rolled back; the legacy password/token and legacy mode remained intact, and the identity mapping was absent | Demonstrates database transaction rollback before commit. After the committed cutover, restoring legacy code is unsafe without a separately proven compatibility path; use the documented pause and roll-forward procedure. |
| Browser, desktop | Two fabricated users registered. The driver published a one-seat University→PRMITR offer; the passenger requested, the driver accepted, and the UI displayed a confirmed seat with ₹25.00 frozen contribution and car details without participant phone. The driver boarded the passenger and departed; the driver and passenger separately confirmed completion; the passenger submitted a direct UPI claim and the driver confirmed receipt. | Approvals, vehicle association, recovery opening and the provisional policy were synthetic database fixtures. The test clock and local file receipt backend do not prove live worker timing, independent recovery or a selected provider. |
| Browser, cancellation and restriction | A second offer received a pending request, then the passenger canceled it with a reason. After the synthetic recovery mode became restricted, another request was denied with “Pilot activity is paused”; an ordinary student saw the operator access denied page. | No operator case decision, restriction reversal or provider-backed MFA was completed in the browser. |
| Browser, 390×844 viewport and keyboard | The mobile layout and bottom navigation rendered; Tab focus reached the cancellation reason field. | This is one keyboard path and one viewport, not a complete accessibility audit. |
| PostgreSQL operation count after browser flow | 2 offer operations, 3 request operations, 1 departure operation, 2 journey operations, 2 settlement operations, 1 cancellation operation and 18 notification events | Counts are from the disposable browser database; they do not establish provider delivery or independent receipt durability. |

The successful offer was `b806e879-83b9-44fc-a613-23cb17581c04` in the disposable database. This identifier is a correlation aid for rerunning the synthetic flow, not a staging operation receipt. The browser walkthrough was manual through the public UI; it is not an automated, repeatable full suite. Browser case review, account restriction/reversal, actual onboarding evidence approval, notification failure recovery, and full keyboard/error coverage remain open. No screenshots containing account details are committed.

## Remaining demonstration gates

1. Select and authorize an accessible staging arrangement, then record actual provider plans, terms, quotas, measured cost and spend exposure. Keep zero recurring cost constraint unless the maintainer changes it.
2. On isolated synthetic staging, inventory current schema and users, rehearse forward migration, stable ID mapping, old-session invalidation, compatible code rollback/roll-forward, backup/restore, independent receipt reconciliation, and measured RPO/RTO.
3. Run the full two-role browser sheet in the runbook, including mobile and keyboard/error states, pickup exception without phone numbers, cancellation, case decisions, restrictions and restricted mode. Capture redacted screenshots/logs and operation IDs.
4. Prove actual authentication email/reset/MFA; storage privacy, object/internal retention and deletion; worker deadlines, notification limits, independent paging/receipt, and separate recovery-reader semantics. Reconcile ticket 28 deletion and ticket 27 outreach gaps.
5. Verify external TLS, least-privilege roles, client-secret absence, direct policy protection, current authorization, CSRF/origin, private caches and abuse controls with provider-backed evidence. Audit every active protected mutation route, including case/restriction decisions, and inject notification failure and recovery.
6. With explicit repository-change authority, configure and demonstrate CI, PR and main protections while preserving the local guard. Record actual support contact/window, corridor contribution policy and all remaining pilot launch gates before real trips.

No acceptance criterion is marked complete merely because a local unit or rendered-page check passed. Ticket 30 remains `claimed`.
