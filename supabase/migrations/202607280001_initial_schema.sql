begin;

create extension if not exists pgcrypto;

create type public.profile_role as enum ('emergency_admin', 'owner');
create type public.account_status as enum ('active', 'inactive');
create type public.responsibility_status as enum ('upcoming', 'current', 'completed');
create type public.charge_status as enum ('unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled');
create type public.payment_verification_status as enum ('pending', 'verified', 'rejected');
create type public.expense_status as enum ('draft', 'pending', 'approved', 'rejected', 'cancelled');
create type public.payment_mode as enum ('UPI', 'bank_transfer', 'cash', 'cheque', 'card', 'other');
create type public.document_entity_type as enum ('payment', 'expense');
create type public.document_type as enum ('payment_proof', 'official_receipt', 'expense_bill', 'quotation', 'legacy_link', 'other');
create type public.import_status as enum ('pending', 'validated', 'completed', 'failed');

create table public.apartment_settings (
  id uuid primary key default gen_random_uuid(),
  apartment_name text not null default 'Mukunda Enclave',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  registration_number text,
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Kolkata',
  financial_year_start_month smallint not null default 4 check (financial_year_start_month between 1 and 12),
  default_maintenance_amount numeric(12,2) not null default 3000 check (default_maintenance_amount >= 0),
  default_due_day smallint not null default 10 check (default_due_day between 1 and 28),
  receipt_prefix text not null default 'ME' check (receipt_prefix ~ '^[A-Z0-9-]{1,12}$'),
  upi_id text,
  bank_details jsonb,
  contact_details jsonb,
  logo_storage_path text,
  configured_storage_limit_bytes bigint not null default 1073741824 check (configured_storage_limit_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flats (
  id uuid primary key default gen_random_uuid(),
  flat_number text not null,
  floor text not null,
  owner_name text not null,
  mobile text,
  maintenance_amount numeric(12,2) not null default 3000 check (maintenance_amount >= 0),
  occupancy_status text not null default 'owner_occupied' check (occupancy_status in ('owner_occupied', 'tenant_occupied', 'vacant')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flats_flat_number_unique unique (flat_number),
  constraint flats_mobile_text check (mobile is null or length(mobile) between 7 and 20)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  username text not null,
  flat_id uuid references public.flats(id) on delete restrict,
  owner_name text not null,
  mobile text,
  email text,
  role public.profile_role not null default 'owner',
  account_status public.account_status not null default 'active',
  must_change_password boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_normalized check (username = lower(trim(username)) and username ~ '^[a-z0-9][a-z0-9._-]{1,63}$'),
  constraint profiles_username_unique unique (username),
  constraint profiles_role_flat check (
    (role = 'emergency_admin' and flat_id is null) or
    (role = 'owner' and flat_id is not null)
  ),
  constraint profiles_one_owner_per_flat unique (flat_id)
);

create table public.maintenance_responsibilities (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats(id) on delete restrict,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  responsibility_year integer not null check (responsibility_year between 2000 and 2200),
  start_date date not null,
  end_date date not null,
  opening_balance numeric(14,2) not null default 0,
  closing_balance numeric(14,2),
  handover_date date,
  handover_notes text,
  status public.responsibility_status not null default 'upcoming',
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  completed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint responsibility_dates check (end_date >= start_date),
  constraint responsibility_year_unique unique (responsibility_year),
  constraint responsibility_completion check (
    status <> 'completed' or
    (closing_balance is not null and handover_date is not null and handover_notes is not null and length(trim(handover_notes)) >= 10)
  )
);
create unique index maintenance_responsibilities_one_current
  on public.maintenance_responsibilities ((status))
  where status = 'current';

create table public.maintenance_charges (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats(id) on delete restrict,
  billing_month date not null check (billing_month = date_trunc('month', billing_month)::date),
  base_amount numeric(12,2) not null check (base_amount >= 0),
  previous_balance numeric(12,2) not null default 0 check (previous_balance >= 0),
  late_fee numeric(12,2) not null default 0 check (late_fee >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  adjustment numeric(12,2) not null default 0,
  adjustment_reason text,
  total_amount numeric(12,2) generated always as (greatest(0, base_amount + previous_balance + late_fee - discount + adjustment)) stored,
  due_date date not null,
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  balance_amount numeric(12,2) not null default 0 check (balance_amount >= 0),
  status public.charge_status not null default 'unpaid',
  generated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancellation_reason text,
  constraint maintenance_adjustment_reason check (adjustment = 0 or length(trim(adjustment_reason)) >= 3),
  constraint maintenance_due_month check (due_date >= billing_month),
  constraint maintenance_cancel_reason check (status <> 'cancelled' or length(trim(cancellation_reason)) >= 3)
);
create unique index maintenance_charges_unique_active_month
  on public.maintenance_charges (flat_id, billing_month)
  where status <> 'cancelled';
create index maintenance_charges_flat_month_idx on public.maintenance_charges (flat_id, billing_month desc);
create index maintenance_charges_status_idx on public.maintenance_charges (status);
create index maintenance_charges_created_idx on public.maintenance_charges (created_at desc);

create sequence public.receipt_number_seq;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats(id) on delete restrict,
  maintenance_charge_id uuid not null references public.maintenance_charges(id) on delete restrict,
  receipt_number text,
  payment_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_mode public.payment_mode not null,
  transaction_reference text,
  notes text,
  verification_status public.payment_verification_status not null default 'pending',
  verified_by uuid references public.profiles(id) on delete restrict,
  verified_at timestamptz,
  rejection_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancellation_reason text,
  constraint payments_receipt_unique unique (receipt_number),
  constraint payment_verification_fields check (
    (verification_status = 'pending' and verified_by is null and verified_at is null and rejection_reason is null) or
    (verification_status = 'verified' and verified_by is not null and verified_at is not null and receipt_number is not null and rejection_reason is null) or
    (verification_status = 'rejected' and verified_by is not null and verified_at is not null and length(trim(rejection_reason)) >= 3)
  ),
  constraint payment_cancel_reason check (cancelled_at is null or length(trim(cancellation_reason)) >= 3)
);
create unique index payments_transaction_reference_unique
  on public.payments (lower(transaction_reference))
  where transaction_reference is not null and trim(transaction_reference) <> '' and cancelled_at is null;
create index payments_flat_date_idx on public.payments (flat_id, payment_date desc);
create index payments_charge_idx on public.payments (maintenance_charge_id);
create index payments_verification_idx on public.payments (verification_status);
create index payments_created_idx on public.payments (created_at desc);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text not null default '#0F766E' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_name_unique unique (name)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  vendor_name text not null,
  vendor_phone text,
  description text not null check (length(trim(description)) >= 3),
  amount numeric(12,2) not null check (amount > 0),
  payment_mode public.payment_mode not null,
  transaction_reference text,
  status public.expense_status not null default 'draft',
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  rejection_reason text,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_workflow_fields check (
    (status = 'draft' and submitted_at is null and approved_at is null) or
    (status = 'pending' and submitted_at is not null and approved_at is null) or
    (status = 'approved' and submitted_at is not null and approved_by is not null and approved_at is not null) or
    (status = 'rejected' and submitted_at is not null and approved_by is not null and approved_at is not null and length(trim(rejection_reason)) >= 3) or
    (status = 'cancelled' and cancelled_by is not null and cancelled_at is not null and length(trim(cancellation_reason)) >= 3)
  )
);
create index expenses_date_idx on public.expenses (expense_date desc);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_status_idx on public.expenses (status);
create index expenses_created_idx on public.expenses (created_at desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  entity_type public.document_entity_type not null,
  entity_id uuid not null,
  document_type public.document_type not null,
  storage_path text,
  legacy_document_url text,
  original_filename text not null,
  stored_filename text,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes between 0 and 5242880),
  checksum text,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  replaced_at timestamptz,
  deleted_at timestamptz,
  constraint document_location check (
    (document_type = 'legacy_link' and storage_path is null and legacy_document_url ~ '^https://') or
    (document_type <> 'legacy_link' and storage_path is not null and legacy_document_url is null)
  ),
  constraint document_mime check (
    document_type = 'legacy_link' or mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  )
);
create unique index documents_storage_path_unique on public.documents (storage_path) where storage_path is not null;
create index documents_entity_idx on public.documents (entity_type, entity_id);
create index documents_created_idx on public.documents (created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index audit_logs_user_date_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  source_checksum text not null,
  status public.import_status not null default 'pending',
  dry_run boolean not null default true,
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  warning_rows integer not null default 0 check (warning_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  reconciliation jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint import_batch_idempotency unique (source_checksum, dry_run)
);

create table public.import_row_references (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete restrict,
  source_sheet text not null,
  source_row_number integer not null check (source_row_number > 0),
  source_row_hash text not null,
  target_entity_type text,
  target_entity_id uuid,
  status text not null check (status in ('imported', 'skipped', 'duplicate', 'warning', 'failed')),
  warning_or_error text,
  created_at timestamptz not null default now(),
  constraint import_row_idempotency unique (import_batch_id, source_sheet, source_row_number),
  constraint import_row_hash_idempotency unique (import_batch_id, source_row_hash)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger apartment_settings_updated before update on public.apartment_settings for each row execute function public.set_updated_at();
create trigger flats_updated before update on public.flats for each row execute function public.set_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger responsibilities_updated before update on public.maintenance_responsibilities for each row execute function public.set_updated_at();
create trigger charges_updated before update on public.maintenance_charges for each row execute function public.set_updated_at();
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();
create trigger categories_updated before update on public.expense_categories for each row execute function public.set_updated_at();
create trigger expenses_updated before update on public.expenses for each row execute function public.set_updated_at();

insert into public.apartment_settings (apartment_name) values ('Mukunda Enclave');
insert into public.expense_categories (name, color) values
  ('Security', '#0F766E'), ('Housekeeping', '#14B8A6'), ('Common Electricity', '#F59E0B'),
  ('Water', '#0EA5E9'), ('Repairs and Maintenance', '#8B5CF6'), ('Lift Maintenance', '#6366F1'),
  ('Gardening', '#16A34A'), ('Plumbing', '#0284C7'), ('Electrical', '#EAB308'),
  ('Waste Management', '#64748B'), ('Administrative', '#475569'),
  ('Festival or Event', '#EC4899'), ('Other', '#94A3B8');

revoke all on sequence public.receipt_number_seq from public, anon, authenticated;
revoke all on all tables in schema public from anon;

commit;
