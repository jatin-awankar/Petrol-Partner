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

The release runbook and artifact command are reviewable in this branch. The full test run did not pass and must be repeated with Docker and a disposable PostgreSQL test database. No database rehearsal was run: local PostgreSQL on `127.0.0.1:5432` was unavailable (`pg_isready`: no response), and no disposable remote database was authorized. No full browser automation was run; existing rendered-page and HTTP tests are narrower evidence. The old `smoke:staging` script uses legacy credentials and vehicle assumptions and is not accepted as pilot browser proof.

## Remaining demonstration gates

1. Select and authorize an accessible staging arrangement, then record actual provider plans, terms, quotas, measured cost and spend exposure. Keep zero recurring cost constraint unless the maintainer changes it.
2. On isolated synthetic staging, inventory current schema and users, rehearse forward migration, stable ID mapping, old-session invalidation, compatible code rollback/roll-forward, backup/restore, independent receipt reconciliation, and measured RPO/RTO.
3. Run the full two-role browser sheet in the runbook, including mobile and keyboard/error states, pickup exception without phone numbers, cancellation, case decisions, restrictions and restricted mode. Capture redacted screenshots/logs and operation IDs.
4. Prove actual authentication email/reset/MFA; storage privacy, object/internal retention and deletion; worker deadlines, notification limits, independent paging/receipt, and separate recovery-reader semantics. Reconcile ticket 28 deletion and ticket 27 outreach gaps.
5. Verify external TLS, least-privilege roles, client-secret absence, direct policy protection, current authorization, CSRF/origin, private caches and abuse controls with provider-backed evidence. Audit every active protected mutation route, including case/restriction decisions, and inject notification failure and recovery.
6. With explicit repository-change authority, configure and demonstrate CI, PR and main protections while preserving the local guard. Record actual support contact/window, corridor contribution policy and all remaining pilot launch gates before real trips.

No acceptance criterion is marked complete merely because a local unit or rendered-page check passed. Ticket 30 remains `claimed`.
