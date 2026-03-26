# Petrol Partner Backend Runbook

This repo now contains three runtime surfaces:

- `web`: the existing Next.js application
- `apps/api`: the production Express API
- `apps/worker`: the background worker for expiry, overdue, reconcile, and recovery sweeps

## Production Shape

- Platform target: `Render`
- Database: `Supabase Postgres`
- Queue/runtime state: `managed Redis`
- Auth transport: `httpOnly` cookies, so the web app and API should live under the same parent domain

## Local Development

1. Copy:
   - `apps/api/.env.example` -> `apps/api/.env`
   - `apps/worker/.env.example` -> `apps/worker/.env`
2. Start local Postgres and Redis.
3. Apply the schema from `apps/api/src/db/migrations/0001_init.sql`.
4. Run:
   - `npm run api:dev`
   - `npm run worker:dev`
   - `npm run dev`

## Verification Model

- Student verification submissions are `pending_review` until approved by an admin.
- Driver eligibility submissions are `pending_review` until approved by an admin.
- Vehicles are `pending_review` until approved by an admin.
- Only verified students can create ride requests, bookings, or settlements.
- Only users with approved driver eligibility and an approved vehicle can create ride offers.

## Critical Execution Flow

1. User registers and logs in.
2. User submits student verification, driver eligibility, and vehicle details.
3. Admin reviews pending verification items through the API.
4. Verified students create ride offers or requests.
5. Match refresh requests are persisted and processed by the API background processor.
6. Bookings are created and expiry jobs are recovered by worker sweeps if queue dispatch was missed.
7. Completed bookings open settlements.
8. Overdue settlements are recovered by worker sweeps if queue dispatch was missed.
9. Online payments flow through Razorpay order creation, client verify intake, webhook persistence, and worker-driven reconcile.
10. Stale webhook or client-verify states are recovered by worker sweeps.

## Deployment

- Use `render.yaml` as the baseline blueprint.
- Deploy `apps/api` and `apps/worker` as separate services.
- Do not deploy production without Redis configured.
- Keep `ENABLE_CHAT=false` and `ENABLE_TRACKING=false` until those runtimes are implemented.

## Verification Commands

- API typecheck: `npm --prefix apps/api run typecheck`
- API tests: `npm --prefix apps/api run test`
- Worker typecheck: `npm --prefix apps/worker run typecheck`
- Worker tests: `npm --prefix apps/worker run test`

## Frontend Cutover Flags

Create `.env.local` from `.env.local.example` and set:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_USE_NEW_AUTH=true`
- `NEXT_PUBLIC_USE_NEW_VERIFICATION=true`
- `NEXT_PUBLIC_USE_NEW_RIDES=true`
- `NEXT_PUBLIC_USE_NEW_BOOKINGS=true`
- `NEXT_PUBLIC_USE_NEW_SETTLEMENTS=true`
- `NEXT_PUBLIC_USE_NEW_PAYMENTS=true`
- `NEXT_PUBLIC_ENABLE_COMMUNITY_UI=false`
- `NEXT_PUBLIC_ENABLE_RATINGS_UI=false`
- `NEXT_PUBLIC_ENABLE_CHAT_UI=false`
- `NEXT_PUBLIC_ENABLE_TRACKING_UI=false`

Legacy Next.js auth endpoints are deprecated and return `410`. Frontend auth must use Express `/v1/auth/*`.

## Staging Smoke Gate (Before Full Frontend Cutover)

1. Login on web and confirm `GET /v1/auth/me` returns authenticated user.
2. Submit verification and approve it from backend/admin flow.
3. Create ride offer/request and confirm listing/detail pages work from `/v1/rides/*`.
4. Create booking, confirm, complete ride, and confirm settlement is opened.
5. Complete one offline settlement and one Razorpay sandbox online settlement.
6. Verify overdue hold is applied when unpaid and removed after successful payment.

## Automated Staging Smoke Script

Run:

- `npm run smoke:staging`

Required environment variables:

- `SMOKE_API_BASE_URL`
- `SMOKE_PASSENGER_EMAIL`
- `SMOKE_PASSENGER_PASSWORD`
- `SMOKE_DRIVER_EMAIL`
- `SMOKE_DRIVER_PASSWORD`

Optional (recommended for auto-approval):

- `SMOKE_ADMIN_EMAIL`
- `SMOKE_ADMIN_PASSWORD`

What it verifies:

- Express auth cookie flow (`/v1/auth/*`)
- Verification submission + optional admin approval
- Ride offer creation with approved vehicle
- Booking create -> confirm -> complete
- Settlement creation after completion
- Online payment order creation + payment status read
