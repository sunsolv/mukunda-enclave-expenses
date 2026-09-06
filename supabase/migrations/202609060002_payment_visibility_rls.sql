begin;

-- Pending, rejected and cancelled payment submissions may contain private notes,
-- transaction references and review reasons. They are visible only to finance
-- managers or the affected flat. Verified, active collections remain shared so
-- apartment-wide reports and cash-flow totals continue to reconcile for owners.
drop policy if exists payments_read_active on public.payments;
drop policy if exists payments_read_authorized on public.payments;
create policy payments_read_authorized on public.payments for select to authenticated
using (
  public.can_manage_finances()
  or flat_id = (public.current_profile()).flat_id
  or (
    verification_status = 'verified'
    and cancelled_at is null
  )
);

-- Payment rows must be created through record_payment() or
-- submit_payment_with_document(). Those functions lock and load the charge, derive
-- flat_id from it, enforce the caller's flat boundary and validate the amount.
revoke insert on public.payments from authenticated;
drop policy if exists payments_insert_own_or_manager on public.payments;
drop policy if exists payments_rpc_only_insert on public.payments;
create policy payments_rpc_only_insert on public.payments for insert to authenticated
with check (false);

commit;
