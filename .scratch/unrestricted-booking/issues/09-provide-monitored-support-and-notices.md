# 09: Provide monitored support and notices

**What to build:** Applicants and participants can find a working support contact, while operators can monitor route-booking notices and handle urgent delivery failures.

**Blocked by:** 04 (Approve operating and support policy).

**Status:** claimed

- [x] Publish the controlled contact and coverage in the relevant application views; verify it is monitored and test the fallback procedure.
- [ ] Extend durable event and email work, retry and stalled-work visibility, and urgent outreach for the new policy without assuming delivery means receipt.
- [x] Verify support privacy and failure behavior with synthetic events, including notification failure after a committed action; reuse applicable pilot-readiness 10 and 27 work.

## Current completion decision — 2026-10-03

The maintainer explicitly instructed: “consider 1 and 2 as done and update the docs as per that”. This refers to the follow-up resolution plan's **(1) monitored support, receipt/response and fallback rehearsal** and **(2) independent active-trip escalation and missed-contact rehearsal**, not acceptance criteria 1 and 2 above. These two operational items are accepted as complete for ticket tracking on the maintainer's authority. Acceptance criterion 1 is therefore checked; the booking-notice criterion remains partial.

Evidence classification: **maintainer-accepted completion**, not an independently observed agent test. No new message timestamps, escalation contact identity/channel, paging receipt or rehearsal artifacts were supplied in this instruction. Do not invent those details, rewrite the earlier synthetic test results as live results, or infer authorization to enable bookings. Retain the operational record references for the release review when available.

**Remaining item 3: booking-specific end-to-end evidence.** Existing synthetic request/acceptance, cancellation, journey/payment notice, failure/retry, privacy and incident tests pass. Complete the remaining existing-producer event matrix now where possible; production publication/discovery/passenger quote and updated-policy producers remain dependencies of tickets 10–13. Ticket 15 owns the integrated journey; tickets 16–17 retain actual-provider staging and outage validation. Independent monitor-to-human delivery through the configured provider remains an integration check, distinct from accepting the support arrangement itself. The detailed evidence document names the next tests and the existing ticket 13 MFA follow-up.

**Status remains claimed solely for the unfinished technical/integrated notice evidence. Real bookings remain disabled.** Ticket 18's explicit launch decision is unchanged. Earlier statements below about support items 1 and 2 being open are historical and superseded by this decision; recorded observations and technical gaps remain unchanged.

## Historical implementation answer

The protected operator console now shows the two nominated inboxes, proposed monitoring window, and explicit pending fallback and active-trip escalation status. This is an internal preparation view; public contact and coverage remain unpublished. The same console distinguishes durable work by origin, event, and related entity without exposing notification message bodies, and warns that send status is not participant receipt. A synthetic unrestricted-booking notification exercises recovery readiness, failed email after notification commit, and retry with one durable event. The existing protected operator test verifies event visibility, redacted errors, and safe retry.

Still blocked: ticket 04 has not approved a separately reachable fallback or active-trip escalation path. There is no unrestricted booking mutation producer yet, so transaction, audit, recipient selection, recovery reconstruction, and end-to-end notices for each actual route-booking action remain unverified. No live monitor, external paging, operator receipt, or contact fallback drill is evidenced. The two inboxes share Gmail and one operator. Keep this ticket claimed and real bookings disabled.

Checks: `npm run typecheck`, focused worker PostgreSQL test (5 passed), focused operator HTTP/PostgreSQL test (1 passed), `npm test` (passed), targeted ESLint (passed), API and worker builds (passed), and `git diff --check` (passed). `npm run check` stopped in lint because the pre-existing untracked `.worktrees/` contains generated Next.js output; the Next.js build separately failed fetching Google Fonts. Standards review found no actionable violation. Spec review found the missing committed-action scenario described above; wording was corrected to distinguish notification commit from booking commit.

## Comments

