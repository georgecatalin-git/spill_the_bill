-- ---------------------------------------------------------------------------
-- A guest adds what they had
--
-- Until now a guest could only tick things somebody else had already written
-- down. That is fine when the receipt arrives first, and useless while the
-- evening is still happening: Alin orders a beer, and the only person who can
-- record it is whoever is holding the host's phone.
--
-- So a guest may now add a line — and three things are true about it, each
-- enforced here rather than in the app:
--
--   * It goes on *their* share. The participant comes from the session token,
--     as everywhere else in this file, so there is no id a client could send to
--     put a beer on George instead.
--   * They cannot take it off the bill again. Adding is a record of something
--     that happened; removing it is the host's call, the way voiding an order
--     is the waiter's. `bill_items` has no DELETE policy for a guest at all,
--     and `remove_item_claim` and `update_item_claim` now refuse to let
--     somebody drop the line they added themselves.
--   * Nobody else can claim it. A line somebody added for themselves is not a
--     platter to share, and without this guard a `quantity = 1` line would be
--     shareable by anyone at the table.
--
-- The host keeps every power they had: `admin_set_participant_claim` and the
-- admin's own delete are untouched, so a mistake is still fixable by the person
-- who can see the paper.
-- ---------------------------------------------------------------------------

alter table public.bill_items
  add column if not exists added_by uuid
  references public.participants (id) on delete set null;

comment on column public.bill_items.added_by is
  'The guest who put this line on the bill themselves. Null for anything the host or the scanner added. A line with this set belongs to that person: only the host can move it or take it off.';

create index if not exists bill_items_added_by_idx on public.bill_items (added_by);

-- `bill_items` carries table-wide grants for anon and authenticated, so the new
-- column inherits them; RLS is what actually guards this table, and anon has no
-- policy on it at all. (`participants` is the one where every column has to be
-- granted by name — this is not that table.)

-- ---------------------------------------------------------------------------
-- Adding
-- ---------------------------------------------------------------------------

