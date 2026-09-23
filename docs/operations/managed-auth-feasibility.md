# Managed authentication feasibility

Evidence date: 2026-09-23

## Decision

Reject Supabase Auth for pilot adoption **now**. Keep it as the preferred candidate for a
synthetic staging proof after the requirements below are implemented and demonstrated.
This is not a rejection of the provider: its documented email/password recovery, TOTP
MFA, server APIs, and PostgreSQL export options fit the intended architecture. The
current application and available environment do not yet prove the pilot's authorization,
revocation, outage, SMTP, or recovery requirements.

Run `npm run auth:feasibility` to evaluate the checked-in evidence. The command exits
non-zero while any required check is `not_run` or `failed`, or when primary sources are
missing or undated. A fully evidenced proof may still recommend rejection, but a failed
ticket requirement must first be resolved or returned for an explicit scope decision.
This fail-closed result is intentional and must not be bypassed for launch approval.

Every check marked `passed` must include these machine-validated fields in the evidence
file:

- `checked_on`: the observation date in `YYYY-MM-DD` form;
- `procedure`: the executed command or reproducible procedure;
- `observed_result`: the externally observable outcome rather than an implementation
  assertion; and
- `artifact`: a retained artifact path or reference supporting the result.

A completed 19/19 proof additionally requires `environment` to be exactly
`synthetic-staging`. These structural requirements prevent unsupported prose from
passing the gate; the maintainer reviewing adoption must still inspect the referenced
artifacts and confirm that they belong to the recorded run.

## Current repository findings

- The Express API issues and verifies its own JWTs. It does not validate a Supabase
  identity server-side.
- Student and driver eligibility is stored in application PostgreSQL records and checked
  by ride/booking services. This is correctly independent of provider metadata.
- `requireAdmin` trusts the `role` claim in the locally issued access token. There is no
  current operator allowlist and no `aal2` check.
- Auth cookies are `HttpOnly`, `Secure` in production, and `SameSite=Lax`. Cookie-backed
  mutations have no explicit Origin check or CSRF token.
- The application has auth endpoint rate limiting, but its login and reset behavior has
  not been measured against Supabase's configured limits.
- No Supabase URL/key, synthetic Supabase identity, approved SMTP test sender, or
  provider backup is configured in this workspace.

These findings are feasibility evidence, not authorization to migrate existing users or
replace the current login path.

## Required application design

### Stable identity mapping

Keep `users.id` as the stable application identifier used by rides, bookings, journeys,
settlements, audit records, and eligibility. Add a separate mapping only after the
deployed user inventory and migration baseline are known:

```text
auth_identities
  provider            "supabase"
  provider_subject     Supabase auth.users.id
  user_id              existing users.id
  first_linked_at
  last_validated_at
  disabled_at

UNIQUE (provider, provider_subject)
UNIQUE (provider, user_id) WHERE disabled_at IS NULL
```

The server derives the provider subject from a validated token, resolves it to
`users.id`, and then performs every eligibility or authorization query using `users.id`.
It never accepts `user_id`, operator role, eligibility, or allowlist status from editable
user metadata. Provider roles/claims may be a cache hint only.

Before linking any account:

1. Inventory normalized application emails and stop on collisions.
2. Match only a provider identity whose email ownership is verified. Do not infer
   ownership from a successful or obfuscated duplicate-signup response.
3. Reject automatic claiming for identities with a missing/unusable email. Send them to
   manual operator review using minimal evidence.
4. Attach the provider subject to exactly one pre-existing `users.id` in a transaction
   with an audit record. Never create a second application user to resolve ambiguity.

### Controlled claim/reset fallback

Password transfer is not assumed. Although Supabase currently uses bcrypt and documents
auth-schema migration between Supabase projects, Petrol Partner's legacy hashes have not
been imported or rehearsed. The default migration is therefore a controlled account
claim:

1. Freeze the inventoried legacy account and create an unconfirmed provider identity
   associated with the same normalized email.
2. Deliver a single-use, short-lived claim/reset link through the approved sender.
3. After verified email ownership, transactionally attach the provider subject to the
   existing `users.id`, record the migration outcome, and invalidate legacy refresh
   tokens/login.
4. Require operator review for collisions, missing email, changed email, expired links,
   or a claim on an already-linked user. A review outcome never rewrites historical
   relationships.
5. Reconcile user counts, every mapping, active commitments, and audit results before
   ending the migration window. Retain a controlled rollback path until reconciliation
   passes.

### Protected request policy

A protected mutation is allowed only when all applicable facts are current:

```text
validated provider subject
  -> active provider session
  -> stable application user mapping
  -> active application account
  -> current student/driver/car/phone eligibility
  -> for operator actions: active operator allowlist entry + aal2
```

Supabase documents that access tokens from revoked sessions remain usable until their
JWT expiry. Offline signature/expiry validation alone is therefore insufficient for
pilot-protected mutations. Use an online current-user/session validation at this boundary
or an equivalent lookup of the token's `session_id`; reject if current status cannot be
established. Safe reads may use a still-valid locally verified token only where the data
policy permits it. During an Auth outage, deny protected mutations with a retryable
`AUTH_ASSURANCE_UNAVAILABLE` response rather than silently trusting stale claims.

The web/API deployment must use an exact HTTPS origin allowlist for cookie-authenticated
unsafe methods and a CSRF token bound to the session. Keep `HttpOnly`, `Secure`, and
`SameSite=Lax` cookies; restrict Domain and Path to the narrowest working values. Use
PKCE and exact production/staging redirect URLs, not broad production wildcards.

