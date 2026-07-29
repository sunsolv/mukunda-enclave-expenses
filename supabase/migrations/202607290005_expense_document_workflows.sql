begin;

-- Additive workflow keys make retries idempotent without exposing unfinished
-- financial rows. Existing rows remain complete and unchanged.
alter table public.expenses
  add column if not exists submission_key uuid,
  add column if not exists last_edit_key uuid,
  add column if not exists updated_by uuid references public.profiles(id) on delete restrict,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete restrict,
  add column if not exists deletion_reason text;

alter table public.payments
  add column if not exists submission_key uuid;

alter table public.documents
  add column if not exists deleted_by uuid references public.profiles(id) on delete restrict;

create unique index if not exists expenses_submission_key_unique
  on public.expenses(submission_key)
  where submission_key is not null;
create unique index if not exists payments_submission_key_unique
  on public.payments(submission_key)
  where submission_key is not null;
create index if not exists expenses_active_date_idx
  on public.expenses(expense_date desc)
  where deleted_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_deletion_fields'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_deletion_fields check (
        (deleted_at is null and deleted_by is null and deletion_reason is null)
        or
        (
          deleted_at is not null
          and deleted_by is not null
          and length(trim(deletion_reason)) between 3 and 500
        )
      );
  end if;
end
$$;

-- Only these server-side functions can turn private staged objects into linked
-- financial documents. Paths, object existence, MIME type and size are verified
-- from storage metadata before document metadata is committed.
create or replace function public.attach_staged_documents(
  p_entity_type public.document_entity_type,
  p_entity_id uuid,
  p_submission_key uuid,
  p_documents jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document jsonb;
  v_path text;
  v_original_filename text;
  v_stored_filename text;
  v_mime_type text;
  v_size_bytes bigint;
  v_object_size bigint;
  v_object_mime text;
  v_prefix text := 'staging/' || auth.uid()::text || '/' || p_submission_key::text || '/';
begin
  if p_documents is null then
    p_documents := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) > 5 then
    raise exception 'Attach no more than five documents';
  end if;

  for v_document in select value from jsonb_array_elements(p_documents)
  loop
    v_path := v_document ->> 'storage_path';
    v_original_filename := nullif(trim(v_document ->> 'original_filename'), '');
    v_stored_filename := nullif(trim(v_document ->> 'stored_filename'), '');
    v_mime_type := v_document ->> 'mime_type';
    v_size_bytes := nullif(v_document ->> 'size_bytes', '')::bigint;

    if v_path is null
       or left(v_path, length(v_prefix)) <> v_prefix
       or storage.extension(v_path) <> all(array['jpg','jpeg','png','webp','pdf']) then
      raise exception 'Invalid staged document path';
    end if;
    if v_original_filename is null or length(v_original_filename) > 255
       or v_stored_filename is null or length(v_stored_filename) > 255 then
      raise exception 'Invalid document filename';
    end if;
    if v_mime_type <> all(array['image/jpeg','image/png','image/webp','application/pdf']) then
      raise exception 'Unsupported document type';
    end if;
    if not (
      (storage.extension(v_path) in ('jpg', 'jpeg') and v_mime_type = 'image/jpeg')
      or (storage.extension(v_path) = 'png' and v_mime_type = 'image/png')
      or (storage.extension(v_path) = 'webp' and v_mime_type = 'image/webp')
      or (storage.extension(v_path) = 'pdf' and v_mime_type = 'application/pdf')
    ) then
      raise exception 'Document extension and type do not match';
    end if;
    if v_size_bytes is null or v_size_bytes <= 0 or v_size_bytes > 5242880 then
      raise exception 'Document must be 5 MB or smaller';
    end if;

    select
      nullif(o.metadata ->> 'size', '')::bigint,
      o.metadata ->> 'mimetype'
    into v_object_size, v_object_mime
    from storage.objects o
    where o.bucket_id = 'financial-documents'
      and o.name = v_path;

    if not found then
      raise exception 'Staged document was not uploaded';
    end if;
    if v_object_size is not null and v_object_size <> v_size_bytes then
      raise exception 'Uploaded document size does not match';
    end if;
    if v_object_mime is not null and v_object_mime <> v_mime_type then
      raise exception 'Uploaded document type does not match';
    end if;

    if not exists (
      select 1 from public.documents d
      where d.storage_path = v_path
    ) then
      insert into public.documents(
        entity_type,
        entity_id,
        document_type,
        storage_path,
        original_filename,
        stored_filename,
        mime_type,
        size_bytes,
        uploaded_by
      )
      values (
        p_entity_type,
        p_entity_id,
        case
          when p_entity_type = 'payment' then 'payment_proof'::public.document_type
          else 'expense_bill'::public.document_type
        end,
        v_path,
        v_original_filename,
        v_stored_filename,
        v_mime_type,
        v_size_bytes,
        auth.uid()
      );
    end if;
  end loop;
