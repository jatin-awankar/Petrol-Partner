# Ticket 27 local synthetic rehearsal — 2026-09-27

A fresh disposable PostgreSQL database (`petrol_partner_run2_ticket27_test`) was created and forward migrated through `0032_stalled_work_outreach.sql`. The repository's local Redis container supported the actual worker process. `npm run rehearse:notifications` ran with a separate continuous monitor process and a local HTTPS receiver. The synthetic user and participant had no real contact information.

Observed JSON result: `result=passed`, first important email attempt **180 ms** after job creation, one email gateway request, real worker process stopped, and monitor HTTPS receiver received `worker_stalled`, `important_queue_stalled`, and `important_queue_growth`. The rehearsal used a controlled six-minute clock advance after the process stopped; it did not wait six wall-clock minutes. The fallback command ran without a database URL, appended a signed and fsynced record using an individual test credential and one-time code, then reconciled exactly one record after database access returned.

PostgreSQL worker integration tests exercised five consecutive failed email attempts, bounded exhaustion, no repeat of the originating pause operation, and recovery mode remaining open for ordinary provider failure. Protected HTTP/PostgreSQL tests cover delivery metrics, retry idempotency, outreach authorization, payload mismatch, audit, and fallback reconciliation. All notices and alert payloads used synthetic codes and identifiers.

The local HTTPS receiver is not a deployed operator paging provider. No independent production monitor host, actual operator receipt, or credential custody was established. These are pilot deployment and launch checks; real trips remain disabled.
