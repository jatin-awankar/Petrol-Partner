# Recruiter demo: scope and final design baseline

Ticket 01 · 2026-10-24 · reviewed source baseline `f96d04c` (`origin/main`).

Ticket 02 implementation: see [the demo foundation and verification record](reviews/recruiter-02/README.md) for the now-implemented entry, session and clock. The route map below remains the full delivery target.

## Delivery contract

The first portfolio release is an explicitly labelled, browser-local simulation of a complete passenger/driver journey. It is usable without an account, a routing provider, a live API or database. It is not evidence of production booking readiness or server concurrency correctness. Keep the modular Next.js, Express and PostgreSQL application and every real-service gate intact.

The user confirmed the current landing page as the final design. Preserve its composition, copy hierarchy, illustration, palette and interactions. This ticket changes documentation only. Future demo entry should use the existing secondary hero-link treatment: propose replacing “See the idea” with “Try the demo” linking to `/demo`, while retaining the existing “How it works” navigation and account CTA. Make that small change when the demo is ready, not before. Do not replace the landing with a new template.

Local implementation tickets live in `.scratch/recruiter-demo/`. They are ignored by Git; this document carries the durable baseline for fresh checkouts. Read [frontend-redesign.md](frontend-redesign.md) for product language and [pilot-spec.md](pilot-spec.md) for protected historical behavior.

## Evidence and limits

Source inventory below refers to `f96d04c`, not the unrelated retention branch. Captures were made from the main checkout at `efdaa3a`; `git diff origin/main -- app/page.tsx app/landing.module.css` was empty. The landing and shared root layout/provider/shell/global-style files were compared against the reviewed baseline before delivery. See [capture evidence](reviews/recruiter-01/README.md).

“API-backed” below means implemented calls in the inspected source, not verified availability on a public deployment. This ticket did not sign in, mutate business state, inspect a deployed database or re-certify historical release evidence. The existing [release review](reviews/step-8/release-review.md) includes later operator-MFA addenda: read those alongside its earlier hold statements. Current sign-in health, populated protected outcomes, provider readiness and expiring preview resources need fresh verification in Ticket 06.

## Existing screen inventory

Each path maps directly to `app/<path>/page.tsx`; `/` maps to `app/page.tsx`. Supporting source is named where behavior comes from a provider or hook.

- `/`: public landing, with real account links and honest prelaunch copy. No demo entry exists. The root auth provider still runs here.
- `/login`, `/register`: API-backed account access through `AuthProvider` and `lib/api/backend.ts`; registration does not imply ride eligibility. Loading, errors and confirmation states exist. Keep separate from demo identity selection.
- `/recover`, `/recover/password`, `/auth/callback`: provider-backed recovery/callback flows. These require real provider configuration; never reuse them for fictional demo identities.
- `/support`: public explanatory support notice (`components/support/SupportNotice.tsx`); not proof of a staffed live support channel.
- `/dashboard`: server-authenticated `ParticipantHome`, with account readiness and next actions. It is not a public demo home.
- `/adult-declaration`: API-backed declaration, withdrawal and uncertain-operation lookup. This records self-declaration, not independent verification.
- `/driver-vehicle-declarations`: API-backed driver/vehicle declarations, revocation and operation lookup with adult prerequisites. Do not submit these forms for demo characters.
- `/profile-settings`: API-backed profile/preferences and declaration links via profile hooks; signed-out, unavailable and ready states.
- `/notifications`: authenticated durable in-app notices through `hooks/notifications/useInAppNotifications.ts`; not a fake demo notification feed.
- `/find-a-ride`: component-local synthetic route selection, point order, quote and request-state walkthrough. No passenger API call in the page. Empty/error/stale/restricted/unknown examples are independently selected, not one durable journey.
- `/offer-a-ride`: component-local vehicle and driver-state selector. Thirteen sample states include preparation, publication gate, incoming request, decisions, capacity, cancellation, replacement and recovery. It does not create a route or respond to the Find page.
- `/trips`: authenticated historical fixed-corridor commitments/reviews from `/v1/seat-requests`, plus a synthetic `JourneyStateGuide`. It does not consume the Find or Offer page state.
- `/direct-settlements`: authenticated historical obligations and protected claim/receipt/dispute/case actions through `/v1/direct-settlements`, plus a synthetic contribution guide. Do not wire a demo payment button to these calls.
- `/journey-reviews/[id]`: authenticated historical review details and actor-specific flow; not a new-policy synthetic review screen.
- `/payments`: authenticated, read-only historical platform-payment records. New platform collection remains disabled.
- `/eligibility`: authenticated historical student/corridor evidence and account restrictions. Historical approvals do not grant new-policy eligibility.
- `/search-rides`, `/post-a-ride`: legacy fixed-corridor screens with API reads AND mutation controls. They are not merely read-only archives and must not be linked from the demo. Preserve their data and gates.
- `/search-rides/[id]`: legacy ride/booking detail using existing hooks and gated generic API paths; exclude from the demo.
- `/messages-chat`: retained legacy chat code with `enableChatUi: false`. No demo chat scope.
- `/operator/mfa`: real managed MFA enrollment/challenge/verification and operator entry. Never expose a real operator login as a demonstration role.
- `/operator`, `/operator/restrictions`, `/operator/settlement-reviews`: real authorized queues, audited decisions and recovery/status handling. These stay outside the demo; a fictional review outcome is a local scenario action only.
- `app/loading.tsx` and `app/not-found.tsx`: shared fallback surfaces to account for in deep-link and reset checks.

