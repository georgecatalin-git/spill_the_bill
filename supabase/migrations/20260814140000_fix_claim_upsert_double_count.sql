-- Fixes a real bug: topping up an existing claim near a unit-limited item's
-- capacity could be wrongly refused.
--
-- `claim_item` and `admin_claim_item` add to an existing claim with
-- `insert ... on conflict (bill_item_id, participant_id) do update`. On
-- Postgres, a `BEFORE INSERT` trigger for an upsert fires against the
-- would-be-inserted row — carrying a freshly generated `id` from the column
-- default — before the conflict is detected and the statement is diverted to
-- an UPDATE. `enforce_claim_rules` excluded "everyone else's claims" by
-- `id is distinct from new.id`, which is exactly wrong at that moment: the
-- fresh id never matches the participant's own existing row, so the
-- exclusion fails and their own prior quantity gets counted as someone
-- else's. The check then double-counts that participant's holding, making
-- the item look scarcer than it is and refusing a claim that fits.
--
-- Reproduced on this project: an item with quantity 5, two participants
-- holding 2 each. The third participant's own `claim_item` guard correctly
-- computed 1 unit free and allowed the call through; this trigger then
-- rejected it, reporting "Only 1 of 5 units... available" — the same number,
-- reached by counting the caller's own 2 units twice.
--
-- The fix: exclude by `participant_id`, the way `claim_item`'s own guard
-- already does. A participant holds at most one row per item (the table's
-- unique constraint), so filtering by who it belongs to is unambiguous on
-- insert, update, and upsert-diverted-to-update alike — unlike a row `id`,
-- which the upsert path does not reliably carry forward.
create or replace function public.enforce_claim_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.bill_items%rowtype;
  v_bill public.bills%rowtype;
  v_participant public.participants%rowtype;
  v_other_claimed bigint;
begin
  select * into v_item from public.bill_items where id = new.bill_item_id for update;
  if not found then
    raise exception 'Bill item % does not exist', new.bill_item_id;
  end if;

  select * into v_bill from public.bills where id = v_item.bill_id;
  select * into v_participant from public.participants where id = new.participant_id;
  if not found then
    raise exception 'Participant % does not exist', new.participant_id;
  end if;

  if v_participant.table_id <> v_bill.table_id then
    raise exception 'Participant % does not belong to the table this bill is for', new.participant_id;
  end if;

  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed';
  end if;

  if v_item.quantity > 1 then
    select coalesce(sum(quantity), 0) into v_other_claimed
    from public.item_claims
    where bill_item_id = new.bill_item_id
      and participant_id <> new.participant_id;

    if v_other_claimed + new.quantity > v_item.quantity then
      raise exception 'Only % of % units of "%" are still available',
        v_item.quantity - v_other_claimed, v_item.quantity, v_item.name;
    end if;
  end if;

  return new;
end;
$$;