end;
$$;

create or replace function public.submit_expense_with_documents(
  p_expense_date date,
  p_category_name text,
  p_vendor_name text,
  p_description text,
  p_amount numeric,
  p_payment_mode public.payment_mode,
  p_transaction_reference text,
  p_notes text,
  p_submit boolean,
  p_other_category text,
  p_submission_key uuid,
  p_documents jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_finances() then
    raise exception 'Not authorized';
  end if;
  if p_submission_key is null then
    raise exception 'Submission key is required';
  end if;

  select e.id into v_id
  from public.expenses e
  where e.submission_key = p_submission_key
    and e.created_by = auth.uid();
  if v_id is not null then
    return v_id;
  end if;

  v_id := public.save_expense(
    p_expense_date,
    p_category_name,
    p_vendor_name,
    p_description,
    p_amount,
    p_payment_mode,
    p_transaction_reference,
    p_notes,
    p_submit,
    p_other_category
  );
  update public.expenses
  set submission_key = p_submission_key
  where id = v_id;
  perform public.attach_staged_documents('expense', v_id, p_submission_key, p_documents);
  return v_id;
end;
$$;

create or replace function public.submit_payment_with_document(
  p_charge_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_transaction_reference text,
  p_notes text,
  p_submission_key uuid,
  p_documents jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_submission_key is null then
    raise exception 'Submission key is required';
  end if;

  select p.id into v_id
  from public.payments p
  where p.submission_key = p_submission_key
    and p.created_by = auth.uid();
  if v_id is not null then
    return v_id;
  end if;

  v_id := public.record_payment(
    p_charge_id,
    p_amount,
    p_payment_date,
    p_payment_mode,
    p_transaction_reference,
    p_notes
  );
  update public.payments
  set submission_key = p_submission_key
  where id = v_id;
  perform public.attach_staged_documents('payment', v_id, p_submission_key, p_documents);
  return v_id;
end;
$$;

create or replace function public.update_expense_with_document(
  p_expense_id uuid,
  p_expense_date date,
  p_category_name text,
  p_vendor_name text,
  p_description text,
  p_amount numeric,
  p_payment_mode public.payment_mode,
  p_transaction_reference text,
  p_notes text,
  p_other_category text,
  p_edit_key uuid,
  p_documents jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_category_id uuid;
  v_other_category text := nullif(trim(p_other_category), '');
begin
  if not public.can_manage_finances() then
    raise exception 'Not authorized';
  end if;
  if p_edit_key is null then
    raise exception 'Edit key is required';
  end if;

  select * into v_expense
  from public.expenses
  where id = p_expense_id
    and deleted_at is null
  for update;
  if v_expense.id is null then
    raise exception 'Active expense not found';
  end if;
  if v_expense.last_edit_key = p_edit_key then
    return v_expense.id;
  end if;

  select id into v_category_id
  from public.expense_categories
  where name = p_category_name and active;
  if v_category_id is null then
    raise exception 'Active expense category not found';
  end if;
  if p_category_name = 'Other'
     and (v_other_category is null or length(v_other_category) not between 2 and 120) then
    raise exception 'A custom category is required for Other';
  end if;
  if p_category_name <> 'Other' then
    v_other_category := null;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero';
  end if;

  update public.expenses
  set expense_date = p_expense_date,
      category_id = v_category_id,
      other_category = v_other_category,
      vendor_name = trim(p_vendor_name),
      description = trim(p_description),
      amount = p_amount,
      payment_mode = p_payment_mode,
      transaction_reference = nullif(trim(p_transaction_reference), ''),
      notes = nullif(trim(p_notes), ''),
      updated_by = auth.uid(),
      last_edit_key = p_edit_key,
      updated_at = now()
  where id = p_expense_id;

  if jsonb_array_length(coalesce(p_documents, '[]'::jsonb)) > 0 then
    perform public.attach_staged_documents('expense', p_expense_id, p_edit_key, p_documents);
    update public.documents
    set deleted_at = now(),
        deleted_by = auth.uid()
    where entity_type = 'expense'
      and entity_id = p_expense_id
      and deleted_at is null
      and storage_path not like
        ('staging/' || auth.uid()::text || '/' || p_edit_key::text || '/%');
  end if;

  perform public.audit_event(
    'expense.updated',
    'expense',
    p_expense_id,
    to_jsonb(v_expense),
    (select to_jsonb(e) from public.expenses e where e.id = p_expense_id)
  );
  return p_expense_id;
end;
$$;

create or replace function public.delete_expense(
  p_expense_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_reason text := trim(p_reason);
begin
  if not public.is_emergency_admin() then
    raise exception 'Not authorized';
  end if;
  if v_reason is null or length(v_reason) not between 3 and 500 then
    raise exception 'A deletion reason is required';
  end if;

  select * into v_expense
  from public.expenses
  where id = p_expense_id
    and deleted_at is null
  for update;
  if v_expense.id is null then
    raise exception 'Active expense not found';
  end if;

  update public.expenses
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      cancelled_by = coalesce(cancelled_by, auth.uid()),
      cancellation_reason = coalesce(cancellation_reason, v_reason),
      deleted_at = now(),
      deleted_by = auth.uid(),
      deletion_reason = v_reason,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_expense_id;

  perform public.audit_event(
    'expense.deleted',
    'expense',
    p_expense_id,
    to_jsonb(v_expense),
    (select to_jsonb(e) from public.expenses e where e.id = p_expense_id),
    v_reason
  );
end;
$$;

create or replace function public.resolve_document_submission(
  p_entity_type public.document_entity_type,
  p_operation_key uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_entity_type = 'expense' then (
      select e.id
      from public.expenses e
      where (
        e.submission_key = p_operation_key and e.created_by = auth.uid()
      ) or (
        e.last_edit_key = p_operation_key and e.updated_by = auth.uid()
      )
      limit 1
    )
    else (
      select p.id
      from public.payments p
      where p.submission_key = p_operation_key
        and p.created_by = auth.uid()
      limit 1
    )
  end
$$;

-- The bucket remains private. Authenticated clients may upload only to their own
-- UUID-scoped staging prefix; reads still require linked document metadata.
drop policy if exists financial_documents_insert on storage.objects;
create policy financial_documents_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'financial-documents'
  and storage.extension(name) = any(array['jpg','jpeg','png','webp','pdf'])
  and (
    exists (
      select 1 from public.documents d
      where d.storage_path = name
        and d.uploaded_by = auth.uid()
        and d.deleted_at is null
    )
    or (
      (storage.foldername(name))[1] = 'staging'
      and (storage.foldername(name))[2] = auth.uid()::text
      and (public.current_profile()).id is not null
    )
  )
);

drop policy if exists financial_documents_delete_staging on storage.objects;
create policy financial_documents_delete_staging on storage.objects for delete to authenticated
using (
  bucket_id = 'financial-documents'
  and (storage.foldername(name))[1] = 'staging'
  and (storage.foldername(name))[2] = auth.uid()::text
  and not exists (
    select 1 from public.documents d
    where d.storage_path = name
      and d.deleted_at is null
  )
);

create or replace function public.can_view_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists(
    select 1
    from public.documents d
    left join public.payments p
      on d.entity_type = 'payment' and p.id = d.entity_id
    left join public.expenses e
      on d.entity_type = 'expense' and e.id = d.entity_id
    where d.id = p_document_id
      and d.deleted_at is null
      and (
        public.is_emergency_admin()
        or public.is_current_manager()
        or (
          d.entity_type = 'payment'
          and p.cancelled_at is null
          and (
            p.verification_status = 'verified'
            or p.flat_id = (public.current_profile()).flat_id
          )
        )
        or (
          d.entity_type = 'expense'
          and e.status = 'approved'
          and e.cancelled_at is null
          and e.deleted_at is null
        )
      )
  ), false)
$$;

create or replace view public.financial_transactions
with (security_invoker = true)
as
  select
    p.payment_date as transaction_date,
    'collection'::text as transaction_type,
    p.id as transaction_id,
    p.flat_id,
    p.amount as amount,
    p.receipt_number as reference
  from public.payments p
  where p.verification_status = 'verified'
    and p.cancelled_at is null
  union all
  select
    e.expense_date,
    'expense',
    e.id,
    null::uuid,
    -e.amount,
    e.transaction_reference
  from public.expenses e
  where e.status = 'approved'
    and e.cancelled_at is null
    and e.deleted_at is null;
grant select on public.financial_transactions to authenticated;

create or replace function public.financial_summary(p_from date, p_to date)
returns table (
  verified_collections numeric,
  approved_expenses numeric,
  maintenance_billed numeric,
  pending_maintenance numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce((
      select sum(p.amount)
      from public.payments p
      where p.verification_status = 'verified'
        and p.cancelled_at is null
        and p.payment_date between p_from and p_to
    ), 0),
    coalesce((
      select sum(e.amount)
      from public.expenses e
      where e.status = 'approved'
        and e.cancelled_at is null
        and e.deleted_at is null
        and e.expense_date between p_from and p_to
    ), 0),
    coalesce((
      select sum(c.total_amount)
      from public.maintenance_charges c
      where c.status <> 'cancelled'
        and c.billing_month between
          date_trunc('month', p_from)::date
          and date_trunc('month', p_to)::date
    ), 0),
    coalesce((
      select sum(c.balance_amount)
      from public.maintenance_charges c
      where c.status not in ('paid', 'cancelled')
        and c.billing_month <= date_trunc('month', p_to)::date
    ), 0)
$$;

revoke execute on function public.attach_staged_documents(
  public.document_entity_type,uuid,uuid,jsonb
) from public, anon, authenticated;
revoke execute on function public.submit_expense_with_documents(
  date,text,text,text,numeric,public.payment_mode,text,text,boolean,text,uuid,jsonb
) from public, anon;
revoke execute on function public.submit_payment_with_document(
  uuid,numeric,date,public.payment_mode,text,text,uuid,jsonb
) from public, anon;
revoke execute on function public.update_expense_with_document(
  uuid,date,text,text,text,numeric,public.payment_mode,text,text,text,uuid,jsonb
) from public, anon;
revoke execute on function public.delete_expense(uuid,text) from public, anon;
revoke execute on function public.resolve_document_submission(
  public.document_entity_type,uuid
) from public, anon;

grant execute on function public.submit_expense_with_documents(
  date,text,text,text,numeric,public.payment_mode,text,text,boolean,text,uuid,jsonb
) to authenticated;
grant execute on function public.submit_payment_with_document(
  uuid,numeric,date,public.payment_mode,text,text,uuid,jsonb
) to authenticated;
grant execute on function public.update_expense_with_document(
  uuid,date,text,text,text,numeric,public.payment_mode,text,text,text,uuid,jsonb
) to authenticated;
grant execute on function public.delete_expense(uuid,text) to authenticated;
grant execute on function public.resolve_document_submission(
  public.document_entity_type,uuid
) to authenticated;
grant execute on function public.can_view_document(uuid) to authenticated;

commit;
