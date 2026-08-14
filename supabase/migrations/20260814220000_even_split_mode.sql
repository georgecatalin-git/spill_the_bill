-- "Just split it evenly" — a whole bill divided by headcount, no ticking.
--
-- Claiming item by item is the honest way to split a receipt and stays the
-- default. But plenty of meals do not want it: nobody is counting who had the
-- extra coffee, and being made to tap through twelve lines to say so is worse
-- than the arithmetic it replaces.
--
-- What gets divided is the GRAND TOTAL, not the subtotal. Item claims only
-- ever covered the items, which left tax and service charge allocated to
-- nobody and showing up as an unexplained "remaining" on everyone's screen.
-- Splitting the total closes that: the shares add up to exactly what the table
-- pays, with nothing on the side.
--
-- Largest remainder again, so the parts add back up to the cent — €10 between
-- three is 334 + 333 + 333. The order is by `joined_at` so the extra cent
-- lands somewhere stable rather than moving each time the view is read.

create type public.split_mode as enum ('BY_ITEM', 'EVENLY');

alter table public.bills
  add column if not exists split_mode public.split_mode not null default 'BY_ITEM';

comment on column public.bills.split_mode is
  'BY_ITEM: people claim what they had. EVENLY: the grand total is divided by headcount and claims are ignored.';

/**
 * Everyone's share when the bill is split evenly.
 *
 * Empty for a BY_ITEM bill, so a caller can read this unconditionally and get
 * nothing rather than a wrong number.
 */
create or replace view public.bill_even_shares
with (security_invoker = true) as
with active_people as (
  select
    b.id as bill_id,
    b.total_cents,
    p.id as participant_id,
    p.name,
    count(*) over (partition by b.id) as active_count,
    row_number() over (partition by b.id order by p.joined_at, p.id) as rn
  from public.bills b
  join public.participants p
    on p.table_id = b.table_id and p.is_active
  where b.split_mode = 'EVENLY'
)
select
  bill_id,
  participant_id,
  name,
  active_count,
  (
    (total_cents / active_count)
    + case when rn <= (total_cents % active_count) then 1 else 0 end
  )::bigint as share_cents
from active_people;

comment on view public.bill_even_shares is
  'Per-person share of the grand total on an evenly split bill. Largest remainder keeps the parts exact; empty when the bill is split by item.';

/**
 * Switches a bill between the two ways of splitting it.
 *
 * Item claims are left alone on purpose. Someone who ticks half the receipt,
 * flips to even, then flips back should find their selections where they left
 * them — throwing them away would make the toggle a one-way door disguised as
 * a switch.
 */
create or replace function public.set_bill_split_mode(p_bill_id uuid, p_mode public.split_mode)
returns public.bills
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    raise exception 'This bill does not exist.' using errcode = '22000';
  end if;

  if not public.is_bill_admin(p_bill_id) then
    raise exception 'Only the table admin can change how the bill is split.'
      using errcode = '42501';
  end if;

  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '23000';
  end if;

  update public.bills set split_mode = p_mode where id = p_bill_id
  returning * into v_bill;

  -- The status rules differ per mode, so re-derive rather than leave a bill
  -- sitting in a state that belonged to the other one.
  perform public.apply_assignment_status(p_bill_id);

  select * into v_bill from public.bills where id = p_bill_id;
  return v_bill;
end;
$$;

revoke execute on function public.set_bill_split_mode(uuid, public.split_mode) from public, anon;
grant execute on function public.set_bill_split_mode(uuid, public.split_mode) to authenticated;

/**
 * An evenly split bill is fully assigned as soon as it has a total and
 * somebody to divide it between — there is nothing left to claim.
 */
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
  if not found or v_bill.status = 'COMPLETED' then return; end if;

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

/**
 * Closing an evenly split bill asks a different question.
 *
 * There is nothing to claim, so "some items have not been claimed yet" cannot
 * apply. What must hold is that there is a total and someone to divide it
 * between, and that the divided parts still add back up to it exactly.
 */
create or replace function public.validate_bill_completion(p_bill_id uuid)
returns table(is_valid boolean, reason text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_item_count integer;
  v_assigned bigint;
  v_claimable bigint;
  v_people_sum bigint;
  v_overclaimed integer;
  v_people integer;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    return query select false, 'This bill does not exist.'; return;
  end if;

  select count(*) into v_item_count from public.bill_items where bill_id = p_bill_id;
  if v_item_count = 0 then
    return query select false, 'There is nothing on this bill yet.'; return;
  end if;

  if v_bill.total_cents <= 0 then
    return query select false, 'The bill total has not been set.'; return;
  end if;

  if v_bill.split_mode = 'EVENLY' then
    select count(*) into v_people
    from public.participants p
    where p.table_id = v_bill.table_id and p.is_active;

    if v_people = 0 then
      return query select false, 'There is nobody at the table to split this between.'; return;
    end if;

    select coalesce(sum(s.share_cents), 0) into v_people_sum
    from public.bill_even_shares s where s.bill_id = p_bill_id;

    if v_people_sum <> v_bill.total_cents then
      return query select false, 'The even shares do not add up to the bill total.'; return;
    end if;

    return query select true, null::text; return;
  end if;

  select count(*) into v_overclaimed
  from public.bill_items bi
  where bi.bill_id = p_bill_id and bi.quantity > 1
    and (select coalesce(sum(ic.quantity), 0) from public.item_claims ic where ic.bill_item_id = bi.id) > bi.quantity;

  if v_overclaimed > 0 then
    return query select false, 'Some items are claimed more times than they exist.'; return;
  end if;

  v_claimable := public.bill_claimable_cents(p_bill_id);
  v_assigned := public.bill_assigned_cents(p_bill_id);

  if v_assigned <> v_claimable then
    return query select false, 'Some items have not been claimed yet.'; return;
  end if;

  select coalesce(sum(t.total_cents), 0) into v_people_sum
  from public.bill_participant_totals t where t.bill_id = p_bill_id;

  if v_people_sum <> v_claimable then
    return query select false, 'The shares do not add up to the claimed items.'; return;
  end if;

  return query select true, null::text;
end;
$$;

/** Guest read: everyone's share on an evenly split bill. */
create or replace function public.get_guest_even_shares(p_session_token text)
returns table (
  participant_id uuid,
  participant_name text,
  is_me boolean,
  share_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
  v_bill public.bills%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  select * into v_bill
  from public.bills
  where table_id = v_participant.table_id
  order by created_at
  limit 1;

  if not found then
    return;
  end if;

  return query
    select s.participant_id, s.name, (s.participant_id = v_participant.id), s.share_cents
    from public.bill_even_shares s
    where s.bill_id = v_bill.id
    order by s.name;
end;
$$;

revoke execute on function public.get_guest_even_shares(text) from public;
grant execute on function public.get_guest_even_shares(text) to anon, authenticated;

-- Everyone's share moves when somebody joins or leaves an evenly split bill,
-- so the table's own broadcast has to reach the bill's watchers too. The
-- participants trigger already fires on both topics; nothing to add.
