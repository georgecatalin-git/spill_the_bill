-- ---------------------------------------------------------------------------
-- One code per restaurant, and the table is just what the guests call it
--
-- Physical tables were built and are removed the same day. The reason is worth
-- keeping: a restaurant with thirty tables would have had to enter thirty rows
-- and print thirty different stickers before it could use Split at all, and
-- fifty restaurants would have made that somebody's job. The product is meant
-- to be "here is your code, print it as many times as you like".
--
-- Nothing about the security model changes, because the physical table never
-- carried any of it. The restaurant is still derived from the code
-- server-side; the receipt still has to carry that restaurant's fiscal code;
-- the session still expires; a receipt still cannot be used twice.
--
-- What the guest types — "12", "Terasa 3" — lands in `tables.name`, where free
-- text has always lived. It is a label on a session, not an entity: two groups
-- who both type 12 get two separate sessions, because the session's identity
-- is its id and never its name. That is what stops one group walking into
-- another's bill by typing the same number.
-- ---------------------------------------------------------------------------

-- The session no longer points at furniture. Dropped before the table it
-- references, and with no rows anywhere to lose.
alter table public.tables drop column if exists restaurant_table_id;

drop function if exists public.owner_list_tables(uuid);
drop function if exists public.owner_add_table(uuid, text);
drop function if exists public.owner_set_table_active(uuid, boolean);

drop table if exists public.restaurant_tables;

drop function if exists public.generate_table_code();

-- ---------------------------------------------------------------------------
-- The resolver answers for the one kind of code there is again
-- ---------------------------------------------------------------------------

create or replace function public.resolve_venue_code(p_code text)
returns table (restaurant_id uuid, restaurant_name text, city text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.city
  from public.restaurants r
  where upper(trim(r.venue_code)) = upper(trim(coalesce(p_code, '')))
    and r.is_active;
$$;

comment on function public.resolve_venue_code(text) is
  'The restaurant behind a printed code, or nothing. A code that does not exist and a restaurant that is not ACTIVE answer identically, so guessing teaches nothing.';

revoke execute on function public.resolve_venue_code(text) from public, anon;
grant execute on function public.resolve_venue_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Opening a session, without the seat
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

  -- What the guests call their table. Free text on purpose, and never an
  -- identity: two groups who both type 12 get two sessions.
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Please name your table.';
  end if;

  select * into v_match from public.resolve_venue_code(p_venue_code);

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

  insert into public.tables (admin_id, name, restaurant_id)
  values (v_admin, trim(p_name), v_restaurant.id)
  returning * into v_table;

  return query select v_table.id, v_table.name, v_table.invite_code, v_restaurant.name;
end;
$$;

comment on function public.create_table_at_venue(text, text) is
  'Opens a Split session from the restaurant''s printed code. The restaurant is read from the code, never sent by the client; the name is whatever the guests call their table.';

revoke execute on function public.create_table_at_venue(text, text) from public, anon;
grant execute on function public.create_table_at_venue(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The owner's figures lose the count of furniture
-- ---------------------------------------------------------------------------

drop function if exists public.owner_restaurant_stats();

create function public.owner_restaurant_stats()
returns table (
  restaurant_id uuid,
  restaurant_name text,
  city text,
  tax_id text,
  address text,
  venue_code text,
  status text,
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
      r.id, r.name, r.city, r.tax_id, r.address, r.venue_code, r.status, r.is_active,
      (select count(*) from public.tables t where t.restaurant_id = r.id)::integer,
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
        where s.restaurant_id = r.id and s.created_at >= date_trunc('month', now()))::integer,
      coalesce((select sum(s.cost_micros) from public.receipt_scans s
        where s.restaurant_id = r.id and s.created_at >= date_trunc('month', now())), 0)::bigint
    from public.restaurants r
    order by r.name;
end;
$$;

comment on function public.owner_restaurant_stats() is
  'Per-restaurant usage counts for the owner, with the lifecycle status and the fiscal code that gates it.';

revoke execute on function public.owner_restaurant_stats() from public, anon;
grant execute on function public.owner_restaurant_stats() to authenticated;
