# Ticket 14 protected recovery execution — 2026-10-08

The approved synthetic Auth-loss and independent receipt recovery drills passed.
This complements the [source-derived upgrade evidence](ticket14-source-copy-results.md),
not a claim that deployed users or bookings were copied. Actual source-account
continuity remains unproven. No source Auth rows, sessions, tokens or MFA secrets
were accessed; the deployed source was not modified. No deployment or real bookings
were enabled.

## Targets and provenance

Execution used branch `codex/14-representative-upgrade-rehearsal`, application revision
`a1bad1f`, PostgreSQL 17.11 and all 44 migration files with verified ledger checksums.
The earlier approved source baseline remains project `qqmofdocznefwpbqweud`, public
schema at 0003 with three pricing seeds and no application records. Supplemental
historical records are synthetic. Dependency ancestry and old/new application-role
checks remain documented in the source-copy report.

Auth ran in separate Docker projects `pp14-auth-origin-20261008` and
`pp14-auth-recovery-20261008`, with internal database networks, loopback Auth gateways
55490/55491 and distinct signing keys. Actual Supabase GoTrue v2.196.0 image digest:
`sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232`.
The container databases used PostgreSQL 17.6. No SMTP delivery was configured;
synthetic verification used the provider's admin link/verify endpoints.

Application databases used the existing isolated cluster on 127.0.0.1:55488:
`pp14_recovery_origin_test`, `pp14_recovery_restored_test`,
`pp14_receipts_origin_test` and `pp14_receipts_restored_test`. Both origin databases
were fenced with `ALLOW_CONNECTIONS false` before recovery. No source connection
or source credential was needed. Restores required empty, explicitly disposable
local targets.

B2 bucket `synthetic-recovery-receipts` held only this run's new objects under
`ticket14synthetic/20261008/`: `auth/`, `receipt-drill/` and `negative/` subprefixes.
New seven-day writer/reader keys were verified using native v4 authorization:
exact bucket/prefix restrictions, no delete, governance bypass or administration;
the reader has no object-write capability. Existing broad keys did not perform
uploads or recovery. The temporary management key named `ticket14` was revoked
through the console with explicit user approval; it was not saved or used by the
agent. The scoped v4 credentials subsequently completed recovery successfully.

## Auth provider loss

A synthetic account was verified and logged in through actual provider HTTP and
application HTTP. The Auth schema dump (83,358 bytes) and application baseline
were encrypted with AES-256-GCM, uploaded independently and retrieved by the scoped
reader after origin Auth and its database were stopped. The two encrypted objects
totaled 500,105 bytes; version/hash and one-day retention were verified. Recovery
used a separate protected key directory, not an origin service or database.

The Auth schema was restored into the second instance and the application snapshot
into its second local database. New signing keys rejected the old access token.
Actual global logout invalidated restored refresh sessions; both old and freshly
revoked refresh tokens failed. Fresh provider login worked, retained its provider
subject, and mapped to the same stable application user. Old application cookies
and refresh requests failed. A deliberately conflicting synthetic subject returned
409 `IDENTITY_REVIEW_REQUIRED`, retained one user and created one review case;
the deliberate fixture conflict was then restored.

Checks completed at 05:50:56 UTC. The interval from backup upload to completed checks
was approximately 75 seconds, including pre-incident time; an exact incident RTO
was not captured and is not claimed. Recovery material was outside both services,
but on the same workstation: this proves provider/process loss, not workstation
loss or second-person custody. Actual hosted source-account continuity remains
unproven and is not inferred from the synthetic result.

## Older-copy receipt recovery

The actual `scripts/pilot-backup.mjs` created the encrypted independent snapshot at
05:56:21.401 UTC, before later protected actions. Real application HTTP then
acknowledged two adult declarations, driver and vehicle declarations, two routes
(one privately prepared, one published with current-area fixture evidence), two
priced seat requests, two acceptances, two passenger cancellations and three pause
changes. Routing evidence was explicitly synthetic; Auth, PostgreSQL, B2, signing
and the business/reconciliation routes were real.

