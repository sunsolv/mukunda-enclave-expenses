# Security model

## Scope and roles

There is no public financial access. The only roles are Emergency Administrator and owner; one
owner receives current financial write authority through the single current responsibility row.
Completed/future owners remain read-only.

Angular guards improve navigation but do not provide security. PostgreSQL RLS, constraints, and
security-definer functions independently enforce every material authorization rule.

## RLS strategy

- Anonymous has no grants on financial tables.
- Active owners can read shared charges, verified/own payments, approved expenses, authorized
  documents, reports, and audit history.
- Owners can create pending payment proof only for their own flat.
- Direct updates to profiles, charges, payments, responsibilities, and audit logs are denied.
- Current-manager or Emergency Administrator checks occur again inside transactional functions.
- The role, flat, amount, receipt, totals, and statuses supplied by a browser are never authoritative.
- A partial unique index allows only one `current` responsibility.

Audit rows have no client update/delete policy. Approved entries are cancelled with reasons, never
hard-deleted through the application.

## Authentication and passwords

Supabase Auth stores all password material. User-facing email is not required; internal placeholder
identities are deterministic and non-personal. Public sign-up, email verification, OTP, social
login, and public recovery are disabled.

Temporary passwords are supplied only to a trusted provisioning/reset context and are never placed
in source, migrations, seed files, docs, audit values, or logs. New/reset profiles must change the
password before ordinary navigation. The browser re-authenticates the current password before a
normal password change. Inactive profiles fail server-side helper checks.

## Documents

`financial-documents` is private. Storage policies map object paths back to authorized metadata.
Files are limited to 5 MB and supported image/PDF MIME types. The client must also validate file
extension, MIME type, and size, rename with UUIDs, and request short-lived signed URLs. Permanent
public URLs are forbidden.

Legacy Drive links remain external and are not assumed private.

## Secrets and client data

- Never expose the service-role key to Angular, GitHub Pages, localStorage, logs, or source control.
- The publishable/anon key is not an authorization boundary.
- Do not log PII, financial payloads, tokens, passwords, or file bodies.
- The local demo stores sample records only in memory. Production financial data is never cached in
  browser local storage; Supabase’s standard Auth session storage is permitted.

## Verification

Run static SQL checks and live anonymous negative tests:

```bash
psql "$SUPABASE_DB_URL" -f supabase/tests/rls_verification.sql
SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run security:verify
```

Before production, also test disposable owner accounts for role escalation, another-flat uploads,
direct financial writes, altered RPC parameters, signed URL expiry, emergency-action audits, and
transactional handover rollback.

## Dependency and platform handling

Run `npm audit` during maintenance windows, review severity and reachability, and update lockfiles
through reviewed pull requests. Do not apply breaking `--force` upgrades blindly. Enable Supabase
database backups, GitHub branch protection, Actions least privilege, and security advisories.

## Incident basics

1. Disable the affected account and preserve audit/database logs.
2. Rotate exposed keys immediately; redeploy the frontend only if its public configuration changed.
3. Revoke sessions where supported and review Auth logs, RLS changes, financial cancellations, and
   Storage access.
4. Restore only from a verified backup; reconcile payments, expenses, and closing balance.
5. Document cause, time window, affected records, recovery, and preventive changes.

Report suspected vulnerabilities privately to the repository maintainers. Do not include resident
data, passwords, tokens, or live document URLs in a public issue.
