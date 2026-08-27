-- ---------------------------------------------------------------------------
-- A restaurant's own account cannot be sent somewhere else by a code
--
-- The venue code exists for a customer, who belongs nowhere and needs the
-- sticker to say where they are sitting. An account that already belongs to a
-- restaurant is a different thing: it is that restaurant's identity, shared by
-- its staff, not a person who might go out to dinner elsewhere. Letting
-- Italien's account open a table at Le Pressoir would put one client's activity
-- in another client's figures, which are the numbers the owner area exists to
-- keep honest.
--
-- So the account's own restaurant wins over any code presented to it. The
-- owner stays exempt, as everywhere else: they demo wherever the meeting is.
--
-- This is enforced here rather than only in the screen for the usual reason —
-- the screen is a convenience and the database is the boundary.
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

  select * into v_restaurant
  from public.restaurants r
  where upper(trim(r.venue_code)) = upper(trim(coalesce(p_venue_code, '')));

  -- One message for a wrong code and for a hidden restaurant. Which of the two
  -- it is tells a stranger whether they guessed a real code.
  if v_restaurant.id is null or not v_restaurant.is_active then
    raise exception 'That code does not open a table here.';
  end if;

  select * into v_profile from public.profiles p where p.id = v_admin;

  if v_profile.role <> 'owner'
     and v_profile.restaurant_id is not null
     and v_profile.restaurant_id <> v_restaurant.id then
    raise exception 'This account belongs to another restaurant, so it opens tables only there.'
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
  'Opens a table at the restaurant whose printed code was scanned. Refused for an account that already belongs to a different restaurant; the owner is exempt.';

revoke execute on function public.create_table_at_venue(text, text) from public, anon;
grant execute on function public.create_table_at_venue(text, text) to authenticated;
