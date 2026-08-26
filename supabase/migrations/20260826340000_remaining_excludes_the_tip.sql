-- ---------------------------------------------------------------------------
-- "Remaining" stops counting the tip as unassigned
--
-- On a finished bill — every item claimed, status FULLY_ASSIGNED — the guest
-- screen still announced "Remaining 139.40". That was the tip, and the tip was
-- never outstanding: `bill_tip_shares` divides it by headcount and the screen
-- shows each person's slice a few rows further down. The figure said money had
-- no owner while the row underneath said who owed what.
--
-- Three places computed "remaining" and two of them disagreed with the third.
-- `bill_summaries` had it right — `subtotal - assigned` — because what a guest
-- can ever pick off a receipt is the items. This function did
-- `total - assigned`, which on any bill carrying a tip, a service charge or
-- tax could never reach zero.
--
-- The percentage had the same fault: assigned over *total* never reaches 100%
-- on a bill with a tip, so a fully claimed receipt read as 90% done.
--
-- EVENLY is untouched. There, every share sums to the grand total by
-- definition, so assigned is the total and nothing is left.
-- ---------------------------------------------------------------------------

create or replace function public.get_bill_assignment_summary(p_session_token text)
returns table (
  bill_id uuid,
  currency text,
  status text,
  bill_total_cents bigint,
  assigned_total_cents bigint,
  remaining_total_cents bigint,
  percentage_assigned numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
  v_bill public.bills%rowtype;
  v_assigned bigint;
  v_claimable bigint;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  select * into v_bill from public.bills
  where table_id = v_participant.table_id order by created_at limit 1;

  if not found then return; end if;

  if v_bill.split_mode = 'EVENLY' then
    -- Everyone's share sums to the total, so nothing is left over.
    v_assigned := v_bill.total_cents;
    v_claimable := v_bill.total_cents;
  else
    v_assigned := public.bill_assigned_cents(v_bill.id);
    -- What anybody can actually claim is the items. Tip, service and tax are
    -- carried by the bill, not picked off it — the tip is already split by
    -- headcount elsewhere.
    v_claimable := v_bill.subtotal_cents;
  end if;

  return query select
    v_bill.id, v_bill.currency, v_bill.status,
    -- The headline figure stays the whole bill: that is what gets paid.
    v_bill.total_cents,
    v_assigned,
    greatest(v_claimable - v_assigned, 0)::bigint,
    case when v_claimable > 0
      then round((v_assigned::numeric * 100) / v_claimable, 4) else 0 end;
end;
$$;

comment on function public.get_bill_assignment_summary(text) is
  'What is claimed and what is still outstanding, from a guest''s side. Outstanding means unclaimed ITEMS — the tip is split by headcount and was never waiting for an owner.';
