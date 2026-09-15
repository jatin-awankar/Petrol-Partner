# Petrol Partner

Petrol Partner is a modular Next.js web application with an Express API, a PostgreSQL database, and a BullMQ worker. The current codebase is a legacy foundation being moved toward the controlled pilot contract in [`docs/pilot-spec.md`](docs/pilot-spec.md); existing ride, payment, and chat behavior is not evidence of pilot correctness.

## Supported development environment

- Tested development toolchain: Node.js 24.20.0 (see `.nvmrc`) and npm 11.19.0
- Deployment compatibility: Node.js 24.x and npm 11.x (managed providers select patch versions)
- Docker with Compose v2

The repository is one npm workspace with one root `package-lock.json`. From a fresh checkout:

```sh
nvm use
npm install --global npm@11.19.0
npm run runtime:check
npm ci
npm run hooks:install
docker compose up -d --wait
cp .env.example .env.local
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner_test npm run db:migrate
```

The examples use only local synthetic credentials and a disposable PostgreSQL database. Never put participant data or production credentials in these files.

## Running locally

Start each process in its own terminal:

```sh
npm run dev
npm run api:dev
npm run worker:dev
```

The web app listens on `http://localhost:3000`, the API on `http://localhost:4000`, PostgreSQL on port `55432`, and Redis on port `56379`. Create a synthetic record through the existing HTTP application:

```sh
curl -i http://localhost:4000/v1/auth/register \
  -H 'content-type: application/json' \
  --data '{"email":"student@example.test","password":"synthetic-password","fullName":"Synthetic Student","college":"Synthetic College"}'
```

Stop and discard the local service data with `docker compose down`. PostgreSQL uses a `tmpfs`, so its contents are intentionally disposable.

## Checks

With the Compose services running, execute the same aggregate check used by CI:

```sh
npm run check
```

Focused commands are available as `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, and `npm run build:all`. API integration tests exercise the public HTTP application with real PostgreSQL and verify committed state through an independent connection. Tables are truncated deterministically between cases. The first test characterizes legacy registration durability; it does not certify the registration flow against the pilot policy.

Both API and worker environment loaders require the explicit `TEST_DATABASE_DISPOSABLE=true` acknowledgement, a loopback host, and a database name ending in `_test` whenever `NODE_ENV=test` or `CI=true`. CI provisions fixed local PostgreSQL and Redis services, so an automated check cannot silently target a remote production database.

## Branch and commit guard

Run `npm run hooks:install` once per clone. It configures the versioned pre-commit hook, which rejects commits on `main`. If `.git/hooks/pre-commit` already exists, the installer preserves it as `.githooks/pre-commit.local` and runs it after the branch guard. Work on a dedicated `codex/<ticket>-<description>` branch and merge through review.

## Module boundaries

- `app/`, `components/`, `hooks/`, `lib/`: Next.js web UI and browser/server adapters.
- `apps/api`: Express routes/controllers, domain services, repositories, and PostgreSQL migrations. Routes/controllers stay thin; services own policy and transactions; repositories own SQL.
- `apps/worker`: BullMQ job entry points and PostgreSQL-backed maintenance work.
- `packages/shared-types`: types shared by more than one application.
- `scripts`: repository-level setup, migration, guard, and smoke utilities.

## Current limitations

- The migration runner applies the existing forward SQL files but the deployed schema history is still unknown; ticket 02 must inventory and reconcile it before any production migration.
- Local Redis supports legacy queues. Redis durability, payment processing, chat, tracking, passenger listings, and other pilot-disabled behavior are not approved pilot capabilities.
- The PostgreSQL HTTP test is a characterization foothold. Later pilot-critical state changes still require dedicated authorization, concurrency, idempotency, rollback, notification, and recovery tests with separate connections.
- The new Next.js ESLint preset exposed legacy effect-state and callback-order findings. Those two compiler-oriented rules are temporarily isolated globally, and the misnamed callback false-positive is isolated to `RouteSection.tsx`; existing hook dependency warnings remain visible for follow-up.
- This setup neither deploys nor changes production data. Remote branch protection remains a repository-host setting for an operator to enable.