At 06:12:38.383 UTC the origin application database was fenced. The actual
`scripts/pilot-restore-rehearsal.mjs` retrieved/decrypted/verified the older backup
using only the scoped reader and separately held key. Empty-target restore took
4.115 seconds. Default connections remained read-only. Only the explicitly
configured local recovery runtime connection overrode that default, retaining
application-level restricted recovery mode and table-level permissions.

`POST /v1/operator/reconcile` used the recovered synthetic operator's actual
Supabase MFA session, cookies, Origin and CSRF checks. The runtime was a non-owner,
non-superuser without schema creation, migration-ledger mutation or platform-payment
mutation rights. Two reconciliations completed by 06:16:21.361 UTC: 222.978 seconds
from the recorded fence through both passes, including role setup/retries. Snapshot
age at the fence was 976.982 seconds. No acknowledged operation in this drill was
lost. These measured intervals are drill evidence, not a production RTO promise.

Final assertions established:

- Exact equality with protected pre-loss projections for declaration clocks and
  policy versions; vehicle ownership/category/capacity; route ownership, geometry,
  distance, departure, capacity, policy identifiers and state; and both seat owners,
  frozen accepted terms (including amounts/currency) and cancellation states.
- Twelve recovered domain operations (2 adult, 2 driver/vehicle, 2 route, 4 seat,
  2 outcome), each with exactly one audit record. Three pause receipts recovered;
  the first reconciliation reported no pending operations. Repetition did not
  duplicate outcomes, seats or obligations; both cancelled seats had no obligation.
- Nineteen durable notification events and 16 exhausted email jobs with no active
  lease. Recovery suppressed uncertain delivery; no notification worker or outbound
  SMTP service was run.
- Original cancellation retry succeeded; changed payload under the same key
  returned 409; a fresh mutation returned 503 while restricted. Independent negative
  subprefixes rejected invalid signatures (503 `RECOVERY_INVALID`) and two conflicting
  signed versions (503 `RECOVERY_CONFLICT`). With signing material unavailable,
  reconciliation returned 503 `RECOVERY_UNAVAILABLE`. All projection comparisons
  still passed after those failures; writes stayed restricted.
- `scripts/ticket14-recovery-verify.mjs` independently checked all 44 migration
  names/checksums, role restrictions, fenced origins, audit uniqueness and email
  suppression using a read-only transaction.

Both newly generated routes use current contribution policy
`unrestricted-route-contribution-2026-10-04.1`. This run does not claim to have newly
published historical `.2` receipts. Historical `.2`, corridor records and successor
`.1` frozen storage/signed-envelope preservation remain supported by the earlier
labelled synthetic upgrade/restore checks. The first older snapshot predates the later receipt operations. The additional
snapshot-overlap case below addresses this separately.

## Snapshot-overlap follow-up

Spec review identified that repetition alone did not satisfy the plan's
snapshot-overlap case. A separate local synthetic fixture phase temporarily opened only
the disposable recovered application database for two explicit test actions:
an acknowledged passenger adult-declaration withdrawal, then the actual encrypted
backup, then an acknowledged redeclaration. No deployment/reopening decision was
made for any real service.

The backup timestamp was 06:26:23.216 UTC. Its database was renamed to
`pp14_receipts_overlap_origin_test` and fenced at 06:27:12.244 UTC. A new empty
`pp14_receipts_restored_test` restored that backup in 3.657 seconds. Before
reconciliation it contained two recovered adult operations and one acknowledged
withdrawal, but no later redeclaration. This establishes actual snapshot overlap,
not just a second pass over previously recovered receipts.

Two actual operator reconciliations completed at 06:29:53.053 UTC (160.809 seconds
including restore/setup and both passes), with no pending operations. The original
acknowledged withdrawal remained acknowledged; the later declaration became
recovered. Four adult operations and ten other domain operations had exactly one
audit each. All 18 restored email jobs were exhausted without an active lease.
Both seats and their frozen terms remained unchanged. The restricted runtime's
attempted schema creation, ledger deletion and payment-order deletion each failed
with PostgreSQL `42501`, with each probe rolled back. All three synthetic origin
databases remained fenced and application writes remained restricted.

## Protection, retention and cleanup

