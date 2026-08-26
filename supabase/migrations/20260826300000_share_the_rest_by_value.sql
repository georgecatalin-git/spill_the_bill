-- ---------------------------------------------------------------------------
-- Share what is left by value, not by the piece
--
-- The first version of this split the leftover *units*. It was fine for beer —
-- forty-eight between five is 9/9/10/10/10, one beer of spread — and wrong for
-- everything else. One pork neck left between twelve people cannot be cut into
-- twelfths, so the whole 62 lei landed on whoever happened to sort first. There
-- is no good answer to "why me?" in that.
--
-- Nobody admitting to the pork neck is exactly the case this exists for, and
-- the only outcome anyone will accept out loud is that everybody pays a little:
-- 5.17 each, not 62 for one.
--
-- So the remainder becomes a **shared line** — the same mechanism a dessert
-- platter already uses. `quantity = 1` means "divide this between whoever
-- claims it", `item_claim_shares` splits it by largest remainder, and the money
-- lands to the cent without a new concept anywhere.
--
-- Two shapes, decided by whether anything was claimed at all:
--
--   * Nothing claimed — the item itself becomes the shared line. One row, no
--     duplicate, nothing to explain.
--   * Some claimed — the line is trimmed to what people owned up to, and the
--     rest splits off as its own shared row. Two rows where the receipt has
--     one, which is honest: some of it was claimed, the rest was not.
--
-- The totals are untouched either way. `apply_bill_item_total` recomputes
-- `total = quantity * unit_price`, so the split-off row carries the whole
-- remainder as its unit price — the only shape that survives that trigger.
-- ---------------------------------------------------------------------------

drop function if exists public.split_remaining_evenly(uuid, uuid[]);

create function public.split_remaining_evenly(
  p_bill_item_id uuid,
  p_participant_ids uuid[]
)
returns table (shared_item_id uuid, people integer, each_cents bigint)
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
  v_value bigint;
  v_target uuid;
begin
  select * into v_item from public.bill_items where id = p_bill_item_id;
  if not found then
    raise exception 'That item is no longer on the bill.';
  end if;

  if not public.is_bill_item_admin(p_bill_item_id) then
    raise exception 'Only the table admin can share what is left.';
  end if;

  select * into v_bill from public.bills where id = v_item.bill_id;
  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '23000';
  end if;

  if v_item.quantity <= 1 then
    raise exception 'This item is already shared between whoever claims it.';
  end if;

  select coalesce(sum(quantity), 0) into v_claimed
  from public.item_claims where bill_item_id = p_bill_item_id;

  v_remaining := v_item.quantity - v_claimed;
  if v_remaining <= 0 then
    raise exception 'Nothing is left unclaimed on this item.';
  end if;

  v_table_id := v_bill.table_id;

  select count(*) into v_people
  from public.participants p
  where p.id = any(p_participant_ids)
    and p.table_id = v_table_id
    and p.is_active;

  if v_people < 2 then
    raise exception 'There has to be more than one person to share this between.';
  end if;

  if v_people <> coalesce(array_length(p_participant_ids, 1), 0) then
    raise exception 'Somebody on that list is not at this table any more.';
  end if;

  v_value := v_remaining::bigint * v_item.unit_price_cents;

  if v_claimed = 0 then
    -- Nobody owned up to any of it: the line itself becomes the shared one.
    update public.bill_items
      set quantity = 1,
          unit_price_cents = v_value,
          name = case when v_remaining > 1
                      then v_item.name || ' × ' || v_remaining
                      else v_item.name end,
          updated_at = now()
      where id = p_bill_item_id;
    v_target := p_bill_item_id;
  else
    -- Trim the original to what people actually claimed, and split the rest off.
    update public.bill_items
      set quantity = v_claimed, updated_at = now()
      where id = p_bill_item_id;

    insert into public.bill_items (bill_id, name, quantity, unit_price_cents, total_price_cents)
    values (
      v_item.bill_id,
      case when v_remaining > 1 then v_item.name || ' × ' || v_remaining else v_item.name end,
      1,
      v_value,
      v_value
    )
    returning id into v_target;
  end if;

  -- Everyone chosen goes on it. A shared line divides between its claimants,
  -- so one claim each is all it takes.
  insert into public.item_claims (bill_item_id, participant_id, quantity)
  select v_target, p.id, 1
  from public.participants p
  where p.id = any(p_participant_ids) and p.table_id = v_table_id and p.is_active
  on conflict (bill_item_id, participant_id) do nothing;

  return query
  select v_target, v_people, (v_value / v_people)::bigint;
end;
$$;

comment on function public.split_remaining_evenly(uuid, uuid[]) is
  'Turns the unclaimed part of a counted line into a shared line divided between the chosen people. Value, not pieces — nobody eats a twelfth of a steak. Admin only.';

revoke execute on function public.split_remaining_evenly(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.split_remaining_evenly(uuid, uuid[]) to authenticated;
