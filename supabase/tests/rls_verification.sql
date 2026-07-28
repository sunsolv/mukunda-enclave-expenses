\set ON_ERROR_STOP on

-- Run against a disposable Supabase test project after replacing fixture UUIDs.
-- Every DO block raises if a security invariant is broken.

begin;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in (
      'apartment_settings','profiles','flats','maintenance_responsibilities',
      'maintenance_charges','payments','expense_categories','expenses',
      'documents','audit_logs','import_batches','import_row_references'
    )
    group by schemaname
    having count(distinct tablename) < 12
  ) then
    raise exception 'One or more public tables are missing RLS policies';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'maintenance_responsibilities_one_current'
      and indexdef ilike '%where (status = ''current''%'
  ) then
    raise exception 'Only-one-current-responsibility index is missing';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from storage.buckets
    where id = 'financial-documents' and public
  ) then
    raise exception 'Financial document bucket must be private';
  end if;
end $$;

do $$
begin
  if has_table_privilege('anon', 'public.payments', 'select')
    or has_table_privilege('anon', 'public.expenses', 'select')
    or has_table_privilege('anon', 'public.documents', 'select')
  then
    raise exception 'Anonymous role has a financial table grant';
  end if;
end $$;

rollback;

-- Live negative-access checks are in scripts/verify-supabase-security.mjs.
