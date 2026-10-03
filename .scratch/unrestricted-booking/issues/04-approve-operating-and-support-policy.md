# 04: Approve operating and support policy

**What to build:** Participants and operators have an approved operating contract for route bookings beyond the fixed corridor.

**Blocked by:** 01 (Approve broader eligibility and vehicle rules); 02 (Approve route and contribution rules).

**Status:** ready-for-human

- [ ] Set request, acceptance, departure, cancellation, incident, support coverage, escalation, and retention rules for the wider geography.
- [ ] Define a monitored public support contact, coverage owner, response expectations, and fallback; exclude the uncontrolled support@pp.com address.
- [x] Record which historical corridor rules remain specific to historical records rather than applying automatically to new bookings.

## Proposed decision record — not resolved

**Policy version:** `2026-09-29.1`. **Decision date:** 2026-09-29. **Policy approver and proposed primary on-duty operator:** Jatin Awankar. The maintainer confirmed the complete proposed record on 2026-09-29, including its unresolved launch dependencies. See [the operating policy](../../../docs/operations/unrestricted-booking-operating-policy.md).

The proposed record covers weekday 09:00–18:00 IST departures with coverage through active-trip outcome, 2-hour-to-7-day posting, 60-minute request and 30-minute acceptance cutoffs, −15/+30-minute departure checks, cancellation and incident handling, fail-closed outage recovery, provisional retention, and historical-policy separation. Jatin Awankar subsequently selected Maharashtra as the launch service area on 2026-09-29, replacing the proposed Amravati-area limit; both endpoints must be inside, with brief verified-route travel outside permitted. The exact boundary dataset remains undecided. The 50 km/90-minute caps remain proposed. The resolved ticket 02 now incorporates this geographic restriction. Proposed 15-minute urgent acknowledgement and one-business-day routine response targets are **not** published promises.

The third acceptance criterion is evidenced by the historical-policy section of the operating document. The first two remain open: the authoritative boundary and complete retention schedule are still undecided. Jatin Awankar nominated `jatinawankar23@gmail.com` as the primary inbox and `supportpp@gmail.com` as the fallback on 2026-09-29. He reports receiving and personally acknowledging tests in both at approximately 15:00 IST that day. This is maintainer-attested evidence. He is the sole operator during published hours and until active trips end, not 24/7; both inboxes use Gmail and his own access, so independent reachability and active-trip escalation are not established. Response targets and missed-contact behavior have not been rehearsed. `support@pp.com` is uncontrolled. Ticket 02's transferred implementation and production-evidence gates, ticket 03 external review, ticket 09 publication, deployed-data/provider retention inventory, staging and recovery evidence, and ticket 18 launch decision remain separate blockers. Real bookings stay disabled.

The Survey of India administrative-boundary database is a free official geometry candidate, not a selected production dataset: edition, checksum, geometry accuracy, and reuse permission have not been verified. The existing account-closure flow has no provider deletion runner or restore-safe deletion manifest. These findings prevent claiming that a complete retention or boundary-enforcement policy is ready.

## Comments

- 2026-10-03: Resumed from updated `main` (`ecd4b4d`) on `codex/04-operating-support-policy`, preserving prior decisions and the existing branch history. Tickets 01 and 02 are resolved. Ticket 02 selects self-hosted Valhalla/OSM and already incorporates Maharashtra; stale policy references to a separate branch and geographic conflict are corrected. Ticket 05's database/Auth inventory is resolved, but does not establish provider-copy or backup deletion lifecycles. Human commitments for response targets, backup/escalation and retention have been requested; silence is not approval. Acceptance criteria remain open.
- 2026-10-03: The maintainer explicitly approved 15-minute personal urgent acknowledgement throughout coverage (including active-trip extensions) and a first substantive routine response within one business day, subject to rehearsal before launch. The working policy revision `2026-10-03.1` defines the business-day clock and missed-target behavior. This supersedes the earlier uncommitted targets above; it does not claim a rehearsal or publish a live promise. Backup/escalation and retention answers remain pending.
- 2026-10-03: The maintainer approved the proposed 30-day onboarding / 90-day linked-history periods and 30-day hold reviews. He explained that this is a personal project and declined backup staffing for the current phase. Record sole-operator development/testing as the intended model; do not invent backup consent or equate a working synthetic flow with real-trip support readiness.

## Current outcome — not resolved

Working revision `2026-10-03.1` in [the operating policy](../../../docs/operations/unrestricted-booking-operating-policy.md) preserves Maharashtra, weekday 09:00–18:00 IST departures, support through active-trip resolution, both nominated/tested Gmail inboxes and historical records. It records the approved response-target commitment and proposed retention periods, with engineering detail for clocks, missed targets, polygon provenance, cumulative brief-crossing limits, data classes, backup expiry and restore-safe deletion. [Dated evidence](../../../docs/operations/evidence/ticket04-boundary-and-policy-evidence-2026-10-03.md) distinguishes publisher claims, maintainer testimony and unperformed validation.

Criterion 1 remains partial: the actual boundary geometry/reuse evidence, historical-payment retention and provider-copy lifecycle remain unresolved. Criterion 2 remains partial: sole ownership and response targets are recorded, but the maintainer declined backup staffing and there is no separately reachable active-trip escalation arrangement or missed-contact rehearsal. Criterion 3 remains satisfied. Keep `ready-for-human`; do not add a resolved Answer or remove these completion requirements by borrowing ticket 02's scope amendment. Engineering and synthetic testing can continue; this document does not unblock ticket 09's real support readiness or ticket 18's real-booking decision.

## Verification — 2026-10-03

- `git diff --check`: passed. A path-resolving Markdown check passed all 14 local links across the three ticket 04 files. External source pages and the metadata download were checked separately; the incomplete geometry download is recorded in the evidence.
- `npm run typecheck`: passed for the root and workspaces.
- `npm test`: attempted in the sandbox; local socket/PostgreSQL access was denied and the landing test stalled and was terminated. Retried with local access: all root tests passed (38 passed, 10 skipped); API had 181 passing tests and worker 7, but four API and three worker integration suites failed setup because the configured disposable PostgreSQL endpoint `127.0.0.1:55432` refused connections. Full suite is **not passing**; PostgreSQL integration remains unverified. No database was provisioned, migrated or modified for this documentation-only task.
- The implement skill's code-review ran separate standards and specification reviews against updated `main` (`ecd4b4d`). Standards: zero actionable findings. Spec: zero actionable defects; both open acceptance criteria are accurately recorded as partial. No tests were added for this documentation-only change.
- Only ticket 04's tracker, operating policy and dated evidence are committed. Existing untracked `.worktrees/` is untouched. No deployment, purchase, external outreach, live deletion or real-booking activation occurred.
