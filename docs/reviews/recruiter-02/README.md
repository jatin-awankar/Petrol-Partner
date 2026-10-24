# Ticket 02 — isolated demo foundation

2026-10-24 · branch `codex/02-recruiter-demo-foundation` · base `f121260` (merged Ticket 01).

## Delivered scope

`/demo` offers fictional passenger Mira and driver Arjun without registration. `/demo/home` shares one preset route and an explicitly controlled sample clock between those roles. Visitors can switch roles, refresh/resume, cancel or confirm reset, and recover from a missing demo link. The landing source, layout design and links remain unchanged; its eventual demo CTA belongs to the presentation ticket.

This is the foundation, not the completed booking demo. Requests, acceptances, trip outcomes and contribution flows remain Tickets 03–04. The UI says so explicitly and exposes no placeholder booking/payment buttons. The sample route is not published or provider-verified. No production API, migration, permission, launch gate or stored business record changed.

## Implementation contract

- `app/providers/ApplicationFrame.tsx` keeps the existing AuthProvider/theme/toast/navigation/Analytics composition for real pages. Only the exact `/demo` segment and descendants omit it. The existing root main landmark is retained. Prefixes such as `/demonstration` do not bypass real providers. This affects presentation only; API authorization and `proxy.ts` are unchanged.
- Unmounting the real provider removes its registered auth-failure handler when entering the demo. Demo pages do not import account hooks or live API adapters. Analytics is not mounted on direct demo entry; an explicit beforeSend filter also drops demo events if an analytics script was previously loaded on a real page. Previously initiated real-page requests are not retroactively cancelled by this feature.
- `lib/demo/session.ts` owns fixtures, strict version-1 persistence validation, role/clock transitions, subscription and reset. The current schema stores only version, fictional role enum and sample minute. Names, route stops and capacity are immutable source fixtures, not browser-supplied identities. No real credentials, account identifiers or personal details are persisted.
- Persistence uses `sessionStorage` key `petrol-partner.demo.session`, with a schema version in its value. Refresh in the same tab resumes. Independent new tabs have independent session storage; a browser duplicate-tab feature may initially copy a snapshot, after which they diverge. Browser session restoration may restore a closed tab. No cross-device or account persistence is promised.
- Read/parse/version/shape failures recover safely. Invalid content is replaced only in the demo key. Write/access failures fall back to memory with a visible warning that refresh may restore older saved state or start again. Reset overwrites only the demo key with the initial state; it never clears shared browser storage or touches cookies.
- A role must be chosen before the clock can advance. Only explicit 15/60-minute increments are accepted, within a 48-hour sample window starting Day 1 at 15:00. The sample departure stays Day 1 at 17:00. Wall-clock time, role changes and reset do not create travel/payment facts. Invalid actions and overflow leave the snapshot unchanged.
- The demo layout owns its provider, shell, scoped CSS, fictional identity selection and accessible Radix reset dialog. A nested missing-page view links back to `/demo`, avoiding the real dashboard fallback. All business transitions remain absent until later tickets implement them.
- Extend the schema and transitions for Tickets 03–04 with distinct request, allocation, journey, obligation, claim, receipt and review records. Preserve safe handling of incompatible saved versions. Do not connect these local actions to a production API or deploy a test runtime to bypass service gates.

## Visual and browser verification

Tested the optimized production build at `http://127.0.0.1:3012`, with both API target settings directed to unavailable local port 9. The browser completed demo actions while the API was unavailable. No backend was started, no account login was performed, and no demo API-proxy errors appeared. Returning to the real landing did attempt its existing auth read; that expected failure is separate from demo operation.

- Passenger selection reached Home; explicit +15 minutes and switching to Driver retained the same clock. Reload retained Driver and Day 1 at 15:15.
- A second independently opened tab at `/demo/home` showed “Choose your perspective” while the first tab retained Driver. Separate storage adapters are also covered by unit tests. These are tab-isolation checks, not tests against real user accounts.
- Reset opens a named dialog with “Keep exploring” focused. Escape cancels and returns focus to Reset demo. Confirming reset returns to role selection with no selected role. The fresh Home deep link provides an entry link instead of redirecting to real sign-in.
- `/demo/missing-page` displays the demo-specific fallback; Return to demo works. Its copy correctly preserves existing sample state.
- Home at 375×812, 768×1024 and 1440×900 had one main, one H1 and document width equal to viewport width. Screenshots were inspected for text clipping and hierarchy; no unintended horizontal overflow was observed at those samples.
- Tab reached the skip link and Enter focused `#demo-content`. Reset was checked on phone with visible keyboard focus. Viewport overrides were restored afterward.
- The final landing was visually checked at 1440×900 after leaving the demo; its original design remained intact. `app/page.tsx` and `app/landing.module.css` have no diff.

Original viewport JPEG captures (not composites):

- [Entry, desktop](entry-desktop.jpg) and [entry, phone](entry-phone.jpg).
- [Home, desktop](home-desktop.jpg), [Home, tablet](home-tablet.jpg), [Home, phone](home-phone.jpg).
- [Reset dialog, phone](reset-phone.jpg).
- [Landing regression, desktop](landing-regression-desktop.jpg).

This is sampled local browser evidence, not a complete accessibility certification, provider-backed account session rehearsal or deployed-release acceptance. Storage-denied, obsolete/malformed storage and synthetic existing-account-cookie cases are automated test evidence, not manual browser-provider tests.

## Verification commands and outcomes

- `npm run lint`: passed with nine pre-existing warnings; no new warnings.
- `npm run typecheck`: passed for frontend/API/worker.
- `npm run build`: optimized production frontend passed, including `/demo`, `/demo/home` and the nested missing-page route.
- `npm run build --workspaces --if-present`: API, worker and shared-types builds passed.
- From `apps/api`: `../../node_modules/.bin/vitest run --pool threads --maxWorkers 1` with all `src/test/*.test.tsx` except `*.integration.test.tsx`, plus `src/test/demo-session.test.ts`: 28 files, 175 tests passed, including the storage-unavailable UI case.
- `node --test scripts/landing-eligibility.test.mjs`: three tests passed.
- The actual ApplicationFrame/DemoProvider integration test uses a synthetic pre-existing account cookie, checks no fetch calls across role selection/reset, and verifies cookie/unrelated-storage preservation. Frame tests cover real-provider remount behavior and analytics event filtering.
- `git diff --check` and documentation-link checks: passed before commit.

The first sandboxed build stalled and was stopped; the permission-enabled production build passed. The first rendered demo-test attempt needed an explicit CSS-module mock because the existing API test runner cannot load the frontend PostCSS configuration; visual CSS verification uses the real production browser build. No production configuration was relaxed. Nested worktree builds warn about multiple workspace lockfiles; no lockfile or dependency changes were made.

The PostgreSQL integration suite was not run locally for this frontend-only ticket; there are no server transaction changes. Repository CI still runs its aggregate checks. Local simulation tests establish only demo behavior and are not evidence for production capacity, locking or recovery guarantees.
