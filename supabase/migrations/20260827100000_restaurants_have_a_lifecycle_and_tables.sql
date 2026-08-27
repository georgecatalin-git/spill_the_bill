-- ---------------------------------------------------------------------------
-- A restaurant has a lifecycle, and a restaurant has tables
--
-- Two gaps, and they belong together because both are about onboarding: a
-- place that has been entered but not yet signed is not the same as one whose
-- contract ended, and neither is the same as one taken down for a problem.
-- `is_active` said only yes or no.
--
-- `status` becomes the truth and `is_active` becomes a **generated column** off
-- it. Everything that already reads `is_active` — the two triggers, the search
-- box, the venue lookup, the receipt gate, the owner's figures — keeps working
-- untouched, and the two can never drift apart, which is the failure a second
-- boolean would have invited.
--
-- New restaurants start PENDING. The owner enters a place during a demo and
-- activates it when the contract is signed; that is the lifecycle this project
-- has been describing all along, now written down.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The lifecycle
-- ---------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists status text not null default 'PENDING'
    check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE'));

update public.restaurants
set status = case when is_active then 'ACTIVE' else 'INACTIVE' end;

alter table public.restaurants drop constraint if exists restaurants_active_needs_tax_id;
alter table public.restaurants drop column if exists is_active;

alter table public.restaurants
  add column is_active boolean
  generated always as (status = 'ACTIVE') stored;

-- Only ACTIVE can serve, and only a restaurant whose fiscal code is on file can
-- be ACTIVE — without one no receipt of theirs could ever be validated.
alter table public.restaurants
  add constraint restaurants_active_needs_tax_id
  check (status <> 'ACTIVE' or tax_id is not null);

comment on column public.restaurants.status is
  'PENDING (entered, not signed) · ACTIVE (serving) · SUSPENDED (a problem) · INACTIVE (contract ended). Only ACTIVE may be used.';
comment on column public.restaurants.is_active is
  'Derived from status, so the two cannot drift. Read it freely; write status.';

-- ---------------------------------------------------------------------------
-- 2. The physical tables
--
-- Separate from `tables`, which is the *session* — a party sitting down, with
-- its bill and its participants. A physical table is furniture: it outlives
-- every session held at it, and its code is printed once and stuck down.
--
-- Same alphabet as the invite codes, for the same reason: somebody will
-- eventually read one out over the phone.
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  table_code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.restaurant_tables is
  'The furniture. One row per physical table, with the code printed on it. Outlives the sessions held at it.';

create index if not exists restaurant_tables_restaurant_idx
  on public.restaurant_tables (restaurant_id);

create unique index if not exists restaurant_tables_label_key
  on public.restaurant_tables (restaurant_id, lower(trim(label)));

create trigger restaurant_tables_set_updated_at
  before update on public.restaurant_tables
  for each row execute function public.set_updated_at();

alter table public.restaurant_tables enable row level security;

-- Nobody reaches this table directly. The owner manages it through the
-- functions below, and a customer only ever presents a code. Revoking rather
-- than trusting the default: a fresh table on Supabase starts with anon and
-- authenticated holding every verb.
revoke all on public.restaurant_tables from anon, authenticated;

create or replace function public.generate_table_code()
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

    exit when not exists (select 1 from public.restaurant_tables where table_code = v_code)
      and not exists (select 1 from public.restaurants where venue_code = v_code);

    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      raise exception 'Could not generate a unique table code';
    end if;
  end loop;

  return v_code;
end;
$$;

-- Checked against both code spaces above, because one function resolves both
-- and a collision would silently send a customer to the wrong place.
revoke execute on function public.generate_table_code() from public, anon, authenticated;

alter table public.restaurant_tables
  alter column table_code set default public.generate_table_code();

