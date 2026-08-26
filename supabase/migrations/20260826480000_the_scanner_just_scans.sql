-- ---------------------------------------------------------------------------
-- The scanner goes back to scanning
--
-- Checking the receipt's fiscal code against the restaurant was built to stop
-- a bill from one place being scanned onto another. It worked, and it was not
-- worth what it cost to live with: every honest photo that did not happen to
-- show the header was read, paid for, and then refused, and a restaurant whose
-- code nobody had typed in could not scan at all.
--
-- The thing it prevented is worth roughly a cent per attempt, once, because
-- somebody refused gets nothing and stops. The thing it broke was the ordinary
-- case, every time. So it goes.
--
-- What stays, because neither has anything to do with reading receipts:
--
--   * `search_restaurants` and `normalise_business_name` — the picker,
--   * `resolve_scan_restaurant` — which restaurant a scan is billed to. It is
--     attribution, not verification: without it a scan spends money that no
--     restaurant's figures ever show, which is the whole point of the scan log.
--     It goes back to answering only that.
--
-- If this is ever rebuilt, the lesson is in the two migrations it replaces:
-- refuse only on contradiction, never on absence, and never charge for finding
-- out that the paper was the wrong one.
-- ---------------------------------------------------------------------------

drop function if exists public.check_scan_receipt(uuid, uuid, text, text);

drop function if exists public.resolve_scan_restaurant(uuid, uuid);

create function public.resolve_scan_restaurant(
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
  'The restaurant a scan is billed to, or null when the table is not that admin''s. Asked before the API call so an unattributable scan never happens.';

revoke execute on function public.resolve_scan_restaurant(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_scan_restaurant(uuid, uuid) to service_role;

-- The stats function selects the column, so it goes before the column does.
drop function if exists public.owner_restaurant_stats();

alter table public.restaurants drop column if exists tax_id;

-- Nothing reads it once the column is gone. `normalise_business_name` stays:
-- the search box is built on it.
drop function if exists public.normalise_tax_id(text);

create function public.owner_restaurant_stats()
returns table (
  restaurant_id uuid,
  restaurant_name text,
  city text,
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
      r.id, r.name, r.city, r.is_active,
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
