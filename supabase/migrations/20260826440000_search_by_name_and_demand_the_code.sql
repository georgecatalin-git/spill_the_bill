-- ---------------------------------------------------------------------------
-- The perimeter goes; the fiscal code becomes the rule
--
-- The perimeter had to be configured from inside the restaurant — somebody had
-- to stand there and press a button. That is fine for the two places in this
-- town and absurd for a restaurant in Arad, six hundred kilometres away. A
-- control you cannot switch on without a car is not a control.
--
-- What replaces it is not another guess at where the phone is. Nothing on a
-- phone can answer that honestly. It is the one witness that cannot be
-- reported by the client at all: the fiscal code printed on the receipt, read
-- from the photo, on the server. From here it is **required** rather than
-- consulted when available.
--
-- Alongside it the picker becomes a search box. That is not a security
-- measure, and should not be mistaken for one — typing "Italien" is exactly as
-- easy as choosing it from a list. It does two other things worth having: the
-- customer list stops being readable by anyone who signs up, and a name box
-- still works at five hundred restaurants where a dropdown does not.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Take the perimeter out
--
-- The stats function selects the columns, so it goes first.
-- ---------------------------------------------------------------------------

drop function if exists public.owner_restaurant_stats();

drop trigger if exists tables_require_being_there on public.tables;
drop function if exists public.prevent_table_outside_restaurant_radius();
drop function if exists public.distance_meters(
  double precision, double precision, double precision, double precision);

alter table public.restaurants
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists radius_m;

alter table public.tables
  drop column if exists opened_lat,
  drop column if exists opened_lng;

-- ---------------------------------------------------------------------------
-- 2. The list stops being readable in one piece
--
-- `using (true)` handed every restaurant's name and town to anybody who could
-- reach the sign-up screen. With a search box there is no longer a reason for
-- it: the picker asks `search_restaurants`, which is SECURITY DEFINER and
-- answers a question rather than handing over a table.
--
-- The one exception is the same one as before: an admin keeps reading the
-- restaurants behind their own tables, because `admin_table_summaries` joins
-- them and their history would otherwise vanish from the dashboard.
-- ---------------------------------------------------------------------------

create or replace function public.admin_has_table_at(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tables t
    where t.restaurant_id = p_restaurant_id
      and t.admin_id = (select auth.uid())
  );
$$;

comment on function public.admin_has_table_at(uuid) is
  'True when the caller already has a table at this restaurant. Keeps their own history readable; grants nothing new.';

revoke execute on function public.admin_has_table_at(uuid) from public, anon;
grant execute on function public.admin_has_table_at(uuid) to authenticated;

drop policy if exists "Admins read restaurants" on public.restaurants;

create policy "Admins read the restaurants behind their tables"
  on public.restaurants for select to authenticated
  using (public.is_owner() or public.admin_has_table_at(id));

-- ---------------------------------------------------------------------------
-- 3. Finding a restaurant by typing its name
--
-- Spelling is free, the name is not. `normalise_business_name` already folds
-- case, diacritics, punctuation and the legal forms, so "SUB TÂMPA",
-- "sub tampa" and "SC Sub Tampa SRL" all reach the same row — and it was
-- written conservatively, for the receipt check, precisely so that two real
-- places never collapse into one.
--
-- Prefix match from three characters. Enough to type ahead and see the branch
-- you want, short of handing over the list to somebody typing single letters.
-- Inactive restaurants are not returned: a place whose contract ended stops
-- taking new tables anyway, in `prevent_table_at_inactive_restaurant`.
-- ---------------------------------------------------------------------------

