# Ticket 07 provider refresh — 2026-09-28

This is a documentation check, not a selected topology or a live provider rehearsal. The existing `npm run provider:arrangement` gate reports **7/14 passed** against the previously rejected Render-based arrangement. Ticket 07 remains `claimed`; real trips remain blocked.

## Current free-tier boundaries

- [Supabase Free projects can pause after low activity](https://supabase.com/docs/guides/platform/free-project-pausing). [Managed database backups are on paid plans, and database backups exclude Storage objects](https://supabase.com/docs/guides/platform/backups). The one-hour recovery point therefore needs measured off-site exports for database state and a separate evidence-object recovery plan; a free database account does not supply that proof.
- [Render Free services spin down after inactivity and use an ephemeral filesystem](https://render.com/docs/free). They cannot by themselves run the continuous pilot worker or backup scheduler during published support windows.
- [Cloudflare Workers Free has a 10 ms CPU limit per invocation and five Cron Triggers](https://developers.cloudflare.com/workers/platform/limits/). A small external checker is conceivable, but the existing Node worker cannot be moved there without a separate design and measured execution. [Cron changes can take up to 15 minutes to propagate](https://developers.cloudflare.com/workers/configuration/cron-triggers/); schedule precision and account accessibility need a live test.
- [Better Stack advertises free monitors and heartbeats with three-minute checks](https://betterstack.com/uptime). Its [missed-heartbeat behavior](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/) is a plausible independent alert path, but the five-minute operator-receipt target must be measured after stopping the actual worker. Check commercial eligibility and account access before relying on it.
- [Backblaze B2 includes the first 10 GB free](https://www.backblaze.com/cloud-storage/pricing), and [Resend Free lists 3,000 messages per month and 100 per day](https://resend.com/pricing). These allowances do not establish account accessibility, object-lock/read-after-write/key-recovery behavior, SMTP delivery, or zero overage exposure.

## Decision sequence

1. Confirm an accessible, permitted host that can run the existing web, API, worker, and hourly export scheduler through the support window **without a card or recurring charge**. The previous OCI candidate requires a supported payment card and is unavailable to this maintainer. If no such host exists, stop: the current zero-cost constraint and pilot reliability targets have no demonstrated intersection. Keep ticket 07 claimed and request an explicit budget or operating-scope decision; do not substitute an operator laptop silently.
2. Confirm access to a sender domain, Supabase staging project, independent B2 account, and independent monitor/paging account. Record exact plan names, regions, ownership, commercial-use permission, overage controls, and support windows. Use synthetic identities only.
3. On the selected host, measure one-minute due-work processing, 200 queued items, worker restart, one-hour export cadence, off-site restore, and independent worker-stop alert receipt. Also exercise B2 ambiguous writes/object lock/key recovery, Supabase private-object deletion and internal-retention disclosure, and Auth plus SMTP delivery.
4. Record timestamps, provider response codes, redacted artifacts, costs, and failed checks in a new topology-specific evidence file. Run `npm run provider:arrangement` against that file. Select the topology only after the maintainer reviews the measured limits; leave failed or untested checks open.

The next decisive proof is **accessible continuous compute**. Re-running local simulations or selecting an external monitor cannot compensate for a worker and export scheduler that have nowhere permitted to run.
