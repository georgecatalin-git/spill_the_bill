-- ---------------------------------------------------------------------------
-- Ask about the fiscal code before spending money, not after
--
-- With the code now required on both sides, a restaurant whose code the owner
-- has not recorded refuses every scan at it. Discovering that *after* the API
-- call would burn tokens on every attempt, over and over, for a
-- misconfiguration nobody at the table can fix.
--
-- So the pre-flight question grows a second half. `resolve_scan_restaurant`
-- already answered "which restaurant, if any" before the photo is sent; it now
-- also says whether that restaurant has a code to compare against. The Edge
-- Function refuses on either, and nothing has been spent.
-- ---------------------------------------------------------------------------

drop function if exists public.resolve_scan_restaurant(uuid, uuid);

create function public.resolve_scan_restaurant(
  p_table_id uuid,
  p_admin_id uuid
)
returns table (restaurant_id uuid, has_tax_id boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, public.normalise_tax_id(r.tax_id) is not null
  from public.tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.id = p_table_id and t.admin_id = p_admin_id;
$$;

comment on function public.resolve_scan_restaurant(uuid, uuid) is
  'The restaurant a scan would be billed to and whether its fiscal code is on file. No rows when the table is not that admin''s. Asked before the API call.';

revoke execute on function public.resolve_scan_restaurant(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_scan_restaurant(uuid, uuid) to service_role;