### Server paths and existing gates

Trace for posted routes: `apps/api/src/modules/posted-routes/posted-routes.routes.ts` → `posted-routes.service.ts` / `seat-booking.service.ts` / `outcomes.service.ts` → their corresponding repositories. Router-wide `requireAuth` and private/no-store responses apply. Repositories own SQL; demo components must not import these server modules.

The older frontend design document says no passenger discovery endpoint exists. At this source revision, `GET /v1/posted-routes` and `GET /v1/posted-routes/published/:id` DO exist. Service reads use `passengerAccess`, which calls `assertPassengerPreviewEnabled` in `passenger-routes.ts`; this rejects outside tests. They also check eligibility/recovery and published route evidence. A missing/private route can return 404 before the preview gate. Do not describe these paths as publicly usable or implement a second discovery endpoint merely because the older prose says it is absent.

`POST /:id/quote` remains test-gated with `ROUTE_QUOTES_DISABLED`; posted-route seat requests/accept/reject remain test-gated with `ROUTE_BOOKINGS_DISABLED`; outcomes have their own non-test boundary. Owner-scoped `/mine`, `/:id` and preparation/preview exist, but preparation depends on declarations, verified routing, coverage and recovery evidence. `routing.ts` uses configured Valhalla, with injectable synthetic routing restricted to tests. A configured implementation is not proof the provider is available. Preserve all boundaries and do not deploy with `NODE_ENV=test` to bypass them.

### Reuse and isolation decisions for Ticket 02

Reuse candidates: `components/ProductStates.tsx`, `components/JourneyStateGuide.tsx`, `lib/formatPaiseAmount.ts`, existing page state vocabulary and fixture examples. Audit visual fit before reuse; do not copy whole API-backed screens into the simulator.

Existing examples live inside their pages rather than a shared scenario store. Introduce one demo-owned state boundary with deterministic transitions, versioned synthetic persistence and reset. Keep request, allocation, journey statements, obligation, payment claim, receipt and review distinct. Store monetary values as integer paise with currency and freeze accepted terms. This is simulation state, not a client-authoritative booking API.

`app/layout.tsx` mounts `ClientProviders`, `ParticipantShell`, `OperatorShell` and Analytics globally. `ClientProviders` mounts `AuthProvider`; its mount effect fetches the real current user, and its global auth-failure handler can redirect to login. `ParticipantShell` hides on specific public paths but does not currently exclude `/demo`. Ticket 02 must establish a demo boundary that avoids real auth fetch/refresh/logout, logged-in participant chrome and inherited redirect handling, while preserving actual account authentication behavior. A route prefix alone is insufficient. Decide whether Analytics belongs in the standalone demo; core functionality must not depend on telemetry.

`proxy.ts` uses cookie presence for selected route redirects; `/demo` is not currently matched. Server authorization remains mandatory for real APIs. The demo should remain usable both signed out and when a real account session already exists, without reading or changing that session.

Use a dedicated versioned storage key, no secrets or real personal data, and an in-memory fallback when persistence is unavailable. Document tab semantics: localStorage is shared within one origin/browser profile; it does not give per-tab isolation. Separate browser profiles/contexts must remain independent. Reset must clear only demo-owned state. Use an explicit scenario clock so wall-clock passage cannot silently invent travel or payment.

