-- Completed bills are records, not working documents.
--
-- `complete_bill` already refuses to close a bill that does not balance, and
-- `enforce_claim_rules` already refuses to ADD a claim to a closed one. What
-- nothing checked was everything else, and all of it turned out to be
-- reachable by an ordinary tap:
--
--   * the admin could add a line to a settled bill, or change its tip — the
--     total moved after the money had been agreed;
--   * a guest could REMOVE a claim from a settled bill. `remove_item_claim`
--     asks for the item with `p_require_open := false`, which was meant to
--     stop a guest being stranded on a FULLY_ASSIGNED bill they could no
--     longer back out of. `false` skipped the status check altogether, so
--     COMPLETED went through with it. Everyone's share moved afterwards.
--
-- So the rule is split in two. FULLY_ASSIGNED still lets a guest lower or
-- clear their own claim — that is what stops them being stuck. COMPLETED
-- refuses everything, in both directions, on every table the bill touches.

-- ---------------------------------------------------------------------------
-- Shared test
--
-- The three trigger functions below are SECURITY DEFINER, like
-- `enforce_claim_rules`. Without it they run as the caller, and the caller has
-- no EXECUTE on `bill_is_completed` — which does not merely give the wrong
-- error, it fails on EVERY write, closed bill or not. Adding a line to an
-- ordinary open bill came back "permission denied for function
-- bill_is_completed" until this was fixed.
-- ---------------------------------------------------------------------------

/**
 * Whether this bill is closed.
 *
 * A bill that is not there at all is not closed — it is being deleted, and
 * the rows cascading out from under it are cleanup rather than an edit. The
 * same shape `prevent_claimed_item_delete` already relies on.
 */
create or replace function public.bill_is_completed(p_bill_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bills where id = p_bill_id and status = 'COMPLETED'
  );
$$;

-- ---------------------------------------------------------------------------
-- The bill itself
-- ---------------------------------------------------------------------------

/**
 * Refuses to change a bill once it is closed.
 *
 * Reads OLD, not NEW, so `complete_bill` can still perform the update that
 * does the closing: at that moment the row is not COMPLETED yet.
 */
create or replace function public.prevent_completed_bill_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '23000';
  end if;

  return new;
end;
$$;

drop trigger if exists bills_freeze_when_completed on public.bills;
create trigger bills_freeze_when_completed
  before update on public.bills
  for each row execute function public.prevent_completed_bill_update();

-- ---------------------------------------------------------------------------
-- Its lines
-- ---------------------------------------------------------------------------

create or replace function public.prevent_completed_bill_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.bill_is_completed(coalesce(new.bill_id, old.bill_id)) then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '23000';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists bill_items_freeze_when_completed on public.bill_items;
create trigger bill_items_freeze_when_completed
  before insert or update or delete on public.bill_items
  for each row execute function public.prevent_completed_bill_item_change();

-- ---------------------------------------------------------------------------
-- Its claims
--
-- Adding and updating are already covered by `enforce_claim_rules`. Deleting
-- was not covered anywhere: not by that trigger, which is INSERT/UPDATE only,
-- and not by RLS, which lets an admin delete claims on their own bills.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_completed_claim_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id uuid;
begin
  -- Gone already means the line is cascading away, not being edited.
  select bi.bill_id into v_bill_id
  from public.bill_items bi
  where bi.id = old.bill_item_id;

  if v_bill_id is not null and public.bill_is_completed(v_bill_id) then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '23000';
  end if;

  return old;
end;
$$;

drop trigger if exists item_claims_freeze_when_completed on public.item_claims;
create trigger item_claims_freeze_when_completed
  before delete on public.item_claims
  for each row execute function public.prevent_completed_claim_delete();

-- ---------------------------------------------------------------------------
-- The guest and admin claim guards
--
-- Both gain the same sentence: COMPLETED is refused whatever `p_require_open`
-- says. The parameter keeps its old job — "this action needs the bill to be
-- OPEN specifically" — and clearing a claim still works on a FULLY_ASSIGNED
-- bill, which is the case it was added for.
-- ---------------------------------------------------------------------------

create or replace function public.lock_claimable_item(
  p_session_token text,
  p_bill_item_id uuid,
  p_require_open boolean default true
)
returns table (participant_id uuid, item_id uuid, item_name text, item_quantity integer)
language plpgsql
volatile
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

  -- The whole point: an item from another table is simply not reachable, even
  -- with a valid session and a guessed UUID.
  if v_bill.table_id <> v_participant.table_id then
    raise exception 'That item is not on this bill.' using errcode = '22000';
  end if;

  -- Closed is closed, in both directions.
  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '22000';
  end if;

  if p_require_open and v_bill.status <> 'OPEN' then
    raise exception 'This bill is no longer accepting selections.' using errcode = '22000';
  end if;

  return query select v_participant.id, v_item.id, v_item.name, v_item.quantity;
end;
$$;

create or replace function public.lock_admin_claimable_item(
  p_bill_item_id uuid,
  p_require_open boolean default true
)
returns table (participant_id uuid, item_name text, item_quantity integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.bill_items%rowtype;
  v_bill public.bills%rowtype;
  v_table public.tables%rowtype;
  v_participant_id uuid;
  v_name text;
begin
  select * into v_item from public.bill_items where id = p_bill_item_id for update;
  if not found then
    raise exception 'That item is not on this bill.' using errcode = '22000';
  end if;

  select * into v_bill from public.bills where id = v_item.bill_id;
  select * into v_table from public.tables where id = v_bill.table_id;

  if v_table.admin_id is distinct from (select auth.uid()) then
    raise exception 'That item is not on this bill.' using errcode = '22000';
  end if;

  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '22000';
  end if;

  if p_require_open and v_bill.status <> 'OPEN' then
    raise exception 'This bill is no longer accepting selections.' using errcode = '22000';
  end if;

  select p.id into v_participant_id
  from public.participants p
  where p.table_id = v_table.id and p.is_admin;

  if v_participant_id is null then
    select coalesce(nullif(trim(full_name), ''), 'Host') into v_name
    from public.profiles where id = v_table.admin_id;

    insert into public.participants (table_id, name, is_admin)
    values (v_table.id, coalesce(v_name, 'Host'), true)
    returning id into v_participant_id;
  end if;

  return query select v_participant_id, v_item.name, v_item.quantity;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Trigger plumbing again. EXECUTE goes to PUBLIC by default, so PUBLIC has to
-- be named; the triggers keep working because they run as the table owner.
-- ---------------------------------------------------------------------------

revoke execute on function public.bill_is_completed(uuid) from public, anon, authenticated;
revoke execute on function public.prevent_completed_bill_update() from public, anon, authenticated;
revoke execute on function public.prevent_completed_bill_item_change()
  from public, anon, authenticated;
revoke execute on function public.prevent_completed_claim_delete()
  from public, anon, authenticated;

-- Unchanged from where they were defined, restated because CREATE OR REPLACE
-- on an existing function leaves its grants alone but a fresh project applying
-- these migrations in order should not have to guess.
revoke execute on function public.lock_claimable_item(text, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.lock_admin_claimable_item(uuid, boolean)
  from public, anon, authenticated;
