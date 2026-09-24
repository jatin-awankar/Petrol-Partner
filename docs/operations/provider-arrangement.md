# Pilot provider arrangement

Evidence date: 2026-09-24

Status: **zero-cost constraint selected; reviewed arrangement is not compliant; launch remains blocked**

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
for real trips among the reviewed components. This assessment does not claim to rule out
every provider in the market.

## Best zero-cost candidate to validate

The maintainer conditionally selected an Oracle Cloud Infrastructure (OCI) Always Free
Ampere A1 VM as the synthetic-staging candidate on 2026-09-24, if it remains the best
zero-cost fit. Run it in the tenancy's home region for the existing Next.js, Express,
and worker processes, plus an hourly export scheduler. Retain the already proven
Supabase Auth integration and use
Supabase Free for PostgreSQL and private raw evidence, Resend Free for custom SMTP,
Backblaze B2 Free in a separate account for encrypted exports and signed receipts, and
an external Better Stack heartbeat for worker and backup freshness. The VM must not
store the only copy of any accepted business or recovery state. This is a **candidate for
synthetic staging**, not a selected real-trip topology.

OCI is the closest fit among the free compute options checked for this repository:
Koyeb's free instance sleeps, cannot run a worker, and is described as unsuitable for
production; Fly.io has no ongoing free tier; Cloudflare Workers Free has a 10 ms CPU
limit per invocation and would require substantial rework of the current Node services.
This ranking is an inference from provider limits and repository structure, not a
measured OCI deployment or a claim that every provider was surveyed.

OCI documents 2 OCPUs and 12 GB RAM of Always Free A1 capacity, but allocation depends
on home-region availability and idle instances may be reclaimed. Supabase Free can pause
after insufficient activity over a seven-day period and has no managed database backup.
The current provider evidence therefore does not establish the one-minute work target,
one-hour recovery point, or four-hour restoration target. Do not generate artificial
load to avoid reclamation; detect loss, restrict protected writes, and test restoration.
External monitoring must alert independently of the VM. A three-minute free HTTP check
alone does not prove the five-minute stalled-work alert; stage a worker heartbeat with
measured frequency, grace period, and notification latency.

The modeled base charge is USD 0 only while each component stays inside its free
allowance. OCI account creation commonly requires a card, and a sender domain may cost
money unless the maintainer already controls one. Confirm exact home-region quotas,
email sender requirements, object storage operation/egress caps, monitoring limits,
overage controls, taxes, and commercial-use terms before treating the candidate as
zero-cost. A paid plan, trial credit, or an operator laptop cannot fill a missing
requirement under the maintainer's constraint.

### Evidence sequence for ticket 07

1. Record the maintainer's OCI home region, existing sender-domain control, whether a
   payment card with any overage exposure is acceptable, exact support window, and the
   operator who can restore service. If a required domain or provider resource cannot
   be obtained at zero cost, reject this candidate and retain the launch block.
2. Verify primary terms for commercial use and every quota; provision isolated OCI,
   Supabase, Resend, B2, and external-monitoring resources with synthetic identities
   only. Set available spend caps and record any uncapped exposure. No production
   connection or participant data is needed for this proof.
3. Measure Next.js/API/worker memory and startup on the A1 shape. Sweep at one-minute
   cadence with 200 due synthetic jobs, restart during processing, stop the worker,
   and record the time to an independent five-minute alert. Repeat after VM reboot and
   simulated unavailability. Prove restricted mode before another protected success.
4. Add a B2 adapter to the recovery prototype behind its existing HTTP action and
   status seam, then exercise it with unique keys, timeout-after-send, read/list
   consistency, retained-object delete and overwrite attempts, a separate
   recovery reader, key rotation, and post-expiry deletion. Export encrypted Supabase
   data hourly and daily, verify remote checksums, then restore an older snapshot and
   reconcile every newer acknowledged synthetic action. Measure RPO and RTO, including
   recovery when the OCI VM cannot be reused.
5. Test Auth plus Resend delivery, suppression, and daily limits; private-object
   access, deletion, caches, and provider-side retention; and external readiness,
   worker, and backup alerts. Record observed times and raw provider response codes in
   restricted evidence, with no secrets or participant data in the ticket.
6. Run `npm run provider:arrangement` against a dated evidence file for this exact
   topology. Keep every untested or unresolved check `not_run`. Present the results and
   any reduced support-window dependency to the maintainer for an explicit topology
   choice. Resolve ticket 07 only if every required criterion has evidence and the
   choice is recorded; otherwise document the failed limit and leave real trips blocked.

Primary documents for this candidate: [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm),
[OCI Free Tier account conditions](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm),
[Supabase Free pausing](https://supabase.com/docs/guides/platform/free-project-pausing),
[Supabase backups](https://supabase.com/docs/guides/platform/backups),
[Better Stack check frequency](https://betterstack.com/docs/uptime/check-frequency/), and
[Better Stack heartbeat behavior](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/).
Comparison sources: [Koyeb instance limits](https://www.koyeb.com/docs/reference/instances),
[Fly.io cost management](https://fly.io/docs/about/cost-management/), and
[Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Previously reviewed paid arrangement

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

To revisit this decision, either approve a non-zero budget or propose and validate a new
free provider arrangement whose current terms permit this pilot and whose live behavior
passes every outstanding evidence check. The safety objectives themselves are not
silently reduced.

## Staging prerequisites and runbook inputs

Before staging, record the accountable operator, support window, data region, exact
service plan IDs, sender domain/DNS owner, alert recipients, spend caps, and approved
retention periods. Provision separate staging resources and synthetic identities only.
Store these secrets outside git:

- Supabase service/Auth credentials and SMTP secret;
- OCI tenancy/runtime credentials for the free candidate (or Render deploy/runtime
  credentials if the paid alternative is reconsidered);
- B2 writer and recovery-reader keys, receipt signing key, and export-encryption key; and
- Better Stack monitor/heartbeat tokens.

Deploy only after CI passes. Verify API/web readiness, worker and backup heartbeats,
email delivery, private object access/deletion, receipt semantics, an encrypted export
restore, restricted mode, and manual reopening. Record durations, identifiers, checksums,
provider status, and operator decisions without participant data or secrets. The later
release rehearsal owns production cutover; this ticket does not.

## Decision recorded

The maintainer selected zero recurring infrastructure spend on 2026-09-24. This is a
budget constraint, not selection of a hosting topology or reduced-window workflow.
Because the reviewed free components do not form a compliant real-trip arrangement, the
consequence is to keep real trips blocked. This decision authorizes no purchase,
production deployment, or weakening of the pilot requirements.

The maintainer subsequently chose the OCI-based combination above as the synthetic
staging candidate if it remains the best zero-cost fit. That is a choice of what to
validate next, not a decision that it meets the real-trip launch gates. The final
support-window and hosting choice remains open until the measured evidence is reviewed.

Live B2 semantics, executor timing, email delivery, object deletion, backup, restore, and
monitor tests are now the required proof for the selected staging candidate. Ticket 07
remains unresolved because an explicit constraint and staging choice do not establish
that an operating arrangement satisfies the pilot.

The evidence command treats a rejected arrangement as incomplete for ticket 07 even
when every failed check is reproducible. A failed technical criterion cannot resolve
the ticket; its dated procedure and artifact explain why the candidate was rejected.

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
