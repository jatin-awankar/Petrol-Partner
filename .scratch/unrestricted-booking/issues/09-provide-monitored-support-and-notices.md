# 09: Provide monitored support and notices

**What to build:** Applicants and participants can find a working support contact, while operators can monitor route-booking notices and handle urgent delivery failures.

**Blocked by:** 04 (Approve operating and support policy).

**Status:** claimed

- [ ] Publish the controlled contact and coverage in the relevant application views; verify it is monitored and test the fallback procedure.
- [ ] Extend durable event and email work, retry and stalled-work visibility, and urgent outreach for the new policy without assuming delivery means receipt.
- [ ] Verify support privacy and failure behavior with synthetic events, including notification failure after a committed action; reuse applicable pilot-readiness 10 and 27 work.

## Answer

The protected operator console now shows the two nominated inboxes, proposed monitoring window, and explicit pending fallback and active-trip escalation status. This is an internal preparation view; public contact and coverage remain unpublished. The same console distinguishes durable work by origin, event, and related entity without exposing notification message bodies, and warns that send status is not participant receipt. A synthetic unrestricted-booking notification exercises recovery readiness, failed email after notification commit, and retry with one durable event. The existing protected operator test verifies event visibility, redacted errors, and safe retry.

Still blocked: ticket 04 has not approved a separately reachable fallback or active-trip escalation path. There is no unrestricted booking mutation producer yet, so transaction, audit, recipient selection, recovery reconstruction, and end-to-end notices for each actual route-booking action remain unverified. No live monitor, external paging, operator receipt, or contact fallback drill is evidenced. The two inboxes share Gmail and one operator. Keep this ticket claimed and real bookings disabled.

Checks: `npm run typecheck`, focused worker PostgreSQL test (5 passed), focused operator HTTP/PostgreSQL test (1 passed), `npm test` (passed), targeted ESLint (passed), API and worker builds (passed), and `git diff --check` (passed). `npm run check` stopped in lint because the pre-existing untracked `.worktrees/` contains generated Next.js output; the Next.js build separately failed fetching Google Fonts. Standards review found no actionable violation. Spec review found the missing committed-action scenario described above; wording was corrected to distinguish notification commit from booking commit.

## Comments

- Follow-up TDD work uses the specification's authenticated HTTP/PostgreSQL seam. An existing unrestricted adult declaration action now has a synthetic test showing recipient-only notice access, operator queue visibility, redacted delivery failure, coded urgent outreach with a recorded `no_answer` outcome, and unchanged acknowledged action state. Recipient and operator delivery responses now set `Cache-Control: private, no-store`. The test does not stand in for a route booking, active trip, live provider failure, or participant receipt.
- The maintainer explicitly chose to skip production support publication and use existing actions for ticket 09; booking-specific producers remain with the booking tickets. Public coverage, independently reachable fallback, active-trip escalation, and live paging remain unevidenced. Keep this ticket claimed and real bookings disabled.
- Follow-up checks: the focused privacy tests, `npm run typecheck`, targeted ESLint, `npm test` (API 173 passed/1 skipped; worker 19 passed), API build, and `git diff --check` passed. Red tests first demonstrated missing `no-store` headers on both notification reads; both now pass.

## Operating-policy evidence handoff — ticket 04, 2026-10-03

Ticket 04 is now resolved for implementation under its explicit scope amendment. Implement the approved `2026-10-03.2` sole-operator policy and both Gmail contacts, retaining their shared-failure limitation. Rehearse personal urgent acknowledgement within 15 minutes, routine response within nine covered hours, missed-contact pause, unsupported-departure blocking and incident reconciliation. Synthetic escalation may be simulated and must be labelled as such. Public operational claims and real-trip readiness still require receipt evidence, an independently reachable active-trip escalation arrangement and missed-contact rehearsal. No backup has been appointed. This supersedes references above to ticket 04 awaiting policy approval; all unperformed support evidence remains open. Keep status claimed.