create or replace function public.search_restaurants(p_query text)
returns table (id uuid, name text, city text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.city
  from public.restaurants r
  where r.is_active
    and length(public.normalise_business_name(p_query)) >= 3
    and public.normalise_business_name(r.name)
        like public.normalise_business_name(p_query) || '%'
  order by r.name, r.city
  limit 10;
$$;

comment on function public.search_restaurants(text) is
  'Restaurants whose name starts with what was typed, spelling-insensitive. Answers a question instead of handing over the list.';

revoke execute on function public.search_restaurants(text) from public, anon;
grant execute on function public.search_restaurants(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The fiscal code stops being optional
--
-- Two new refusals, and both are instructions rather than accusations:
--
--   no_receipt_code      the photo shows no code — it is the pre-bill, not the
--                        fiscal receipt. Ask for the other piece of paper.
--   restaurant_has_no_code  nobody recorded this restaurant's code, so no scan
--                        here can be checked. That is the owner's to fix, and
--                        the message says so.
--
-- The name stays a *supporting* witness: it can still convict a receipt that
-- names a different known restaurant, but its absence is never a refusal. Only
-- the code is required.
-- ---------------------------------------------------------------------------

drop function if exists public.check_scan_receipt(uuid, uuid, text, text);

create function public.check_scan_receipt(
  p_table_id uuid,
  p_admin_id uuid,
  p_receipt_tax_id text,
  p_receipt_name text
)
returns table (verdict text, chosen_name text, receipt_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chosen public.restaurants%rowtype;
  v_tax text;
  v_name text;
  v_named public.restaurants%rowtype;
  v_matches integer;
begin
  select r.* into v_chosen
  from public.tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.id = p_table_id and t.admin_id = p_admin_id;

  if v_chosen.id is null then
    return query select 'no_table'::text, null::text, null::text;
    return;
  end if;

  v_tax := public.normalise_tax_id(p_receipt_tax_id);
  v_name := public.normalise_business_name(p_receipt_name);

  if public.normalise_tax_id(v_chosen.tax_id) is null then
    return query select 'restaurant_has_no_code'::text, v_chosen.name, null::text;
    return;
  end if;

  if v_tax is null then
    return query select 'no_receipt_code'::text, v_chosen.name, null::text;
    return;
  end if;

  if public.normalise_tax_id(v_chosen.tax_id) = v_tax then
    return query select 'ok'::text, v_chosen.name, v_chosen.name;
    return;
  end if;

  -- The codes differ. Name whoever the receipt really belongs to, when that is
  -- one of ours: the common version of this mistake is honest.
  select count(*) into v_matches
  from public.restaurants r2
  where public.normalise_tax_id(r2.tax_id) = v_tax;

  if v_matches = 1 then
    select r2.* into v_named from public.restaurants r2
    where public.normalise_tax_id(r2.tax_id) = v_tax;
    return query select 'mismatch'::text, v_chosen.name, v_named.name;
    return;
  end if;

  -- No row carries that code. The printed name is the only thing left that
  -- might identify the place, and only when it resolves to exactly one known
  -- restaurant — a chain shares a name across towns.
  if v_name is not null then
    select count(*) into v_matches
    from public.restaurants r2
    where public.normalise_business_name(r2.name) = v_name;

    if v_matches = 1 then
      select r2.* into v_named from public.restaurants r2
      where public.normalise_business_name(r2.name) = v_name;
      return query select 'mismatch'::text, v_chosen.name, v_named.name;
      return;
    end if;
  end if;

  return query select
    'mismatch'::text,
    v_chosen.name,
    nullif(trim(coalesce(p_receipt_name, '')), '');
end;
$$;

comment on function public.check_scan_receipt(uuid, uuid, text, text) is
  'Whether the receipt was printed by the restaurant the table names. The fiscal code is required on both sides; the name only supports it.';

revoke execute on function public.check_scan_receipt(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.check_scan_receipt(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The owner's figures, without the perimeter columns
-- ---------------------------------------------------------------------------

create function public.owner_restaurant_stats()
returns table (
  restaurant_id uuid,
  restaurant_name text,
  city text,
  tax_id text,
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
      r.id, r.name, r.city, r.tax_id, r.is_active,
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
