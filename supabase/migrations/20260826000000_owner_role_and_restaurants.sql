-- ---------------------------------------------------------------------------
-- Owner role and a curated list of restaurants
--
-- Two things this adds, and they only make sense together.
--
-- The `owner` role sees whether the app is actually being used — how many
-- tables, how many bills closed, how many people joined, when a place was last
-- active. Every admin before this could only ever see their own tables, so
-- nobody could see the whole picture.
--
-- That picture is only worth reading if the restaurant name is trustworthy.
-- It used to be free text on `tables`, which meant "Trattoria Roma" and
-- "trattoria roma" counted as two different places. Names now come from a
-- `restaurants` table that only the owner may write, and a table points at one
-- by id.
--
-- The owner sees COUNTS, never money. `owner_restaurant_stats` returns no
-- amounts, no participant names and no receipt lines — reading whether a place
-- uses the app does not require reading what its customers ate.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The role
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists role text not null default 'admin'
    check (role in ('admin', 'owner'));

comment on column public.profiles.role is
  'admin (default) or owner. Writable only by service_role — see the grants below.';

-- An admin could otherwise promote themselves: `profiles` carried a table-wide
-- UPDATE grant and the "Admins update their own profile" policy passes any
-- write to `id = auth.uid()`, columns included. Same lesson as `participants`:
-- a column-level REVOKE does nothing while the table privilege stands, so the
-- table privilege goes first and the safe columns come back by name.
--
-- INSERT goes too, for the same reason. Nothing in the app inserts a profile —
-- `handle_new_user` does it as SECURITY DEFINER and is unaffected — but the
-- "Admins create their own profile" policy would otherwise accept a row that
-- names its own role.
revoke insert, update on public.profiles from authenticated;

grant insert (id, full_name, email) on public.profiles to authenticated;
grant update (full_name, onboarding_completed) on public.profiles to authenticated;

-- SELECT is deliberately left table-wide, so `role` stays readable by its own
-- owner (RLS already restricts profiles to `id = auth.uid()`).
--
-- Consequence, and it is the `participants` trap all over again: from here on a
-- new column on `profiles` is NOT writable until it is granted by name.

-- ---------------------------------------------------------------------------
-- 2. is_owner()
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the check itself cannot be starved by a future policy
-- change on profiles, and so it answers the same way from inside the
-- definer functions below.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'owner'
  );
$$;

comment on function public.is_owner() is
  'True when the caller is the application owner. The authorisation boundary for every owner-only read.';

-- EXECUTE is granted to PUBLIC by default, and PUBLIC covers anon.
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. restaurants
-- ---------------------------------------------------------------------------

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.restaurants is
  'The places Split is sold into. Curated by the owner so statistics group on a name that means one thing.';

-- What actually prevents the duplicates the free-text field allowed.
create unique index if not exists restaurants_name_key
  on public.restaurants (lower(trim(name)));

create trigger restaurants_set_updated_at
  before update on public.restaurants
  for each row execute function public.set_updated_at();

alter table public.restaurants enable row level security;

-- Every admin has to be able to pick from the list.
create policy "Admins read restaurants"
  on public.restaurants for select to authenticated
  using (true);

-- Only the owner curates it.
create policy "Owner creates restaurants"
  on public.restaurants for insert to authenticated
  with check (public.is_owner());

create policy "Owner updates restaurants"
  on public.restaurants for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- Table-wide grants are fine here: no column on this table is a secret, and
-- RLS above is what restricts writes. Deliberately no DELETE — a restaurant
-- with tables behind it gets deactivated, not removed.
grant select, insert, update on public.restaurants to authenticated;

-- ---------------------------------------------------------------------------
-- 4. tables.restaurant_id, and the backfill off the old free text
-- ---------------------------------------------------------------------------

alter table public.tables
  add column if not exists restaurant_id uuid references public.restaurants (id);

