# Ticket 14 protected synthetic recovery drills

Prepared 2026-10-08. Execution is pending the access decision below. Ticket 14 stays
claimed; criterion 2 is not waived or transferred to ticket 17. This plan contains
no source Auth values. It does not authorize production deployment or bookings.

## Inspected resources and reusable evidence

- The saved staging Auth project is `tmvckqstkaykstqxefbk`
  (`petrol-partner-pilot-baseline`, Free). Its authenticated dashboard currently
  says **paused**. It was not resumed and its database/Auth rows were not queried.
- The saved `AUTH_RESTORE_DB_URL` resolves to `qqmofdocznefwpbqweud`, now the
  protected deployed source. **Reject that target.** Never run the old restore
  instructions against it. No source connection was made during this inspection.
- Ticket 08's public-schema archive and stable mapping checks remain useful, but
  its provider was still available. Its archive excludes a populated Auth backup;
  it cannot demonstrate provider loss. Existing accounts are not reusable fixtures.
- Ticket 11 identifies private B2 bucket `synthetic-recovery-receipts`. Fresh
  read-only authentication succeeded for both existing local keys. Bucket metadata
  confirms versioning and Object Lock enabled. The only lifecycle rules apply to
  `ticket11synthetic/`: hide at 31 days, delete noncurrent versions after one day,
  and remove orphan markers. Do not alter those rules or old objects.
- Both existing keys are bucket-bound but have **no prefix restriction**. The
  writer has delete, bucket-setting, retention-write and governance-bypass rights;
  neither inspected key includes key-creation authority. The reader cannot write
  objects but is also bucket-wide. These are inspection/bootstrap credentials,
  not acceptable runtime credentials for the new drill.
- A protected local ticket 11 recovery file contains the prior encryption/signing
  material. Its existence is not second-custodian recovery proof; do not reuse its
  signing secret or expose its content. No B2 object body was downloaded this turn.
- Docker is available and PostgreSQL 17 images exist locally. Supabase CLI/Auth
  images are not installed/cached. Fetching official pinned tooling is required;
  no hosted compute or paid service is needed for the local proposal.

## Named targets and guards

Use run identifier `ticket14-20261008` (abort on any collision; choose and record a
new identifier rather than overwrite). All resources are synthetic-only.

- Local Docker projects `pp14-auth-origin-20261008` and
  `pp14-auth-recovery-20261008`, separate networks, volumes, PostgreSQL databases
  and Auth signing keys. Loopback gateways proposed on 55490 and 55491; abort if
  occupied. No public listener, shared Auth database or production environment file.
- Local application databases `pp14_recovery_origin_test` and
  `pp14_recovery_restored_test` in a fresh loopback PostgreSQL cluster. Explicit
  disposable flag, host/port/name allowlist, separate migrator/runtime/verifier
  roles. Load the already approved public baseline only while its seven-day
  retention is valid; otherwise recreate a labelled synthetic baseline without
  claiming renewed source provenance. Apply/check all 44 current migrations.
- Proposed B2 prefix `ticket14synthetic/20261008` in
  `synthetic-recovery-receipts`. Set `PILOT_B2_PREFIX` to that exact string;
  application receipt keys then lie under `<prefix>/receipts/<kind>/<uuid>.json`.
  Backups use `<prefix>/backups/`. A negative-test subprefix has separate fixtures.
  Assert zero objects before the first write. Never touch other prefixes.

The local Auth target is an actual Supabase Auth service with its own PostgreSQL,
not a mocked identity provider. This demonstrates synthetic provider-instance loss
and application recovery, not recovery of the actual hosted source account or loss
of the entire workstation. Actual source-account continuity remains unproven.

## Auth drill execution

1. Pin official Supabase tooling/container versions and image digests, record
   PostgreSQL and Auth migration versions, and start both local instances with
   outbound delivery confined to a local mail sink. Generate synthetic accounts
   only (driver, passenger, operator and conflicting subject); retain credentials
   only in the private run directory. Use actual Auth HTTP verification/login and
   application session completion. Record aggregate checks and stable-ID digests.
