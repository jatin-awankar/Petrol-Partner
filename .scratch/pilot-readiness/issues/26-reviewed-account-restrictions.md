# 26: Apply and reverse reviewed account restrictions

**What to build:** The operator can impose or reverse a justified restriction after review and see its effect on future and active travel.

**Blocked by:** 21 (Revocation holds and active-trip incidents); 25 (Resolve settlement disputes and unanswered claims).

**Status:** resolved

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 10, 37, 38, 50, 60, 61. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Provide a restriction action from incident or settlement history with scope, reason, reviewed evidence, responsible operator and timestamp.
- [ ] Enforce restrictions on relevant offer/request/acceptance/start actions using current server state, including stale-session and concurrent-action cases.
- [ ] Handle future confirmed commitments through recorded holds/cancellations and active trips through incidents, preserving allocated capacity until an actual cancellation.
- [ ] A single unanswered payment claim, overdue timer or no-show flag cannot automatically restrict a participant.
- [ ] Provide a separately audited reversal that restores only permissions allowed by all other current eligibility conditions.
- [ ] Apply protected idempotent transactions, independent recovery evidence and durable notifications to restrictions and reversals.
- [ ] Test cross-role effects, race outcomes, unrelated-user access, historical claim preservation and operator/passenger visibility.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

Implemented an operator-only, MFA-gated restriction decision linked to an existing incident or a resolved settlement review. Each action records the target, driver/passenger/all scope, reason, reviewed evidence summary, source, operator, timestamp, audit record, durable notices, idempotency key, and independent receipt. Reversal is a separate reviewed operation. A participant sees their restriction status and reason; the operator sees decision evidence and history. Claim and receipt records are not changed by either action.

Current server state blocks restricted users at offer publication, seat request, acceptance, and departure. Restriction and booking actions share advisory locks. A future confirmed passenger seat is held without freeing capacity; a driver restriction holds the future ride. Restrictions during a departed ride create a high-priority incident. A reversal removes only its own restriction; any other restriction or eligibility failure remains effective. Overdue claims, unanswered claims, and absence flags have no path that creates a restriction.

Evidence: focused PostgreSQL integration tests covered unauthorized and stale-MFA operator actions, unrelated-user access, private participant/operator responses, scope effects, idempotent retries, changed-payload rejection, simultaneous restriction/acceptance and restriction/departure on separate connections, notification rollback, active-trip incidents, independent receipt replay for restriction and reversal, multiple overlapping restrictions, a resolved settlement source, and preservation of the original payment claim. UI tests exercised operator and participant views. `npm run lint`, `npm run typecheck`, `npm run build:all`, and `DATABASE_URL=postgres://postgres:postgres@localhost:55432/petrol_partner_test npm test` passed against the local disposable test database. Lint reported ten pre-existing warnings outside this ticket; the first sandboxed build attempt could not fetch the existing Google font, and the build passed with network access.

Remaining limits: No deployed database, actual student population, provider recovery store, or real incident evidence was touched. The launch gates in `docs/pilot-spec.md` still prohibit real trips. Operators must review the source and decide whether a restriction or reversal is justified; the system does not infer that decision from a claim, deadline, or absence.

## Comments

- Two-axis code review against `main` found no spec mismatch. It identified two SQL placement violations and one duplicated predicate; the lookup, advisory lock, and predicate were moved into repositories before final verification.