create or replace function public.guest_add_item(
  p_session_token text,
  p_name text,
  p_quantity integer default 1,
  p_unit_price_cents bigint default 0
)
returns table (item_id uuid, item_name text, quantity integer, unit_price_cents bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
  v_bill public.bills%rowtype;
  v_name text;
  v_id uuid;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Please give it a name.' using errcode = '22000';
  end if;
  if length(v_name) > 80 then
    raise exception 'That name is too long.' using errcode = '22000';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Please choose at least one.' using errcode = '22000';
  end if;
  if p_unit_price_cents is null or p_unit_price_cents < 0 then
    raise exception 'Please enter a valid price.' using errcode = '22000';
  end if;

  select * into v_bill
  from public.bills
  where table_id = v_participant.table_id
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'There is no bill open at this table yet.' using errcode = '22000';
  end if;

  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed.'
      using errcode = '22000';
  end if;
  if v_bill.status = 'DRAFT' then
    raise exception 'This bill has not been opened yet.' using errcode = '22000';
  end if;

  insert into public.bill_items (bill_id, name, quantity, unit_price_cents, total_price_cents, added_by)
  values (v_bill.id, v_name, p_quantity, p_unit_price_cents,
          p_quantity * p_unit_price_cents, v_participant.id)
  returning id into v_id;

  -- Created and claimed together. Splitting it into two steps is how the second
  -- half gets lost, and a line the adder does not own is exactly what this
  -- function exists to avoid.
  insert into public.item_claims (bill_item_id, participant_id, quantity)
  values (v_id, v_participant.id, p_quantity);

  return query select v_id, v_name, p_quantity, p_unit_price_cents;
end;
$$;

comment on function public.guest_add_item(text, text, integer, bigint) is
  'A guest records something they had. The participant comes from the session token, so it can only ever land on their own share.';

revoke execute on function public.guest_add_item(text, text, integer, bigint) from public;
grant execute on function public.guest_add_item(text, text, integer, bigint) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keeping it theirs
-- ---------------------------------------------------------------------------

create or replace function public.claim_item(
  p_session_token text,
  p_bill_item_id uuid,
  p_quantity integer default 1
)
returns table (item_id uuid, new_quantity integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard record;
  v_added_by uuid;
  v_held integer;
  v_others integer;
  v_available integer;
  v_new integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Please choose at least one.' using errcode = '22000';
  end if;

  select * into v_guard from public.lock_claimable_item(p_session_token, p_bill_item_id, true);

  select bi.added_by into v_added_by from public.bill_items bi where bi.id = p_bill_item_id;

  if v_added_by is not null and v_added_by <> v_guard.participant_id then
    raise exception 'Somebody added that for themselves.' using errcode = '22000';
  end if;

  select coalesce(ic.quantity, 0) into v_held
  from public.item_claims ic
  where ic.bill_item_id = p_bill_item_id and ic.participant_id = v_guard.participant_id;

  v_held := coalesce(v_held, 0);
  v_new := v_held + p_quantity;

  if v_guard.item_quantity > 1 then
    select coalesce(sum(ic.quantity), 0) into v_others
    from public.item_claims ic
    where ic.bill_item_id = p_bill_item_id and ic.participant_id <> v_guard.participant_id;

    v_available := v_guard.item_quantity - v_others - v_held;

    if p_quantity > v_available then
      if v_available <= 0 then
        raise exception 'No % left.', v_guard.item_name using errcode = '22000';
      end if;
      raise exception 'Only % % remaining.', v_available, v_guard.item_name using errcode = '22000';
    end if;
  end if;

  insert into public.item_claims (bill_item_id, participant_id, quantity)
  values (p_bill_item_id, v_guard.participant_id, v_new)
  on conflict (bill_item_id, participant_id) do update set quantity = excluded.quantity;

  return query select p_bill_item_id, v_new;
end;
$$;

create or replace function public.remove_item_claim(p_session_token text, p_bill_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard record;
  v_added_by uuid;
begin
  select * into v_guard from public.lock_claimable_item(p_session_token, p_bill_item_id, false);

  select bi.added_by into v_added_by from public.bill_items bi where bi.id = p_bill_item_id;

  if v_added_by = v_guard.participant_id then
    raise exception 'You added that yourself. Ask whoever is hosting to take it off.'
      using errcode = '22000';
  end if;

  delete from public.item_claims ic
  where ic.bill_item_id = p_bill_item_id and ic.participant_id = v_guard.participant_id;
end;
$$;

create or replace function public.update_item_claim(
  p_session_token text,
  p_bill_item_id uuid,
  p_quantity integer
)
returns table (item_id uuid, new_quantity integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard record;
  v_added_by uuid;
  v_others integer;
  v_available integer;
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Please choose a valid quantity.' using errcode = '22000';
  end if;

  select * into v_guard
  from public.lock_claimable_item(p_session_token, p_bill_item_id, p_quantity > 0);

  select bi.added_by into v_added_by from public.bill_items bi where bi.id = p_bill_item_id;

  if v_added_by is not null then
    -- Their own record of what they had is not a slider. Somebody else's is not
    -- theirs to touch at all.
    if v_added_by = v_guard.participant_id then
      raise exception 'You added that yourself. Ask whoever is hosting to change it.'
        using errcode = '22000';
    end if;
    raise exception 'Somebody added that for themselves.' using errcode = '22000';
  end if;

  if p_quantity = 0 then
    delete from public.item_claims ic
    where ic.bill_item_id = p_bill_item_id and ic.participant_id = v_guard.participant_id;
    return query select p_bill_item_id, 0;
    return;
  end if;

  if v_guard.item_quantity > 1 then
    select coalesce(sum(ic.quantity), 0) into v_others
    from public.item_claims ic
    where ic.bill_item_id = p_bill_item_id and ic.participant_id <> v_guard.participant_id;

    v_available := v_guard.item_quantity - v_others;

    if p_quantity > v_available then
      raise exception 'Only % % remaining.', v_available, v_guard.item_name using errcode = '22000';
    end if;
  end if;

  insert into public.item_claims (bill_item_id, participant_id, quantity)
  values (p_bill_item_id, v_guard.participant_id, p_quantity)
  on conflict (bill_item_id, participant_id) do update set quantity = excluded.quantity;

  return query select p_bill_item_id, p_quantity;
end;
$$;
