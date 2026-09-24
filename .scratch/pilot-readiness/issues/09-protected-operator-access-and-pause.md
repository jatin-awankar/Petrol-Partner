# 09: Protected operator access and recovery-aware pause

**What to build:** An authorized operator can pause pilot activity through an auditable console, see uncertain actions and restricted mode, and trust that acknowledged decisions have recovery evidence.

**Blocked by:** 04 (Prove acknowledgement recovery); 08 (Verified account access with preserved identities).

**Status:** claimed

**Work type:** Feature slice

**Specification:** Petrol Partner: controlled pilot readiness. User stories 14, 60, 61, 62, 63, 64, 65. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [ ] Create a minimal operator interface protected by current allowlist membership, active account and verified MFA assurance; reject wrong-role, stale-session and missing-MFA access server-side.
- [ ] Deliver independent pause controls for new offers, requests, acceptance and overall booking activity. Expose current state safely to participant views.
- [ ] Apply the proven protected-mutation protocol to pause decisions: transactionally record state/audit/idempotency result, persist required independent evidence, then publish success.
- [ ] Show a stable operation reference and authenticated pending/status lookup after ambiguous outcomes. Prevent reads and other instances from reporting unprotected success.
- [ ] Persist restricted-mode cause/start time when evidence is unavailable, preserve safe reads and require manual reopening after reconciliation and healthy recovery evidence.
- [ ] Keep application and migration database roles appropriately restricted; browser access cannot bypass operator or domain authorization.
- [ ] Test duplicate requests, changed-payload retries, MFA/session changes, evidence outages and restart recovery through HTTP/PostgreSQL plus the operator browser view.
- [ ] Provide the shared protocol/authorization interfaces consumed by later feature slices without treating this first protected action as proof for all future operations.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.


## Comments

- 2026-09-24: Implementation started on `codex/09-protected-operator-access-pause`. HTTP/PostgreSQL coverage passes for authorization, idempotency, evidence failure, missing evidence, receipt reconciliation, and a separate-connection database guard race. The ticket remains claimed because the production independent receipt provider, deployed database-role inventory/grants, browser rehearsal, and a safe resolution path for an abandoned intent are not yet evidenced. See `docs/operations/operator-pause.md`.
- 2026-09-24: `TEST_DATABASE_DISPOSABLE=true DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner_test npm run check` passed: 27 root tests, 51 API tests, 6 worker tests, typechecks and all builds. Lint had zero errors and ten pre-existing warnings. The `/operator` page built, but a signed-in browser rehearsal remains outstanding.
- 2026-09-24: Rehearsed the signed-in `/operator` page in the in-app browser against a disposable PostgreSQL database and synthetic AAL2 allowlisted operator. It displayed all four paused controls, the restricted cause/start time, and an uncertain committed operation; the dashboard displayed the restricted banner. The rehearsal exposed an internal receipt path through the public status response, so that response now omits internal causes and the authenticated operator view uses `/v1/operator/status`. The full repository check passed again: 27 root tests, 51 API tests, 6 worker tests, typechecks, builds, and lint with zero errors and ten existing warnings. Production receipt-provider approval, deployed role grants, and a safe abandoned-intent resolution remain outstanding; this ticket remains claimed.
- 2026-09-24: User chose a code-only pilot with production activation gated. Added an HTTP/PostgreSQL test that resumes a persisted intent through a fresh Express instance; it does not simulate a process crash. Migrations outside an explicitly disposable localhost `_test` database now require `MIGRATION_DATABASE_URL` separate from runtime `DATABASE_URL` and reject a shared or overprivileged runtime role before applying SQL. The operator receipt adapter stores each signed receipt as a separately synced immutable file, so an interrupted temporary write cannot corrupt earlier receipts. A second current MFA operator can now manually complete a stranded `intent` or `committed` decision, preserving its original business audit and recording the completing actor in database and independent receipt evidence. Tests cover revoked original access and restoration from the receipt. Full `npm run check` passed after these changes: root tests, 56 API tests, 6 worker tests, all builds and typechecks, and lint with zero errors and ten existing warnings. No production receipt store or deployed grants were configured or tested; full process-crash injection at each acknowledgement boundary is still absent. The ticket remains claimed pending those acceptance proofs and a shared protocol interface for later slices.
- 2026-09-24: Rehearsed the new handoff control in the signed-in browser with synthetic AAL2 operator access and disposable PostgreSQL. The pending intent and original reason appeared, entering a review reason enabled the action, the `Check status` button returned `intent`, and completing the pending decision removed it from the pending list while recovery remained restricted. The temporary harness and receipt files were removed. Final `npm run check` passed afterward: root tests, 56 API tests, 6 worker tests, typechecks and builds; lint had zero errors and ten pre-existing warnings.
- 2026-09-24: Added a real child-process crash/restart HTTP/PostgreSQL rehearsal at the four pause acknowledgement boundaries. The restarted process retries the same key and produces one operation, audit and follow-up at each boundary. The shared operation-state, evidence-store and transaction interfaces now live in `apps/api/src/modules/protected-mutation/protocol.ts`; later slices must supply their own domain policy and recovery proof. Final `npm run check` passed: root tests, 57 API tests, 6 worker tests, typechecks and builds; lint had zero errors and ten pre-existing warnings. Production independent evidence/provider approval and deployed database-grant evidence remain absent by the user's code-only-pilot choice, so the ticket remains claimed and real pilot activity must stay gated.
