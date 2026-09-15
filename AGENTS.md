# Petrol Partner agent guide

Petrol Partner is preparing a supervised pilot for 20–30 verified adult students on one fixed college corridor. Preserve the existing modular Next.js, Express, and PostgreSQL foundation while moving it toward the approved pilot architecture.

## Before changing code

1. Inspect `git status` and the current branch. Preserve user work and existing data. Treat the deployed schema and user population as unknown until explicitly inventoried.
2. Read the nearest `package.json`, relevant source, migrations, and tests. Treat the repository as the source of truth for current commands and structure.
3. For changes to rides, bookings, eligibility, journeys, settlements, operator actions, notifications, authentication, personal data, recovery, deployment, or pilot scope, read [`docs/pilot-spec.md`](docs/pilot-spec.md). The change is ready only when every affected invariant is accounted for in code and tests.
4. Trace the complete server-side path from route through service and repository. Client checks provide feedback; server transactions and database constraints protect state.

## Git workflow

Create or switch to a dedicated `codex/<ticket-number>-<short-description>` branch before editing tracked files when the current branch is `main`. Keep each implementation branch limited to one ticket and run its required checks. Commit on the dedicated branch; `main` receives changes through reviewed pull requests.

## Design boundaries

- Keep HTTP routes and controllers thin. Services own authorization, policy, and transactional use cases; repositories own SQL.
- Keep one modular API. Add packages only when multiple real consumers exist. Prefer PostgreSQL-backed durable work for the pilot over new infrastructure.
- Keep stable application-user IDs independent of authentication-provider IDs.
- Model ride, request, allocation, journey, contribution, payment claim, receipt, and review outcomes separately.
- Store money as integer paise with an explicit currency. Freeze the accepted contribution and policy version.
- Make protected mutations idempotent. Commit business state, audit history, and follow-up work in one database transaction; acknowledge success only after the approved recovery evidence is durable.
- Use forward-only migrations. Reconcile existing migration histories and the deployed baseline before declaring one history authoritative. Preserve historical payment data while platform payment remains disabled.
- Keep pilot-disabled capabilities disabled at API boundaries as well as in the UI: passenger ride listings, automatic matching, Razorpay collection, payouts, chat, live tracking, and push notifications.

## Verification

Use the narrowest meaningful check while iterating, then run every existing check affected by the change. Critical state changes require PostgreSQL integration tests; mocked repositories do not establish locking, uniqueness, idempotency, or rollback behavior. Concurrency tests must use separate database connections.

Before reporting a pilot-critical change complete, verify the applicable cases from `docs/pilot-spec.md`, including authorization, retries, race conditions, invalid transitions, audit records, notification failure, and recovery behavior. Report commands run, outcomes, and anything that remains unverified.

## Safety gates

Do not reset, discard, rewrite, or migrate existing data without an explicit inventory and migration decision. Do not enable real trips until the launch gates in `docs/pilot-spec.md` are evidenced. Do not spend money, deploy, contact institutions or insurers, or represent unresolved legal and provider questions as settled without user authorization.

## Agent skills

### Issue tracker

Specs and issues are local Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain layout. See `docs/agents/domain.md`.
