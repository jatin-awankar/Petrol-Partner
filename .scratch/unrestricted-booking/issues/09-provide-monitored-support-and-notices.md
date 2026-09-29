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
