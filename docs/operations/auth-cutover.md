# Managed authentication cutover

This runbook implements ticket 08 without authorizing a production cutover. `users.id` remains the application identity; Supabase subjects live only in `auth_identities`. Registration and email confirmation do not set `user_profiles.is_verified`, student eligibility, driver eligibility, or operator access.

## Inventory and rehearsal

1. Back up the target and record its migration ledger. Run `npm run auth:identity-inventory` against a read-only connection. Stop for normalized-email duplicates, missing emails, or unexplained user counts.
2. Apply migration `0005_managed_auth_identities.sql` to a staging copy. Re-run the inventory and capture counts for users, mappings, bookings, vehicles, approvals, settlements, and payment orders.
3. For every inventoried account, use provider email verification/recovery. Password import is not assumed. A verified exact normalized email may claim its existing `users.id`; collisions, changed/missing email, or an already-linked user require operator review.
4. Exercise registration, confirmation callback, login, logout, recovery, token refresh, global revocation, provider outage, Origin rejection, and CSRF rejection through public HTTP. Confirm historical foreign keys still reference the same `users.id`.
5. In staging set `AUTH_PROVIDER=supabase` with the exact callback URL and custom SMTP configuration. Confirm the old password route is no longer active, legacy refresh tokens are revoked on claim, and only the managed path issues sessions.

## Authorized cutover

Do not change production configuration without explicit authorization. At the approved window: freeze onboarding, take the final inventory and backup, configure exact redirect/origin values, switch `AUTH_PROVIDER` once, run the narrow browser journey, compare all counts and ownership samples, and record authorization in `auth_cutover_state`. Do not run both login paths concurrently.

## Rollback and recovery

Before accepting real use, retain the pre-cutover database backup and provider configuration export. If reconciliation fails, disable new protected mutations, preserve new identity/audit rows, restore the approved application snapshot into a separate recovery target, reconcile provider subjects to stable user IDs, and only then choose either the managed path or the legacy configuration. Never delete mappings or rewrite historical foreign keys to force counts to match.
