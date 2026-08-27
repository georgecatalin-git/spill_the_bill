-- ---------------------------------------------------------------------------
-- A code printed on the table opens a table at that restaurant
--
-- Until now only the restaurant's own staff could start a table, because the
-- restaurant is a property of their account. A customer sitting at the table
-- has no such account and nothing to tie them to a place.
--
-- The tie is a sticker. Every restaurant gets one short code, printed on every
-- table, and scanning it is what says "this is Italien" — the same job
-- `profiles.restaurant_id` does for staff, done by a physical object the
-- customer had to be sitting in front of.
--
-- WHAT THIS IS AND IS NOT. The code is not a login, and the customer is never
-- signed in as the restaurant. They stay themselves: their own session, their
-- own table, and the RLS that has always restricted `tables` to
-- `admin_id = auth.uid()` shows them their own and nothing else. There is no
-- screen to hide, because there is nothing else to see. Handing out the
-- restaurant's account instead would have handed out every table's totals,
-- names and receipt photos with it.
--
-- The code is rotatable, and that is the point of it being a separate column
-- rather than the restaurant's id. A sticker can be photographed; when one
-- turns up somewhere it should not, the owner issues a new code and reprints.
-- An id could never be changed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The code
--
-- Eight characters from the same unambiguous alphabet the invite codes use —
-- no O/0, no I/1 — because somebody will eventually type this rather than scan
-- it. `generate_invite_code` checks itself against `tables`, so its output is
-- looped here until it is free among restaurants too.
-- ---------------------------------------------------------------------------

alter table public.restaurants add column if not exists venue_code text;

create or replace function public.generate_venue_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
  v_attempts integer := 0;
begin
  loop
    v_code := public.generate_invite_code(8);
    exit when not exists (select 1 from public.restaurants where venue_code = v_code);

    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      raise exception 'Could not generate a unique venue code';
    end if;
  end loop;

  return v_code;
end;
$$;

revoke execute on function public.generate_venue_code() from public, anon, authenticated;

update public.restaurants set venue_code = public.generate_venue_code()
where venue_code is null;

alter table public.restaurants
  alter column venue_code set not null,
  alter column venue_code set default public.generate_venue_code();

create unique index if not exists restaurants_venue_code_key
  on public.restaurants (venue_code);

comment on column public.restaurants.venue_code is
  'The code printed on this restaurant''s tables. Rotatable: a sticker can be photographed, an id could never be changed.';

-- ---------------------------------------------------------------------------
-- 2. Opening a table with it
--
-- SECURITY DEFINER because the caller has no right to read `restaurants` by
-- code — that read is the whole credential, and letting a client do it
-- directly would turn the table into a directory of every code.
--
-- The insert has to get past `prevent_table_at_another_restaurant`, which
-- exists to stop an account naming somewhere it does not belong. A customer
-- belongs nowhere, and the code is what speaks for them, so the function says
-- so through a transaction-local setting the trigger reads. Transaction-local
-- (`is_local => true`) matters: it cannot survive the statement, so nothing
-- else in the session inherits permission.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_table_at_another_restaurant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  -- A table opened with a venue code has already proved which restaurant it
  -- belongs to, and it proved it with something the client cannot invent.
  if current_setting('split.venue_code_ok', true) = new.restaurant_id::text then
    return new;
  end if;

  select * into v_profile from public.profiles p where p.id = new.admin_id;

  if v_profile.role = 'owner' then
    return new;
  end if;

  if v_profile.restaurant_id is null then
    raise exception 'This account is not linked to a restaurant yet.'
      using errcode = '42501';
  end if;

  if new.restaurant_id is distinct from v_profile.restaurant_id then
    raise exception 'This account can only open tables at its own restaurant.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.prevent_table_at_another_restaurant() is
  'A table may only be opened at the account''s own restaurant, or at the one whose printed code was presented. The owner is exempt.';

