# Database setup

Use a new or backed-up Supabase project. Do not run unreviewed migrations against production.

## Apply migrations

Install the Supabase CLI, authenticate, and link the intended project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The versioned migrations run in this order:

1. `202607280001_initial_schema.sql` creates normalized tables, money constraints, indexes, the
   single-current-responsibility index, and default expense categories.
2. `202607280002_financial_functions.sql` creates security-definer functions for charge generation,
   payment allocation/verification, receipt numbering, expense review, and atomic handover.
3. `202607280003_rls_storage_and_reports.sql` enables RLS, installs table and private-storage
   policies, creates the private bucket, and defines server-aligned reporting functions.

## Initial records

Add exactly four flat rows before provisioning owners:

```sql
insert into public.flats (flat_number, floor, owner_name, mobile, maintenance_amount)
values
  ('101', 'Ground', 'OWNER NAME', null, 3000),
  ('102', 'Ground', 'OWNER NAME', null, 3000),
  ('201', 'First', 'OWNER NAME', null, 3000),
  ('202', 'First', 'OWNER NAME', null, 3000);
```

Store mobile numbers in text fields. Do not use numeric columns for phone numbers.

After account provisioning, assign the first responsibility as the Emergency Administrator:

```sql
insert into public.maintenance_responsibilities
  (flat_id, owner_profile_id, responsibility_year, start_date, end_date,
   opening_balance, status, assigned_by)
select f.id, p.id, 2026, date '2026-01-01', date '2026-12-31', 0, 'current', admin.id
from public.flats f
join public.profiles p on p.flat_id = f.id
cross join lateral (
  select id from public.profiles where role = 'emergency_admin' limit 1
) admin
where f.flat_number = '101';
```

Change the year, dates, flat, and reviewed opening balance. The partial unique index prevents a
second `current` row.

## Verification

In a disposable linked project:

```bash
psql "$SUPABASE_DB_URL" -f supabase/tests/rls_verification.sql
SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run security:verify
```

The first script checks policy coverage, the single-current index, private bucket status, and
anonymous grants. The second makes real anonymous requests. Full owner-role negative tests require
temporary test accounts; never run destructive fixtures in production.

## Financial definitions

- Collections: `payments.verification_status = 'verified'` and `cancelled_at is null`.
- Expenses: `expenses.status = 'approved'` and `cancelled_at is null`.
- Closing balance: opening balance + collections − expenses.
- Money: `numeric(12,2)`/`numeric(14,2)`, never floating point.
- Approved financial entries are cancelled with reasons rather than deleted.

Keep daily PostgreSQL backups and private Storage backups. See
`docs/BACKUP_AND_RECOVERY.md`.
