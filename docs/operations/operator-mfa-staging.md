# Operator MFA staging and QA

This is the separate managed-auth staging path for PR #78's remaining operator walkthrough. It is a synthetic rehearsal, not a launch or production authentication cutover. The MFA implementation is on `codex/09-operator-mfa-flow`, stacked on `codex/08-cross-page-qa` until PR #78 merges.

## Environment to prepare

1. Use a web preview, API deployment, disposable PostgreSQL database, and non-production Supabase Auth project isolated from production. Existing PR #78 synthetic API/database resources may be reused after inventory. Keep route booking and payment gates closed. Do not copy production participants or historical payment records into this environment.
   The current PR #79 Vercel preview is scoped to `codex/09-operator-mfa-flow`. Its `API_PROXY_TARGET` and `NEXT_PUBLIC_API_BASE_URL` must be branch-only values pointing at the synthetic API; neither a production default nor PR #78's branch-only values apply to this preview. Redeploy after changing Vercel variables and verify `/v1/ready` through both the preview and the synthetic API before signing in.
2. Record the exact HTTPS web origin as `APP_ORIGIN` and the exact callback as `AUTH_CALLBACK_URL`. Configure those exact URLs in Supabase Auth; do not use wildcard production redirects. Set `AUTH_PROVIDER=supabase`, `SUPABASE_URL`, and the publishable key only in the staging API's secret store. Configure the approved synthetic mail sender and enable TOTP MFA.
3. Inventory the disposable database and migration ledger. Apply only the required forward migrations, then record an authorized **staging-only** managed cutover in `auth_cutover_state` as described in [auth-cutover.md](auth-cutover.md). Leave any production `auth_cutover_state` and deployment configuration untouched.
4. Create one disposable individual operator with a verified email, a stable application `users.id`, an active `operator_allowlist` entry, and a managed `auth_identities` mapping. Do not infer operator access from provider metadata. The operator completes sign-in and MFA enrollment personally; never send credentials, TOTP secrets, or codes in chat.

## Browser proof

1. Sign in through the staging web origin. An operator should reach `/operator/mfa` at `aal1`. `/v1/operator/pending` must return `MFA_REQUIRED` before code verification.
2. On `/operator/mfa`, start setup, scan the QR code or enter the secret in an authenticator app, enter the current six-digit code, and press Enter. A successful response must replace the session cookies and permit `/operator` reads at `aal2`.
3. Sign out and sign in again. The existing verified factor should appear without showing its secret. Enter a new code and confirm the operator workspace opens. A wrong or expired code must leave operator reads blocked.
4. Revoke the synthetic operator's allowlist entry. Existing `aal2` cookies must then fail at the operator API. Also check missing Origin/CSRF and provider outage responses. No operator state-changing action is needed for this proof.
5. Capture desktop, tablet, and phone views after verification. Do not capture or retain the enrollment QR code, setup secret, TOTP code, cookies, or personal data in screenshots or logs. Record the environment, commit, date, response outcomes, and sanitized screenshot paths in PR #78's release review.

## Current gate

The HTTP flow and rendered page are covered by disposable PostgreSQL and UI tests. A live managed-auth browser run, provider response check, MFA enrollment by a real disposable operator, and authenticated operator screenshots still require the separate staging environment and test account. PR #78 remains on hold for those observations and its other recorded launch checks. The existing PR #78 isolated API uses legacy authentication and cannot supply this proof.

On October 2, the selected synthetic Supabase project showed TOTP enabled and email confirmation required. This machine's local DNS resolver returned NXDOMAIN for the project's `supabase.co` hostname, while a fresh public resolver returned valid addresses. The dashboard's local “Unhealthy” reading alone therefore does not prove a provider outage. Verify provider reachability from the deployed API and complete the email confirmation on a browser/network that can resolve the project hostname. Do not change system DNS or weaken email confirmation as a shortcut.

The PR #78 Render API and database are free synthetic resources. The API currently uses legacy auth and PR #78's exact web origin; switching it to this MFA rehearsal will interrupt that older preview's sign-in. Inventory its migration ledger and application rows, preserve its synthetic data, and record the transition before changing its branch, origin, provider settings, or database cutover state. Render's free API plan has no web shell, so use a read-only external database connection for that inventory and keep its URL in an ignored local file.

Lost-factor recovery and removal of a verified factor remain controlled operator administration tasks; this PR does not offer self-service verified-factor removal. Complete and rehearse that procedure before any production operator cutover. The setup action removes only unfinished TOTP factors for the same managed account so an interrupted enrollment can restart.