- Follow-up TDD work uses the specification's authenticated HTTP/PostgreSQL seam. An existing unrestricted adult declaration action now has a synthetic test showing recipient-only notice access, operator queue visibility, redacted delivery failure, coded urgent outreach with a recorded `no_answer` outcome, and unchanged acknowledged action state. Recipient and operator delivery responses now set `Cache-Control: private, no-store`. The test does not stand in for a route booking, active trip, live provider failure, or participant receipt.
- The maintainer explicitly chose to skip production support publication and use existing actions for ticket 09; booking-specific producers remain with the booking tickets. Public coverage, independently reachable fallback, active-trip escalation, and live paging remain unevidenced. Keep this ticket claimed and real bookings disabled.
- Follow-up checks: the focused privacy tests, `npm run typecheck`, targeted ESLint, `npm test` (API 173 passed/1 skipped; worker 19 passed), API build, and `git diff --check` passed. Red tests first demonstrated missing `no-store` headers on both notification reads; both now pass.

## Operating-policy evidence handoff — ticket 04, 2026-10-03

Ticket 04 is now resolved for implementation under its explicit scope amendment. Implement the approved `2026-10-03.2` sole-operator policy and both Gmail contacts, retaining their shared-failure limitation. Rehearse personal urgent acknowledgement within 15 minutes, routine response within nine covered hours, missed-contact pause, unsupported-departure blocking and incident reconciliation. Synthetic escalation may be simulated and must be labelled as such. Public operational claims and real-trip readiness still require receipt evidence, an independently reachable active-trip escalation arrangement and missed-contact rehearsal. No backup has been appointed. This supersedes references above to ticket 04 awaiting policy approval; all unperformed support evidence remains open. Keep status claimed.

## Continuation — 2026-10-03

Resumed from updated `main` (`6c28595`) on `codex/09-complete-support-notices`, preserving the existing implementation and claim. This request supersedes the earlier deferral of application contact publication. Ticket 04 policy `2026-10-03.2` is approved for implementation, not launch.

Published controlled support contacts, coverage and explicit prelaunch limitations in `/support`, linked from public/auth/participant/historical views and reused in the operator console. Three actual booking-mutation HTTP/PostgreSQL rehearsals now cover acceptance retry exhaustion, recipient privacy, cancellation delivery failure, journey/payment notices, and missed-contact pause/incident reconciliation. Fixed excessive outcome recipients, incident reconciliation while paused, nonempty evidence-reference serialization and missing MFA guards on incident reads/resolution. Existing notification, worker, monitor and offline fallback infrastructure is reused.

Acceptance criterion 1 remains partial: application publication and simulated fallback/missed-contact behavior are evidenced, but live monitored receipt and independent active-trip escalation are not. Criterion 2 remains partial: local durable work, worker failure/retry and coded outreach pass; independent paging and every production booking-specific flow remain unevidenced. Criterion 3's synthetic verification is evidenced. **Status stays claimed. Real bookings remain disabled.**

[Detailed evidence and next tests](../../../docs/operations/evidence/ticket09-support-notices-2026-10-03.md) distinguish existing evidence, new failures/fixes, simulated 15-minute and nine-covered-hour clocks, and unperformed live work. Exact dependencies: ticket 09 owner and pilot-readiness 27 for actual human receipt and independent escalation; tickets 10/11 for public publication/discovery/quote producers; tickets 12/13/15 for approved-policy integration and remaining event coverage; tickets 16/17 for real-provider staging/outage evidence; ticket 18 for the explicit launch decision. The current mutation fixtures retain operating snapshot `2026-09-29.1`; no existing records were silently moved to the new policy.

Continuation checks: lint (zero errors, nine existing warnings), typecheck, three focused HTTP/PostgreSQL rehearsals, rendered support/coordination/operator tests, full tests and production builds passed. Final full suite: root 38 passed/10 skipped; API 363 passed/1 skipped; worker 19 passed. One intermediate full run timed out in an existing departure/cancellation race; isolated and final full reruns passed without weakening the test. Separate standards and spec reviews reported zero actionable findings. Phone/tablet/desktop support-page layout and keyboard access were inspected. No deployed data, external messages or real bookings were changed.
