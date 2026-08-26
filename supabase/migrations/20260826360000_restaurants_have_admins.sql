-- ---------------------------------------------------------------------------
-- A restaurant has admins, and only they may open tables there
--
-- Until now nothing tied an account to a restaurant. Sign-up is open, and the
-- picker filtered on `is_active` alone — so anyone who could reach the sign-up
-- screen could pick any restaurant on the list, start a table, and scan
-- receipts. Scanning is the one part of Split that costs money per use, so an
-- unassigned account was uncapped spending; worse, the cost landed on the
-- usage figures of a restaurant that had nothing to do with it, which is
-- exactly the number the owner area exists to make trustworthy.
--
-- The link is a row in `restaurant_admins`, written by the owner when the
-- contract is signed. Sign-up stays open on purpose: a prospect makes an
-- account during the demo, and the account should be *useless* until assigned,
-- not impossible to create.
--
-- Three separate things follow, and only the second is a real boundary:
--
--   * the picker shows the restaurants you may use (`list_my_restaurants`),
--   * Postgres refuses a table anywhere else (the trigger below),
--   * the list of restaurants stops being readable by every account.
--
-- The middle one is what protects anything. This project has already learned
-- once that filtering in a service leaves the database happily accepting the
-- row — see `prevent_table_at_inactive_restaurant`, which exists for that
-- reason.
--
-- The owner is exempt throughout. They pay for the API calls, they run the
-- demos, and making them assign themselves before showing the app to anyone
-- would be friction with nothing on the other side of it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The link itself
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_admins (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  admin_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, admin_id)
);

comment on table public.restaurant_admins is
  'Which account may open tables at which restaurant. Written by the owner; nobody reaches this table directly.';

-- The primary key already covers (restaurant_id, admin_id); this is the other
-- direction, which is the one the picker asks for.
create index if not exists restaurant_admins_admin_idx
  on public.restaurant_admins (admin_id);

alter table public.restaurant_admins enable row level security;

-- Everything goes through the SECURITY DEFINER functions below, so no role
-- needs a privilege here at all. Revoking rather than trusting the default:
-- a fresh table on Supabase starts with anon and authenticated holding every
-- verb — the lesson from 20260826220000.
revoke all on public.restaurant_admins from anon, authenticated;

-- No policy is created deliberately. RLS with no policy denies everything,
-- and there is no read this table owes a client directly.

-- ---------------------------------------------------------------------------
-- 2. The two questions everything else asks
--
-- Both are SECURITY DEFINER, for the same reason `is_owner()` is: they are
-- called from inside RLS policies and from a trigger, and neither caller
-- should need a privilege on the tables being consulted. It also keeps the
-- policy on `restaurants` from having to reach into `tables`, which would put
-- one table's policy inside another's.
-- ---------------------------------------------------------------------------

