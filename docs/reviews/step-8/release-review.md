# Step 8 cross-page QA and release review

2026-10-02 · branch `codex/08-cross-page-qa` · base `ac9c5c4`

## Scope and recommendation

The local `main` and `origin/main` both point to `ac9c5c4`, **Merge pull request #77**. The GitHub API could not be reached during this review, so that local commit graph is the merge evidence. The untracked `.worktrees/` directory and all existing data were left intact.

**Recommendation:** review and merge this frontend QA slice after CI. Do **not** authorize real bookings or describe the redesigned journeys as live. Public discovery, passenger quotes, posted-route seat actions, route outcomes, payment collection, chat, tracking, and matching remain launch gated. The authenticated UI and the step 7 operator evidence gaps below still need separate server and staging proof.

## Walkthrough and evidence

- **Public and access:** Opened `/`, `/login`, `/register`, `/recover`, and `/recover/password` in the local browser. Checked account versus ride eligibility copy, form labels, recovery navigation, keyboard tab order, the landing skip link, and the sign-in return path. Fixed duplicate level-one headings and main landmarks on sign-in/register, removed a duplicate registration link, gave the inactive Google option an explicit disabled state and explanation, and added a landing link. The callback requires a real auth redirect and was inspected through source and existing auth checks only.
- **Passenger and driver preview:** Opened `/find-a-ride` and `/offer-a-ride` at three widths. Walked the synthetic ordered-point, sample quote, pending request and unknown-result path, plus the driver state selector through its recovery state. These previews made no booking mutation and remained labelled as samples. Reviewed rendered fixtures for loading, empty, failed discovery, stale quote, restriction, each request outcome, private preparation, publication gate, capacity, cancellation, replacement, and recovery.
- **Participant account and records:** Inspected `/dashboard`, `/adult-declaration`, `/driver-vehicle-declarations`, `/profile-settings`, `/eligibility`, `/notifications`, `/trips`, `/direct-settlements`, `/payments`, and `/journey-reviews/[id]` in source and their rendered synthetic tests. Confirmed the current declarations are called self-declarations; historical corridor approval, fixed-corridor trip records, direct contribution claims, driver receipts, and historical platform-payment reads have separate labels. Recent Trips reads are limited by the pilot's ordinary detail-access window and are not a complete archive. The account, notification, journey, contribution, and review tests cover loading, empty, restricted, failed reads, retry, and uncertain protected outcomes where the page offers an action.
- **Operator:** Opened `/operator` signed out and confirmed its access gate. Inspected the workspace, restriction, and settlement review pages and their synthetic rendered tests for loading, forbidden, partial read failure, pending decisions, same-key retry, status lookup, recovery, delivery, and historical case distinctions. Added an operator skip link and removed duplicate main landmarks/IDs across its three pages. No protected operator record was opened in the browser.
- **Legacy routes:** Reviewed `/search-rides`, `/search-rides/[id]`, `/post-a-ride`, and `/messages-chat` in source as historical/disabled surfaces. They are not destinations in the redesigned primary navigation. No legacy write was exercised.
- **Responsive and access:** Captured 375×812, 768×1024, and 1440×900 screenshots. The opened public/prelaunch pages had no document-level horizontal overflow or unlabelled input/select/textarea in a browser DOM scan. Visual review of the captured views found no clipped primary action or obvious text/background contrast failure. Keyboard focus reached the landing skip link and then the main target; tabbing into sign-in reached the labelled email field. This is a sampled contrast and keyboard review, not a full automated accessibility certification.

### Screenshots

The [screenshots directory](screenshots/) contains the phone, tablet, and desktop viewport captures for `landing`, `sign-in`, `find-gated`, `offer-gated`, and `operator-access`, plus [synthetic passenger unknown result](screenshots/phone-find-unknown-synthetic.png) and [synthetic driver recovery](screenshots/tablet-offer-recovery-synthetic.png). The operator images show the signed-out gate; they are not evidence of an authenticated queue.

