-- ---------------------------------------------------------------------------
-- "Nobody remembers — split the rest between us"
--
-- Five people, seventy beers, four hours. By the end nobody can say whether
-- they had seven or fifteen, and the bill will not close while units are
-- unclaimed — correctly, because the gap is real money. But the app offered no
-- honest way out of it: someone had to invent a number.
--
-- This is the way out. Pick who was drinking, and the units nobody claimed are
-- shared between them.
--
-- **Units, not money.** The obvious instinct is to split the leftover *value*
-- evenly — 96 lei between five is 19.20 each. But a claim in this schema is a
-- count of things consumed, and the money already follows from it:
-- `item_claim_shares` divides the line proportionally to claimed quantity and
-- settles the odd cents by largest remainder. Splitting units keeps one source
-- of truth. The price is that eight beers between five people is 2/2/2/1/1 —
-- one beer of spread — because nobody drank four fifths of a beer.
--
-- The spare units go to whoever has claimed **least** so far. Someone who
-- already admitted to fifteen should not also collect the extra.
--
-- Admin only. It rewrites other people's claims, so it belongs to the person
-- running the table, not to whoever taps first.
-- ---------------------------------------------------------------------------

drop function if exists public.split_remaining_evenly(uuid, uuid[]);

create function public.split_remaining_evenly(
  p_bill_item_id uuid,
  p_participant_ids uuid[]
)
-- The output columns are deliberately not called `participant_id` or
-- `quantity`: those are column names on `item_claims`, and plpgsql would not
-- know which one the body meant.
returns table (guest_id uuid, added integer, now_claimed integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.bill_items%rowtype;
  v_bill public.bills%rowtype;
  v_table_id uuid;
  v_claimed integer;
  v_remaining integer;
  v_people integer;
  v_base integer;
  v_extra integer;
begin
  select * into v_item from public.bill_items where id = p_bill_item_id;
  if not found then
    raise exception 'That item is no longer on the bill.';
  end if;

  if not public.is_bill_item_admin(p_bill_item_id) then
    raise exception 'Only the table admin can split what is left.';
  end if;

  select * into v_bill from public.bills where id = v_item.bill_id;
  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '23000';
  end if;

  -- A shareable line (quantity 1) is already divided between everyone who
  -- claims it; there is nothing left over to share.
  if v_item.quantity <= 1 then
    raise exception 'This item is already shared between whoever claims it.';
  end if;

  select coalesce(sum(quantity), 0) into v_claimed
  from public.item_claims where bill_item_id = p_bill_item_id;

  v_remaining := v_item.quantity - v_claimed;
  if v_remaining <= 0 then
    raise exception 'Nothing is left unclaimed on this item.';
  end if;

  select t.id into v_table_id from public.tables t where t.id = v_bill.table_id;

  -- Only people actually at this table, and only those still at it. Silently
  -- ignoring a stranger's id would hand them somebody else's beer.
  select count(*) into v_people
  from public.participants p
  where p.id = any(p_participant_ids)
    and p.table_id = v_table_id
    and p.is_active;

  if v_people = 0 then
    raise exception 'Nobody was chosen to share what is left.';
  end if;

  if v_people <> coalesce(array_length(p_participant_ids, 1), 0) then
    raise exception 'Somebody on that list is not at this table any more.';
  end if;

  v_base := v_remaining / v_people;
  v_extra := v_remaining % v_people;

  return query
  with chosen as (
    select
      p.id,
      coalesce((select sum(ic.quantity) from public.item_claims ic
                where ic.bill_item_id = p_bill_item_id
                  and ic.participant_id = p.id), 0) as already,
      row_number() over (
        order by coalesce((select sum(ic.quantity) from public.item_claims ic
                           where ic.bill_item_id = p_bill_item_id
                             and ic.participant_id = p.id), 0),
                 p.joined_at, p.id
      ) as rn
    from public.participants p
    where p.id = any(p_participant_ids) and p.table_id = v_table_id and p.is_active
  ),
  shares as (
    select id, already,
           v_base + case when rn <= v_extra then 1 else 0 end as add_qty
    from chosen
  ),
  applied as (
    insert into public.item_claims (bill_item_id, participant_id, quantity)
    select p_bill_item_id, s.id, s.already + s.add_qty
    from shares s
    where s.already + s.add_qty > 0
    on conflict (bill_item_id, participant_id)
      do update set quantity = excluded.quantity, updated_at = now()
    returning item_claims.participant_id as pid, item_claims.quantity as qty
  )
  select a.pid, s.add_qty::integer, a.qty::integer
  from applied a join shares s on s.id = a.pid;
end;
$$;

comment on function public.split_remaining_evenly(uuid, uuid[]) is
  'Shares the unclaimed units of a counted item between the chosen people. Spare units go to whoever has claimed least. Admin only.';

revoke execute on function public.split_remaining_evenly(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.split_remaining_evenly(uuid, uuid[]) to authenticated;
