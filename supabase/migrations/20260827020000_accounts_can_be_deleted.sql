-- ---------------------------------------------------------------------------
-- An account can be deleted, and the restaurant keeps its history
--
-- Two ways out: the owner removes an account from the Owner tab, and a person
-- removes their own from Profile. Both destroy the account completely — the
-- login, the name, the email.
--
-- What they must NOT destroy is the restaurant's record. `tables.admin_id`
-- cascaded from `profiles`, so deleting a waiter who left would have taken
-- months of the restaurant's activity with it — every table, and with them the
-- bills, the participants and the claims. That is the evidence the owner area
-- exists to produce, and it belongs to the restaurant rather than to whoever
-- happened to be holding the phone.
--
-- So the link becomes `set null`. The tables stay where they are, with no
-- administrator. Nobody can act on them afterwards — every policy on `tables`
-- reads `admin_id = auth.uid()`, and null matches nobody, which is the correct
-- outcome rather than a gap: the person who could act on them is gone.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. A table outlives its admin
-- ---------------------------------------------------------------------------

alter table public.tables alter column admin_id drop not null;

alter table public.tables drop constraint if exists tables_admin_id_fkey;

alter table public.tables
  add constraint tables_admin_id_fkey
  foreign key (admin_id) references public.profiles (id) on delete set null;

comment on column public.tables.admin_id is
  'Who opened the table. Null once that account is deleted — the restaurant keeps the table, nobody can act on it again.';

-- The insert guards read the profile behind `new.admin_id`, and an insert
-- always has one. Only deletion produces a null, and neither trigger fires
-- then.

-- ---------------------------------------------------------------------------
-- 2. Deleting an account
--
-- Deleting the `auth.users` row is what actually removes an account; the
-- profile follows it through `profiles_id_fkey`, which cascades. Both
-- functions are SECURITY DEFINER for that reason — no client role has any
-- business touching the auth schema.
--
-- Storage is deliberately untouched. Receipt photos live in a bucket, and this
-- project has already learned that deleting storage objects from Postgres
-- raises inside `storage.protect_delete` and takes the parent row down with
-- it. The tables survive here anyway, so their photos are still theirs.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := (select auth.uid());
begin
  if v_id is null then
    raise exception 'Only a signed-in account can be deleted.';
  end if;

  -- The owner would lock themselves out of the one account that can curate
  -- restaurants and link staff, and nothing in the app could put it back.
  if exists (select 1 from public.profiles p where p.id = v_id and p.role = 'owner') then
    raise exception 'The owner account cannot be deleted from the app.';
  end if;

  delete from auth.users u where u.id = v_id;
end;
$$;

comment on function public.delete_my_account() is
  'Removes the caller''s own account. The tables they opened stay with the restaurant.';

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

create or replace function public.owner_delete_admin(p_admin_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can delete an account.';
  end if;

  if p_admin_id = (select auth.uid()) then
    raise exception 'You cannot delete your own account from here.';
  end if;

  -- One owner, by design. Removing another one would either be a mistake or
  -- the last step of losing the app.
  if exists (select 1 from public.profiles p where p.id = p_admin_id and p.role = 'owner') then
    raise exception 'An owner account cannot be deleted.';
  end if;

  delete from auth.users u where u.id = p_admin_id;
end;
$$;

comment on function public.owner_delete_admin(uuid) is
  'Removes somebody else''s account. Refuses the caller''s own and any owner. The tables stay with the restaurant.';

revoke execute on function public.owner_delete_admin(uuid) from public, anon;
grant execute on function public.owner_delete_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. What the owner sees before deciding
--
-- The confirmation names what survives rather than asking "are you sure", the
-- same way `owner_delete_restaurant` names what it destroys.
-- ---------------------------------------------------------------------------

drop function if exists public.owner_list_admins();

create function public.owner_list_admins()
returns table (
  admin_id uuid,
  full_name text,
  email text,
  role text,
  restaurant_id uuid,
  restaurant_name text,
  tables_total integer
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
      p.id, p.full_name, p.email, p.role, p.restaurant_id, r.name,
      (select count(*) from public.tables t where t.admin_id = p.id)::integer
    from public.profiles p
    left join public.restaurants r on r.id = p.restaurant_id
    order by p.full_name, p.email;
end;
$$;

comment on function public.owner_list_admins() is
  'Every account, where it belongs, and how many tables it opened. For the owner''s linking and deletion screen.';

revoke execute on function public.owner_list_admins() from public, anon;
grant execute on function public.owner_list_admins() to authenticated;