## Final landing design references

Authoritative files: [app/page.tsx](../app/page.tsx), [app/landing.module.css](../app/landing.module.css); body typography and surrounding composition also come from [app/layout.tsx](../app/layout.tsx) and [app/globals.css](../app/globals.css). CSS selector names below are stable lookup anchors.

- Palette (`.page`): ink `#1a261f`, green `#173e34`, paper `#f5f1e7`, lime `#d8ee86`, orange `#ec794f`. Secondary surfaces include ticket `#f9f6eb`, step `#fffdf5`, pale step `#edf1d8`. Use paper/ink for task readability, lime for emphasis and orange sparingly; status meaning also needs text.
- Typography: heavy Arial/Helvetica display headings (`.hero h1`, `.pilotCopy h2`, `.cta h2`), Georgia serif section and route titles (`.sectionHeading h2`, `.ticketRoute strong`), monospace labels (`.kicker`, `.heroLabel`, `.ticketTop`), system sans body inherited from the root. No external font is required by this landing. Keep large compressed display type on marketing surfaces; use readable task-heading and body sizes inside forms.
- Scale: desktop hero `clamp(64px, 7.3vw, 114px)`, line-height `.84`, letter spacing `-.095em`; serif section heading `clamp(42px, 4.6vw, 74px)`. Body examples are 13–15px with 1.65–1.8 line-height. These are observed marketing values, not blanket requirements to use tiny labels in the application.
- Layout: maximum 1480px, horizontal padding `clamp(24px, 4vw, 72px)`, desktop hero 55/45 split. Section spacing `clamp(76px, 8vw, 130px)`. Use the alignment/rhythm at suitable task-screen density; do not reproduce a giant marketing hero on every screen.
- Shape: predominantly square panels/buttons, 1.5–2px ink borders, hard offset shadows. Rounded geometry is intentional for brand mark, route dots, stamp and Later pills (`25px`), not every card.
- Illustration: CSS ticket, dashed route, barcode and rotated paper/stamp. Reuse the ticket/route motif for a compact trip summary. Preserve the landing illustration; do not introduce a paid map dependency to recreate it.
- Interaction: primary button 57px minimum height, 5px orange shadow, hover translate 2px and 3px shadow over `.2s`. Secondary links and navigation use 44px minimum height. Visible focus is a 3px orange outline with 4px offset; skip link has its own focus reveal.
- Responsive behavior: the later 901–1050px override restores the desktop hero split, so the effective single-column hero begins at 900px and below. At 650px and below, header navigation hides, hero actions wrap, steps stack, and illustration/shadows scale down. Do not infer breakpoints solely from the first 1050px rule.
- Motion: restrained hover and skip-link transitions; reduced-motion overrides remove those transitions. The “marquee” is a wrapping static strip, not continuous scrolling animation. Preserve this restraint.

Screenshots and measured viewport evidence are in [reviews/recruiter-01](reviews/recruiter-01/README.md). Future shared tokens should be introduced only as screens need them, with screenshot checks to ensure the landing stays unchanged.

## Proposed demo screen and state map

These routes are planned, not implemented. All stay under `/demo`; navigation never silently exits to an API-backed participant route. Persistent chrome shows “Demo — no real rides or payments”, the current role, Switch role, Reset demo and Back to website. Driver-first entry explains how to create the sample passenger request; the default guided start is Passenger.

