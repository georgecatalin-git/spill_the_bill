-- Guest item claims.
--
-- Two kinds of line behave differently, and this file leans on that
-- distinction throughout:
--
--   quantity > 1  -> unit based. Units are counted out. The sum of all claims
--                    can never exceed the printed quantity.
--   quantity = 1  -> shareable. Any number of people may claim it and the
--                    price is divided between them (one pizza, three ways).
--
-- Every operation derives the participant from the session token. A guest can
-- only ever touch their own claim, on an item that belongs to their table.

-- ---------------------------------------------------------------------------
-- Shared guard: resolve the session and check the item is claimable
-- ---------------------------------------------------------------------------

/**
 * Locks the bill item and returns it, once the session has been proved to
 * belong to a live participant at the item's own table.
 *
 * The `for update` is what makes concurrent claims safe: two guests going for
 * the last unit are serialised here, so the second one sees the first one's
 * claim before deciding.
 */
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

  if p_require_open and v_bill.status <> 'OPEN' then
    raise exception 'This bill is no longer accepting selections.' using errcode = '22000';
  end if;

  return query select v_participant.id, v_item.id, v_item.name, v_item.quantity;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claim operations
-- ---------------------------------------------------------------------------

/** Adds `p_quantity` more of an item to the guest's own claim. */
create or replace function public.claim_item(
  p_session_token text,
  p_bill_item_id uuid,
  p_quantity integer default 1
)
-- The output column names deliberately differ from the table's own columns:
-- inside the body they would shadow them, and `on conflict (bill_item_id, ...)`
-- could no longer tell which one was meant.
returns table (item_id uuid, new_quantity integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guard record;
  v_held integer;
  v_others integer;
  v_available integer;
  v_new integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Please choose at least one.' using errcode = '22000';
  end if;

  select * into v_guard
  from public.lock_claimable_item(p_session_token, p_bill_item_id, true);

  select coalesce(ic.quantity, 0) into v_held
  from public.item_claims ic
  where ic.bill_item_id = p_bill_item_id
    and ic.participant_id = v_guard.participant_id;

  v_held := coalesce(v_held, 0);
  v_new := v_held + p_quantity;

  -- Unit based lines are the only ones that can run out.
  if v_guard.item_quantity > 1 then
    select coalesce(sum(ic.quantity), 0) into v_others
    from public.item_claims ic
    where ic.bill_item_id = p_bill_item_id
      and ic.participant_id <> v_guard.participant_id;

    v_available := v_guard.item_quantity - v_others - v_held;

    if p_quantity > v_available then
      if v_available <= 0 then
        raise exception 'No % left.', v_guard.item_name using errcode = '22000';
      end if;
      raise exception 'Only % % remaining.', v_available, v_guard.item_name
        using errcode = '22000';
    end if;
  end if;

  insert into public.item_claims (bill_item_id, participant_id, quantity)
  values (p_bill_item_id, v_guard.participant_id, v_new)
  on conflict (bill_item_id, participant_id)
    do update set quantity = excluded.quantity;

  return query select p_bill_item_id, v_new;
end;
$$;

/** Sets the guest's claim to an exact quantity. Zero removes it. */
create or replace function public.update_item_claim(
  p_session_token text,
  p_bill_item_id uuid,
  p_quantity integer
)
returns table (item_id uuid, new_quantity integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guard record;
  v_others integer;
  v_available integer;
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Please choose a valid quantity.' using errcode = '22000';
  end if;

  -- Lowering or clearing a claim stays possible once everything is spoken for,
  -- otherwise a guest could get stuck on a bill they can no longer edit.
  select * into v_guard
  from public.lock_claimable_item(p_session_token, p_bill_item_id, p_quantity > 0);

  if p_quantity = 0 then
    delete from public.item_claims ic
    where ic.bill_item_id = p_bill_item_id
      and ic.participant_id = v_guard.participant_id;

    return query select p_bill_item_id, 0;
    return;
  end if;

  if v_guard.item_quantity > 1 then
    select coalesce(sum(ic.quantity), 0) into v_others
    from public.item_claims ic
    where ic.bill_item_id = p_bill_item_id
      and ic.participant_id <> v_guard.participant_id;

    v_available := v_guard.item_quantity - v_others;

    if p_quantity > v_available then
      raise exception 'Only % % remaining.', v_available, v_guard.item_name
        using errcode = '22000';
    end if;
  end if;

  insert into public.item_claims (bill_item_id, participant_id, quantity)
  values (p_bill_item_id, v_guard.participant_id, p_quantity)
  on conflict (bill_item_id, participant_id)
    do update set quantity = excluded.quantity;

  return query select p_bill_item_id, p_quantity;
end;
$$;

create or replace function public.remove_item_claim(
  p_session_token text,
  p_bill_item_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guard record;
begin
  select * into v_guard
  from public.lock_claimable_item(p_session_token, p_bill_item_id, false);

  delete from public.item_claims ic
  where ic.bill_item_id = p_bill_item_id
    and ic.participant_id = v_guard.participant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest reads
-- ---------------------------------------------------------------------------

/**
 * The whole receipt in one call: each line with who took what, how much is
 * left, and what this guest owes for it.
 *
 * One round trip for the entire bill rather than a query per item.
 */
create or replace function public.get_guest_items_with_claims(p_session_token text)
returns table (
  id uuid,
  name text,
  quantity integer,
  unit_price_cents bigint,
  total_price_cents bigint,
  claimed_quantity integer,
  available_quantity integer,
  is_shared boolean,
  can_claim_more boolean,
  my_quantity integer,
  my_amount_cents bigint,
  claims jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  return query
  select
    bi.id,
    bi.name,
    bi.quantity,
    bi.unit_price_cents,
    bi.total_price_cents,
    coalesce(agg.claimed, 0)::integer as claimed_quantity,
    -- Null means "shareable": there is no unit count to run out of.
    case when bi.quantity > 1 then (bi.quantity - coalesce(agg.claimed, 0))::integer end
      as available_quantity,
    (bi.quantity = 1) as is_shared,
    (bi.quantity = 1 or bi.quantity - coalesce(agg.claimed, 0) > 0) as can_claim_more,
    coalesce(mine.quantity, 0)::integer as my_quantity,
    coalesce(myshare.amount_cents, 0)::bigint as my_amount_cents,
    coalesce(agg.claims, '[]'::jsonb) as claims
  from public.bill_items bi
  join public.bills b on b.id = bi.bill_id
  left join lateral (
    select
      sum(ic.quantity) as claimed,
      jsonb_agg(
        jsonb_build_object(
          'participant_id', p.id,
          'participant_name', p.name,
          'quantity', ic.quantity,
          'amount_cents', coalesce(s.amount_cents, 0)
        ) order by p.joined_at
      ) as claims
    from public.item_claims ic
    join public.participants p on p.id = ic.participant_id
    left join public.item_claim_shares s
      on s.bill_item_id = ic.bill_item_id and s.participant_id = ic.participant_id
    where ic.bill_item_id = bi.id
  ) agg on true
  left join public.item_claims mine
    on mine.bill_item_id = bi.id and mine.participant_id = v_participant.id
  left join public.item_claim_shares myshare
    on myshare.bill_item_id = bi.id and myshare.participant_id = v_participant.id
  where b.table_id = v_participant.table_id
  order by bi.created_at;
end;
$$;

/** Everyone's running total at this table, this guest included. */
create or replace function public.get_guest_totals(p_session_token text)
returns table (
  participant_id uuid,
  participant_name text,
  is_me boolean,
  total_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  return query
  select
    p.id,
    p.name,
    (p.id = v_participant.id) as is_me,
    coalesce(sum(s.amount_cents), 0)::bigint
  from public.participants p
  left join public.item_claim_shares s on s.participant_id = p.id
  left join public.bill_items bi on bi.id = s.bill_item_id
  left join public.bills b on b.id = bi.bill_id and b.table_id = p.table_id
  where p.table_id = v_participant.table_id
  group by p.id, p.name, p.joined_at
  order by p.joined_at;
end;
$$;

/**
 * How much of the bill is spoken for.
 *
 * The bill total is whatever the admin set — it is not derived from what
 * guests picked. Guests only move the assigned figure.
 */
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

  v_assigned := public.bill_assigned_cents(v_bill.id);

  return query select
    v_bill.id,
    v_bill.currency,
    v_bill.status,
    v_bill.total_cents,
    v_assigned,
    v_bill.total_cents - v_assigned,
    case
      when v_bill.total_cents > 0
        then round((v_assigned::numeric * 100) / v_bill.total_cents, 4)
      else 0
    end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Guests arrive as `anon`. These functions are the only way in; `anon` still
-- has no direct access to any table.
-- ---------------------------------------------------------------------------

revoke execute on function public.lock_claimable_item(text, uuid, boolean)
  from public, anon, authenticated;

revoke execute on function public.claim_item(text, uuid, integer) from public;
revoke execute on function public.update_item_claim(text, uuid, integer) from public;
revoke execute on function public.remove_item_claim(text, uuid) from public;
revoke execute on function public.get_guest_items_with_claims(text) from public;
revoke execute on function public.get_guest_totals(text) from public;
revoke execute on function public.get_bill_assignment_summary(text) from public;

grant execute on function public.claim_item(text, uuid, integer) to anon, authenticated;
grant execute on function public.update_item_claim(text, uuid, integer) to anon, authenticated;
grant execute on function public.remove_item_claim(text, uuid) to anon, authenticated;
grant execute on function public.get_guest_items_with_claims(text) to anon, authenticated;
grant execute on function public.get_guest_totals(text) to anon, authenticated;
grant execute on function public.get_bill_assignment_summary(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin overview
-- ---------------------------------------------------------------------------

-- Who claimed what, with the amount each one owes for it. One query for the
-- admin's overview instead of stitching four tables together on the client.
create or replace view public.bill_claim_details
with (security_invoker = true) as
select
  bi.bill_id,
  bi.id as bill_item_id,
  bi.name as item_name,
  bi.quantity as item_quantity,
  bi.unit_price_cents,
  bi.total_price_cents,
  bi.created_at as item_created_at,
  p.id as participant_id,
  p.name as participant_name,
  p.is_admin,
  ic.quantity as claimed_quantity,
  coalesce(s.amount_cents, 0)::bigint as amount_cents
from public.bill_items bi
join public.item_claims ic on ic.bill_item_id = bi.id
join public.participants p on p.id = ic.participant_id
left join public.item_claim_shares s
  on s.bill_item_id = ic.bill_item_id and s.participant_id = ic.participant_id;
