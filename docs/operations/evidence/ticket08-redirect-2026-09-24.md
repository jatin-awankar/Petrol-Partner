# Ticket 08 staging redirect acceptance

Date: 2026-09-24. Environment: isolated Supabase staging project, local web app at
`http://127.0.0.1:43123`, and local API connected to the inventoried staging database.
Only a synthetic email identity was used.

- The registration form returned “Check your email” without granting a session.
- The fresh verification message's Supabase action link returned HTTP 303 to the exact
  `http://127.0.0.1:43123/auth/callback` path with a `code` parameter. The callback URL
  was inspected without printing its code. A local DNS resolution failure required
  following the provider action link in the test process, then opening its unmodified
  redirect URL in the original browser tab.
- The browser exchanged the code with its PKCE verifier and opened the authenticated
  dashboard.
- PostgreSQL aggregate checks found one application user, one active provider mapping,
  and one identity audit event for the synthetic account.
- The provider user was deleted after the proof. Its application mapping was disabled
  and a `disabled` audit event was retained, preserving the audit trail.

This proves the corrected staging redirect and registration callback. Password recovery,
old-password rejection, new-password login, and stable mapping were exercised in the
same staging environment earlier on this date; that earlier recovery link used the prior
Site URL and required routing its code to the callback path. The current redirect
configuration should be checked again in a deployed staging origin before production
cutover.
