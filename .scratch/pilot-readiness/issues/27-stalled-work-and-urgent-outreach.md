# 27: Detect stalled work and record urgent outreach

**What to build:** The operator detects stalled processing independently, retries failed delivery safely and records urgent fallback contact when participants need help.

**Blocked by:** 10 (Durable notifications from an operator action).

**Status:** resolved

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 40, 57, 58, 59, 60, 61. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Display worker heartbeat, oldest important queued event, queue size, recent failures and last successful processing time in the protected console.
- [x] During operating windows, target first important delivery attempt within one minute and independently alert on worker stall or an important event waiting over five minutes.
- [x] Ensure a stopped worker is not responsible for sending its own outage alert; exercise the independent monitoring/fallback path.
- [x] Expose bounded retries and exhausted delivery states. Operator retry never repeats the originating booking or financial mutation.
- [x] Record urgent outreach method, participant reference, time, reason and outcome through protected operator actions; include an independent fallback record usable during primary-system outage.
- [x] Keep phone numbers and sensitive payloads out of logs/URLs; authorize access to any protected contact record.
- [x] Demonstrate healthy scheduling, prolonged failure, queue growth, retry exhaustion and process stoppage. Ordinary email failure does not trigger recovery restriction unless required evidence also fails.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.


## Answer

Implemented and verified on `codex/27-stalled-work-and-urgent-outreach` with synthetic data. The protected console shows worker heartbeat, oldest important queued event, queue size, recent failures, last successful processing time, attempt history, and exhausted jobs. The worker attempts ready email within the one-minute target, retries at most five times, and never reruns the originating business mutation. Ordinary email failure leaves recovery mode open.

A separate continuous monitor process checks every minute during configured operating windows and sends coded alerts over an independent HTTPS channel when the worker or important queue is more than five minutes stale, the queue grows, or the database is unavailable. Failure of the alert channel makes the monitor exit nonzero for its supervisor. Operator urgent outreach records participant reference, method, time, coded reason and outcome through current MFA authorization, audit, idempotency and independent recovery evidence. During database outage an individual operator credential and one-time code permit a signed, fsynced private fallback record without placing participant details in shell arguments; reconciliation is idempotent.

The repeatable isolated rehearsal in `docs/operations/evidence/ticket27-synthetic-rehearsal-2026-09-27.md` used fresh forward-migrated PostgreSQL, the actual worker process, a separately running monitor, local HTTPS receivers, and a controlled clock. It measured a **180 ms** first attempt; after a real worker stop and six-minute clock advance, the independent monitor's HTTPS receiver got worker-stall, important-queue-stall, and queue-growth alerts. Offline outreach was recorded without a database URL and reconciled exactly once. PostgreSQL integration tests cover five consecutive delivery failures through exhaustion, recovery mode remaining open, retry idempotency, protected authorization, audit, queue metrics and sensitive-data rejection.

`npm run check` passed after the browser integration fixture was isolated from another suite's authentication cutover state: root scripts 35 passed/4 skipped, API 139 passed/1 skipped, worker 17 passed; lint had zero errors and ten existing warnings; typechecks and all builds passed. `node scripts/pilot-notification-watch.mjs` also exited nonzero when its independent HTTPS alert channel was unconfigured.

Remaining deployment limits: the HTTPS receiver in this rehearsal was local and synthetic. A production paging destination, independent host or supervisor, actual operator receipt, private credential custody, and the broader provider arrangement still require deployment evidence before real trips. The automatic recovery gate cannot discover an offline file that an operator has not submitted; the recovery operator must inspect and reconcile each operator's fallback file before reopening writes. Ticket 27's technical acceptance behavior is demonstrated; these provider and launch gates remain open, and real trips stay disabled.

## Comments

- Code review found direct SQL in the outreach service and shell-argument exposure in the outage command. SQL was moved into the repository; the command reads participant data from stdin and requires an individual private credential plus a one-time code. Missing operating-window configuration produces an alert signal.
- The final rehearsal and complete check above supersede the earlier partial synthetic checks. The unrelated settlement browser test now explicitly resets its legacy authentication fixture, removing the observed cross-suite failure.
