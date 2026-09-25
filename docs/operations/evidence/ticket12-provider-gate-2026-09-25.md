# Ticket 12 provider gate inventory — 2026-09-25

Scope: read-only checks of the configured isolated Supabase staging project. No
bucket, object, lifecycle rule, credential, deployment, or database record was
created, changed, or deleted.

- The configured Supabase API hostname failed DNS resolution with `ENOTFOUND`.
  `supabase.com` resolved from the same host, so this was specific to the
  configured project endpoint. A read-only Storage API bucket list request failed
  before it reached Supabase.
- The configured PostgreSQL session-pooler connection for the same project
  succeeded. A read-only query of `storage.buckets` returned zero rows.
- No alternate active Supabase Storage endpoint or B2 receipt credentials were
  present in the local ignored configuration files checked for this ticket.

These observations establish that the current configuration cannot support the
synthetic Storage deletion rehearsal. They do not establish why the project API
hostname no longer resolves or what Supabase retains after object deletion.
No permanent-erasure claim or real evidence intake is authorized by this check.

The next supervised step is to make an active staging Supabase Storage endpoint
available, create or verify a **private** `pilot-student-evidence` bucket with
the required type and size limits, and run the synthetic upload, access, delete,
version, cache, and provider-retention checks in
[`../student-evidence.md`](../student-evidence.md). Separately verify the
student-review B2 receipt prefix lifecycle and its personal-data retention
before setting either production verification flag. Record provider responses,
timestamps, settings, and the operator decision here or in a follow-up evidence
file. Keep all provider credentials outside Git.