## Reproducible synthetic staging demonstration

Do not use real students or production data. Provisioning a project, sender, or paid
plan requires maintainer approval. Store credentials outside git and record redacted
configuration plus timestamps in `managed-auth-evidence.json`.

### Preconditions

1. Use a dedicated non-production Supabase project and two unique synthetic inboxes:
   one student and one operator.
2. Enable email confirmation. Configure the exact staging Site URL/callback allowlist
   and an approved custom SMTP test sender (or approved Send Email hook). Do not use the
   provider's default sender as pilot evidence.
3. Enable TOTP MFA and record the Auth session, password, CAPTCHA, and rate-limit
   settings. Set a short but supported JWT lifetime for the stale-token observation.
4. Seed two stable application users, an active student eligibility row, and an explicit
   operator allowlist row. The allowlist contains the stable application ID, not email or
   provider metadata.
5. Use current application server endpoints after the mapping and authorization changes
   land; direct SDK success alone does not prove server enforcement.

### Student flow

1. Sign up the synthetic student. Record that no authenticated session is issued before
   confirmation and that exactly one verification message reaches the approved sender.
2. Follow the allowed callback and sign in. Call the application's authenticated identity
   endpoint and record that the server resolves the provider subject to the seeded stable
   `users.id`.
3. Request password recovery. Follow the delivered link, set a new password, and record
   that the old password fails, the new password succeeds, and the stable application ID
   is unchanged.
4. Repeat signup for the same email and confirm the response does not create or attach a
   second application identity. Exercise the manual path for a synthetic missing-email
   provider identity.
5. Remove/expire application eligibility without changing provider metadata. Confirm a
   protected student action is rejected. Restore it through the normal reviewed path and
   confirm the same action becomes eligible.

### Operator MFA and revocation flow

1. Sign in the synthetic operator at `aal1`. Confirm every operator endpoint rejects it,
   even if editable metadata contains `role=admin`.
2. Enroll a TOTP factor, create and verify a challenge, refresh the session, and record
   `aal2`. Confirm the allowlisted operator action now succeeds.
3. Remove the application allowlist entry while retaining the `aal2` token. Confirm the
   next operator action fails. Restore only through the audited allowlist workflow.
4. Create two sessions. Revoke the current session and then all sessions. Record refresh
   failure for the affected scopes.
5. Reuse the captured unexpired access token after revocation. Record the provider's
   offline-token behavior and confirm the application's protected endpoint rejects it by
   checking current session state. Repeat after JWT expiry.

### Abuse, browser, and outage flow

1. Against synthetic identities, exercise configured login, signup, verification,
   recovery, token, and MFA limits just to the documented boundary. Record status `429`,
   retry timing, and whether limits apply per user, IP, or project. Do not load-test the
   shared service.
2. Verify CAPTCHA on signup, login, and recovery if selected. Confirm application-level
   throttling remains in front of the provider and does not disclose account existence.
3. Inspect `Set-Cookie` over staging HTTPS and record `HttpOnly`, `Secure`, `SameSite`,
   Domain, Path, and expiry. From a disallowed Origin, confirm every unsafe cookie-backed
   request fails; repeat with a missing/incorrect CSRF token.
4. Inject an Auth adapter timeout/unavailable response. Confirm protected mutations fail
   closed, permitted reads follow the documented degraded mode, and recovery is visible
   to operators without logging tokens or personal data.

### Export and restore flow

1. Export roles, schema, and data using the documented Supabase CLI process to encrypted
   off-site test storage. Record duration, size, checksum, tool/PostgreSQL versions, and
   whether auth identities, factors, and sessions are covered.
2. Restore into a fresh non-production project, including documented auth-schema
   customizations and migration history. Never overwrite the source project.
3. Rotate/reconfigure project-specific secrets as required. Confirm old-token behavior,
   synthetic user counts, subject mappings, email login/recovery, operator MFA re-enrolment
   requirements, and application relationships.
4. Record measured RPO/RTO. A dump that has not been restored is not recovery evidence.

After every step has dated evidence, change only the corresponding check to `passed` or
`failed`, update the recommendation, and rerun `npm run auth:feasibility`. A fully run
proof may legitimately recommend rejection.

## Limits and cost finding

Primary sources checked on 2026-09-23 show:

- Free: USD 0, 50,000 MAU, 500 MB database, two active projects, and basic MFA. Free
  projects pause after one week of inactivity and have no managed automatic backups.
- Pro starts at USD 25/month for the organization. Session lifetime/inactivity/single-
  session controls are documented as Pro-only.
- Built-in Auth email is best-effort, restricted to project team addresses, has no SLA,
  and is currently limited to two messages/hour. A custom SMTP provider or Send Email
  hook is required; its unapproved cost is not estimated here.
- Managed PITR currently starts near USD 100/month for seven days. Free projects must
  operate and test their own logical exports. Neither choice alone proves the pilot's
  one-hour RPO and four-hour recovery objective.

Therefore the free tier is suitable for the development proof, not approved pilot
operation. The maintainer must approve an SMTP provider and a recovery arrangement after
measured staging evidence; this document authorizes no purchase.

## Primary sources

- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Multi-Factor Authentication](https://supabase.com/docs/guides/auth/auth-mfa)
- [User sessions](https://supabase.com/docs/guides/auth/sessions)
- [Signing out](https://supabase.com/docs/guides/auth/signout)
- [Advanced server-side Auth guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Database backups](https://supabase.com/docs/guides/platform/backups)
- [CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Pricing](https://supabase.com/pricing)
