begin;

create or replace function public.current_profile()
returns public.profiles
language sql stable security definer set search_path = ''
as $$ select p from public.profiles p where p.id = auth.uid() and p.account_status = 'active' $$;

create or replace function public.is_emergency_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select p.role = 'emergency_admin' from public.profiles p where p.id = auth.uid() and p.account_status = 'active'), false) $$;

create or replace function public.is_current_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(exists(
    select 1 from public.maintenance_responsibilities r
    join public.profiles p on p.id = r.owner_profile_id
    where r.status = 'current' and r.owner_profile_id = auth.uid() and p.account_status = 'active'
      and current_date between r.start_date and r.end_date
  ), false)
$$;

create or replace function public.can_manage_finances()
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_emergency_admin() or public.is_current_manager() $$;

create or replace function public.audit_event(
  p_action text, p_entity_type text, p_entity_id uuid default null,
  p_old_values jsonb default null, p_new_values jsonb default null, p_reason text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.audit_logs(user_id, action, entity_type, entity_id, old_values, new_values, reason)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_old_values, p_new_values, p_reason)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.complete_initial_password_change()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set must_change_password = false where id = auth.uid() and account_status = 'active';
  if not found then raise exception 'Active profile not found'; end if;
  perform public.audit_event('password.change_completed', 'profile', auth.uid());
end;
$$;

create or replace function public.audit_session_event(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('login', 'logout') then raise exception 'Unsupported session action'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and account_status = 'active') then
    raise exception 'Active profile not found';
  end if;
  if p_action = 'login' then
    update public.profiles set last_login_at = now() where id = auth.uid();
  end if;
  perform public.audit_event(p_action, 'session', null);
end;
$$;

create or replace function public.generate_monthly_charges(p_billing_month date, p_due_date date)
returns setof public.maintenance_charges
language plpgsql security definer set search_path = '' as $$
declare v_month date := date_trunc('month', p_billing_month)::date;
begin
  if not public.can_manage_finances() then raise exception 'Not authorized'; end if;
  if p_due_date < v_month then raise exception 'Due date cannot precede billing month'; end if;

  return query
  insert into public.maintenance_charges(
    flat_id, billing_month, base_amount, previous_balance, due_date,
    balance_amount, status, generated_by
  )
  select f.id, v_month, f.maintenance_amount,
    coalesce((
      select sum(c.balance_amount) from public.maintenance_charges c
      where c.flat_id = f.id and c.billing_month < v_month and c.status not in ('paid', 'cancelled')
    ), 0),
    p_due_date,
    f.maintenance_amount + coalesce((
      select sum(c.balance_amount) from public.maintenance_charges c
      where c.flat_id = f.id and c.billing_month < v_month and c.status not in ('paid', 'cancelled')
    ), 0),
    case when p_due_date < current_date then 'overdue'::public.charge_status else 'unpaid'::public.charge_status end,
    auth.uid()
  from public.flats f where f.active
  returning *;
  perform public.audit_event('maintenance.generated', 'maintenance_charge', null, null, jsonb_build_object('billing_month', v_month, 'due_date', p_due_date));
exception when unique_violation then
  raise exception 'Charges already exist for one or more active flats in this billing month';
end;
$$;