2. Create stable application users/mappings and representative owned history via
   the application. Exercise a verified synthetic subject's existing-ID claim and
   capture stale application/provider access and refresh sessions privately.
3. Back up the synthetic Auth data, application data and configuration manifest.
   Use the official Supabase logical backup/restore workflow, inspect the generated
   exports to confirm inclusion of users, identities and required Auth schema
   history, and record hashes. Restore only into the new disposable instance;
   never silently omit incompatible tables. Archive configuration separately:
   provider version, issuer/audience, SMTP sink, redirects, auth hooks and key IDs.
   Encrypt artifacts before off-host storage. A dump without a tested restore fails.
4. Stop origin Auth, its PostgreSQL and original application process. Disconnect
   its network; keep origin volumes unavailable to recovery. Prove origin requests
   fail. Recover using only the encrypted backup, independent reader and recovery
   key bundle. Do not read origin again to supply missing data.
5. Restore Auth into recovery, retaining synthetic user/identity UUIDs. Use a new
   target signing key/issuer. Revoke restored sessions and refresh tokens using
   the supported pinned provider mechanism before serving recovery. Record that
   procedure; key rotation alone is not proof of refresh-token revocation.
6. Restore application mappings and historical IDs. Reconfigure only the local
   recovery API to the new provider. Re-authenticate through actual Auth/API and
   assert the same application IDs, provider-subject mappings and owned records.
   Assert old provider tokens, refresh tokens and application cookies fail; new
   sessions work. Repeat logout/global revocation and stale-session checks.
7. Exercise conflicting provider-subject/account claims through HTTP and the
   normal review path: no automatic reassignment, merge or ownership rewrite.
   Repeated claims must be idempotent. If any subject changes unexpectedly, stop;
   do not invent a mapping decision. Keep business writes restricted throughout
   recovery; recovery authorization is explicit and synthetic.

