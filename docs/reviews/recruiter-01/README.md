# Ticket 01: landing capture and inventory evidence

Captured 2026-10-24 from local Next.js development server at `http://127.0.0.1:3011/`. This is local evidence, not a public deployment certification.

## Source identity

Documentation branch: `codex/01-recruiter-design-baseline`, based on fetched `origin/main` at `f96d04c`. The local frontend ran in the existing checkout at `efdaa3a`; the landing files, root layout, global styles, providers and participant/operator shells have no diff against `origin/main`. Existing retention work was not included in this branch. Runtime: Node 24.20.0, npm 11.19.0 (`npm run runtime:check` passed).

The server was started with `API_PROXY_TARGET=http://127.0.0.1:9` and `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:9` so auth reads could not reach the shared service. Landing returned HTTP 200. The root provider attempted `/v1/auth/me`, which failed against the intentionally unavailable local endpoint; the landing remained visible. This confirms the automatic auth coupling described in the baseline, not account-flow health.

## Captures

- [Desktop](landing-desktop.jpg): 1440 × 900 viewport; measured document width 1440; one H1.
- [Tablet](landing-tablet.jpg): 768 × 1024 viewport; measured document width 768; one H1.
- [Phone](landing-phone.jpg): 375 × 812 viewport; measured document width 375; one H1.

These are original viewport screenshots, not edited composites. Full-page capture initially produced duplicated/stitching artifacts and was replaced; those artifacts are not application findings. The Next.js development indicator may appear in captures and is not part of the approved design. Viewport overrides were reset after capture.

Visual inspection: desktop retains the split hero and route-ticket illustration; tablet stacks the illustration below the copy; phone hides desktop navigation and wraps the action row. No obvious hero clipping was observed. Document-width checks establish no horizontal page overflow at these sampled sizes; they do not certify every element or breakpoint. Phone Tab focused “Skip to main content”; Enter focused `#landing-content`.

No changes were made to the landing. These checks are a baseline, not a complete accessibility or cross-browser audit. Full-page lower-section screenshot coverage and populated authenticated journeys belong to later QA.

## Checks

- `npm run runtime:check`: passed with the pinned versions.
- From `apps/api`, `../../node_modules/.bin/vitest run --pool threads --maxWorkers 1 src/test/find-ride-page.test.tsx src/test/offer-ride-page.test.tsx src/test/participant-shell.test.tsx`: 3 files, 34 tests passed.
- Initial `npm --workspace @petrol-partner/api run test -- ...` unexpectedly selected all `src` because the package script already includes that positional filter: 37 files passed, 5 failed, 1 skipped. Failures involved restricted local PostgreSQL/socket access (`EPERM`); this is not a full-suite pass. The focused command above corrected the selection. No database migration was performed.
- Initial sandboxed landing test could not complete local-server setup and was interrupted. Its permission-enabled rerun is recorded below.
- No application source changed; lint/type/build/database certification is not claimed for this documentation-only ticket.

See [scope and design baseline](../../recruiter-demo-baseline.md) for current routes, source-backed API gates, reusable components, dependency inventory and the proposed screen/actor/action/outcome map.

- Permission-enabled `node --test scripts/landing-eligibility.test.mjs`: 3 tests passed.
- `git diff --check`: passed. Local Markdown links in the new baseline/evidence documents were checked; all targets exist.
