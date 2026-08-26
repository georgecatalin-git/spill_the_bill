-- ---------------------------------------------------------------------------
-- A hidden restaurant stops taking new tables
--
-- `is_active = false` is how a place that no longer has a contract leaves the
-- app while keeping its history — which is the whole point, because that
-- history is what the owner area exists to show.
--
-- Until now that was a screen-level rule: the picker filtered on `is_active`,
-- and nothing else did. The database happily accepted a table pointing at a
-- cancelled restaurant. This project's rule is the opposite way round — the
-- database owns it and the app displays it — so the refusal belongs here.
--
-- INSERT only, deliberately, for two reasons:
--
--   * Tables that already exist at a restaurant must keep working. Hiding a
--     place in the middle of somebody's dinner should not break their bill.
--   * `owner_merge_restaurants` moves tables with an UPDATE, and consolidating
--     two dead entries into one is a reasonable thing to want.
--
-- SECURITY DEFINER because a trigger function is not one unless it says so,
-- and a plain one runs as the caller.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_table_at_inactive_restaurant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.restaurants r
    where r.id = new.restaurant_id and r.is_active
  ) then
    raise exception 'That restaurant is no longer taking new tables.'
      using errcode = '23000';
  end if;

  return new;
end;
$$;

comment on function public.prevent_table_at_inactive_restaurant() is
  'Refuses a new table at a restaurant that has been hidden. Existing tables and merges are untouched.';

-- EXECUTE is granted to PUBLIC by default; triggers keep working regardless
-- because they run as the table owner.
revoke execute on function public.prevent_table_at_inactive_restaurant()
  from public, anon, authenticated;

drop trigger if exists tables_require_active_restaurant on public.tables;
create trigger tables_require_active_restaurant
  before insert on public.tables
  for each row execute function public.prevent_table_at_inactive_restaurant();