create or replace function public.record_payment(
  p_charge_id uuid, p_amount numeric, p_payment_date date, p_payment_mode public.payment_mode,
  p_transaction_reference text default null, p_notes text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_charge public.maintenance_charges; v_profile public.profiles; v_id uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid() and account_status = 'active';
  select * into v_charge from public.maintenance_charges where id = p_charge_id and status <> 'cancelled' for update;
  if v_charge.id is null then raise exception 'Charge not found'; end if;
  if not public.can_manage_finances() and v_profile.flat_id is distinct from v_charge.flat_id then raise exception 'Not authorized for this flat'; end if;
  if p_amount <= 0 or p_amount > v_charge.balance_amount then raise exception 'Payment exceeds outstanding balance'; end if;
  insert into public.payments(flat_id, maintenance_charge_id, payment_date, amount, payment_mode, transaction_reference, notes, created_by)
  values (v_charge.flat_id, p_charge_id, p_payment_date, p_amount, p_payment_mode, nullif(trim(p_transaction_reference), ''), p_notes, auth.uid())
  returning id into v_id;
  perform public.audit_event('payment.created', 'payment', v_id, null, jsonb_build_object('charge_id', p_charge_id, 'amount', p_amount));
  return v_id;
end;
$$;

create or replace function public.recalculate_charge(p_charge_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_paid numeric; v_charge public.maintenance_charges;
begin
  select * into v_charge from public.maintenance_charges where id = p_charge_id for update;
  select coalesce(sum(amount), 0) into v_paid from public.payments
    where maintenance_charge_id = p_charge_id and verification_status = 'verified' and cancelled_at is null;
  update public.maintenance_charges
    set paid_amount = v_paid,
        balance_amount = greatest(0, total_amount - v_paid),
        status = case
          when status = 'cancelled' then 'cancelled'::public.charge_status
          when v_paid >= total_amount then 'paid'::public.charge_status
          when v_paid > 0 then 'partially_paid'::public.charge_status
          when due_date < current_date then 'overdue'::public.charge_status
          else 'unpaid'::public.charge_status end
    where id = p_charge_id;
end;
$$;

create or replace function public.verify_payment(p_payment_id uuid, p_approve boolean, p_reason text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_payment public.payments; v_charge public.maintenance_charges; v_receipt text;
begin
  if not public.can_manage_finances() then raise exception 'Not authorized'; end if;
  select * into v_payment from public.payments where id = p_payment_id and cancelled_at is null for update;
  if v_payment.id is null or v_payment.verification_status <> 'pending' then raise exception 'Pending payment not found'; end if;
  select * into v_charge from public.maintenance_charges where id = v_payment.maintenance_charge_id for update;
  if p_approve then
    if v_payment.amount > v_charge.balance_amount then raise exception 'Payment exceeds current outstanding balance'; end if;
    select s.receipt_prefix || '-' || to_char(v_payment.payment_date, 'YYYYMM') || '-' || lpad(nextval('public.receipt_number_seq')::text, 4, '0')
      into v_receipt from public.apartment_settings s order by s.created_at limit 1;
    update public.payments set verification_status = 'verified', verified_by = auth.uid(), verified_at = now(), receipt_number = v_receipt where id = p_payment_id;
  else
    if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Rejection reason is required'; end if;
    update public.payments set verification_status = 'rejected', verified_by = auth.uid(), verified_at = now(), rejection_reason = trim(p_reason) where id = p_payment_id;
  end if;
  perform public.recalculate_charge(v_payment.maintenance_charge_id);
  perform public.audit_event(case when p_approve then 'payment.verified' else 'payment.rejected' end, 'payment', p_payment_id, null, jsonb_build_object('approved', p_approve), p_reason);
  return v_receipt;
end;
$$;

create or replace function public.review_expense(p_expense_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_finances() then raise exception 'Not authorized'; end if;
  if not p_approve and (p_reason is null or length(trim(p_reason)) < 3) then raise exception 'Rejection reason is required'; end if;
  update public.expenses
    set status = case when p_approve then 'approved'::public.expense_status else 'rejected'::public.expense_status end,
        approved_by = auth.uid(), approved_at = now(), rejection_reason = case when p_approve then null else trim(p_reason) end
    where id = p_expense_id and status = 'pending';
  if not found then raise exception 'Pending expense not found'; end if;
  perform public.audit_event(case when p_approve then 'expense.approved' else 'expense.rejected' end, 'expense', p_expense_id, null, jsonb_build_object('approved', p_approve), p_reason);
end;
$$;

create or replace function public.cancel_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_payment public.payments;
begin
  if not public.can_manage_finances() then raise exception 'Not authorized'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Cancellation reason is required'; end if;
  select * into v_payment from public.payments where id = p_payment_id and cancelled_at is null for update;
  if v_payment.id is null then raise exception 'Active payment not found'; end if;
  update public.payments set cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = trim(p_reason)
    where id = p_payment_id;
  perform public.recalculate_charge(v_payment.maintenance_charge_id);
  perform public.audit_event('payment.cancelled', 'payment', p_payment_id, to_jsonb(v_payment), null, p_reason);
end;
$$;

create or replace function public.cancel_expense(p_expense_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_expense public.expenses;
begin
  if not public.can_manage_finances() then raise exception 'Not authorized'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Cancellation reason is required'; end if;
  select * into v_expense from public.expenses where id = p_expense_id and status <> 'cancelled' for update;
  if v_expense.id is null then raise exception 'Active expense not found'; end if;
  update public.expenses set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancellation_reason = trim(p_reason) where id = p_expense_id;
  perform public.audit_event('expense.cancelled', 'expense', p_expense_id, to_jsonb(v_expense), null, p_reason);
end;
$$;

create or replace function public.save_expense(
  p_expense_date date, p_category_name text, p_vendor_name text, p_description text,
  p_amount numeric, p_payment_mode public.payment_mode, p_transaction_reference text default null,
  p_notes text default null, p_submit boolean default false
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_category_id uuid; v_id uuid;
begin
  if not public.can_manage_finances() then raise exception 'Not authorized'; end if;
  select id into v_category_id from public.expense_categories where name = p_category_name and active;
  if v_category_id is null then raise exception 'Active expense category not found'; end if;
  insert into public.expenses(
    expense_date, category_id, vendor_name, description, amount, payment_mode,
    transaction_reference, notes, status, created_by, submitted_at
  ) values (
    p_expense_date, v_category_id, trim(p_vendor_name), trim(p_description), p_amount,
    p_payment_mode, nullif(trim(p_transaction_reference), ''), p_notes,
    case when p_submit then 'pending'::public.expense_status else 'draft'::public.expense_status end,
    auth.uid(), case when p_submit then now() else null end
  ) returning id into v_id;
  perform public.audit_event(case when p_submit then 'expense.submitted' else 'expense.created' end, 'expense', v_id);
  return v_id;
end;
$$;

create or replace function public.discard_failed_document(p_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.documents
  where id = p_document_id and uploaded_by = auth.uid() and created_at > now() - interval '15 minutes'
    and not exists (select 1 from storage.objects o where o.bucket_id = 'financial-documents' and o.name = storage_path);
end;
$$;

create or replace function public.complete_annual_handover(
  p_current_id uuid, p_next_flat_id uuid, p_next_owner_profile_id uuid,
  p_notes text, p_confirmed_closing_balance numeric
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_current public.maintenance_responsibilities; v_collections numeric; v_expenses numeric; v_calculated numeric; v_next_id uuid;
begin
  if not public.can_manage_finances() then raise exception 'Not authorized'; end if;
  if length(trim(p_notes)) < 10 then raise exception 'Handover notes must contain at least 10 characters'; end if;
  select * into v_current from public.maintenance_responsibilities where id = p_current_id and status = 'current' for update;
  if v_current.id is null then raise exception 'Current responsibility not found'; end if;
  select coalesce(sum(amount), 0) into v_collections from public.payments where verification_status = 'verified' and cancelled_at is null and payment_date between v_current.start_date and v_current.end_date;
  select coalesce(sum(amount), 0) into v_expenses from public.expenses where status = 'approved' and cancelled_at is null and expense_date between v_current.start_date and v_current.end_date;
  v_calculated := v_current.opening_balance + v_collections - v_expenses;
  if abs(v_calculated - p_confirmed_closing_balance) > 0.009 then raise exception 'Closing balance does not reconcile'; end if;
  update public.maintenance_responsibilities set status = 'completed', closing_balance = v_calculated, handover_date = current_date, handover_notes = trim(p_notes), completed_by = auth.uid() where id = p_current_id;
  insert into public.maintenance_responsibilities(flat_id, owner_profile_id, responsibility_year, start_date, end_date, opening_balance, status, assigned_by)
  values (p_next_flat_id, p_next_owner_profile_id, v_current.responsibility_year + 1, v_current.end_date + 1, (v_current.end_date + interval '1 year')::date, v_calculated, 'current', auth.uid())
  returning id into v_next_id;
  perform public.audit_event('responsibility.handover', 'maintenance_responsibility', p_current_id, to_jsonb(v_current), jsonb_build_object('next_id', v_next_id, 'closing_balance', v_calculated), p_notes);
  return v_next_id;
end;
$$;

revoke all on function public.audit_event(text,text,uuid,jsonb,jsonb,text) from public;
revoke all on function public.recalculate_charge(uuid) from public;
grant execute on function public.complete_initial_password_change() to authenticated;
grant execute on function public.audit_session_event(text) to authenticated;
grant execute on function public.generate_monthly_charges(date,date) to authenticated;
grant execute on function public.record_payment(uuid,numeric,date,public.payment_mode,text,text) to authenticated;
grant execute on function public.verify_payment(uuid,boolean,text) to authenticated;
grant execute on function public.review_expense(uuid,boolean,text) to authenticated;
grant execute on function public.cancel_payment(uuid,text) to authenticated;
grant execute on function public.cancel_expense(uuid,text) to authenticated;
grant execute on function public.save_expense(date,text,text,text,numeric,public.payment_mode,text,text,boolean) to authenticated;
grant execute on function public.discard_failed_document(uuid) to authenticated;
grant execute on function public.complete_annual_handover(uuid,uuid,uuid,text,numeric) to authenticated;

commit;