-- Every distinct name that was typed, once.
insert into public.restaurants (name)
select distinct on (lower(trim(t.restaurant_name))) trim(t.restaurant_name)
from public.tables t
where t.restaurant_name is not null and trim(t.restaurant_name) <> ''
order by lower(trim(t.restaurant_name)), trim(t.restaurant_name)
on conflict do nothing;

update public.tables t
set restaurant_id = r.id
from public.restaurants r
where t.restaurant_id is null
  and t.restaurant_name is not null
  and lower(trim(t.restaurant_name)) = lower(trim(r.name));

-- Tables that never had a name still need somewhere to point, because the
-- column is about to become mandatory. They are named for what they are rather
-- than folded into a real restaurant's figures.
insert into public.restaurants (name, is_active)
select 'Unknown (imported)', false
where exists (select 1 from public.tables where restaurant_id is null)
on conflict do nothing;

update public.tables t
set restaurant_id = r.id
from public.restaurants r
where t.restaurant_id is null and lower(trim(r.name)) = 'unknown (imported)';

alter table public.tables alter column restaurant_id set not null;

create index if not exists tables_restaurant_id_idx
  on public.tables (restaurant_id);

comment on column public.tables.restaurant_id is
  'The restaurant this table belongs to. Chosen from the curated list, never typed.';

-- ---------------------------------------------------------------------------
-- 5. Drop the free-text column, keep the shape callers already read
--
-- `restaurant_name` disappears from `tables` but stays in the OUTPUT of both
-- readers below, resolved through the join. Screens keep reading the field
-- they always read.
-- ---------------------------------------------------------------------------

-- The view selects the column, so it has to go first. A `create or replace`
-- cannot change a view's column set, hence the drop.
drop view if exists public.admin_table_summaries;

alter table public.tables drop column if exists restaurant_name;

create view public.admin_table_summaries
with (security_invoker = true) as
select
  t.id,
  t.admin_id,
  t.name,
  r.name as restaurant_name,
  t.restaurant_id,
  t.status,
  t.invite_code,
  t.created_at,
  (select count(*) from public.participants p
    where p.table_id = t.id and p.is_active)::integer as people_count,
  coalesce((
    select b.total_cents from public.bills b
    where b.table_id = t.id order by b.created_at limit 1
  ), 0)::bigint as total_cents,
  coalesce((
    select b.currency from public.bills b
    where b.table_id = t.id order by b.created_at limit 1
  ), 'EUR') as currency
from public.tables t
join public.restaurants r on r.id = t.restaurant_id;

-- The guest's own view of which table they are at. Same columns as before;
-- admin_id, invite_code and timestamps are still deliberately not returned.
create or replace function public.get_guest_table(p_session_token text)
returns table (
  id uuid,
  name text,
  restaurant_name text,
  status text
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
    select t.id, t.name, r.name, t.status
    from public.tables t
    join public.restaurants r on r.id = t.restaurant_id
    where t.id = v_participant.table_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. What the owner may read
--
-- A SECURITY DEFINER function rather than a view, because it has to see past
-- every other admin's RLS — the same reason the guest reads are functions.
-- The owner check is the first thing it does.
-- ---------------------------------------------------------------------------

create or replace function public.owner_restaurant_stats()
returns table (
  restaurant_id uuid,
  restaurant_name text,
  city text,
  is_active boolean,
  tables_total integer,
  tables_active integer,
  bills_completed integer,
  participants_total integer,
  last_activity_at timestamptz
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

  -- Counts only. No totals, no participant names, no receipt lines.
  return query
    select
      r.id,
      r.name,
      r.city,
      r.is_active,
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
      )
    from public.restaurants r
    order by r.name;
end;
$$;

comment on function public.owner_restaurant_stats() is
  'Per-restaurant usage counts for the owner. Refuses anyone else, and returns no money and no personal data.';

revoke execute on function public.owner_restaurant_stats() from public, anon;
grant execute on function public.owner_restaurant_stats() to authenticated;
