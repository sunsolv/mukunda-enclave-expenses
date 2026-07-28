begin;

alter table public.apartment_settings enable row level security;
alter table public.flats enable row level security;
alter table public.profiles enable row level security;
alter table public.maintenance_responsibilities enable row level security;
alter table public.maintenance_charges enable row level security;
alter table public.payments enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.documents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_row_references enable row level security;

grant select on public.apartment_settings, public.flats, public.profiles,
  public.maintenance_responsibilities, public.maintenance_charges, public.payments,
  public.expense_categories, public.expenses, public.documents, public.audit_logs
  to authenticated;
grant insert on public.payments, public.expenses, public.documents to authenticated;
grant update on public.expenses, public.expense_categories to authenticated;
grant select, insert, update on public.import_batches, public.import_row_references to authenticated;

create policy settings_read_active on public.apartment_settings for select to authenticated
  using ((public.current_profile()).id is not null);
create policy settings_admin_write on public.apartment_settings for all to authenticated
  using (public.is_emergency_admin()) with check (public.is_emergency_admin());

create policy flats_read_active on public.flats for select to authenticated
  using ((public.current_profile()).id is not null);
create policy flats_admin_write on public.flats for all to authenticated
  using (public.is_emergency_admin()) with check (public.is_emergency_admin());

create policy profiles_read_active on public.profiles for select to authenticated
  using ((public.current_profile()).id is not null);
create policy profiles_no_direct_write on public.profiles for update to authenticated
  using (false) with check (false);

create policy responsibilities_read_active on public.maintenance_responsibilities for select to authenticated
  using ((public.current_profile()).id is not null);
create policy responsibilities_admin_write on public.maintenance_responsibilities for all to authenticated
  using (public.is_emergency_admin()) with check (public.is_emergency_admin());

create policy charges_read_active on public.maintenance_charges for select to authenticated
  using ((public.current_profile()).id is not null);
create policy charges_rpc_only_write on public.maintenance_charges for all to authenticated
  using (false) with check (false);

create policy payments_read_active on public.payments for select to authenticated
  using ((public.current_profile()).id is not null);
create policy payments_insert_own_or_manager on public.payments for insert to authenticated
  with check (
    created_by = auth.uid() and
    (public.can_manage_finances() or flat_id = (public.current_profile()).flat_id) and
    verification_status = 'pending' and receipt_number is null
  );
create policy payments_rpc_only_update on public.payments for update to authenticated
  using (false) with check (false);

create policy categories_read_active on public.expense_categories for select to authenticated
  using ((public.current_profile()).id is not null);
create policy categories_manager_write on public.expense_categories for insert to authenticated
  with check (public.can_manage_finances());
create policy categories_manager_update on public.expense_categories for update to authenticated
  using (public.can_manage_finances()) with check (public.can_manage_finances());

create policy expenses_read_authorized on public.expenses for select to authenticated
  using (
    public.can_manage_finances() or
    status = 'approved' or
    created_by = auth.uid()
  );
create policy expenses_manager_insert on public.expenses for insert to authenticated
  with check (
    public.can_manage_finances() and created_by = auth.uid() and status in ('draft', 'pending')
  );
create policy expenses_manager_draft_update on public.expenses for update to authenticated
  using (public.can_manage_finances() and status in ('draft', 'pending'))
  with check (public.can_manage_finances() and status in ('draft', 'pending'));

create or replace function public.can_view_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(exists(
    select 1 from public.documents d
    left join public.payments p on d.entity_type = 'payment' and p.id = d.entity_id
    left join public.expenses e on d.entity_type = 'expense' and e.id = d.entity_id
    where d.id = p_document_id and d.deleted_at is null and (
      public.is_emergency_admin() or public.is_current_manager() or
      (d.entity_type = 'payment' and (p.verification_status = 'verified' or p.flat_id = (public.current_profile()).flat_id)) or
      (d.entity_type = 'expense' and e.status = 'approved')
    )
  ), false)
$$;

create policy documents_read_authorized on public.documents for select to authenticated
  using (public.can_view_document(id));
create policy documents_insert_authorized on public.documents for insert to authenticated
  with check (
    uploaded_by = auth.uid() and (
      public.can_manage_finances() or
      (entity_type = 'payment' and exists (
        select 1 from public.payments p
        where p.id = entity_id and p.flat_id = (public.current_profile()).flat_id
      ))
    )
  );
create policy documents_manager_update on public.documents for update to authenticated
  using (public.can_manage_finances()) with check (public.can_manage_finances());

create policy audit_read_active on public.audit_logs for select to authenticated
  using ((public.current_profile()).id is not null);

create policy import_admin_read on public.import_batches for select to authenticated
  using (public.is_emergency_admin());
create policy import_admin_insert on public.import_batches for insert to authenticated
  with check (public.is_emergency_admin() and created_by = auth.uid());
create policy import_admin_update on public.import_batches for update to authenticated
  using (public.is_emergency_admin()) with check (public.is_emergency_admin());
create policy import_rows_admin_read on public.import_row_references for select to authenticated
  using (public.is_emergency_admin());
create policy import_rows_admin_insert on public.import_row_references for insert to authenticated
  with check (public.is_emergency_admin());
create policy import_rows_admin_update on public.import_row_references for update to authenticated
  using (public.is_emergency_admin()) with check (public.is_emergency_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financial-documents', 'financial-documents', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy financial_documents_select on storage.objects for select to authenticated
using (
  bucket_id = 'financial-documents' and exists (
    select 1 from public.documents d
    where d.storage_path = name and public.can_view_document(d.id)
  )
);
create policy financial_documents_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'financial-documents' and
  (storage.extension(name) = any(array['jpg','jpeg','png','webp','pdf'])) and
  exists (
    select 1 from public.documents d
    where d.storage_path = name and d.uploaded_by = auth.uid() and d.deleted_at is null
  )
);
create policy financial_documents_update on storage.objects for update to authenticated
using (
  bucket_id = 'financial-documents' and public.can_manage_finances()
)
with check (
  bucket_id = 'financial-documents' and public.can_manage_finances()
);

create or replace view public.financial_transactions
with (security_invoker = true)
as
  select p.payment_date as transaction_date, 'collection'::text as transaction_type,
    p.id as transaction_id, p.flat_id, p.amount as amount, p.receipt_number as reference
  from public.payments p
  where p.verification_status = 'verified' and p.cancelled_at is null
  union all
  select e.expense_date, 'expense', e.id, null::uuid, -e.amount, e.transaction_reference
  from public.expenses e
  where e.status = 'approved' and e.cancelled_at is null;
grant select on public.financial_transactions to authenticated;

create or replace function public.financial_summary(p_from date, p_to date)
returns table (
  verified_collections numeric, approved_expenses numeric,
  maintenance_billed numeric, pending_maintenance numeric
)
language sql stable security invoker set search_path = '' as $$
  select
    coalesce((select sum(p.amount) from public.payments p where p.verification_status = 'verified' and p.cancelled_at is null and p.payment_date between p_from and p_to), 0),
    coalesce((select sum(e.amount) from public.expenses e where e.status = 'approved' and e.cancelled_at is null and e.expense_date between p_from and p_to), 0),
    coalesce((select sum(c.total_amount) from public.maintenance_charges c where c.status <> 'cancelled' and c.billing_month between date_trunc('month', p_from)::date and date_trunc('month', p_to)::date), 0),
    coalesce((select sum(c.balance_amount) from public.maintenance_charges c where c.status not in ('paid','cancelled') and c.billing_month <= date_trunc('month', p_to)::date), 0)
$$;
grant execute on function public.financial_summary(date,date) to authenticated;

commit;