1. `/demo` — visitor chooses Passenger or Driver; sees fictional identities and what can be tried. Continue opens demo Home. Existing state offers Resume or Reset. Reset is scoped to the demo and explains that only this scenario is removed.
2. `/demo/home` — current actor sees scenario progress and the next action. Passenger starts Find; driver sees the sample offer or incoming request. Initial state has a seeded offer but no request/allocation/debt. Role switching preserves shared scenario state.
3. `/demo/find` — passenger selects a preset route; outcome is a selected route detail. Include no-results and load-error scenario controls with an explicit return to the normal scenario.
4. `/demo/routes/[id]` — passenger chooses ordered on-route preset stops and reviews a simulated distance/contribution. Validate reverse/same-stop selections, show a stale-quote scenario and clearly mark quotes as simulated. Confirm requests one seat and moves to Pending; it allocates no capacity.
5. `/demo/offer` — driver inspects the seeded route, vehicle, departure and whole-ride capacity. Incoming request links to review. For the initial demo, route creation/publication is pre-seeded; arbitrary route drawing, new live publication and geocoding are out of scope.
6. `/demo/requests/[id]` — passenger sees pending status and “Switch to driver to respond”; driver reviews the same selection and accepts/rejects. Acceptance freezes the terms and allocates exactly one whole-ride seat. Rejection creates no allocation. Include full-capacity and simulated uncertain-result scenarios with clear recovery instructions.
7. `/demo/trips/[id]` — both roles inspect the same accepted commitment. Driver explicitly advances the scenario clock, starts departure and records boarding. Driver and passenger independently submit journey statements. Agreement establishes the obligation; disagreement or simulated silence opens review without inventing debt. Predeparture cancellation releases the seat exactly once. Post-start interruption becomes review.
8. `/demo/contributions/[id]` — passenger sees frozen obligation and records a simulated cash/UPI claim; driver explicitly confirms receipt or disputes it. A claim is “Awaiting receipt”, not “Paid”. No QR, bank details, payment API, external UPI intent or money movement. A simulated overdue clock changes visibility, not payment facts.
9. `/demo/reviews/[id]` — participant reads fictional disagreement/cancellation/review explanation and next actor. An explicitly labelled scenario control may demonstrate a reasoned outcome; this grants no operator authority. Review closure alone never implies travel or receipt.
10. Completed journey — both roles see a concise timeline of request, acceptance, statements, obligation, claim and receipt. Offer Reset and an engineering explanation; do not claim real-world scale or production launch.

Across every screen: loading/initialization, missing fixture/deep-link, invalid transition, restricted scenario, recoverable error, unavailable persistence and reset outcomes need clear text. Unknown-result exercises are simulated and cannot establish backend idempotency. Main scenario should work with API/network failures after assets have loaded; offline installation/PWA support is not part of this ticket.

## Runtime, deployment and checks

Keep the npm workspace, Next.js 16/React 19 web UI, Express API and PostgreSQL repositories. The pinned development runtime is Node 24.20.0/npm 11.19.0. Existing packages include Radix, Tailwind, Lucide and motion libraries; no new UI/map/state package is justified by this inventory. Legacy Redis/BullMQ, Socket.IO, Razorpay and Mapbox dependencies need consumer audits before later removal. Their presence does not make the corresponding feature available.

`next.config.ts` rewrites `/v1/*` to `API_PROXY_TARGET`, defaulting to the shared Render service. `lib/frontend-config.ts` separately derives an API URL, defaulting to localhost:4000. `lib/api/client.ts` handles requests, refresh and retry. Ticket 06 must validate the effective configuration instead of assuming a missing variable is harmless. No deployment settings or provider accounts were changed here.

Relevant checks already exist: `scripts/landing-eligibility.test.mjs`; rendered tests for participant shell/Home, Find, Offer, Trips, direct settlements and declarations under `apps/api/src/test/`; `http-postgres.integration.test.ts` for real database behavior. `.github/workflows/checks.yml` provisions PostgreSQL 17.6 and runs the aggregate `npm run check`. Read current package scripts at implementation time. Browser-local simulator tests belong beside the new behavior; they do not replace PostgreSQL integration tests for critical backend changes.

## Ticket handoff

Ticket 02 can implement the isolated demo shell, versioned state and role/reset controls using this baseline. It must not enable real route actions. Tickets 03–04 connect the full scenario; Ticket 05 polishes task screens; Ticket 06 verifies live environment/account boundaries; Ticket 07 performs evidenced cleanup; Ticket 08 prepares authorized free hosting; Ticket 09 adds recruiter presentation. A database-backed sandbox remains optional Ticket 10.

## Ticket 03 implementation

The connected preset request/acceptance slice is now implemented under `/demo`. See [Ticket 03 evidence and simulator boundaries](reviews/recruiter-03/README.md). Pending, accepted, declined and expired requests are distinct from the accepted allocation. Journey and contribution records remain the next ticket; the broader screen map above still includes later polishing targets.

## Ticket 04 implementation

The same sample now continues through explicit departure/boarding, both journey statements, a contribution, a simulated cash/UPI claim and separate driver receipt. Cancellation, absence, interruption, disagreement and missed-response reviews remain distinguishable. See [Ticket 04 walkthrough and evidence](reviews/recruiter-04/README.md). No real operator or payment power was added; unresolved review outcomes are explained rather than fabricated.
