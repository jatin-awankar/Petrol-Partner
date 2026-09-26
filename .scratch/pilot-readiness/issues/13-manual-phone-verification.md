# 13: Automatic phone verification and replacement

**What to build:** A participant proves ownership of a phone through automatically delivered SMS verification and safely replaces it without exposing an unverified number.

**Blocked by:** 09 (Protected operator access and recovery-aware pause).

**Status:** superseded

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 6, 7, 8. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Provide applicant/operator views for a normalized phone, verification challenge, pending status and completion.
- [x] Generate random short-lived single-use codes, store only their hash while pending, limit attempts and remove challenge material after success/expiry. Keep codes and full phone values out of ordinary logs.
- [x] When paid delivery is enabled, the applicant requests an automatically sent SMS code. The operator can inspect verification status but cannot view or issue codes.
- [ ] Identify an ongoing zero-cost SMS provider, configure it, and rehearse real delivery with approved numbers before pilot use. Paid sends are prohibited by the current project decision.
- [x] Record method, the human verifier when one exists, verification/change timestamps and audit history. Use idempotent audited operations with required independent evidence for protected eligibility changes.
- [x] Keep a replacement unverified and unshared until ownership succeeds; preserve the previous verified contact until the controlled switch. Expose verification state for later offer/request eligibility checks.
- [x] Provide a reusable contact-loss event/condition for future confirmed-commitment review; the booking/incident slices must integrate it when those workflows exist.
- [x] Test expired/reused/wrong challenges, repeated completion, unauthorized changes, private response handling and pending replacement through HTTP/PostgreSQL and a browser flow.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Comments

- 2026-09-26: The maintainer removed phone ownership verification from the controlled pilot. The zero-cost SMS requirement and lack of a manual verification option made the automatic flow unusable. This ticket is superseded, not resolved. Its unmerged implementation remains on `codex/13-manual-phone-verification` for history and must not be merged into the pilot. The pilot spec and dependent tickets now omit verified-phone eligibility and participant phone sharing. Optional phone numbers remain private and unverified.

- 2026-09-26: User changed the delivery requirement to automatic phone codes and chose a provider, with no paid sends yet. Implementation uses Twilio Programmable Messaging SMS behind a disabled-by-default paid-send gate. Live delivery evidence and authorization to enable paid sends remain pending; ticket stays claimed.

- 2026-09-26: Ticket wording updated to the user-approved automatic delivery flow. The disabled paid-send gate and required provider rehearsal remain explicit.

## Answer

Implemented automatic SMS code requests using Twilio Programmable Messaging behind a disabled-by-default paid-send gate. The API uses random six digit codes, stores a keyed hash while pending, limits attempts and expiry, records audited/idempotent operations with recovery receipts, and exposes only verified contact for eligibility and sharing. The applicant can resend; operators can inspect status but cannot view or issue codes. A replacement preserves the previous verified contact until a successful ownership check.

HTTP/PostgreSQL integration tests previously passed for wrong, expired, reused and competing completion; idempotency; unauthorized access; private responses; replacement; failed delivery and immediate resend; crash/recovery; and contact loss. Full suite on 2026-09-26: 72 API tests passed, 1 skipped, 13 worker tests passed. Typecheck, lint (0 errors, 10 pre-existing warnings), and production build passed.

Synthetic browser rehearsal on 2026-09-26 used the real Next.js phone page and a local mock API, with no database or SMS provider connection: failed first send showed a pending number and resend action; resend exposed code entry; wrong code showed feedback; correct code verified the first number; submitting a replacement kept the old verified number until correct-code completion switched it. The changed wrong-code message was checked again in the browser.

Remaining before resolving: configure Twilio credentials and the India sender/template route, review provider retention and spending controls, authorize paid sends, and rehearse live SMS delivery and recovery with approved test numbers. No paid sends occurred. Ticket stays claimed.

- 2026-09-26: User clarified that SMS sends must remain free now and for the project lifetime. Twilio is not eligible: its Programmable Messaging SMS is usage-priced. Firebase phone SMS is billed per send, and AWS SNS has no SMS free tier. No Twilio account was created, no credentials were added, and no live SMS was sent. Delivery remains disabled and ticket remains claimed pending an evidenced sustainable zero-cost delivery route or a revised verification requirement.
