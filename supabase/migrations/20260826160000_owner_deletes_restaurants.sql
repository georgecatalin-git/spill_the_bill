-- ---------------------------------------------------------------------------
-- Removing a restaurant for good
--
-- Hiding a restaurant covers the common case — a place that stops using Split
-- should keep its history, because that history is the evidence the owner area
-- exists to produce. But a contract that ends for good, or a row added by
-- mistake, has nowhere to go, and leaving dead entries in the list makes the
-- figures harder to read rather than easier.
--
-- So: a real delete, owner only, and it takes the tables with it. Everything
-- below `tables` already cascades — participants, bills, bill_items,
-- item_claims — so deleting the tables is enough to leave nothing orphaned.
--
-- Note what this deliberately does NOT do: it does not stand the completed-bill
-- freeze triggers down. Those guards refuse a claim or a line being *edited* on
-- a closed bill; a cascade from the parent going away is a different thing, and
-- the guards already let it through (`prevent_completed_claim_delete` says as
-- much in its own comment). If that ever stops being true, this function should
-- start failing loudly rather than be given a way around them.
--
-- There is still no DELETE grant on `restaurants` for `authenticated`. This
-- function is the only route, which is what keeps the check in one place.
-- ---------------------------------------------------------------------------

create or replace function public.owner_delete_restaurant(p_restaurant_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can delete a restaurant.';
  end if;

  if not exists (select 1 from public.restaurants where id = p_restaurant_id) then
    raise exception 'That restaurant no longer exists.';
  end if;

  -- Cascades to participants, bills, bill_items and item_claims.
  delete from public.tables where restaurant_id = p_restaurant_id;

  delete from public.restaurants where id = p_restaurant_id;
end;
$$;

comment on function public.owner_delete_restaurant(uuid) is
  'Permanently removes a restaurant and every table, bill and claim behind it. Owner only. Prefer is_active = false unless the history is genuinely unwanted.';

revoke execute on function public.owner_delete_restaurant(uuid) from public, anon;
grant execute on function public.owner_delete_restaurant(uuid) to authenticated;
