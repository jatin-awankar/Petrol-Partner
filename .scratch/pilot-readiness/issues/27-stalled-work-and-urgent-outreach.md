# 27: Detect stalled work and record urgent outreach

**What to build:** The operator detects stalled processing independently, retries failed delivery safely and records urgent fallback contact when participants need help.

**Blocked by:** 10 (Durable notifications from an operator action).

**Status:** claimed

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 40, 57, 58, 59, 60, 61. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Display worker heartbeat, oldest important queued event, queue size, recent failures and last successful processing time in the protected console.
- [ ] During operating windows, target first important delivery attempt within one minute and independently alert on worker stall or an important event waiting over five minutes.
- [ ] Ensure a stopped worker is not responsible for sending its own outage alert; exercise the independent monitoring/fallback path.
- [x] Expose bounded retries and exhausted delivery states. Operator retry never repeats the originating booking or financial mutation.
- [ ] Record urgent outreach method, participant reference, time, reason and outcome through protected operator actions; include an independent fallback record usable during primary-system outage.
- [x] Keep phone numbers and sensitive payloads out of logs/URLs; authorize access to any protected contact record.
- [ ] Demonstrate healthy scheduling, prolonged failure, queue growth, retry exhaustion and process stoppage. Ordinary email failure does not trigger recovery restriction unless required evidence also fails.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.


## Answer

Implemented on `codex/27-stalled-work-and-urgent-outreach`:

- Protected delivery status now reports worker heartbeat, oldest ready important event, queue size, late first attempts, recent failures, last successful processing, exhausted jobs, and redacted attempt history. The worker records last success in the same PostgreSQL transaction as a successful delivery outcome.
- A separate monitor command queries PostgreSQL and sends coded HTTPS alerts for a stale worker, an important event waiting over five minutes, queue growth, and database failure. It has no worker dependency. A healthy worker polls every ten seconds; immediate due time targets the first attempt inside one minute. Operating windows are explicit.
- Existing five-attempt email delivery and idempotent operator retry remain in place. Retry updates only the email job and audit row; the original pause or other business mutation is not invoked. Email failure alone does not enter recovery restriction.
- Protected urgent outreach records participant ID, method, timestamp, coded reason and outcome with current MFA operator access, idempotency, audit, and independent signed recovery evidence. An outage CLI uses an individually provisioned private credential and one-time code, reads participant data from stdin, and appends a signed, fsynced, private record independently of the API and PostgreSQL; the reconciliation command verifies and imports records idempotently.
- Coded reasons and outcomes prevent phone numbers or free-form sensitive payloads in these records. Monitor payloads carry signal codes and counts only.

Checks: focused PostgreSQL outreach and queue-health tests passed, durable email PostgreSQL tests passed (4/4), monitor tests passed (6/6), fallback integrity and one-time-code tests passed (2/2), `npm run typecheck` passed. `npm run check` passed lint and typecheck but its API suite failed two intermittent cases (settlement browser timing and departure socket hangup). A separate API suite rerun passed 139/139 and worker suite passed 16/16. After review fixes, another full check failed only the settlement browser case (138/139 API; 16/16 worker); that test passed alone (1/1). `npm run build:all` passed with network access both before and after the review fixes; the first sandboxed build failed fetching the configured Google font.

Remaining limits: the independent scheduler, HTTPS paging destination, and operator receipt have not been configured or tested in a deployed environment. Process stoppage was simulated with a stale heartbeat; an actual stopped process and end-to-end external alert receipt remain untested. The fallback file and individual credential need an operator custody, provisioning, and storage decision; offline revocation is checked during reconciliation. The fallback is reconciled by a separate command; the automatic reopening gate cannot discover an unsubmitted offline file, so the recovery operator must inspect it before reopening. Real trips remain disabled. The ticket stays claimed until these operational criteria are demonstrated and the full check is consistently green.

## Comments

- Code review found direct SQL in the outreach service and shell-argument exposure in the outage command. SQL was moved into the repository; the command now reads participant data from stdin and requires an individual private credential plus a one-time code. A missing operating-window configuration now produces an alert signal.