-- ---------------------------------------------------------------------------
-- 3. One code, two kinds
--
-- A customer presents a code and does not know or care which kind it is. This
-- resolves either: a restaurant's own code, printed on a poster, or a table's,
-- printed on the table. Both answer with the restaurant; only the second also
-- answers with the seat.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_venue_code(p_code text)
returns table (restaurant_id uuid, restaurant_table_id uuid, label text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, null::uuid, null::text
  from public.restaurants r
  where upper(trim(r.venue_code)) = upper(trim(coalesce(p_code, '')))
    and r.is_active
  union all
  select rt.restaurant_id, rt.id, rt.label
  from public.restaurant_tables rt
  join public.restaurants r on r.id = rt.restaurant_id
  where upper(trim(rt.table_code)) = upper(trim(coalesce(p_code, '')))
    and rt.is_active
    and r.is_active
  limit 1;
$$;

comment on function public.resolve_venue_code(text) is
  'The restaurant, and the seat when the code is a table''s. Both kinds are refused unless the restaurant is ACTIVE and the table itself active.';

revoke execute on function public.resolve_venue_code(text) from public, anon;
grant execute on function public.resolve_venue_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The session remembers which seat it was opened at
-- ---------------------------------------------------------------------------

alter table public.tables
  add column if not exists restaurant_table_id uuid
    references public.restaurant_tables (id) on delete set null;

comment on column public.tables.restaurant_table_id is
  'The physical table this session was opened at, when a table code was used. Null for a restaurant-wide code.';

-- ---------------------------------------------------------------------------
-- 5. Opening a session with either code
--
-- Replaces the restaurant-only version. The restaurant is still derived from
-- the code, server-side; the only change is that a table code also carries the
-- seat, and that an inactive seat is refused even at an active restaurant.
-- ---------------------------------------------------------------------------

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
  v_match record;
  v_restaurant public.restaurants%rowtype;
  v_profile public.profiles%rowtype;
  v_admin uuid := (select auth.uid());
  v_table public.tables%rowtype;
begin
  if v_admin is null then
    raise exception 'Please sign in before opening a table.';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Please name your table.';
  end if;

  select * into v_match from public.resolve_venue_code(p_venue_code);

  -- One message whatever the reason: a wrong code, a retired table and a
  -- restaurant that is not ACTIVE all look the same from outside, which is
  -- what stops a stranger learning anything by guessing.
  if v_match.restaurant_id is null then
    raise exception 'That code does not open a table here.';
  end if;

  select * into v_restaurant from public.restaurants r where r.id = v_match.restaurant_id;
  select * into v_profile from public.profiles p where p.id = v_admin;

  if v_profile.role <> 'owner'
     and v_profile.restaurant_id is not null
     and v_profile.restaurant_id <> v_restaurant.id then
    raise exception 'This account is not assigned to %. Ask the owner to assign it.',
      v_restaurant.name
      using errcode = '42501';
  end if;

  perform set_config('split.venue_code_ok', v_restaurant.id::text, true);

  insert into public.tables (admin_id, name, restaurant_id, restaurant_table_id)
  values (v_admin, trim(p_name), v_restaurant.id, v_match.restaurant_table_id)
  returning * into v_table;

  return query select v_table.id, v_table.name, v_table.invite_code, v_restaurant.name;
end;
$$;

comment on function public.create_table_at_venue(text, text) is
  'Opens a session from a printed code, restaurant-wide or per table. The restaurant is read from the code, never sent by the client.';

revoke execute on function public.create_table_at_venue(text, text) from public, anon;
grant execute on function public.create_table_at_venue(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The owner manages the furniture
-- ---------------------------------------------------------------------------

create or replace function public.owner_add_table(
  p_restaurant_id uuid,
  p_label text
)
returns table (id uuid, label text, table_code text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.restaurant_tables%rowtype;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can add a table.';
  end if;

  if length(trim(coalesce(p_label, ''))) = 0 then
    raise exception 'Please name the table.';
  end if;

  begin
    insert into public.restaurant_tables (restaurant_id, label)
    values (p_restaurant_id, trim(p_label))
    returning * into v_row;
  exception when unique_violation then
    raise exception 'This restaurant already has a table called %.', trim(p_label);
  end;

  return query select v_row.id, v_row.label, v_row.table_code;
end;
$$;

revoke execute on function public.owner_add_table(uuid, text) from public, anon;
grant execute on function public.owner_add_table(uuid, text) to authenticated;

create or replace function public.owner_set_table_active(
  p_table_id uuid,
  p_active boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can retire a table.';
  end if;

  -- The sticker stays on the furniture; the database stops honouring it. That
  -- is the point: a table taken out of service cannot be un-printed.
  update public.restaurant_tables rt set is_active = p_active where rt.id = p_table_id;
end;
$$;

revoke execute on function public.owner_set_table_active(uuid, boolean) from public, anon;
grant execute on function public.owner_set_table_active(uuid, boolean) to authenticated;

create or replace function public.owner_list_tables(p_restaurant_id uuid)
returns table (id uuid, label text, table_code text, is_active boolean, sessions_total integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can read the tables.';
  end if;

  return query
    select rt.id, rt.label, rt.table_code, rt.is_active,
      (select count(*) from public.tables t where t.restaurant_table_id = rt.id)::integer
    from public.restaurant_tables rt
    where rt.restaurant_id = p_restaurant_id
    order by rt.label;
end;
$$;

revoke execute on function public.owner_list_tables(uuid) from public, anon;
grant execute on function public.owner_list_tables(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Status replaces the boolean the owner used to flip
-- ---------------------------------------------------------------------------

create or replace function public.owner_set_restaurant_status(
  p_restaurant_id uuid,
  p_status text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change a restaurant''s status.';
  end if;

  if p_status not in ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE') then
    raise exception 'Unknown status %.', p_status;
  end if;

  update public.restaurants r set status = p_status where r.id = p_restaurant_id;

exception when check_violation then
  raise exception 'Add the fiscal code before making this restaurant active. Without it, no receipt here can be checked.';
end;
$$;

revoke execute on function public.owner_set_restaurant_status(uuid, text) from public, anon;
grant execute on function public.owner_set_restaurant_status(uuid, text) to authenticated;
