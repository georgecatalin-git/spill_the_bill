-- ---------------------------------------------------------------------------
-- The host can put an item on somebody's share
--
-- Until now every claim was made by the person who consumed it: guests tapped
-- their own phone, and the admin could only claim for themselves. That rule
-- exists for a good reason — nobody should be able to put something on your
-- bill — and it is written down in AGENTS.md as a principle.
--
-- It is relaxed here, deliberately, because it was quietly costing more than
-- it protected. A table only worked if *everyone* installed the app and joined.
-- At a club at one in the morning, twelve people scanning a QR code is
-- optimistic, and anyone who did not join simply was not on the bill — their
-- share fell to whoever did.
--
-- With this, one phone is enough. The host adds people by name and records
-- what they ordered, the way a waiter's pad works.
--
-- **The principle survives where it matters.** A guest who *is* in the app can
-- still change what was put on their share — `claim_item` and
-- `remove_item_claim` are untouched. The host writes things down; they do not
-- get the last word. Nobody is stuck paying for something they did not order.
--
-- Setting a quantity of zero removes the claim, which is how the host corrects
-- a mistake without needing a second verb.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_participant_claim(
  p_bill_item_id uuid,
  p_participant_id uuid,
  p_quantity integer
)
returns table (item_id uuid, guest_id uuid, now_claimed integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.bill_items%rowtype;
  v_bill public.bills%rowtype;
  v_participant public.participants%rowtype;
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'A quantity cannot be negative.';
  end if;

  select * into v_item from public.bill_items where id = p_bill_item_id;
  if not found then
    raise exception 'That item is no longer on the bill.';
  end if;

  if not public.is_bill_item_admin(p_bill_item_id) then
    raise exception 'Only the table admin can assign an item to somebody.';
  end if;

  select * into v_bill from public.bills where id = v_item.bill_id;
  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '23000';
  end if;

  -- The person has to be at this table. Without the check, an id from another
  -- table would put somebody else's name on this bill.
  select * into v_participant
  from public.participants
  where id = p_participant_id and table_id = v_bill.table_id;

  if not found then
    raise exception 'That person is not at this table.';
  end if;

  if not v_participant.is_active then
    raise exception 'That person has left the table.';
  end if;

  if p_quantity = 0 then
    delete from public.item_claims
    where bill_item_id = p_bill_item_id and participant_id = p_participant_id;

    return query select p_bill_item_id, p_participant_id, 0;
    return;
  end if;

  -- `enforce_claim_rules` is what refuses more units than the line holds; this
  -- function does not repeat that check, so there is one place it lives.
  insert into public.item_claims (bill_item_id, participant_id, quantity)
  values (p_bill_item_id, p_participant_id, p_quantity)
  on conflict (bill_item_id, participant_id)
    do update set quantity = excluded.quantity, updated_at = now();

  return query select p_bill_item_id, p_participant_id, p_quantity;
end;
$$;

comment on function public.admin_set_participant_claim(uuid, uuid, integer) is
  'Puts an item on a named person''s share, for a table where not everyone has the app. The guest can still change it themselves. Admin only.';

revoke execute on function public.admin_set_participant_claim(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.admin_set_participant_claim(uuid, uuid, integer)
  to authenticated;
