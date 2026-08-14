-- A draft bill is nobody's yet, whichever way it is being split.
--
-- `apply_assignment_status` never guarded against DRAFT because it never had
-- to: claiming requires an OPEN bill, so a draft's assigned total stayed at
-- zero and the "everything is covered" branch was unreachable. An evenly split
-- bill has no claims to wait for, so the same code promoted a DRAFT straight
-- to FULLY_ASSIGNED — skipping `start_bill` entirely, which is the step that
-- shows the receipt to the table in the first place.
--
-- Reproduced before fixing: a DRAFT bill with one item, switched to EVENLY,
-- came back FULLY_ASSIGNED without ever being started.

create or replace function public.apply_assignment_status(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_assigned bigint;
  v_claimable bigint;
  v_people integer;
  v_settled boolean;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then return; end if;

  -- A closed bill is finished; a draft has not been shown to anyone yet.
  -- Neither is waiting on assignment, so neither moves.
  if v_bill.status in ('COMPLETED', 'DRAFT') then return; end if;

  if v_bill.split_mode = 'EVENLY' then
    select count(*) into v_people
    from public.participants p
    where p.table_id = v_bill.table_id and p.is_active;

    v_settled := v_bill.total_cents > 0 and v_people > 0;
  else
    v_assigned := public.bill_assigned_cents(p_bill_id);
    v_claimable := coalesce(
      (select sum(bi.total_price_cents) from public.bill_items bi where bi.bill_id = p_bill_id), 0);

    v_settled := v_claimable > 0 and v_assigned = v_claimable;
  end if;

  if v_settled then
    update public.bills set status = 'FULLY_ASSIGNED'
      where id = p_bill_id and status <> 'FULLY_ASSIGNED';
    update public.tables set status = 'FULLY_ASSIGNED'
      where id = v_bill.table_id and status <> 'COMPLETED';
  elsif v_bill.status = 'FULLY_ASSIGNED' then
    update public.bills set status = 'OPEN' where id = p_bill_id;
    update public.tables set status = 'BILL_IN_PROGRESS'
      where id = v_bill.table_id and status = 'FULLY_ASSIGNED';
  end if;
end;
$$;
