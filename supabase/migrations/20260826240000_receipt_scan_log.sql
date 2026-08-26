-- ---------------------------------------------------------------------------
-- What each restaurant costs to serve
--
-- Reading a receipt is the only part of Split that costs money per use, and it
-- is billed by the token. A place with twenty tables and three sittings a night
-- can run through more in API calls than it pays in subscription, and today the
-- only way to find that out is the Anthropic invoice at the end of the month —
-- by which point it has already happened, to a restaurant whose name the
-- invoice does not mention.
--
-- So every scan is written down against the restaurant that caused it, with the
-- tokens the API actually reported. Not an estimate: `parse-receipt` already
-- receives `usage` in the response and throws it away.
--
-- Cost is stored in **micro-dollars** (millionths). This project keeps money in
-- integers and never in floats; cents are simply too coarse here, because a
-- scan costs around five of them and the interesting differences are smaller
-- than one.
--
-- Failed scans are recorded too. A refusal or a truncated answer still spends
-- tokens, and a restaurant whose photos keep failing is expensive precisely
-- because they keep failing.
-- ---------------------------------------------------------------------------

create table if not exists public.receipt_scans (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  -- The bill and the admin are context, not the point; both may go away while
  -- the cost stays real, so neither cascades the row out of existence.
  table_id uuid references public.tables (id) on delete set null,
  admin_id uuid references public.profiles (id) on delete set null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  succeeded boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.receipt_scans is
  'One row per receipt read, with the tokens the API reported. cost_micros is millionths of a dollar — integer money, like everything else here.';

create index if not exists receipt_scans_restaurant_month_idx
  on public.receipt_scans (restaurant_id, created_at desc);

-- Nobody reaches this table directly. The Edge Function writes it with the
-- service key; the owner reads it through owner_restaurant_stats, which is
-- SECURITY DEFINER. Revoking here rather than later, because a fresh table on
-- Supabase starts with anon and authenticated holding every verb — the lesson
-- from 20260826220000.
alter table public.receipt_scans enable row level security;

revoke all on public.receipt_scans from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The owner's figures gain two columns
--
-- Deliberately "this month" rather than all time: the question the number
-- answers is "is this place profitable right now", and the subscription is
-- monthly. An all-time total would keep a restaurant looking expensive long
-- after a quiet month fixed it.
-- ---------------------------------------------------------------------------

-- The return type gains two columns, and Postgres will not replace a function
-- whose OUT parameters changed — it has to go first. Dropping also drops its
-- grants, which is why they are re-issued below.
drop function if exists public.owner_restaurant_stats();

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

  -- Counts and what they cost. Still no amounts from anyone's bill, no
  -- participant names, no receipt lines.
  return query
    select
      r.id,
      r.name,
      r.city,
      r.is_active,
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
  'Per-restaurant usage counts and this month''s scanning cost, for the owner. Refuses anyone else, and returns no customer money and no personal data.';

revoke execute on function public.owner_restaurant_stats() from public, anon;
grant execute on function public.owner_restaurant_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- How a scan gets written down
--
-- SECURITY DEFINER so the Edge Function does not need table privileges of its
-- own, and so the restaurant is derived from the table id server-side rather
-- than trusted from the caller. Granted to `service_role` only: this is the
-- function's own door, not something a signed-in admin should be able to push
-- numbers through.
-- ---------------------------------------------------------------------------

create or replace function public.record_receipt_scan(
  p_table_id uuid,
  p_admin_id uuid,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_micros bigint,
  p_succeeded boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_restaurant uuid;
begin
  select t.restaurant_id into v_restaurant
  from public.tables t where t.id = p_table_id;

  -- A scan started before the table existed, or against one already deleted,
  -- has nowhere to be attributed. Losing the row is better than raising: the
  -- admin is mid-scan and the receipt matters more than the bookkeeping.
  if v_restaurant is null then
    return;
  end if;

  insert into public.receipt_scans (
    restaurant_id, table_id, admin_id, model,
    input_tokens, output_tokens, cost_micros, succeeded
  ) values (
    v_restaurant, p_table_id, p_admin_id, p_model,
    greatest(p_input_tokens, 0), greatest(p_output_tokens, 0),
    greatest(p_cost_micros, 0), p_succeeded
  );
end;
$$;

comment on function public.record_receipt_scan(uuid, uuid, text, integer, integer, bigint, boolean) is
  'Writes one scan against the restaurant behind the table. Called by the parse-receipt Edge Function with the service key.';

revoke execute on function public.record_receipt_scan(uuid, uuid, text, integer, integer, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.record_receipt_scan(uuid, uuid, text, integer, integer, bigint, boolean)
  to service_role;
