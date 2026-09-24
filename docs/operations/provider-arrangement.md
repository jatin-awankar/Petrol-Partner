# Pilot provider arrangement

Evidence date: 2026-09-24

Status: **zero-cost constraint selected; no compliant real-trip arrangement; launch remains blocked**

## Free-tier result first

A free-only arrangement is not acceptable for the supervised pilot. Render's free web
instances sleep after 15 idle minutes, share 750 monthly instance-hours, lose local files
on restart, and do not offer a free background worker. Supabase Free pauses after one
inactive week, has no managed database backups, and its default Auth mail service is not
intended for production delivery. Better Stack's free three-minute checks also cannot by
themselves establish the one-minute important-work target. These are operating limits,
not capacity conclusions inferred from having only 20–30 students.

The costed arrangement that would close those gaps is:

- three Render `0.5c-512mb` paid services for Next.js, Express, and the continuous worker;
- one Render 256 MB paid Key Value instance for the legacy BullMQ dependency until
  PostgreSQL-backed durable work replaces it;
- Supabase Pro for PostgreSQL, Auth, and a private raw-evidence bucket;
- Resend Free through custom SMTP for pilot transactional email;
- a separate Backblaze B2 account and private Object-Lock-enabled bucket for signed
  acknowledgement receipts and encrypted logical exports; and
- Better Stack external uptime plus heartbeat monitoring. Its free plan is only a
  staging candidate; alert timing and commercial eligibility must be confirmed before
  pilot use.

On 2026-09-24 the maintainer rejected this paid arrangement and required zero recurring
infrastructure spend. It remains here as the priced comparison, not a recommendation or
authorization to buy or deploy it.

Under that constraint, free Supabase, Resend, Backblaze B2, and Better Stack resources may
be used only for synthetic development/staging within their terms. Render explicitly
describes free compute as suitable for exploration and previews, not production. An
operator laptop is not an acceptable hidden substitute for an always-on worker, backup
scheduler, or independent monitor. There is consequently no selected provider topology
for real trips.

## One operating arrangement

| Need | Candidate and boundary |
| --- | --- |
| Authentication and SMTP | Supabase Auth with Resend custom SMTP. Keep stable application IDs and the controls proven in `managed-auth-feasibility.md`. |
| Web and API | Separate always-on paid Render web services. Free sleep is prohibited during a published support window. |
| Timely executor | Paid Render background worker. PostgreSQL remains the durable source of due work; Redis is never sole acceptance evidence. |
| Private evidence | Private Supabase Storage bucket, server-only upload policy, short-lived review URL, restrictive cache control, and retryable deletion. Raw objects are excluded from database dumps. |
| Independent recovery | Backblaze B2 in a different provider account/failure domain, using unique object keys, SSE, checksums, and Object Lock. The database provider cannot be the only recovery credential holder. |
| Exports | Hourly encrypted logical export during support windows, plus a daily export, uploaded to B2 and verified by checksum/list/read. |
| Independent monitoring | Better Stack checks public readiness and receives separate worker/backup heartbeats. Monitoring must not depend on Render, Supabase, or the operator laptop. |

The operator laptop may initiate a supervised restore, but it is not part of normal
execution, alerting, or backup freshness. Provider credentials and signing/encryption
keys must be recoverable by the documented two-person procedure, not only from that
machine.

## Measured representative volume

The existing restore rehearsal produced compressed logical archives of 94 KiB and
325 KiB. For planning, use a deliberately larger 10 MiB encrypted export:

- 24 hourly exports retained for seven days: 1.64 GiB;
- 30 daily exports retained for 30 days: 0.29 GiB;
- 10 trips × 20 protected actions × 2 KiB signed receipt: under 0.4 MiB; and
- one write, one verification read, and one list/check per export: about 2,250 monthly
  B2 operations before restore rehearsals.

The modeled 1.94 GiB is below B2's first 10 GB free allowance. This is not a permanent
promise: staging must measure encrypted archive size and upload duration. Alert at 25 MiB
per export or 5 GiB total, and re-price before crossing either threshold. Export
creation, upload, checksum, and independent heartbeat must complete within the one-hour
RPO; staging must prove the schedule with the application and worker running.

Email planning assumes 30 students, two onboarding/recovery messages each, and ten trips
with 20 participant-trip relationships and up to six messages per relationship. Doubling
that for retries gives 360 messages; the operating envelope is 600/month and 50/day.
That is below Resend Free's documented 3,000/month and 100/day, but staging must measure
delivery and suppression behavior. Crossing 50/day pauses new onboarding; urgent trip
coordination uses the published fallback rather than silently exceeding a provider cap.

The worker must be tested with a one-minute sweep, at least 200 due synthetic jobs, a
restart during processing, and a five-minute stalled-work alert while the worker process
is stopped. No provider timing result has yet been recorded.

## Recovery adapter semantics to demonstrate

Backblaze documents S3-compatible operations, retained object versions, and Object Lock.
Documentation alone does not validate the prototype adapter. With an authorized
synthetic bucket, the staging proof must:

