# Acknowledgement recovery prototype

This throwaway synthetic prototype demonstrates the publication barrier required by the pilot specification. It does not enable a real protected mutation and is deliberately isolated from ride, booking, identity, and payment records.

## Protocol and failure model

`POST /prototype/actions` accepts a synthetic counter change with `Idempotency-Scope` and `Idempotency-Key`. The canonical payload SHA-256 digest binds that scoped key to one request. PostgreSQL assigns the stable operation ID.

The protocol has four durable stages:

1. PostgreSQL commits `intent` independently. A retry can resume the same operation after process loss.
2. One PostgreSQL transaction locks the operation and subject, writes the synthetic action, audit event, exact result, external-effect key, and `db_committed` state. A committed result is still `pending_unknown` and is not readable as success.
3. The receipt adapter appends a signed record containing the stable identity, request digest, original payload, exact result, and original commit time, then calls `fsync`. Failure restricts new writes. A retry of the same operation may finish recovery; a different operation may not bypass it.
4. PostgreSQL marks the operation `acknowledged` and creates the synthetic success notification. Only then does HTTP publish success. A lost response retries to the same result.

The injected test failures are: before intent, after intent, after the business commit, after receipt durability, and after success publication but before the caller receives the response. Evidence-store errors, timeouts represented by a stopped request, changed-payload retries, two API instances, and a restarted process are also covered. `intent` and `db_committed` predecessors block later mutations. `db_committed` results, dependent reads, and success notifications stay behind the publication barrier.

The prototype assumes PostgreSQL transactions, row/advisory locks, unique constraints, and clocks behave as documented. The file adapter assumes append writes plus file `fsync` are durable and independently survive database loss. HMAC detects modification but is not encryption and does not prevent deletion or rollback. A production provider must validate separate failure domains, atomic append semantics, fsync guarantees, encryption at rest/in transit, immutable retention, deletion/retention policy, monitoring, availability, credentials, key rotation, key backup/recovery, and restore permissions. The receipt signing key and operator token must come from an approved secret manager and be recoverable separately; neither may share the database backup's sole failure domain. These provider and key decisions remain launch blockers.

## Run

Use only a disposable local database whose name ends in `_test`. Apply migrations, set long random prototype secrets, choose a receipt file outside the database volume, then start the isolated server:

```sh
TEST_DATABASE_DISPOSABLE=true DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner_test npm run db:migrate
TEST_DATABASE_DISPOSABLE=true DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner_test ACKNOWLEDGEMENT_RECEIPT_PATH=/approved-independent-volume/ack-receipts.jsonl ACKNOWLEDGEMENT_RECEIPT_SECRET='<secret>' ACKNOWLEDGEMENT_OPERATOR_TOKEN='<token>' npm --workspace @petrol-partner/api run prototype:acknowledgement
```

The visible endpoints are `GET /prototype/operations/:operationId`, `GET /prototype/subjects/:subject`, and `GET /prototype/system-status`. Recovery endpoints require `Recovery-Operator-Token`: `POST /prototype/recovery/reconcile` identifies and restores acknowledged operations missing after an older database snapshot, remains restricted, and is duplicate-safe by operation/external-effect identity. `POST /prototype/recovery/reopen` requires a nonempty operator decision and refuses unresolved operations. Reconciliation copies the receipt's original result and timestamp; it does not reevaluate the action using today's clock or repeat an external effect.

## Demonstrated evidence

On 2026-09-23, the PostgreSQL integration suite ran against an isolated PostgreSQL 17.6 disposable container with separate application and verification pools. It passed stable retry, payload mismatch, all five crash boundaries, pending visibility, notification/read/write barriers, evidence failure, restricted-mode restart, explicit reopening, older-snapshot reconciliation, repeat reconciliation, and concurrent calls through two API instances. This demonstrates the protocol mechanism only. Provider durability, encryption, key recovery, retention, production backup restoration, and real domain reconciliation remain explicitly unvalidated.