### Authenticated paths not exercised in a browser

No disposable, browser-authenticated participant or MFA-enabled operator account was available in this checkout. Therefore the browser review could not enter Home readiness, declarations, account settings, notifications, Trips, Contributions, historical payments/reviews, or protected operator queues and decisions. Their states were rendered with synthetic mocked identities and API fixtures in `apps/api/src/test/*.test.tsx`; those tests verify frontend behavior but cannot establish live identity, PostgreSQL, recovery, or staging behavior. No existing personal account, database, or `.worktrees/` content was used as a fixture.

## Server gates and step 7 assessment

`apps/api/src/modules/index.ts` closes generic ride listings/writes, matching, pricing, chat, tracking, webhooks, and payment writes. `posted-routes.service.ts` allows a driver-private `prepared` route, but quotes return `ROUTE_QUOTES_DISABLED` outside tests; `seat-booking.service.ts` and `outcomes.service.ts` return `ROUTE_BOOKINGS_DISABLED` outside tests. Their production-boundary cases exist in `http-postgres.integration.test.ts`. This review did not alter those services or enable capabilities.

The step 7 gaps remain **open**:

- **Cancellation and departure:** `/v1/operator/cancellation-reviews` and `/departure-reviews` provide read-only pilot signals. The workspace cannot show an actionable case detail, decision, actor, or reliable deadline from those reads.
- **Restriction source and impact:** the restriction command requires a reviewed incident/settlement source ID and evidence summary, and the service checks that the target participated. The form still cannot preview the source record or all affected active commitments before submission.
- **Cross-domain audit:** case-specific histories exist, but there is no authorized, paginated audit feed joining decisions and outcomes across domains.
- **Live-route incidents:** posted-route incident reads and outcomes are test gated by `outcomes.service.ts`; the operator workspace cannot claim a production new-policy incident queue.

These need a **separate reviewed API slice**, following a deployed-schema/user inventory and historical-policy reconciliation. Define operator-scoped case detail and source/impact reads, cancellation/departure resolution commands where policy permits them, a paginated cross-domain audit read, live-route incident reads, and operation lookup for every command. Preserve the current booking gate. Verify server authorization, stale operator/MFA denial, idempotency, decision races, audit, notification failure, and restore behavior with separate PostgreSQL connections before wiring a live UI. Do not present the current read-only signals as completed operational coverage.

## Checks

- `npx vitest run src/test/auth-access-pages.test.tsx src/test/operator-landmarks.test.tsx src/test/operator-workspace-page.test.tsx src/test/account-restriction-page.test.tsx src/test/settlement-review-page.test.tsx` from `apps/api`: **33 passed** across 5 files.
- `npx vitest run src/test --exclude src/test/direct-settlement-browser.integration.test.tsx --exclude src/test/http-postgres.integration.test.ts --exclude src/test/b2-live.integration.test.ts` from `apps/api`: **128 passed** across 22 rendered/unit test files.
- `node --test scripts/landing-eligibility.test.mjs` with loopback access: **2 passed**.
- `npm run lint`: **passed**, zero errors and nine existing warnings. `npm run typecheck`: **passed** for root, API, and worker. `npm run build:all` with local process access: **passed** for Next.js, API, worker, and shared types. `git diff --check`: **passed**.
- `npm run check` did **not** complete. The first attempt was stopped when ESLint entered preserved untracked `.worktrees/` generated files; `eslint.config.mjs` now ignores that directory. The restart reached root tests and was stopped after a localhost landing test could not bind in the default sandbox. Its Docker runtime test also failed because the expected Node image was unavailable. The landing test passed separately with loopback access. A direct attempt to include the PostgreSQL browser integration test was denied by sandbox networking (`EPERM 127.0.0.1:55432`); no database test setup or migration was attempted. PostgreSQL integration and full CI remain unverified here.

No migration, deployment, payment, email, or real booking action was performed.
