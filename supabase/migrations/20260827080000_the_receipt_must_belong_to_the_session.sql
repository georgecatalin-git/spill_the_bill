-- ---------------------------------------------------------------------------
-- A receipt may only be attached to the restaurant whose session it is
--
-- The hole this closes: a customer opens a table at Italien with Italien's own
-- code — legitimately — and then photographs a receipt from somewhere that has
-- never heard of Split. The lines land on Italien's table. The other place gets
-- the product for nothing, and Italien's figures, which are what the owner area
-- exists to make trustworthy, fill up with somebody else's dinner.
--
-- The rule is one line: the fiscal code on the paper must be the fiscal code of
-- the restaurant whose session this is.
--
-- WHERE IT LIVES MATTERS MORE THAN THE RULE. The fiscal code is read from the
-- photo on the server and travels to Postgres with the service key; it never
-- passes through the phone. The columns that hold it carry no UPDATE grant for
-- `authenticated`, so a client cannot write a receipt identity of its own
-- choosing either. The restaurant is derived from the table, never sent.
--
-- What this does NOT cover, and should not be claimed to: items typed in by
-- hand. There is no receipt to compare, and nothing to compare it against.
-- That path costs nothing to serve, which is why it stays open.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. One definition of "the same fiscal code"
--
-- Receipts print it a dozen ways: `CUI: RO 12345678`, `C.I.F.12345678`. The
-- digits are the code. Keeping only digits also survives an OCR reading a full
-- stop as a comma, which is the likeliest way this would otherwise refuse an
-- honest customer.
-- ---------------------------------------------------------------------------

create or replace function public.normalise_tax_id(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), '');
$$;

comment on function public.normalise_tax_id(text) is
  'A fiscal code reduced to its digits, so two spellings of the same code compare equal.';