Before upload, the authenticated console showed zero-dollar caps and sufficient
free storage, downloads and request allowance. After overlap recovery, the console showed 2 MB stored,
3 MB downloaded, Class B 446 and Class C 382, each below 2,500/day. No billing setting
was changed. The bounded plan allowed at most 20 MiB, 100 versions, 100 MiB downloads
and 2,000 requests per class, with no Class D operations.

At 06:28:46 UTC, the exact-prefix inventory measured 26 versions, 1,498,190 bytes,
zero deletion markers and 22 governance-locked versions. The other four objects
are the actual backup runner's encrypted archive/metadata, which do not set an
object lock. That existing runner limitation is explicit; checksum/authenticated
ciphertext verification succeeded. Signed receipts and Auth backups were locked.
The latest lock expires **2026-10-09 06:26:38.169 UTC**. No bypass was used.

The console appended only `ticket14synthetic/20261008/` lifecycle: hide after two
days, delete noncurrent versions after one day. The existing ticket11 prefix rule
remained present and unchanged. Lifecycle is a fallback; it is not evidence of
completed deletion. Remote deletion and empty-prefix verification remain pending
until retention permits. A daily 13:00 Asia/Kolkata follow-up named
`Ticket 14 protected artifact cleanup` is active; it must check actual lock expiry
before deleting anything, then pause when cleanup is complete. Cleanup must delete only this prefix's versions/markers,
then revoke the two scoped keys, with separate administrative cleanup access.

Ignored local artifacts are under
`.scratch/unrestricted-booking/representative-copy/ticket14-20261008/` (0700/0600),
with independent key custody `/private/tmp/pp14-recovery-custody-20261008/` (0700/0600).
New synthetic artifacts will be removed by the earlier shared deadline below,
within their seven-day limit. The original source-copy deadline remains 2026-10-14 18:25:25
UTC. No dump, credential, account value, session, MFA secret or receipt body is
included in this report or Git.

## Exceptions and final checks

Recorded failed setup attempts: native B2 v3 authorization rejected newly created
v4 keys (v4 succeeded); internal-only Docker networking did not publish Auth ports
(a separate loopback gateway fixed it); Auth startup raced database readiness
(restart after readiness succeeded); local PostgreSQL restart omitted its custom
port (corrected before drill data operations); the initial application role lacked
profile INSERT; operator row locking required UPDATE on only `reviewed_at` in
`operator_allowlist`; a pause fixture used invalid capability `acceptances` (400,
corrected to `acceptance`). No failed attempt is counted as a pass.

The initial final test command targeted unavailable default PostgreSQL port 55432.
A fresh isolated test database enabled all root/PostgreSQL checks. One full run had
an empty 404 during the existing HTTP fixture setup (513 API passed). That unchanged
focused case passed, and the final full rerun passed 49 root tests, 514 API tests
(7 opt-in skips) and 19 worker tests. Typecheck passed. Source-copy preservation, legacy
reads and restricted-role HTTP coverage are reused from the linked prior report.

Cutover still requires refreshed source inventory, actual-account recovery planning,
writer fencing/backup decisions, provider/financial approvals and explicit reopening.
This ticket supplies the authorized representative-copy and synthetic recovery
proof; it supplies no production migration, deployment or real-booking approval.

## Completion and review

After the overlap case, the exact four projection groups and original request
retry passed again at 06:31:02 UTC. Conflicting request reuse returned 409; fresh
writes and all three negative recovery cases returned 503. Outcomes, seats,
obligations and frozen values remained unchanged. Standards review found no
findings. Spec review's snapshot-overlap finding was fixed and re-reviewed with
no remaining acceptance gap. Scoped lint and whitespace checks passed.

Both named Auth Docker projects, their networks and synthetic volumes were removed.
All six named application/drill/full-suite databases (including the overlap origin
and `pp14_final_suite_test`) were dropped; the exact-name readback count was zero.
The existing cluster and unrelated prior work were preserved. Protected artifacts
and scoped cleanup credentials remain only for retention-dependent cleanup.
Remote deletion/key revocation are pending, not reported as completed. Ticket 14's
three acceptance criteria are satisfied under the explicit source-copy/synthetic
Auth approvals; cleanup remains tracked by the active follow-up.
