-- Real bill management for the admin.
--
-- The database owns every money figure: line totals, the subtotal, and the
-- final total. The client sends what the admin typed; the server decides what
-- the numbers actually are.

-- ---------------------------------------------------------------------------
-- Admin-confirmed receipt total
-- ---------------------------------------------------------------------------

alter table public.bills
  add column if not exists confirmed_total_cents bigint;

do $$
begin
  alter table public.bills
    add constraint bills_confirmed_total_nonnegative
    check (confirmed_total_cents is null or confirmed_total_cents >= 0);
exception
  when duplicate_object then null;
end $$;

comment on column public.bills.confirmed_total_cents is
  'Total the admin read off the paper receipt. When set it wins over the computed sum, because real receipts carry discounts and rounding.';

-- Only one bill can be open at a table at a time; this is what stops a second
-- "Start Bill" from creating a duplicate.
create unique index if not exists bills_one_active_per_table_idx
  on public.bills (table_id)
  where status in ('DRAFT', 'OPEN', 'FULLY_ASSIGNED');

-- ---------------------------------------------------------------------------
-- Line totals
-- ---------------------------------------------------------------------------

/**
 * A line always costs quantity × unit price.
 *
 * Recomputed rather than validated, so a client cannot post a total that
 * disagrees with the parts. Corrections happen by editing quantity or price;
 * receipt-level oddities go in `confirmed_total_cents`.
 */
create or replace function public.apply_bill_item_total()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.total_price_cents := new.quantity * new.unit_price_cents;
  return new;
end;
$$;

drop trigger if exists bill_items_apply_total on public.bill_items;
create trigger bill_items_apply_total
  before insert or update on public.bill_items
  for each row execute function public.apply_bill_item_total();

-- ---------------------------------------------------------------------------
-- Bill totals
-- ---------------------------------------------------------------------------

create or replace function public.calculate_bill_subtotal(p_bill_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(total_price_cents), 0)::bigint
  from public.bill_items
  where bill_id = p_bill_id;
$$;

create or replace function public.calculate_bill_total(p_bill_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    b.confirmed_total_cents,
    public.calculate_bill_subtotal(b.id) + b.tax_cents + b.service_charge_cents + b.tip_cents
  )
  from public.bills b
  where b.id = p_bill_id;
$$;

/** Keeps `total_cents` in step with its parts, or with the confirmed total. */
create or replace function public.apply_bill_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.total_cents := coalesce(
    new.confirmed_total_cents,
    new.subtotal_cents + new.tax_cents + new.service_charge_cents + new.tip_cents
  );
  return new;
end;
$$;

drop trigger if exists bills_apply_totals on public.bills;
create trigger bills_apply_totals
  before insert or update on public.bills
  for each row execute function public.apply_bill_totals();

