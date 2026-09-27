# 23: Resolve interrupted or disputed journeys

**What to build:** The operator resolves whether a passenger travelled and whether the frozen contribution is owed without overwriting participant claims.

**Blocked by:** 22 (Confirm each passenger’s journey).

**Status:** resolved

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 36, 43, 44, 48, 49, 61. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Deliver a journey-review queue and detail view covering disagreement, missing confirmation and interrupted travel.
- [x] Allow explicit outcomes: travelled/completed, did not travel, interrupted, or insufficient evidence/unresolved. Keep contribution owed/not owed separate from journey outcome.
- [x] An explicit owed decision establishes one obligation with a 24-hour deadline from that decision; no-travel/no-obligation decisions create no financial claim.
- [x] Preserve original participant statements and append outcome, reason, evidence references, operator identity and timestamp.
- [x] Keep unresolved cases visibly unresolved. Case closure cannot assert receipt of money or silently modify the frozen contribution.
- [x] Protect decisions with current operator MFA/allowlist authorization, idempotency, audit, independent evidence and notifications.
- [x] Test repeated/conflicting decisions, insufficient evidence, separate passenger outcomes and operator/passenger views through HTTP/PostgreSQL.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

Implemented an operator queue and case detail for disagreement, silence, absence, and interruption, plus a participant review detail after ordinary trip visibility expires. Every driver and passenger claim remains in its original journey-claim row. Review decisions append an outcome, a separate owed/not-owed decision, reason, evidence references, operator ID, and timestamp. Insufficient evidence appends a decision while leaving the case open. A final no-travel or not-owed decision creates no obligation. An owed decision inserts one obligation using the accepted frozen paise, currency, and policy version, due exactly 24 hours after the operator decision. Decisions do not create a payment claim or receipt.

Mutations require current MFA and allowlist checks at HTTP and current operator authorization in the transaction. PostgreSQL locks and unique indexes serialize final decisions and obligations. Idempotency keys return the original result or reject changed payloads. The transaction records decision, obligation when owed, audit, and durable notices; signed independent receipts gate acknowledgement. Recovery reconciliation restores a decision, its obligation, audit, and notifications, and the global restricted-mode/reopen protocol verifies this evidence before writes reopen.

Verification: focused PostgreSQL HTTP tests passed for three passenger outcomes through separate operator decisions, participant/operator views, changed-payload retries, invalid no-travel/owed combinations, current MFA/allowlist failures, separate-connection conflicting decisions, notification-insert rollback, frozen obligation and deadline, and restoration from an older snapshot using independent evidence. The full PostgreSQL HTTP suite passed (48/48). `npm test` passed (27 script tests, 4 skipped; 112 API tests, 1 skipped; 16 worker tests). `npm run typecheck`, `npm run api:build`, and `npm run lint` passed; lint reported 10 existing warnings and zero errors. `npm run build:all` passed when the build could fetch the configured Google font; the initial sandboxed attempt failed only at that font request.

The two-axis `/code-review` against `main` found one standards issue (SQL reads in the service) and one spec evidence gap (different passenger decisions were not all exercised through HTTP). Both were corrected, and the affected tests, typecheck, lint, and API build passed afterward. The review also noted similar client and server payload normalization as a judgment-call duplication; client normalization supplies feedback while server validation remains authoritative.

Remaining limits: no deployed schema or user-population inventory, provider restore rehearsal, live email outage, or real-trip launch gate was performed. This ticket did not deploy, migrate a deployment, or enable real trips. Operator judgment of actual trip evidence remains a human decision for each case.

## Comments

Follow-up `/code-review` fix: the PostgreSQL HTTP test now submits an insufficient-evidence operator decision through the authenticated endpoint, then reads the still-open case through both operator and managed passenger HTTP sessions. It verifies no obligation is present and later final decisions and recovery still work. A temporary local mutation that rejected insufficient-evidence decisions made the focused test fail with HTTP 409 instead of 200; the mutation was removed and the test passed. `npm test` passed again (27 script tests, 4 skipped; 112 API tests, 1 skipped; 16 worker tests), as did `npm run typecheck`.

The standards review's recovery-registry “Shotgun Surgery” note remains a low-severity design judgment, not a documented-standard violation. Recovery, reconciliation, and digest lists use deliberately different orders; a broad registry refactor would change pilot-critical recovery code without a demonstrated correctness defect in this ticket.
