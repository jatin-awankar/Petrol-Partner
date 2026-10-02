# Operator MFA staging and QA

This is the separate managed-auth staging path for PR #78's remaining operator walkthrough. It is a synthetic rehearsal, not a launch or production authentication cutover. The MFA implementation is on `codex/09-operator-mfa-flow`, stacked on `codex/08-cross-page-qa` until PR #78 merges.

## Environment to prepare

1. Use a separate web preview, API deployment, disposable PostgreSQL database, and non-production Supabase Auth project or an inventoried, isolated synthetic project. Keep route booking and payment gates closed. Do not copy production participants or historical payment records into this environment.
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

Lost-factor recovery and removal of a verified factor remain controlled operator administration tasks; this PR does not offer self-service verified-factor removal. Complete and rehearse that procedure before any production operator cutover. The setup action removes only unfinished TOTP factors for the same managed account so an interrupted enrollment can restart.
