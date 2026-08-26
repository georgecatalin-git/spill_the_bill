-- ---------------------------------------------------------------------------
-- Merging two restaurants that turned out to be one
--
-- The free-text field this list replaced left real duplicates behind:
-- "Italien" and "italiwn" are the same place typed twice, and no amount of
-- renaming fixes that on its own — renaming one onto the other just collides
-- with the unique index, which is the index doing its job.
--
-- Merging is the operation that was actually missing: move the tables across,
-- then drop the row that is now empty.
--
-- It is a function rather than a policy because `authenticated` deliberately
-- has no DELETE on `restaurants` — a place with history behind it should be
-- deactivated, not removed. Merging is the one exception, and it is safe
-- precisely because the tables are carried over first rather than orphaned.
-- ---------------------------------------------------------------------------

create or replace function public.owner_merge_restaurants(p_source uuid, p_target uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can merge restaurants.';
  end if;

  if p_source = p_target then
    raise exception 'Pick a different restaurant to merge into.';
  end if;

  if not exists (select 1 from public.restaurants where id = p_source) then
    raise exception 'That restaurant no longer exists.';
  end if;

  if not exists (select 1 from public.restaurants where id = p_target) then
    raise exception 'The restaurant to merge into no longer exists.';
  end if;

  -- Order matters: the tables move first, so the delete below can never
  -- orphan one. `tables.restaurant_id` is NOT NULL and references this row.
  update public.tables
    set restaurant_id = p_target
    where restaurant_id = p_source;

  delete from public.restaurants where id = p_source;
end;
$$;

comment on function public.owner_merge_restaurants(uuid, uuid) is
  'Moves every table from one restaurant to another and removes the empty one. Owner only.';

revoke execute on function public.owner_merge_restaurants(uuid, uuid) from public, anon;
grant execute on function public.owner_merge_restaurants(uuid, uuid) to authenticated;