create or replace function public.admin_may_use_restaurant(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_owner() or exists (
    select 1 from public.restaurant_admins ra
    where ra.restaurant_id = p_restaurant_id
      and ra.admin_id = (select auth.uid())
  );
$$;

comment on function public.admin_may_use_restaurant(uuid) is
  'True when the caller may open tables at this restaurant. The authorisation boundary for the whole feature.';

revoke execute on function public.admin_may_use_restaurant(uuid) from public, anon;
grant execute on function public.admin_may_use_restaurant(uuid) to authenticated;

-- Deliberately NOT part of the question above. An admin whose assignment is
-- withdrawn keeps *reading* the restaurant behind their old tables, because
-- `admin_table_summaries` joins it and their history would otherwise vanish
-- from the dashboard. They do not thereby keep the right to open new ones —
-- if this counted as permission, revoking access would be undone by the first
-- table the admin ever created there.
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

-- ---------------------------------------------------------------------------
-- 3. Existing assignments, inferred from what has already happened
--
-- Every admin who has ever opened a table at a restaurant is assigned to it.
-- Without this the migration would lock everybody — including the owner's own
-- historical tables — out of the places they are already using.
-- ---------------------------------------------------------------------------

insert into public.restaurant_admins (restaurant_id, admin_id)
select distinct t.restaurant_id, t.admin_id
from public.tables t
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. The list of restaurants stops being public to every account
--
-- It was `using (true)`, which made the customer list readable by anyone who
-- could sign up. The names and towns of the places paying for Split are not a
-- security matter, but they are not a stranger's business either, and the
-- policy no longer needs to be that wide.
-- ---------------------------------------------------------------------------

drop policy if exists "Admins read restaurants" on public.restaurants;

create policy "Admins read the restaurants they may use"
  on public.restaurants for select to authenticated
  using (
    public.admin_may_use_restaurant(id)
    or public.admin_has_table_at(id)
  );

-- ---------------------------------------------------------------------------
-- 5. Postgres refuses a table at a restaurant the admin is not assigned to
--
-- Separate from `prevent_table_at_inactive_restaurant` rather than folded into
-- it: they refuse for different reasons and a person reading the error should
-- be told which. Both fire before insert, and both are INSERT only — tables
-- that already exist keep working, so withdrawing access in the middle of
-- somebody's dinner does not break their bill.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_table_at_unassigned_restaurant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The check is on the row's own admin rather than on auth.uid(): the trigger
  -- runs as definer, and a table is always created by the admin it names.
  if not exists (
    select 1 from public.restaurant_admins ra
    where ra.restaurant_id = new.restaurant_id
      and ra.admin_id = new.admin_id
  ) and not exists (
    select 1 from public.profiles p
    where p.id = new.admin_id and p.role = 'owner'
  ) then
    raise exception 'Your account does not have access to that restaurant.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.prevent_table_at_unassigned_restaurant() is
  'Refuses a new table at a restaurant the admin has not been given access to. The owner is exempt.';

revoke execute on function public.prevent_table_at_unassigned_restaurant()
  from public, anon, authenticated;

drop trigger if exists tables_require_assigned_restaurant on public.tables;
create trigger tables_require_assigned_restaurant
  before insert on public.tables
  for each row execute function public.prevent_table_at_unassigned_restaurant();

-- ---------------------------------------------------------------------------
-- 6. What the picker asks for
--
-- Assignment AND active, which is exactly what the two triggers together
-- allow. A function rather than a filtered select, so the picker cannot drift
-- away from the rule the database enforces.
-- ---------------------------------------------------------------------------

create or replace function public.list_my_restaurants()
returns setof public.restaurants
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.restaurants r
  where r.is_active
    and public.admin_may_use_restaurant(r.id)
  order by r.name;
$$;

comment on function public.list_my_restaurants() is
  'The restaurants the caller may start a table at. Empty for an account nobody has given access to.';

revoke execute on function public.list_my_restaurants() from public, anon;
grant execute on function public.list_my_restaurants() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. What the owner needs in order to assign
--
-- `profiles` is restricted to `id = auth.uid()` by RLS, so the owner cannot
-- see another account at all without a definer function. This returns the
-- accounts and what each one already has — no password material, and nothing
-- about anybody's bills.
-- ---------------------------------------------------------------------------

create or replace function public.owner_list_admins()
returns table (
  admin_id uuid,
  full_name text,
  email text,
  role text,
  restaurant_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can list the accounts.';
  end if;

  return query
    select
      p.id,
      p.full_name,
      p.email,
      p.role,
      coalesce(
        (select array_agg(ra.restaurant_id order by ra.created_at)
         from public.restaurant_admins ra where ra.admin_id = p.id),
        '{}'::uuid[]
      )
    from public.profiles p
    order by p.full_name, p.email;
end;
$$;

comment on function public.owner_list_admins() is
  'Every admin account and the restaurants it has been given, for the owner''s assignment screen.';

revoke execute on function public.owner_list_admins() from public, anon;
grant execute on function public.owner_list_admins() to authenticated;

create or replace function public.owner_assign_restaurant(
  p_restaurant_id uuid,
  p_admin_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can give access to a restaurant.';
  end if;

  insert into public.restaurant_admins (restaurant_id, admin_id)
  values (p_restaurant_id, p_admin_id)
  on conflict do nothing;
end;
$$;

comment on function public.owner_assign_restaurant(uuid, uuid) is
  'Gives one account access to one restaurant. Idempotent.';

revoke execute on function public.owner_assign_restaurant(uuid, uuid) from public, anon;
grant execute on function public.owner_assign_restaurant(uuid, uuid) to authenticated;

create or replace function public.owner_revoke_restaurant(
  p_restaurant_id uuid,
  p_admin_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can take access to a restaurant away.';
  end if;

  delete from public.restaurant_admins ra
  where ra.restaurant_id = p_restaurant_id and ra.admin_id = p_admin_id;
end;
$$;

comment on function public.owner_revoke_restaurant(uuid, uuid) is
  'Takes one account''s access away. Tables that already exist keep working; only new ones are refused.';

revoke execute on function public.owner_revoke_restaurant(uuid, uuid) from public, anon;
grant execute on function public.owner_revoke_restaurant(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The scan has to belong to a table, and to the caller's own table
--
-- `table_id` was optional in `parse-receipt`: a scan sent without one ran,
-- cost money, and `record_receipt_scan` dropped the row because there was no
-- restaurant to attribute it to. Making it merely mandatory would not be
-- enough — a made-up uuid resolves to no restaurant and lands in the same
-- silent hole — so the Edge Function now asks this first and refuses when the
-- answer is null.
--
-- service_role only. The Edge Function holds the service key; nobody else
-- should be asking, and the owner has no reason to.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_scan_restaurant(
  p_table_id uuid,
  p_admin_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.restaurant_id
  from public.tables t
  where t.id = p_table_id and t.admin_id = p_admin_id;
$$;

comment on function public.resolve_scan_restaurant(uuid, uuid) is
  'The restaurant a scan should be billed to, or null when the table is not that admin''s. Asked before the API call, not after.';

revoke execute on function public.resolve_scan_restaurant(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_scan_restaurant(uuid, uuid) to service_role;