Supabase documents Auth-table migration and a logical self-hosted restore path;
configuration and signing keys require separate handling. Version/schema matching
and synthetic restore validation remain prerequisites, not assumed successes.
See [Auth migration](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects)
and [self-hosted restore](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

## Independent receipt drill execution

1. Obtain two expiring keys restricted to this bucket and the native key prefix
   `ticket14synthetic/20261008/` (include the terminal slash). Writer needs
   object list/read/write and read/write object retention for the actual
   `B2ReceiptStore`; no delete, governance bypass, bucket-policy changes or key
   administration. Recovery reader needs list/read versions and read retention,
   with no write/delete/bypass. Both also need read-only bucket metadata required
   by `B2ReceiptStore.probe`: bucket existence, encryption and Object Lock.
   Verify default AES256 encryption as well as versioning/lock before use.
   Verify scope from authorization metadata before
   use. Cleanup uses separately held existing administrative access only after
   retention expires, never a runtime credential.
2. Generate a new 32-byte signing secret and separate AES-256-GCM backup key.
   Put a recovery bundle outside both origin containers/databases and the archive
   directory: `/private/tmp/pp14-recovery-custody-20261008/`, directory 0700/files
   0600. The recovering process gets only the separate reader and this bundle;
   it must verify a known signature and decrypt a backup after origin removal.
   This supplies independence from the lost provider/process for this drill, not
   second-person or workstation-disaster custody. Never store a decryption key
   beside its ciphertext in B2 or export secrets to Git/chat.
3. Run actual application receipt backend `b2`, with one-day governance retention
   (`PILOT_B2_RETENTION_DAYS=1`) and fresh prefix. Inventory all object versions and
   retention metadata. Configure a prefix-only lifecycle, preserving existing
   rules: hide after two days, delete noncurrent versions after one day, remove
   orphan markers. Verify configuration before writes. No retention bypass.
4. Create synthetic baseline at time T0, including operator access and historical
   policy versions. Use `scripts/pilot-backup.mjs` to encrypt/upload the application
   snapshot; verify returned object version/hash and independent-reader retrieval.
   Through public HTTP, acknowledge later adult/driver declarations, route
   preparation/publication, priced request/acceptance and a route outcome, plus a
   pause. Use valid fixture routing evidence explicitly labelled synthetic.
   Bound total data to 20 MiB, 100 object versions and 100 MiB downloaded; stop
   before these caps or the smaller verified free allowance is exceeded.
5. Stop origin processes and withhold origin DB access. Run
   `scripts/pilot-restore-rehearsal.mjs` into the named empty recovery database,
   retaining its write fence/restricted state. Configure the recovered Auth from
   the first drill, restricted runtime and separate receipt reader. Startup must
   not require granting the reader write access; if it does, record/fix the seam.
6. Use the actual `POST /v1/operator/reconcile` HTTP route with the recovered
   synthetic operator and normal authorization/CSRF protections. Compare all
   acknowledged operation IDs, frozen terms/paise/policy versions, owners, audit
   and durable work. Include snapshot-overlap receipts; do not replay direct SQL
   inserts as evidence of application reconciliation. Verify uncertain delivery
   stays suppressed and no external notifications are emitted.
7. Repeat reconciliation and original idempotent requests: no duplicate outcomes,
   audit effects or obligations. Attempt conflicting request reuse, signed receipt
   mismatch, unavailable evidence and invalid signature in a separate negative
   fixture target/prefix. Each must reject without changing historical state or
   reopening writes. Verify ordinary business writes stay denied before, during
   and after reconciliation; do not call reopening for real use.
8. Record stage timings/RPO, all failed attempts, aggregate assertions, exact code
   revision, roles, object version/hash/retention evidence and cleanup results.
   Refresh narrow PostgreSQL tests and affected full checks if code changes.

## Retention, cleanup and zero-cost gate

Existing source-copy artifacts retain their original deadline of 2026-10-14
18:25:25 UTC; this plan does not extend it. New synthetic local artifacts and keys
expire seven days after creation (record exact UTC timestamps). Keep files under
ignored `.scratch/unrestricted-booking/representative-copy/ticket14-20261008/`
with 0700 directories/0600 files, encrypted where retained; keys stay separately
in the custody directory. Logs must omit email/token/credential values.

At drill end, stop/remove only run-labelled containers, networks, volumes and
local databases, retaining only protected artifacts needed for review. After the
one-day lock, delete **all versions** and markers in this exact new prefix using
cleanup access, read back an empty inventory, and revoke the two new keys. The
prefix lifecycle is a fallback, not proof that deletion already occurred. Retain
the recovery bundle until cleanup verification, then destroy it by the seven-day
limit. Never purge old ticket 11 objects or weaken their locks. If lifecycle/key
cleanup cannot meet the deadline, do not start uploads.

No purchases, upgrades, hosted compute, paid cron, real email/SMS or external
routing calls. [B2's current published pricing](https://www.backblaze.com/cloud-storage/pricing)
provides 10 GB free storage and bounded free egress; that is account-wide, not a
promise that this account has allowance remaining. Before object transfers,
inspect account usage/caps read-only and prove sufficient free storage/egress
headroom for the bounded run. Existing bucket-scoped keys cannot establish
account-wide remaining allowance. If that cannot be verified, stop remote writes
and request the specific account-access/allowance decision. A local object-store
emulator cannot replace independent B2 evidence.

## Exact missing authorization/access

The existing free hosted resources do not provide a currently approved disposable
Auth restore target: one is paused, the old restore target is protected production.
The two local actual-Auth instances above avoid both limitations without a hosted
purchase; they remain synthetic-only and do not prove actual source continuity.

Approve the new B2 prefix, one-day lock/prefix lifecycle and creation of the two
restricted keys described above, plus read-only account usage/cap inspection.
An authenticated B2 key-management session (or locally configured scoped keys)
is needed because the saved keys cannot create keys. Do not paste credentials.
The previous bucket-wide writer will not be used as the application writer.

No additional source approval, source credentials or actual-account export is
requested. Both drill results remain ticket 14 requirements, and criterion 2
stays open until the real execution evidence passes review.
