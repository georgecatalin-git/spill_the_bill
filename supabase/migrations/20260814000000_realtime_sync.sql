-- Realtime synchronisation.
--
-- What changes and what deliberately does not:
--
-- The database still owns every number. Realtime does not carry any of them.
-- Each message says only "something on bill X changed" and every client then
-- re-reads the authoritative state through the path it is already allowed to
-- use — the admin through RLS, a guest through the `get_guest_*` definer
-- functions. Nothing is recomputed on the device.
--
-- That is not caution for its own sake. A single claim changes what OTHER
-- people owe: shares are split by largest remainder, so one guest taking a
-- second cola re-divides that line between everyone on it. A client merging
-- an `item_claims` row into local state could not work those figures out
-- without re-implementing the split in JavaScript, which is exactly what this
-- project forbids.
--
-- Why broadcast and not `postgres_changes`:
--
-- Guests are `anon` and hold no grant on any table — that is the whole guest
-- security model. `postgres_changes` replays rows through RLS as the
-- connecting role, so a guest would receive precisely nothing, and making it
-- work would mean giving `anon` direct SELECT on bills, items, claims and
-- participants. Broadcast keeps the boundary where it is: `anon` still cannot
-- read a single row, and the message itself contains no data to read.
--
-- The `supabase_realtime` publication is left empty on purpose. No table is
-- exposed to `postgres_changes` by this migration.

-- ---------------------------------------------------------------------------
-- The one message this app sends
-- ---------------------------------------------------------------------------

/**
 * Tells everyone watching a bill that it moved.
 *
 * The payload is a signal, never content: the bill id (so a client can drop a
 * message meant for a bill it is no longer on), which table moved, and which
 * operation it was. No names, no quantities, no amounts, no participant ids.
 *
 * The topic is `bill:<uuid>` and the message is sent as PUBLIC, because a
 * private topic can only be joined by an authenticated client and guests have
 * no account by design. What guards the topic is the bill id itself: 122 bits
 * of randomness that reach a device only through an authorised read, the same
 * way the invite code and the session token do. Guessing it buys nothing —
 * there is no data in the message, and reading the actual bill still needs a
 * valid session token or the owning admin's login.
 *
 * `realtime.send` swallows its own failures into a WARNING, so a realtime
 * problem can never roll back the claim that triggered it. That is the right
 * trade: the write matters, the notification does not.
 */
create or replace function public.broadcast_bill_change(
  p_bill_id uuid,
  p_source text,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Null happens on cascade deletes, where the parent is already gone and the
  -- parent's own trigger has said everything there is to say.
  if p_bill_id is null then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object('bill_id', p_bill_id, 'source', p_source, 'event', p_event),
    'bill_change',
    'bill:' || p_bill_id::text,
    false
  );
end;
$$;

/**
 * The same signal for a table, used by the screens that exist before the bill
 * does: the admin watching people arrive, and the guest waiting for the
 * receipt to be shared.
 */
create or replace function public.broadcast_table_change(
  p_table_id uuid,
  p_source text,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_table_id is null then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object('table_id', p_table_id, 'source', p_source, 'event', p_event),
    'table_change',
    'table:' || p_table_id::text,
    false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
--
-- Row level rather than statement level: every write in this app is one row
-- at a time (one claim, one item, one person), and a row trigger is the only
-- one that can still see which bill the row belonged to on DELETE.
-- ---------------------------------------------------------------------------

create or replace function public.notify_bill_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.broadcast_bill_change(coalesce(new.id, old.id), 'bills', tg_op);
  return null;
end;
$$;

drop trigger if exists bills_notify_change on public.bills;
create trigger bills_notify_change
  after insert or update or delete on public.bills
  for each row execute function public.notify_bill_change();

create or replace function public.notify_bill_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.broadcast_bill_change(coalesce(new.bill_id, old.bill_id), 'bill_items', tg_op);
  return null;
end;
$$;

drop trigger if exists bill_items_notify_change on public.bill_items;
create trigger bill_items_notify_change
  after insert or update or delete on public.bill_items
  for each row execute function public.notify_bill_item_change();

create or replace function public.notify_item_claim_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id uuid;
begin
  -- On a cascade from `bill_items` the line is already gone and this comes
  -- back null; the item's own trigger has already announced the change.
  select bi.bill_id into v_bill_id
  from public.bill_items bi
  where bi.id = coalesce(new.bill_item_id, old.bill_item_id);

  perform public.broadcast_bill_change(v_bill_id, 'item_claims', tg_op);
  return null;
end;
$$;

drop trigger if exists item_claims_notify_change on public.item_claims;
create trigger item_claims_notify_change
  after insert or update or delete on public.item_claims
  for each row execute function public.notify_item_claim_change();

/**
 * A participant belongs to a table, not to a bill, so someone arriving or
 * leaving is announced on both topics: the table, for the waiting screens,
 * and every bill at that table, for the receipt screens.
 */
create or replace function public.notify_participant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table_id uuid := coalesce(new.table_id, old.table_id);
  v_bill_id uuid;
begin
  perform public.broadcast_table_change(v_table_id, 'participants', tg_op);

  for v_bill_id in select b.id from public.bills b where b.table_id = v_table_id loop
    perform public.broadcast_bill_change(v_bill_id, 'participants', tg_op);
  end loop;

  return null;
end;
$$;

drop trigger if exists participants_notify_change on public.participants;
create trigger participants_notify_change
  after insert or update or delete on public.participants
  for each row execute function public.notify_participant_change();

/** Table status: what turns "waiting for the bill" into "the bill is ready". */
create or replace function public.notify_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.broadcast_table_change(coalesce(new.id, old.id), 'tables', tg_op);
  return null;
end;
$$;

drop trigger if exists tables_notify_change on public.tables;
create trigger tables_notify_change
  after insert or update or delete on public.tables
  for each row execute function public.notify_table_change();

-- ---------------------------------------------------------------------------
-- Privileges
--
-- These are trigger plumbing. Nobody calls them over the API, and a broadcast
-- helper that anon could call would let anyone spray messages at any topic.
-- EXECUTE is granted to PUBLIC by default, so PUBLIC has to be named.
-- Triggers keep working: they run as the table owner.
-- ---------------------------------------------------------------------------

revoke execute on function public.broadcast_bill_change(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.broadcast_table_change(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.notify_bill_change() from public, anon, authenticated;
revoke execute on function public.notify_bill_item_change() from public, anon, authenticated;
revoke execute on function public.notify_item_claim_change() from public, anon, authenticated;
revoke execute on function public.notify_participant_change() from public, anon, authenticated;
revoke execute on function public.notify_table_change() from public, anon, authenticated;
