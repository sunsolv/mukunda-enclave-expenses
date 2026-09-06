begin;

-- Carry only the latest statement balance forward. Older unpaid rows are already
-- represented in that balance and summing them again compounds arrears each month.
create or replace function public.generate_monthly_charges(
  p_billing_month date,
  p_due_date date,
  p_base_amount numeric
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
  if p_base_amount is null or p_base_amount <= 0 then
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
    p_base_amount,
    coalesce(previous.balance_amount, 0),
    p_due_date,
    p_base_amount + coalesce(previous.balance_amount, 0),
    case
      when p_due_date < current_date then 'overdue'::public.charge_status
      else 'unpaid'::public.charge_status
    end,
    auth.uid()
  from public.flats f
  left join lateral (
    select c.balance_amount
    from public.maintenance_charges c
    where c.flat_id = f.id
      and c.billing_month < v_month
      and c.status <> 'cancelled'
    order by c.billing_month desc
    limit 1
  ) previous on true
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
      'amount', p_base_amount
    )
  );
exception
  when unique_violation then
    raise exception 'Charges already exist for one or more active flats in this billing month';
end;
$$;

-- Billed means new charges raised in the selected months; carried balances are
-- excluded because they were billed previously. Pending is the latest statement
-- balance for each flat at the period end, avoiding historical double-counting.
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
      select sum(greatest(0, c.base_amount + c.late_fee - c.discount + c.adjustment))
      from public.maintenance_charges c
      where c.status <> 'cancelled'
        and c.billing_month between
          date_trunc('month', p_from)::date
          and date_trunc('month', p_to)::date
    ), 0),
    coalesce((
      select sum(latest.balance_amount)
      from (
        select distinct on (c.flat_id)
          c.flat_id,
          c.balance_amount
        from public.maintenance_charges c
        where c.status <> 'cancelled'
          and c.billing_month <= date_trunc('month', p_to)::date
        order by c.flat_id, c.billing_month desc
      ) latest
    ), 0)
$$;

revoke execute on function public.generate_monthly_charges(date,date,numeric) from public, anon;
revoke execute on function public.financial_summary(date,date) from public, anon;
grant execute on function public.generate_monthly_charges(date,date,numeric) to authenticated;
grant execute on function public.financial_summary(date,date) to authenticated;

commit;