revoke execute on function public.normalise_tax_id(text) from public, anon;
grant execute on function public.normalise_tax_id(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The restaurant's own fiscal identity
--
-- An active restaurant MUST have a code, because without one no receipt of
-- theirs can ever be validated and every scan there would be refused. Rather
-- than let that happen quietly, the constraint says it: a restaurant with no
-- code cannot be active.
--
-- Existing rows are deactivated instead of being refused, because the owner is
-- asleep and the alternative is a migration that will not apply.
-- ---------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists tax_id text
    check (tax_id is null or length(trim(tax_id)) > 0),
  add column if not exists address text;

update public.restaurants set is_active = false
where tax_id is null and is_active;

alter table public.restaurants
  drop constraint if exists restaurants_active_needs_tax_id;

alter table public.restaurants
  add constraint restaurants_active_needs_tax_id
  check (not is_active or tax_id is not null);

comment on column public.restaurants.tax_id is
  'CUI/CIF. Required to be active: it is the only thing a scanned receipt can be checked against.';

-- ---------------------------------------------------------------------------
-- 3. A session that can go stale
--
-- `tables` is already the session — restaurant, status, participants and the
-- bill all hang off it — so it gains an expiry rather than being duplicated by
-- a second entity with the same job.
--
-- Twelve hours: long enough for the longest dinner and a forgotten table, short
-- enough that a session cannot be kept open for a week and fed a receipt from
-- another evening. The existing statuses are left alone; nothing about this
-- rule needs them renamed, and renaming them would ripple through the whole app
-- for no security gain.
-- ---------------------------------------------------------------------------

alter table public.tables
  add column if not exists expires_at timestamptz
    not null default (now() + interval '12 hours');

comment on column public.tables.expires_at is
  'When this session stops accepting receipts. Claims and settling are unaffected — only new receipts are refused.';

-- ---------------------------------------------------------------------------
-- 4. The receipt's own identity, on the bill
--
-- Written only by `attach_receipt_to_bill`, from values the server read off the
-- photo. The unique index is what makes a receipt single-use: the same paper
-- cannot be walked into a second session.
-- ---------------------------------------------------------------------------

alter table public.bills
  add column if not exists receipt_tax_id text,
  add column if not exists receipt_number text,
  add column if not exists receipt_issued_at timestamptz,
  add column if not exists receipt_total_cents bigint;

create unique index if not exists bills_receipt_identity_key
  on public.bills (receipt_tax_id, receipt_number, receipt_issued_at)
  where receipt_tax_id is not null and receipt_number is not null;

comment on column public.bills.receipt_tax_id is
  'The fiscal code read off the photo, server-side. Never supplied by the client — see the grants below.';

-- ---------------------------------------------------------------------------
-- 5. The client cannot write a receipt identity
--
-- `bills` carried a table-wide UPDATE, and a column-level revoke does nothing
-- while that stands — the trap this project has already been caught by twice.
-- So the table privilege goes and the columns the app legitimately writes come
-- back by name. The four receipt columns are deliberately absent, as is
-- `table_id`: a bill does not move between tables.
-- ---------------------------------------------------------------------------

revoke update on public.bills from authenticated;

grant update (
  status, currency, subtotal_cents, tax_cents, service_charge_cents,
  tip_cents, total_cents, confirmed_total_cents, split_mode,
  receipt_path, completed_at, updated_at
) on public.bills to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The gate
--
-- Called by `parse-receipt` with the service key, with values it read from the
-- photo itself. Every refusal is a sentence somebody at a table can act on.
--
-- The time window is deliberately loose in one direction and tight in the
-- other: a receipt printed up to two hours before the session was opened is
-- normal (the table was started after the food arrived), a receipt from
-- yesterday is not, and a receipt dated in the future is a misread.
-- ---------------------------------------------------------------------------

create or replace function public.attach_receipt_to_bill(
  p_table_id uuid,
  p_receipt_tax_id text,
  p_receipt_number text,
  p_receipt_issued_at timestamptz,
  p_receipt_total_cents bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_table public.tables%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_receipt_code text;
  v_bill_id uuid;
begin
  select * into v_table from public.tables t where t.id = p_table_id;
  if v_table.id is null then
    raise exception 'That table no longer exists.';
  end if;

  select * into v_restaurant from public.restaurants r where r.id = v_table.restaurant_id;

  -- The restaurant is derived here, from the session, and is never accepted
  -- from a caller. Everything below is checked before a bill is touched, so a
  -- refused receipt leaves nothing behind.
  if not v_restaurant.is_active then
    raise exception 'This restaurant is not available on Split at the moment.';
  end if;

  if v_table.status = 'COMPLETED' then
    raise exception 'This table is already closed.';
  end if;

  if v_table.expires_at <= now() then
    raise exception 'This Split session has expired. Scan the table code again to start a new one.';
  end if;

  if public.normalise_tax_id(v_restaurant.tax_id) is null then
    raise exception 'This restaurant has no fiscal code on file, so receipts here cannot be checked.';
  end if;

  v_receipt_code := public.normalise_tax_id(p_receipt_tax_id);

  -- No fallback on purpose. "We could not read it, so we accept" is the hole
  -- every version of this check has eventually been defeated through.
  if v_receipt_code is null then
    raise exception 'We could not find the fiscal code on this receipt. Photograph the whole fiscal receipt and try again.';
  end if;

  if v_receipt_code <> public.normalise_tax_id(v_restaurant.tax_id) then
    raise exception 'This receipt does not belong to the restaurant where you started your Split session.'
      using errcode = '42501';
  end if;

  if p_receipt_issued_at is not null then
    if p_receipt_issued_at > now() + interval '1 hour' then
      raise exception 'The date on this receipt is in the future. Photograph the whole receipt and try again.';
    end if;

    if p_receipt_issued_at < v_table.created_at - interval '2 hours' then
      raise exception 'This receipt is from another day. Split works with the bill you are paying now.';
    end if;
  end if;

  -- The same bill the app would have found or made a moment later; doing it
  -- here is what gives the receipt somewhere to be recorded, and the unique
  -- index somewhere to refuse a second use.
  select b.id into v_bill_id
  from public.bills b
  where b.table_id = p_table_id and b.status <> 'COMPLETED'
  order by b.created_at
  limit 1;

  if v_bill_id is null then
    insert into public.bills (table_id) values (p_table_id) returning id into v_bill_id;
  end if;

  begin
    update public.bills b
    set receipt_tax_id = v_receipt_code,
        receipt_number = nullif(trim(coalesce(p_receipt_number, '')), ''),
        receipt_issued_at = p_receipt_issued_at,
        receipt_total_cents = p_receipt_total_cents
    where b.id = v_bill_id;
  exception when unique_violation then
    raise exception 'This receipt has already been split. Each receipt can be used once.';
  end;

  return v_bill_id;
end;
$$;

comment on function public.attach_receipt_to_bill(uuid, text, text, timestamptz, bigint) is
  'Records a receipt against the session''s bill, and refuses it unless it was printed by that session''s restaurant. Called by parse-receipt with values read from the photo, never from the client.';

revoke execute on function public.attach_receipt_to_bill(uuid, text, text, timestamptz, bigint)
  from public, anon, authenticated;
grant execute on function public.attach_receipt_to_bill(uuid, text, text, timestamptz, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. The owner's card shows the fiscal code again
--
-- It is now the field that decides whether a restaurant can be active at all,
-- so it belongs where the owner already edits the name and the town.
-- ---------------------------------------------------------------------------

drop function if exists public.owner_restaurant_stats();

create function public.owner_restaurant_stats()
returns table (
  restaurant_id uuid,
  restaurant_name text,
  city text,
  tax_id text,
  address text,
  venue_code text,
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
      r.id, r.name, r.city, r.tax_id, r.address, r.venue_code, r.is_active,
      (select count(*) from public.tables t where t.restaurant_id = r.id)::integer,
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
        where s.restaurant_id = r.id and s.created_at >= date_trunc('month', now()))::integer,
      coalesce((select sum(s.cost_micros) from public.receipt_scans s
        where s.restaurant_id = r.id and s.created_at >= date_trunc('month', now())), 0)::bigint
    from public.restaurants r
    order by r.name;
end;
$$;

comment on function public.owner_restaurant_stats() is
  'Per-restaurant usage counts for the owner, with the fiscal code that decides whether it may be active.';

revoke execute on function public.owner_restaurant_stats() from public, anon;
grant execute on function public.owner_restaurant_stats() to authenticated;
