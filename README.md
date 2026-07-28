# Mukunda Enclave – Maintenance & Expense Management

Private maintenance accounting for four flats and one Emergency Administrator. The Angular
frontend runs as static files; Supabase owns authentication, PostgreSQL financial records, row
authorization, audit history, and private documents.

## Phase 1 features

- Username/flat-number login with mandatory first-password change; no registration, OTP, email
  verification, social login, or public password recovery.
- One Current Maintenance Administrator, four owner accounts, and one Emergency Administrator.
- Monthly charges, duplicate prevention, previous-balance carry-forward, partial payments,
  verification, official receipt numbering, and PDF receipts.
- Draft/pending/approved/rejected expense workflow and category summaries.
- Verified dashboard definitions, monthly/quarterly/half-year/calendar-year/financial-year/custom
  periods, print, CSV, XLSX, and PDF exports.
- Transactional annual handover, private storage policies, immutable audit history, and a safe
  Excel dry-run migration utility.
- Responsive application shell and GitHub Pages workflow using hash routes.

The local preview uses clearly labelled in-memory sample data. Production builds disable demo mode
and require Supabase configuration. No real credentials or passwords are included.

## Quick start

Prerequisites: Node.js 22.22.3+, 24.15.0+, or 26+ and npm 10+.

```bash
npm ci
npm start
```

Open `http://localhost:4200`. In the local preview, `101` represents the current manager,
`102`/`201`/`202` are view-only owners, and `emergency-admin` represents the emergency role; any
non-empty password is accepted only in demo mode.

```bash
npm run format:check
npm run lint
npm run test:all
npm run build
```

## Architecture

```text
Browser / GitHub Pages
  Angular 22 standalone routes, signals, reactive forms
           │ Supabase publishable key + user JWT
           ▼
Supabase Auth ─ PostgreSQL + RLS + transactional functions
              └ Private Storage (short-lived signed URLs)
```

Financial authority lives in SQL functions and constraints, not in cards or buttons. Verified,
non-cancelled payments are collections; approved, non-cancelled expenses are spending.

## Setup map

1. [DATABASE_SETUP.md](DATABASE_SETUP.md) – migrations, functions, and database checks.
2. [SUPABASE_SETUP.md](SUPABASE_SETUP.md) – project, Auth, private storage, and provisioning.
3. [docs/EXCEL_MIGRATION.md](docs/EXCEL_MIGRATION.md) – workbook dry run and reconciliation.
4. [DEPLOYMENT.md](DEPLOYMENT.md) – `sunsolv/mukunda-enclave-expenses` and GitHub Pages.
5. [USER_GUIDE.md](USER_GUIDE.md) – ordinary owner and administrator workflows.
6. [SECURITY.md](SECURITY.md) – roles, RLS, secrets, incidents, and verification.
7. [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) – backups and restore drills.

## Configuration still required

- A Supabase project URL and publishable/anon key in the production environment file or a safe
  CI build-time replacement.
- Supabase migrations and Edge Function deployment.
- Four actual flat records, account names, a securely supplied temporary password, and the first
  yearly responsibility assignment.
- The actual legacy workbook. No workbook was present during this implementation, so no historical
  figures were imported or claimed reconciled.
- GitHub access to the `sunsolv` organization. This workspace currently has no Git remote.

Never place a service-role key in Angular configuration, GitHub Pages, browser storage, source
control, or `.env.example`.
