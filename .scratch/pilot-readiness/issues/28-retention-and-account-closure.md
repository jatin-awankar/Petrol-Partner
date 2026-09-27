# 28: Enforce operational retention and account closure

**What to build:** Participants' operational records and closed accounts expire under the published policy while narrowly justified case evidence remains protected and recoverable.

**Blocked by:** 11 (Recover an operator action from backup); 12 (Student and adult eligibility review); 18 (Share contacts only with confirmed counterparts); 23 (Resolve interrupted or disputed journeys); 25 (Resolve settlement disputes and unanswered claims); 26 (Apply and reverse reviewed account restrictions).

**Status:** claimed

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 5, 53, 54, 55, 56, 61, 66. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Deliver operator visibility for deletion schedules, account-closure processing, held records, failed jobs and non-sensitive deletion outcomes.
- [ ] Retain the seven-day raw-evidence policy; expire unused/unverified onboarding at 30 days; delete/anonymize routine history and resolved cases 90 days after pilot end.
- [ ] Apply the approved pilot-end/account-closure contact retention rule separately from the 24-hour ordinary contact-view cutoff. Do not erase unresolved obligations or incident evidence without an approved policy decision.
- [ ] Require every retention extension to record reason, operator, restricted scope and review date; remove the hold when its approved condition ends.
- [ ] Cover raw/temporary objects, primary records, caches, operational exports, controlled provider metadata and backups as their documented lifecycle expires.
- [ ] Preserve minimal non-personal deletion receipts and apply them during restoration so older backups do not resurrect deleted information.
- [ ] Test idempotent retry, partial provider failure, active case holds, closure versus active commitments, historical restoration and safe anonymized aggregates.
- [ ] Validate actual provider internal retention and the published notice before launch; this ticket cannot promise stronger permanent erasure than the infrastructure supports.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

In progress on `codex/28-retention-and-account-closure`. A forward-only migration and API now record idempotent self-service closure requests, a 90-day due date, safety holds for known active commitments and open cases, operator-visible work states, and reasoned scoped holds with review dates and audited releases. The deletion receipt table has no deleted content or user identifier, and no receipt is emitted until actual deletion and restoration suppression can be demonstrated. No live user, deployed schema, or provider object was deleted. See `docs/operations/account-closure-retention.md`.

The existing seven-day raw-evidence worker remains unchanged. The 30-day unused-onboarding expiry, pilot-end and closure contact lifecycle, routine history anonymization, provider and backup expiry, partial provider deletion retry, restore suppression, published notice, and actual provider retention remain unverified or unimplemented. Dependencies 11 and 18 retain open evidence. Keep this ticket `claimed`; this branch is a reviewable safety and tracking slice, not an erasure or launch claim.

Verification: focused PostgreSQL integration tests passed for concurrent request retry, durable event uniqueness, hold and release audit, revoked operator denial, and no premature receipt. `npm run lint` passed with ten existing warnings; `npm run typecheck` passed; `npm test` passed after updating the migration-plan expectation; `npm run build:all` passed. The attempted synthetic direct pilot-offer insert for an active-commitment test was correctly rejected by the existing protected-activity database trigger, so an end-to-end closure/commitment race remains an explicit test gap.

Two-axis code review found a protected-mutation idempotency gap in manual holds and a stale safety state after release. Hold and release keys now return the original outcome on retry, reject conflicting retries, and recheck active commitments and cases before a closure becomes pending. Operator queue rows now include active hold scope and review date. Focused PostgreSQL tests and API typecheck passed after these fixes. Final `npm run lint` (ten existing warnings), `npm run typecheck`, `npm test` (37 root tests passed/4 skipped; API 141 passed/1 skipped; worker 17 passed), and `npm run build:all` passed. One unrelated urgent-outreach HTTP test encountered a socket hang-up in an earlier full run; the focused retry and repeated full run passed.
