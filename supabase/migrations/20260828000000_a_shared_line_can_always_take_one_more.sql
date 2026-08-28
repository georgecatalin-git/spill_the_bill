-- ---------------------------------------------------------------------------
-- A shared line can always take one more
--
-- Two people at a table, one platter to split. The first to tick it makes the
-- bill FULLY_ASSIGNED — a shareable line counts as wholly assigned the moment
-- anybody claims it, which is right — and `lock_claimable_item` then refused
-- every further claim, because it demanded the bill be exactly OPEN. The
-- second person was told "This bill is no longer accepting selections" and the
-- first paid the entire 60 lei on their own.
--
-- That is the failure the shareable line exists to prevent, and it needed only
-- a table where the last thing left is something people share.
--
-- The flag's real job is to keep guests off a bill the host is still
-- assembling, so that is what it now says: refuse a DRAFT, refuse a COMPLETED,
-- and let anything in between through. Nothing is loosened by it —
-- over-claiming a counted line is refused by `claim_item`'s own availability
-- check and by `enforce_claim_rules`, both untouched, and both of which give a
-- better message than this ever did ("Only 2 bere remaining" rather than a
-- sentence about the bill).
--
-- It fixes `update_item_claim` in the same stroke: raising a claim passed
-- `p_quantity > 0` into the same flag, so a guest on a fully assigned bill
-- could lower their share but never put it back.
-- ---------------------------------------------------------------------------

create or replace function public.lock_claimable_item(
  p_session_token text,
  p_bill_item_id uuid,
  p_require_open boolean default true
)
returns table (participant_id uuid, item_id uuid, item_name text, item_quantity integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
  v_item public.bill_items%rowtype;
  v_bill public.bills%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  if not v_participant.is_active then
    raise exception 'You have left this table.' using errcode = '28000';
  end if;

  select * into v_item from public.bill_items where id = p_bill_item_id for update;
  if not found then
    raise exception 'That item is not on this bill.' using errcode = '22000';
  end if;

  select * into v_bill from public.bills where id = v_item.bill_id;
  if not found then
    raise exception 'That item is not on this bill.' using errcode = '22000';
  end if;

  if v_bill.table_id <> v_participant.table_id then
    raise exception 'That item is not on this bill.' using errcode = '22000';
  end if;

  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '22000';
  end if;

  -- FULLY_ASSIGNED is deliberately allowed. It means every line has an owner,
  -- not that the bill is shut: somebody joining a shared platter leaves it just
  -- as fully assigned as they found it, and refusing them is how one person
  -- ended up paying for the whole thing.
  if p_require_open and v_bill.status = 'DRAFT' then
    raise exception 'This bill has not been opened yet.' using errcode = '22000';
  end if;

  return query select v_participant.id, v_item.id, v_item.name, v_item.quantity;
end;
$$;

comment on function public.lock_claimable_item(text, uuid, boolean) is
  'Resolves a guest and locks one item for claiming. p_require_open refuses a DRAFT bill, not a FULLY_ASSIGNED one — a shareable line can always take one more claimant.';

revoke execute on function public.lock_claimable_item(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.lock_claimable_item(text, uuid, boolean) to service_role;
