# Student evidence storage gate

Ticket 12 selects a dedicated private Supabase Storage bucket named
`pilot-student-evidence`. The application uses server-side service credentials only.
The API accepts at most 512 KB JPEG, PNG, or PDF objects; document bytes are stored
outside PostgreSQL, audit records, notification payloads, and database dumps.
Operators obtain a five-minute, single-use access token bound to their current
MFA-authorized identity and one document. The browser passes the token in a header,
views the object through an in-memory blob URL, and revokes that URL after one minute.
The API sends `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

Real intake remains **closed** until an operator configures all of:

- `PILOT_EVIDENCE_BACKEND=supabase`
- `PILOT_EVIDENCE_SUPABASE_URL` (HTTPS project URL)
- `PILOT_EVIDENCE_SUPABASE_SERVICE_KEY` (server and worker only)
- `PILOT_EVIDENCE_SUPABASE_BUCKET=pilot-student-evidence`
- `PILOT_EVIDENCE_PROVIDER_VERIFIED=true`
- `PILOT_STUDENT_REVIEW_RECEIPT_RETENTION_VERIFIED=true`

The two verification flags are recorded operator decisions after staging rehearsals,
not substitutes for them. The separate database backup does not contain Storage objects.
The chosen bucket must be private, have a 512 KB object size ceiling, allow only the
three MIME types, deny client uploads and public reads, and have a documented
provider-side orphan-object lifecycle. The service checks the private bucket state
before each upload. The storage worker must share the same configuration and run
often enough to delete decided evidence no later than seven days. Deletion is
scheduled six days after decision to leave one day for retries; the worker records
`deleted`, `already_missing`, or `failed`, with a five-minute retry after failure.
The original deadline never moves. The operator console shows overdue and failed
counts and the oldest deadline; any overdue item requires immediate storage-provider
escalation and a recorded incident decision, since repeated attempts alone do not
meet the seven-day policy.

Before enabling either verification flag, use fabricated documents in a dedicated staging project
to demonstrate upload, authorized read, public-read denial, expiry and one-time
access, deletion, listing and metadata removal, object version behavior, CDN and
signed-URL cache behavior, temporary browser previews, and the provider's internal
backup/replica retention. Capture exact provider settings and timestamps. Supabase's
Storage API deletion alone does not prove all copies have been erased; do not make a
permanent-erasure claim until the provider's residual retention is known. Record a
separate decision for the signed student-review receipt lifecycle: receipts include
the review's identity and enrollment snapshot and must not remain past the pilot's
90-day personal-data limit. The current B2 receipt lifecycle has not been verified
for this new receipt prefix.

An incident hold is exceptional. It requires a written incident or review reason,
an expiry, and an authorized operator decision recorded in the audit log before
setting `student_evidence.hold_reason` and `hold_until`. Releasing a hold likewise
requires an audited decision. No normal UI can place a hold; the operator should
keep protected activity restricted and use the supervised database change process.
The worker will skip an active hold and resume deletion when it expires. A hold must
never be indefinite.

The local synthetic adapter uses a private directory outside the repository with
mode-0600 files. It demonstrates application behavior but cannot establish Supabase
retention, version deletion, or CDN behavior. Real evidence is not permitted in it.
