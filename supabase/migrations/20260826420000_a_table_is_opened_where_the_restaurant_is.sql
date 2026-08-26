-- ---------------------------------------------------------------------------
-- Assignment goes; the perimeter arrives
--
-- `restaurant_admins` asked the owner to hand out access one account at a time.
-- At two restaurants that is nothing; at five hundred it is a full-time job,
-- and it answered the wrong question anyway. What matters is not *who* the
-- account belongs to but *where the phone is standing* — an admin at Panoramic
-- must not be able to open a table at Italien, however trustworthy they are.
--
-- So every admin sees every restaurant the owner has entered, and the table is
-- refused unless the phone is near the place it names.
--
-- READ THIS BEFORE TRUSTING IT. The coordinates are reported by the client.
-- Postgres receives two numbers and has no way to check them; anyone willing
-- to call the API directly can send whatever they like. This is a **guard
-- rail, not a boundary** — the first rule in this schema that does not actually
-- own its own truth. It works because the case it exists for is an honest
-- person tapping a picker, not an attacker crafting requests. The boundary for
-- money is still `check_scan_receipt`, which reads the restaurant off the
-- photo, server-side, where the client cannot reach.
--
-- The owner is exempt: they demo the app wherever the meeting happens, and
-- they pay for the API calls either way.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Take the assignment machinery back out
--
-- The policy goes first: it calls the two helpers, and Postgres will not drop
-- a function a policy depends on.
-- ---------------------------------------------------------------------------

drop policy if exists "Admins read the restaurants they may use" on public.restaurants;

-- Back to what it was. Every admin has to be able to pick from the list, and
-- the perimeter is what decides where they may actually open a table.
create policy "Admins read restaurants"
  on public.restaurants for select to authenticated
  using (true);

drop trigger if exists tables_require_assigned_restaurant on public.tables;

drop function if exists public.prevent_table_at_unassigned_restaurant();
drop function if exists public.list_my_restaurants();
drop function if exists public.owner_list_admins();
drop function if exists public.owner_assign_restaurant(uuid, uuid);
drop function if exists public.owner_revoke_restaurant(uuid, uuid);
drop function if exists public.admin_may_use_restaurant(uuid);
drop function if exists public.admin_has_table_at(uuid);

drop table if exists public.restaurant_admins;

-- ---------------------------------------------------------------------------
-- 2. Where each restaurant is
--
-- Captured by standing in the place and pressing a button, not typed and not
-- geocoded. The owner meets every restaurant in person anyway, and this way no
-- third-party address service is involved — Google Places was considered and
-- rejected for the picker, and it is no more welcome here.
--
-- `radius_m` is per restaurant because the honest failure is a weak GPS fix
-- indoors, and a place in a basement or a shopping centre needs more room than
-- a terrace. Generous by default: letting the table next door through is a far
-- smaller problem than refusing a waiter standing at their own bar.
-- ---------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists latitude double precision
    check (latitude is null or (latitude between -90 and 90)),
  add column if not exists longitude double precision
    check (longitude is null or (longitude between -180 and 180)),
  add column if not exists radius_m integer not null default 250
    check (radius_m between 50 and 5000);

comment on column public.restaurants.latitude is
  'Where the restaurant is, captured on site. Null means tables here cannot be checked against a position.';
comment on column public.restaurants.radius_m is
  'How far from those coordinates a table may still be opened. Generous on purpose: indoor GPS is poor.';

-- ---------------------------------------------------------------------------
-- 3. Where each table was opened
--
-- Kept rather than merely checked. When a figure looks wrong later, "this
-- table was opened 4 km away" is the sentence that explains it, and a null
-- says the position was never offered.
-- ---------------------------------------------------------------------------

alter table public.tables
  add column if not exists opened_lat double precision,
  add column if not exists opened_lng double precision;

comment on column public.tables.opened_lat is
  'The position the device reported when the table was opened. Client-supplied: evidence, not proof.';

-- ---------------------------------------------------------------------------
-- 4. Distance
--
-- Haversine, on a spherical earth. Accurate to a fraction of a percent over
-- the hundreds of metres this is asked about, and it needs no extension —
-- PostGIS and earthdistance would both be a dependency for one formula.
-- ---------------------------------------------------------------------------

create or replace function public.distance_meters(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  ));
$$;

comment on function public.distance_meters(double precision, double precision, double precision, double precision) is
  'Great-circle distance in metres. Haversine, no extension required.';

revoke execute on function public.distance_meters(double precision, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.distance_meters(double precision, double precision, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The refusal
--
-- INSERT only, like the other two guards on this table: a restaurant that
-- moves, or coordinates corrected mid-service, must not break a dinner already
-- under way.
--
-- Never refuses on absence of a *record*. A restaurant whose coordinates the
-- owner has not captured yet lets every table through — the same rule the
-- receipt check follows, and for the same reason: a rule that fires on missing
-- data punishes the honest, because they are the ones standing at the table.
--
-- It DOES refuse on absence of a *reading*, once the restaurant has
-- coordinates. Otherwise refusing the location permission would be the way
-- around it, and everybody would learn that within a week.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_table_outside_restaurant_radius()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_distance double precision;
begin
  if exists (
    select 1 from public.profiles p
    where p.id = new.admin_id and p.role = 'owner'
  ) then
    return new;
  end if;

  select * into v_restaurant
  from public.restaurants r where r.id = new.restaurant_id;

  if v_restaurant.latitude is null or v_restaurant.longitude is null then
    return new;
  end if;

  if new.opened_lat is null or new.opened_lng is null then
    raise exception 'Turn on location to open a table at %.', v_restaurant.name
      using errcode = '42501';
  end if;

  v_distance := public.distance_meters(
    v_restaurant.latitude, v_restaurant.longitude,
    new.opened_lat, new.opened_lng
  );

  if v_distance > v_restaurant.radius_m then
    raise exception 'You are about % m from %. Open the table at the restaurant you are in.',
      round(v_distance)::integer, v_restaurant.name
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.prevent_table_outside_restaurant_radius() is
  'Refuses a table opened away from the restaurant it names. Client-reported position: a guard rail, not a boundary.';

revoke execute on function public.prevent_table_outside_restaurant_radius()
  from public, anon, authenticated;

drop trigger if exists tables_require_being_there on public.tables;
create trigger tables_require_being_there
  before insert on public.tables
  for each row execute function public.prevent_table_outside_restaurant_radius();

-- ---------------------------------------------------------------------------
-- 6. The owner's figures carry the perimeter
--
-- Same reason the fiscal code is there: it is a field the owner fills in on the
-- card they already edit, and a restaurant without coordinates is one whose
-- tables nobody can check.
-- ---------------------------------------------------------------------------

drop function if exists public.owner_restaurant_stats();

create function public.owner_restaurant_stats()
returns table (
  restaurant_id uuid,
  restaurant_name text,
  city text,
  tax_id text,
  latitude double precision,
  longitude double precision,
  radius_m integer,
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
      r.id, r.name, r.city, r.tax_id, r.latitude, r.longitude, r.radius_m, r.is_active,
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
  'Per-restaurant usage counts for the owner. Refuses anyone else, and returns no money and no personal data.';

revoke execute on function public.owner_restaurant_stats() from public, anon;
grant execute on function public.owner_restaurant_stats() to authenticated;