create or replace function public.create_table_at_venue(
  p_venue_code text,
  p_name text
)
returns table (id uuid, name text, invite_code text, restaurant_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_admin uuid := (select auth.uid());
  v_table public.tables%rowtype;
begin
  if v_admin is null then
    raise exception 'Please sign in before opening a table.';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Please name your table.';
  end if;

  select * into v_restaurant
  from public.restaurants r
  where upper(trim(r.venue_code)) = upper(trim(coalesce(p_venue_code, '')));

  -- One message for a wrong code and for a hidden restaurant. Which of the two
  -- it is tells a stranger whether they guessed a real code.
  if v_restaurant.id is null or not v_restaurant.is_active then
    raise exception 'That code does not open a table here.';
  end if;

  perform set_config('split.venue_code_ok', v_restaurant.id::text, true);

  insert into public.tables (admin_id, name, restaurant_id)
  values (v_admin, trim(p_name), v_restaurant.id)
  returning * into v_table;

  return query select v_table.id, v_table.name, v_table.invite_code, v_restaurant.name;
end;
$$;

comment on function public.create_table_at_venue(text, text) is
  'Opens a table at the restaurant whose printed code was scanned. The caller stays themselves — they are never signed in as the restaurant.';

revoke execute on function public.create_table_at_venue(text, text) from public, anon;
grant execute on function public.create_table_at_venue(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reading a code, and replacing one
--
-- `restaurants` is not readable by a customer, so the app cannot show "Italien"
-- next to the code it just scanned without asking. This answers only that, and
-- only for a code somebody already holds.
-- ---------------------------------------------------------------------------

create or replace function public.venue_by_code(p_venue_code text)
returns table (id uuid, name text, city text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.city
  from public.restaurants r
  where upper(trim(r.venue_code)) = upper(trim(coalesce(p_venue_code, '')))
    and r.is_active;
$$;

comment on function public.venue_by_code(text) is
  'The restaurant a scanned code belongs to, so the app can name it before a table is opened.';

revoke execute on function public.venue_by_code(text) from public, anon;
grant execute on function public.venue_by_code(text) to authenticated;

create or replace function public.owner_rotate_venue_code(p_restaurant_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change a venue code.';
  end if;

  v_code := public.generate_venue_code();

  update public.restaurants r set venue_code = v_code where r.id = p_restaurant_id;

  if not found then
    raise exception 'That restaurant no longer exists.';
  end if;

  return v_code;
end;
$$;

comment on function public.owner_rotate_venue_code(uuid) is
  'Issues a new code for a restaurant. Every printed sticker stops working, which is the point.';

revoke execute on function public.owner_rotate_venue_code(uuid) from public, anon;
grant execute on function public.owner_rotate_venue_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The owner's figures carry the code
--
-- It is what gets printed and stuck on the tables, so it belongs on the card
-- the owner already reads, beside the name and the town.
-- ---------------------------------------------------------------------------

drop function if exists public.owner_restaurant_stats();

create function public.owner_restaurant_stats()
returns table (
  restaurant_id uuid,
  restaurant_name text,
  city text,
  venue_code text,
  is_active boolean,
  tables_total integer,
  tables_active integer,
  bills_completed integer,
  participants_total integer,
  last_activity_at timestamptz,
  scans_this_month integer,
  scan_cost_micros_this_month bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can read usage statistics.';
  end if;

  return query
    select
      r.id, r.name, r.city, r.venue_code, r.is_active,
      (select count(*) from public.tables t
        where t.restaurant_id = r.id)::integer,
      (select count(*) from public.tables t
        where t.restaurant_id = r.id and t.status <> 'COMPLETED')::integer,
      (select count(*) from public.bills b
        join public.tables t on t.id = b.table_id
        where t.restaurant_id = r.id and b.status = 'COMPLETED')::integer,
      (select count(*) from public.participants p
        join public.tables t on t.id = p.table_id
        where t.restaurant_id = r.id)::integer,
      greatest(
        (select max(t.updated_at) from public.tables t where t.restaurant_id = r.id),
        (select max(b.updated_at) from public.bills b
          join public.tables t on t.id = b.table_id
          where t.restaurant_id = r.id)
      ),
      (select count(*) from public.receipt_scans s
        where s.restaurant_id = r.id
          and s.created_at >= date_trunc('month', now()))::integer,
      coalesce((select sum(s.cost_micros) from public.receipt_scans s
        where s.restaurant_id = r.id
          and s.created_at >= date_trunc('month', now())), 0)::bigint
    from public.restaurants r
    order by r.name;
end;
$$;

comment on function public.owner_restaurant_stats() is
  'Per-restaurant usage counts for the owner, and the code printed on its tables. Refuses anyone else, and returns no money and no personal data.';

revoke execute on function public.owner_restaurant_stats() from public, anon;
grant execute on function public.owner_restaurant_stats() to authenticated;
