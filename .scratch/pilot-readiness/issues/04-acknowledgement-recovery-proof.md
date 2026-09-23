# 04: Prove acknowledgement recovery

**What to build:** A small synthetic protected action proves that a success can survive an older database restore, while ambiguous outcomes remain visible and duplicate-safe.

**Blocked by:** 01 (Reproducible development and checks).

**Status:** resolved

**Work type:** Runnable prototype

**Specification:** Petrol Partner: controlled pilot readiness. User stories 62, 63, 64, 65, 66, 67. These references identify coverage; the acceptance criteria below define this slice's completion evidence.

## Acceptance criteria

- [x] Implement a throwaway HTTP-to-PostgreSQL action and visible status view with a stable operation ID, scoped idempotency key and payload digest. The prototype uses synthetic records.
- [x] Define the independent durable evidence and supported failure model. Distinguish intent from committed result; keep encryption/key recovery and retention requirements explicit.
- [x] Crash before/after intent, database commit, independent receipt and response publication. Include timeouts and lost responses; retries resolve the same operation and changed-payload key reuse fails.
- [x] Show that a committed database mutation awaiting evidence is pending/unknown, not false failure or acknowledged success. Reads, subsequent writes and emitted success notifications respect the same publication barrier.
- [x] Exercise multiple API instances and a stopped/restarted process; an unresolved predecessor or failed evidence store cannot be bypassed.
- [x] Restore an older snapshot, identify every newer acknowledged synthetic action from surviving evidence and reconcile without repeating external effects or reapplying today's clock rules.
- [x] Demonstrate restricted mode and an explicit reopening decision. Document storage-adapter assumptions that require later provider validation.
- [x] Preserve the runnable experiment and its findings as a primary source. This ticket resolves only when the protocol satisfies the agreed cases or the user explicitly revises the requirement; an unsuccessful experiment must not unblock dependent implementation.

## Completion evidence

Record the demonstrated behavior, checks run and their results, remaining limitations, and any required operator decision. A technical ticket is not resolved while a required criterion fails or depends on missing evidence. Human-led tickets require the actual human findings or decision; agent-generated assumptions cannot close them.

Follow the local tracker's claim/resolution convention: use `claimed` when work starts and `resolved` only when the acceptance criteria are evidenced. Add an Answer section with the outcome and append subsequent discussion under Comments. Readiness describes who may do the work; it does not override the blocking edges.

## Answer

Implemented a runnable synthetic HTTP-to-PostgreSQL acknowledgement protocol on `codex/04-acknowledgement-recovery`. It persists intent, business state/audit/result/follow-up work, signed independently fsynced evidence, and success publication as distinct stages. Scoped idempotency plus payload digest returns one logical result and rejects changed payloads. Pending results remain `pending_unknown`; safe reads expose only published facts, while unresolved predecessors and evidence failures block new writes.

PostgreSQL integration evidence covers all five crash boundaries, lost responses/restarts, two API instances, evidence-store failure, corrupt evidence and unsafe-reopen refusal, restricted mode, operator-identified reopening, partial-snapshot reconciliation, stale-row conflict detection, notification restoration, and repeat reconciliation without duplicate effects or new-clock evaluation. `TEST_DATABASE_DISPOSABLE=true DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55433/petrol_partner_test npm run check` passed on 2026-09-23: 17 root tests, 38 API tests, 6 worker tests, all typechecks and builds. Lint reported zero errors and the existing 10 warnings.

Primary findings, run instructions, failure assumptions, and limitations are preserved in `docs/operations/acknowledgement-recovery-prototype.md`. Required later operator decisions remain explicit: select and validate an independently durable provider; encryption, immutable retention, credentials, monitoring, restore permissions, and signing-key rotation/backup/recovery; and production individual authentication, MFA, and current authorization. This prototype changes no real ride, identity, or payment data and does not itself satisfy those launch gates.