1. upload a uniquely keyed signed receipt, capture version ID/ETag/checksum, immediately
   read it, and list it;
2. repeat the same write, reject a different body under the same operation identity, and
   classify timeout-after-send as ambiguous until read/list resolves it;
3. verify read-after-write and list visibility from a second credential/process;
4. apply retention, prove delete/overwrite fail while locked, then use a separate
   disposable one-day object to observe post-expiry deletion behavior;
5. revoke the writer and prove the recovery reader still works, then exercise documented
   key rotation/recovery without using database-backup credentials; and
6. record provider outage/timeout behavior, exact response codes, retry bounds, encryption,
   region, lifecycle, account deletion, and support limitations.

Compliance-mode retention cannot be shortened, so staging must not put personal raw
evidence into the receipt bucket. Receipts contain only the minimal recovery record and
must use a retention period approved alongside the deletion policy. Raw verification
objects remain in Supabase Storage and require a separate deletion test: object deletion,
metadata removal, signed-URL/cache behavior, provider backup/internal-copy behavior, and
the resulting truthful deletion wording. No seven-day deletion promise should be
published before that provider test.

## Cost and operating restrictions

Current primary pricing checked on 2026-09-24 gives this base monthly estimate:

- Render: three USD 7 compute services plus USD 10 Key Value = **USD 31**;
- Supabase Pro: **USD 25** base, one project included;
- Resend Free: **USD 0** within 3,000/month and 100/day;
- Backblaze B2: **USD 0** within 10 GB and the modeled operation/egress allowance; and
- Better Stack: **USD 0 candidate**, subject to commercial-use and alert-timing approval.

Base total: **USD 56/month**. For budgeting only, at a deliberately conservative
₹100/USD assumption this is ₹5,600/month before tax, or ₹6,608 if 18% tax applies. The
actual card-network exchange rate and invoice tax control. This excludes a sender domain
and registrar renewal, excess build/bandwidth/email/storage, paid monitoring, PITR,
support, and any foreign-transaction fee. Supabase PITR starts at USD 100/month and is
not included; the candidate instead depends on the measured encrypted export workflow.
Keep spend caps enabled where offered and do not purchase anything under this ticket.

## Zero-cost operating restriction

No real-trip support window may be published while the zero-cost constraint remains.
Free resources may host synthetic demonstrations, but they must not onboard real
participants, accept protected ride mutations, or create a promise of one-minute work,
one-hour recovery, four-hour restoration, durable independent receipts, or reliable
notification. A maintainer may run local demonstrations manually, but the machine must
not be represented as production infrastructure and its availability cannot satisfy a
launch gate.

To revisit this decision, either approve a non-zero budget or produce and validate a new
free provider arrangement whose current terms permit this pilot and whose live behavior
passes every outstanding evidence check. The safety objectives themselves are not
silently reduced.

## Staging prerequisites and runbook inputs

Before staging, record the accountable operator, support window, data region, exact
service plan IDs, sender domain/DNS owner, alert recipients, spend caps, and approved
retention periods. Provision separate staging resources and synthetic identities only.
Store these secrets outside git:

- Supabase service/Auth credentials and SMTP secret;
- Render deploy/runtime credentials;
- B2 writer and recovery-reader keys, receipt signing key, and export-encryption key; and
- Better Stack monitor/heartbeat tokens.

Deploy only after CI passes. Verify API/web readiness, worker and backup heartbeats,
email delivery, private object access/deletion, receipt semantics, an encrypted export
restore, restricted mode, and manual reopening. Record durations, identifiers, checksums,
provider status, and operator decisions without participant data or secrets. The later
release rehearsal owns production cutover; this ticket does not.

## Decision recorded

The maintainer selected zero recurring infrastructure spend on 2026-09-24. Because the
documented free tiers do not form a compliant real-trip arrangement, the consequence is
to keep real trips blocked. This decision authorizes no purchase, production deployment,
or weakening of the pilot requirements.

Live B2 semantics, executor timing, email delivery, object deletion, backup, restore, and
monitor tests remain useful only if a future candidate is proposed. Ticket 07 remains
unresolved because an explicit constraint is decision evidence, not evidence that an
operating arrangement satisfies the pilot.

## Primary sources

Checked 2026-09-24:

- Render: https://render.com/docs/free
- Render pricing: https://render.com/pricing
- Render background workers: https://render.com/docs/background-workers
- Supabase pricing: https://supabase.com/pricing
- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Supabase private buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase private serving/cache behavior: https://supabase.com/docs/guides/storage/serving/downloads
- Resend pricing: https://resend.com/pricing
- Backblaze B2 pricing: https://www.backblaze.com/cloud-storage/pricing
- Backblaze Object Lock: https://www.backblaze.com/docs/cloud-storage-object-lock
- Backblaze lifecycle/version behavior: https://www.backblaze.com/docs/cloud-storage/lifecycle-rules
- Better Stack pricing: https://betterstack.com/pricing
- Better Stack check frequency: https://betterstack.com/docs/uptime/check-frequency/