/** Re-adds the items after any of them change. */
create or replace function public.sync_bill_subtotal(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bills
    set subtotal_cents = coalesce(
      (select sum(bi.total_price_cents) from public.bill_items bi where bi.bill_id = p_bill_id), 0
    )
    where id = p_bill_id;
end;
$$;

create or replace function public.refresh_subtotal_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_bill_subtotal(coalesce(new.bill_id, old.bill_id));
  return null;
end;
$$;

-- Named to sort before `bill_items_refresh_status`, so the status check runs
-- against a subtotal that is already up to date.
drop trigger if exists bill_items_apply_subtotal on public.bill_items;
create trigger bill_items_apply_subtotal
  after insert or update or delete on public.bill_items
  for each row execute function public.refresh_subtotal_from_item();

-- ---------------------------------------------------------------------------
-- What "fully assigned" means once a bill carries tax
--
-- Guests claim ITEMS, so the amount that can ever be claimed is the sum of the
-- line totals — not the grand total, which also holds tax, service and tip.
-- Comparing claims against the grand total would make FULLY_ASSIGNED
-- unreachable the moment an admin enters any tax.
-- ---------------------------------------------------------------------------

create or replace function public.bill_claimable_cents(p_bill_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select public.calculate_bill_subtotal(p_bill_id);
$$;

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
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found or v_bill.status = 'COMPLETED' then
    return;
  end if;

  v_assigned := public.bill_assigned_cents(p_bill_id);
  v_claimable := coalesce(
    (select sum(bi.total_price_cents) from public.bill_items bi where bi.bill_id = p_bill_id), 0
  );

  if v_claimable > 0 and v_assigned = v_claimable then
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

create or replace function public.validate_bill_completion(p_bill_id uuid)
returns table (is_valid boolean, reason text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_item_count integer;
  v_assigned bigint;
  v_claimable bigint;
  v_people_sum bigint;
  v_overclaimed integer;
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

  select count(*) into v_overclaimed
  from public.bill_items bi
  where bi.bill_id = p_bill_id
    and bi.quantity > 1
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
  from public.bill_participant_totals t
  where t.bill_id = p_bill_id;

  if v_people_sum <> v_claimable then
    return query select false, 'The shares do not add up to the claimed items.'; return;
  end if;

  return query select true, null::text;
end;
$$;

/** Reports whether the stored figures still agree with the items. */
create or replace function public.validate_bill_totals(p_bill_id uuid)
returns table (is_valid boolean, reason text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_subtotal bigint;
  v_expected bigint;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    return query select false, 'This bill does not exist.'; return;
  end if;

  v_subtotal := public.calculate_bill_subtotal(p_bill_id);

  if v_bill.subtotal_cents <> v_subtotal then
    return query select false, 'The stored subtotal does not match the items.'; return;
  end if;

  v_expected := public.calculate_bill_total(p_bill_id);

  if v_bill.total_cents <> v_expected then
    return query select false, 'The stored total does not match its parts.'; return;
  end if;

  return query select true, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting items
-- ---------------------------------------------------------------------------

/**
 * Refuses to remove an item that guests already picked.
 *
 * Cascades are still allowed: when the parent bill is already gone the row is
 * being cleaned up, not edited away underneath someone.
 */
create or replace function public.prevent_claimed_item_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.bills where id = old.bill_id) then
    return old;
  end if;

  if exists (select 1 from public.item_claims where bill_item_id = old.id) then
    raise exception 'This item has already been selected by one or more guests.'
      using errcode = '23000';
  end if;

  return old;
end;
$$;

drop trigger if exists bill_items_prevent_claimed_delete on public.bill_items;
create trigger bill_items_prevent_claimed_delete
  before delete on public.bill_items
  for each row execute function public.prevent_claimed_item_delete();

-- ---------------------------------------------------------------------------
-- Starting a bill
-- ---------------------------------------------------------------------------

create or replace function public.start_bill(p_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_item_count integer;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    raise exception 'This bill does not exist.';
  end if;

  if not exists (
    select 1 from public.tables t
    where t.id = v_bill.table_id and t.admin_id = (select auth.uid())
  ) then
    raise exception 'Only the admin of this table can start the bill.';
  end if;

  select count(*) into v_item_count from public.bill_items where bill_id = p_bill_id;
  if v_item_count = 0 then
    raise exception 'Add at least one item before starting the bill.';
  end if;

  if v_bill.total_cents <= 0 then
    raise exception 'The bill total must be greater than zero.';
  end if;

  update public.bills set status = 'OPEN'
    where id = p_bill_id and status = 'DRAFT'
    returning * into v_bill;

  if v_bill.id is null then
    select * into v_bill from public.bills where id = p_bill_id;
  end if;

  update public.tables set status = 'BILL_IN_PROGRESS'
    where id = v_bill.table_id and status = 'WAITING_FOR_GUESTS';

  return v_bill;
end;
$$;

-- ---------------------------------------------------------------------------
-- Summary view: items vs what has been claimed of them
-- ---------------------------------------------------------------------------

-- Dropped first: the column list changed, and Postgres will not reshape a view
-- in place.
drop view if exists public.bill_summaries;

create view public.bill_summaries
with (security_invoker = true) as
select
  b.id as bill_id,
  b.table_id,
  b.status,
  b.currency,
  b.subtotal_cents,
  b.tax_cents,
  b.service_charge_cents,
  b.tip_cents,
  b.confirmed_total_cents,
  b.total_cents,
  coalesce(sum(a.assigned_cents), 0)::bigint as assigned_cents,
  b.subtotal_cents - coalesce(sum(a.assigned_cents), 0)::bigint as remaining_cents
from public.bills b
left join public.bill_item_assignments a on a.bill_id = b.id
group by b.id;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.sync_bill_subtotal(uuid) from public, anon, authenticated;
revoke execute on function public.apply_bill_item_total() from public, anon, authenticated;
revoke execute on function public.apply_bill_totals() from public, anon, authenticated;
revoke execute on function public.refresh_subtotal_from_item() from public, anon, authenticated;
revoke execute on function public.prevent_claimed_item_delete() from public, anon, authenticated;

revoke execute on function public.calculate_bill_subtotal(uuid) from public, anon;
revoke execute on function public.calculate_bill_total(uuid) from public, anon;
revoke execute on function public.validate_bill_totals(uuid) from public, anon;
revoke execute on function public.bill_claimable_cents(uuid) from public, anon;

grant execute on function public.calculate_bill_subtotal(uuid) to authenticated;
grant execute on function public.calculate_bill_total(uuid) to authenticated;
grant execute on function public.validate_bill_totals(uuid) to authenticated;
grant execute on function public.bill_claimable_cents(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard listing
-- ---------------------------------------------------------------------------

-- What the admin's dashboard needs about each of their tables, in one query
-- instead of one round trip per card.
create or replace view public.admin_table_summaries
with (security_invoker = true) as
select
  t.id,
  t.admin_id,
  t.name,
  t.restaurant_name,
  t.status,
  t.invite_code,
  t.created_at,
  (select count(*) from public.participants p
    where p.table_id = t.id and p.is_active)::integer as people_count,
  coalesce((
    select b.total_cents from public.bills b
    where b.table_id = t.id order by b.created_at limit 1
  ), 0)::bigint as total_cents,
  coalesce((
    select b.currency from public.bills b
    where b.table_id = t.id order by b.created_at limit 1
  ), 'EUR') as currency
from public.tables t;
