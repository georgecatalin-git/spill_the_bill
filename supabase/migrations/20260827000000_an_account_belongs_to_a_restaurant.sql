-- ---------------------------------------------------------------------------
-- An account belongs to a restaurant, and cannot open a table anywhere else
--
-- Everything tried before this checked *whether the choice was right*: a list
-- the owner curated, an assignment table, a location perimeter, the fiscal code
-- on the receipt. Every one of them sat on top of a choice the client made
-- freely, which is why every one of them could be got around or got in the way.
--
-- This removes the choice. The account is the restaurant's own — its staff sign
-- in to it — so the restaurant is a property of the profile, not something sent
-- with the request. A client cannot lie about a value it never supplies.
--
-- That makes it the first real boundary this problem has had. The perimeter was
-- a guard rail because the position came off the phone; the search box proves
-- nothing because typing a name is free. This is neither: `tables.restaurant_id`
-- is checked against the profile, in Postgres, on every insert.
--
-- The owner stays exempt. They demo wherever the meeting is, and they are the
-- one paying for the API calls.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The link
--
-- `on delete set null` rather than cascade: deleting a restaurant must not
-- delete the people who worked there. They end up unlinked, which is exactly
-- what they are.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists restaurant_id uuid references public.restaurants (id)
    on delete set null;

comment on column public.profiles.restaurant_id is
  'The restaurant this account belongs to. Null for the owner and for an account nobody has linked yet. Writable only through owner_set_admin_restaurant.';

create index if not exists profiles_restaurant_id_idx
  on public.profiles (restaurant_id);

-- Deliberately NOT granted. `profiles` had INSERT/UPDATE revoked and the safe
-- columns granted back by name (see 20260826000000), and a new column stays
-- unwritable until it is named — which is the behaviour wanted here, so no
-- grant is added. An admin who could set this could put themselves at any
-- restaurant, which is the whole thing being prevented.
--
-- SELECT is still table-wide, so an account reads its own restaurant_id
-- through the RLS policy that already restricts profiles to `id = auth.uid()`.

-- ---------------------------------------------------------------------------
-- 2. Reading the restaurant behind your own account
--
-- The SELECT policy on `restaurants` is `is_owner() or admin_has_table_at(id)`.
-- A newly linked account has no tables yet, so without this it could not read
-- the name of the restaurant it belongs to — the New Table screen would show a
-- blank where the restaurant should be.
-- ---------------------------------------------------------------------------

create or replace function public.my_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.restaurant_id from public.profiles p where p.id = (select auth.uid());
$$;

comment on function public.my_restaurant_id() is
  'The restaurant the caller''s account belongs to, or null. The one value the client never gets to send.';

revoke execute on function public.my_restaurant_id() from public, anon;
grant execute on function public.my_restaurant_id() to authenticated;

drop policy if exists "Admins read the restaurants behind their tables" on public.restaurants;

create policy "Admins read their own restaurant and the ones behind their tables"
  on public.restaurants for select to authenticated
  using (
    public.is_owner()
    or id = public.my_restaurant_id()
    or public.admin_has_table_at(id)
  );

-- ---------------------------------------------------------------------------
-- 3. The refusal
--
-- INSERT only, like the guard beside it: moving an account to another
-- restaurant, or unlinking it, must not break a dinner already under way.
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
  'A table may only be opened at the restaurant its account belongs to. The owner is exempt.';

revoke execute on function public.prevent_table_at_another_restaurant()
  from public, anon, authenticated;

drop trigger if exists tables_belong_to_the_account_restaurant on public.tables;
create trigger tables_belong_to_the_account_restaurant
  before insert on public.tables
  for each row execute function public.prevent_table_at_another_restaurant();

-- ---------------------------------------------------------------------------
-- 4. What the owner needs in order to link an account
--
-- `profiles` is restricted to `id = auth.uid()`, so there is no query the owner
-- could write that would see another account. This returns the accounts and
-- where each one belongs — no password material, nothing about anybody's bills.
-- ---------------------------------------------------------------------------

create or replace function public.owner_list_admins()
returns table (
  admin_id uuid,
  full_name text,
  email text,
  role text,
  restaurant_id uuid,
  restaurant_name text
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
    select p.id, p.full_name, p.email, p.role, p.restaurant_id, r.name
    from public.profiles p
    left join public.restaurants r on r.id = p.restaurant_id
    order by p.full_name, p.email;
end;
$$;

comment on function public.owner_list_admins() is
  'Every account and the restaurant it belongs to, for the owner''s linking screen.';

revoke execute on function public.owner_list_admins() from public, anon;
grant execute on function public.owner_list_admins() to authenticated;

create or replace function public.owner_set_admin_restaurant(
  p_admin_id uuid,
  p_restaurant_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can link an account to a restaurant.';
  end if;

  -- Null unlinks, which is how an account is retired without deleting the
  -- tables it opened.
  update public.profiles p
  set restaurant_id = p_restaurant_id
  where p.id = p_admin_id;
end;
$$;

comment on function public.owner_set_admin_restaurant(uuid, uuid) is
  'Links one account to one restaurant, or unlinks it with null. The only way this column is ever written.';

revoke execute on function public.owner_set_admin_restaurant(uuid, uuid) from public, anon;
grant execute on function public.owner_set_admin_restaurant(uuid, uuid) to authenticated;
