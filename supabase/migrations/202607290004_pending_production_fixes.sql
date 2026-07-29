begin;

-- This migration is intentionally additive and repeatable. It preserves all existing
-- accounts and financial history while bringing manually patched environments in line.
alter table public.expenses
  add column if not exists custom_category text;

update public.expenses
set custom_category = null
where custom_category is not null
  and nullif(trim(custom_category), '') is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_custom_category_length'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_custom_category_length
      check (
        custom_category is null
        or length(trim(custom_category)) between 2 and 120
      );
  end if;
end
$$;

alter table public.expenses enable row level security;

-- Correct Flat 101 in both directory and authentication profile data. Current and
-- historical responsibility views resolve the profile name through their foreign key.
update public.flats
set owner_name = 'K V Reddy Prasad',
    updated_at = now()
where flat_number = '101'
  and owner_name is distinct from 'K V Reddy Prasad';

update public.profiles p
set owner_name = 'K V Reddy Prasad',
    updated_at = now()
from public.flats f
where p.flat_id = f.id
  and f.flat_number = '101'
  and p.owner_name is distinct from 'K V Reddy Prasad';

create or replace function public.generate_monthly_charges(
  p_billing_month date,
  p_due_date date,
  p_amount numeric
)
returns setof public.maintenance_charges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_billing_month)::date;
begin
  if not public.can_manage_finances() then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Maintenance amount must be greater than zero';
  end if;
  if p_due_date < v_month then
    raise exception 'Due date cannot precede billing month';
  end if;

  return query
  insert into public.maintenance_charges(
    flat_id,
    billing_month,
    base_amount,
    previous_balance,
    due_date,
    balance_amount,
    status,
    generated_by
  )
  select
    f.id,
    v_month,
    p_amount,
    coalesce((
      select sum(c.balance_amount)
      from public.maintenance_charges c
      where c.flat_id = f.id
        and c.billing_month < v_month
        and c.status not in ('paid', 'cancelled')
    ), 0),
    p_due_date,
    p_amount + coalesce((
      select sum(c.balance_amount)
      from public.maintenance_charges c
      where c.flat_id = f.id
        and c.billing_month < v_month
        and c.status not in ('paid', 'cancelled')
    ), 0),
    case
      when p_due_date < current_date then 'overdue'::public.charge_status
      else 'unpaid'::public.charge_status
    end,
    auth.uid()
  from public.flats f
  where f.active
  returning *;

  perform public.audit_event(
    'maintenance.generated',
    'maintenance_charge',
    null,
    null,
    jsonb_build_object(
      'billing_month', v_month,
      'due_date', p_due_date,
      'amount', p_amount
    )
  );
exception
  when unique_violation then
    raise exception 'Charges already exist for one or more active flats in this billing month';
end;
$$;

create or replace function public.save_expense(
  p_expense_date date,
  p_category_name text,
  p_custom_category text,
  p_vendor_name text,
  p_description text,
  p_amount numeric,
  p_payment_mode public.payment_mode,
  p_transaction_reference text default null,
  p_notes text default null,
  p_submit boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_custom_category text := nullif(trim(p_custom_category), '');
  v_id uuid;
begin
  if not public.can_manage_finances() then
    raise exception 'Not authorized';
  end if;
  select id
  into v_category_id
  from public.expense_categories
  where name = p_category_name
    and active;
  if v_category_id is null then
    raise exception 'Active expense category not found';
  end if;
  if p_category_name = 'Other'
     and (v_custom_category is null or length(v_custom_category) not between 2 and 120) then
    raise exception 'A custom category is required for Other';
  end if;
  if p_category_name <> 'Other' then
    v_custom_category := null;
  end if;

  insert into public.expenses(
    expense_date,
    category_id,
    custom_category,
    vendor_name,
    description,
    amount,
    payment_mode,
    transaction_reference,
    notes,
    status,
    created_by,
    submitted_at
  )
  values (
    p_expense_date,
    v_category_id,
    v_custom_category,
    trim(p_vendor_name),
    trim(p_description),
    p_amount,
    p_payment_mode,
    nullif(trim(p_transaction_reference), ''),
    p_notes,
    case
      when p_submit then 'pending'::public.expense_status
      else 'draft'::public.expense_status
    end,
    auth.uid(),
    case when p_submit then now() else null end
  )
  returning id into v_id;

  perform public.audit_event(
    case when p_submit then 'expense.submitted' else 'expense.created' end,
    'expense',
    v_id
  );
  return v_id;
end;
$$;

create or replace function public.update_owner_details(
  p_flat_id uuid,
  p_owner_name text,
  p_mobile text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flat public.flats;
  v_profile public.profiles;
  v_name text := trim(p_owner_name);
  v_mobile text := nullif(trim(p_mobile), '');
begin
  if not public.is_emergency_admin() then
    raise exception 'Not authorized';
  end if;
  if v_name is null or length(v_name) not between 2 and 120 then
    raise exception 'Owner name must contain between 2 and 120 characters';
  end if;
  if v_mobile is not null
     and (length(v_mobile) not between 7 and 20 or v_mobile !~ '^[0-9+() -]+$') then
    raise exception 'Enter a valid mobile number';
  end if;

  select *
  into v_flat
  from public.flats
  where id = p_flat_id
  for update;
  if v_flat.id is null then
    raise exception 'Flat owner not found';
  end if;

  select *
  into v_profile
  from public.profiles
  where flat_id = p_flat_id
  for update;
  if v_profile.id is null then
    raise exception 'Owner profile not found';
  end if;

  update public.flats
  set owner_name = v_name,
      mobile = v_mobile,
      updated_at = now()
  where id = p_flat_id;

  update public.profiles
  set owner_name = v_name,
      mobile = v_mobile,
      updated_at = now()
  where id = v_profile.id;

  perform public.audit_event(
    'owner.updated',
    'profile',
    v_profile.id,
    jsonb_build_object('owner_name', v_profile.owner_name, 'mobile', v_profile.mobile),
    jsonb_build_object('owner_name', v_name, 'mobile', v_mobile)
  );
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions unless explicitly revoked.
-- Remove anonymous access comprehensively, then grant only the authenticated RPC surface.
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public;

grant execute on function public.current_profile() to authenticated;
grant execute on function public.is_emergency_admin() to authenticated;
grant execute on function public.is_current_manager() to authenticated;
grant execute on function public.can_manage_finances() to authenticated;
grant execute on function public.can_view_document(uuid) to authenticated;
grant execute on function public.complete_initial_password_change() to authenticated;
grant execute on function public.audit_session_event(text) to authenticated;
grant execute on function public.generate_monthly_charges(date,date,numeric) to authenticated;
grant execute on function public.record_payment(uuid,numeric,date,public.payment_mode,text,text) to authenticated;
grant execute on function public.verify_payment(uuid,boolean,text) to authenticated;
grant execute on function public.review_expense(uuid,boolean,text) to authenticated;
grant execute on function public.cancel_payment(uuid,text) to authenticated;
grant execute on function public.cancel_expense(uuid,text) to authenticated;
grant execute on function public.save_expense(date,text,text,text,text,numeric,public.payment_mode,text,text,boolean) to authenticated;
grant execute on function public.discard_failed_document(uuid) to authenticated;
grant execute on function public.complete_annual_handover(uuid,uuid,uuid,text,numeric) to authenticated;
grant execute on function public.update_owner_details(uuid,text,text) to authenticated;
grant execute on function public.financial_summary(date,date) to authenticated;

commit;
