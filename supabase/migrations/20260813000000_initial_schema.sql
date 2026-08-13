-- Split the Bill — initial schema.
--
-- Core idea: the receipt is the single source of truth. Guests claim the items
-- they consumed and every person's share is DERIVED from those claims, never
-- stored. That way the numbers cannot drift apart.
--
-- Money is stored as integer cents everywhere. No floats.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Unambiguous alphabet: no O/0 or I/1 to mistype when read out loud.
create or replace function public.generate_invite_code(p_length integer default 6)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempts integer := 0;
begin
  loop
    v_code := '';
    for i in 1..p_length loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;

    exit when not exists (select 1 from public.tables where invite_code = v_code);

    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      raise exception 'Could not generate a unique invite code';
    end if;
  end loop;

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per ADMIN. Guests never get a profile.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Admin profile. Credentials stay in auth.users; never store passwords here.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Mirror new admins from auth.users into profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'there'), '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill admins that signed up before this migration.
insert into public.profiles (id, full_name, email)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, 'there'), '@', 1)),
  u.email
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- tables — one restaurant table / session
-- ---------------------------------------------------------------------------

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  restaurant_name text,
  status text not null default 'WAITING_FOR_GUESTS'
    check (status in ('WAITING_FOR_GUESTS', 'BILL_IN_PROGRESS', 'FULLY_ASSIGNED', 'COMPLETED')),
  invite_code text not null unique default public.generate_invite_code(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tables_set_updated_at
  before update on public.tables
  for each row execute function public.set_updated_at();

create index if not exists tables_admin_id_idx on public.tables (admin_id);
create index if not exists tables_invite_code_idx on public.tables (invite_code);

-- ---------------------------------------------------------------------------
-- participants — everyone at the table, admin included. NOT auth users.
-- ---------------------------------------------------------------------------

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_admin boolean not null default false,
  -- Secret that identifies a returning guest on their own device. Never sent
  -- to other participants; see the column-level revoke further down.
  session_token text unique,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  is_active boolean not null default true
);

comment on column public.participants.session_token is
  'Opaque guest secret. Readable only by the server-side/definer functions.';

create index if not exists participants_table_id_idx on public.participants (table_id);
create index if not exists participants_session_token_idx on public.participants (session_token);

-- One admin participant per table, so the host cannot be added twice.
create unique index if not exists participants_one_admin_per_table_idx
  on public.participants (table_id)
  where is_admin;

-- ---------------------------------------------------------------------------
-- bills
-- ---------------------------------------------------------------------------

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables (id) on delete cascade,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'OPEN', 'FULLY_ASSIGNED', 'COMPLETED')),
  currency text not null default 'EUR',
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  service_charge_cents bigint not null default 0 check (service_charge_cents >= 0),
  tip_cents bigint not null default 0 check (tip_cents >= 0),
  -- Kept as its own column on purpose: a scanned or hand-typed receipt total
  -- may legitimately differ from the parts, and the admin's confirmed figure
  -- must never be silently overwritten.
  total_cents bigint not null default 0 check (total_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

create index if not exists bills_table_id_idx on public.bills (table_id);

-- ---------------------------------------------------------------------------
-- bill_items
-- ---------------------------------------------------------------------------

create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_price_cents bigint not null check (total_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.bill_items.total_price_cents is
  'Line total. Usually quantity * unit_price_cents, but stored so the admin can correct a receipt.';

create trigger bill_items_set_updated_at
  before update on public.bill_items
  for each row execute function public.set_updated_at();

create index if not exists bill_items_bill_id_idx on public.bill_items (bill_id);

-- ---------------------------------------------------------------------------
-- item_claims — the heart of the app
-- ---------------------------------------------------------------------------

create table if not exists public.item_claims (
  id uuid primary key default gen_random_uuid(),
  bill_item_id uuid not null references public.bill_items (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bill_item_id, participant_id)
);

comment on table public.item_claims is
  'One row per participant per item. Two colas for one person is quantity 2, not two rows.';

create trigger item_claims_set_updated_at
  before update on public.item_claims
  for each row execute function public.set_updated_at();

create index if not exists item_claims_bill_item_id_idx on public.item_claims (bill_item_id);
create index if not exists item_claims_participant_id_idx on public.item_claims (participant_id);

-- ---------------------------------------------------------------------------
-- Money maths
-- ---------------------------------------------------------------------------

-- How much of an item's price is spoken for.
--
-- Two kinds of line exist, and they behave differently:
--   quantity > 1  -> unit based. Units are counted out and cannot be
--                    over-claimed; only claimed units count as assigned.
--   quantity = 1  -> shareable. Any number of people may claim it (one pizza
--                    split three ways) and the whole line counts as assigned.
create or replace function public.item_assigned_cents(
  p_quantity integer,
  p_unit_price_cents bigint,
  p_total_price_cents bigint,
  p_claimed_quantity bigint
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_claimed_quantity, 0) <= 0 then 0
    when p_quantity > 1 then least(p_claimed_quantity, p_quantity) * p_unit_price_cents
    else p_total_price_cents
  end;
$$;

create or replace view public.bill_item_assignments
with (security_invoker = true) as
select
  bi.id as bill_item_id,
  bi.bill_id,
  bi.name,
  bi.quantity,
  bi.unit_price_cents,
  bi.total_price_cents,
  coalesce(sum(ic.quantity), 0)::bigint as claimed_quantity,
  public.item_assigned_cents(
    bi.quantity, bi.unit_price_cents, bi.total_price_cents, coalesce(sum(ic.quantity), 0)::bigint
  ) as assigned_cents
from public.bill_items bi
left join public.item_claims ic on ic.bill_item_id = bi.id
group by bi.id;

-- What each claimant owes for each item.
--
-- Splits by the largest-remainder method: every leftover cent goes to the
-- claimant with the biggest fractional part (ties broken by participant id so
-- the result is deterministic). The parts always add back up to the assigned
-- amount, so cents are never lost or invented.
create or replace view public.item_claim_shares
with (security_invoker = true) as
with claim_base as (
  select
    ic.bill_item_id,
    ic.participant_id,
    ic.quantity,
    a.assigned_cents,
    a.claimed_quantity,
    (a.assigned_cents * ic.quantity) / a.claimed_quantity as whole_cents,
    (a.assigned_cents * ic.quantity) % a.claimed_quantity as remainder
  from public.item_claims ic
  join public.bill_item_assignments a on a.bill_item_id = ic.bill_item_id
  where a.claimed_quantity > 0
),
ranked as (
  select
    cb.*,
    row_number() over (
      partition by cb.bill_item_id
      order by cb.remainder desc, cb.participant_id
    ) as rn,
    cb.assigned_cents - sum(cb.whole_cents) over (partition by cb.bill_item_id) as leftover_cents
  from claim_base cb
)
select
  bill_item_id,
  participant_id,
  (whole_cents + case when rn <= leftover_cents then 1 else 0 end)::bigint as amount_cents
from ranked;

-- Derived, never stored: a participant total is always the sum of their shares.
create or replace view public.participant_totals
with (security_invoker = true) as
select
  p.id as participant_id,
  p.table_id,
  p.name,
  coalesce(sum(s.amount_cents), 0)::bigint as total_cents
from public.participants p
left join public.item_claim_shares s on s.participant_id = p.id
group by p.id;

-- Bill total = assigned + remaining, by construction.
create or replace view public.bill_summaries
with (security_invoker = true) as
select
  b.id as bill_id,
  b.table_id,
  b.status,
  b.currency,
  b.total_cents,
  coalesce(sum(a.assigned_cents), 0)::bigint as assigned_cents,
  b.total_cents - coalesce(sum(a.assigned_cents), 0)::bigint as remaining_cents
from public.bills b
left join public.bill_item_assignments a on a.bill_id = b.id
group by b.id;

-- Same figure as the view, but readable from inside definer functions where
-- the caller's RLS would otherwise hide rows.
create or replace function public.bill_assigned_cents(p_bill_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    public.item_assigned_cents(
      bi.quantity,
      bi.unit_price_cents,
      bi.total_price_cents,
      (select coalesce(sum(ic.quantity), 0) from public.item_claims ic where ic.bill_item_id = bi.id)
    )
  ), 0)::bigint
  from public.bill_items bi
  where bi.bill_id = p_bill_id;
$$;

create or replace function public.bill_remaining_cents(p_bill_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select total_cents from public.bills where id = p_bill_id), 0)
    - public.bill_assigned_cents(p_bill_id);
$$;

-- ---------------------------------------------------------------------------
-- Claim rules, enforced in the database rather than trusted from the client
-- ---------------------------------------------------------------------------

create or replace function public.enforce_claim_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.bill_items%rowtype;
  v_bill public.bills%rowtype;
  v_participant public.participants%rowtype;
  v_other_claimed bigint;
begin
  -- Lock the line so two people claiming the last unit cannot both succeed.
  select * into v_item from public.bill_items where id = new.bill_item_id for update;
  if not found then
    raise exception 'Bill item % does not exist', new.bill_item_id;
  end if;

  select * into v_bill from public.bills where id = v_item.bill_id;
  select * into v_participant from public.participants where id = new.participant_id;
  if not found then
    raise exception 'Participant % does not exist', new.participant_id;
  end if;

  if v_participant.table_id <> v_bill.table_id then
    raise exception 'Participant % does not belong to the table this bill is for', new.participant_id;
  end if;

  if v_bill.status = 'COMPLETED' then
    raise exception 'This bill is completed and can no longer be changed';
  end if;

  if v_item.quantity > 1 then
    select coalesce(sum(quantity), 0) into v_other_claimed
    from public.item_claims
    where bill_item_id = new.bill_item_id
      and id is distinct from new.id;

    if v_other_claimed + new.quantity > v_item.quantity then
      raise exception 'Only % of % units of "%" are still available',
        v_item.quantity - v_other_claimed, v_item.quantity, v_item.name;
    end if;
  end if;

  return new;
end;
$$;

create trigger item_claims_enforce_rules
  before insert or update on public.item_claims
  for each row execute function public.enforce_claim_rules();

-- ---------------------------------------------------------------------------
-- Status lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.apply_assignment_status(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_assigned bigint;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found or v_bill.status = 'COMPLETED' then
    return;
  end if;

  v_assigned := public.bill_assigned_cents(p_bill_id);

  if v_bill.total_cents > 0 and v_assigned = v_bill.total_cents then
    update public.bills set status = 'FULLY_ASSIGNED'
      where id = p_bill_id and status <> 'FULLY_ASSIGNED';
    update public.tables set status = 'FULLY_ASSIGNED'
      where id = v_bill.table_id and status <> 'COMPLETED';
  elsif v_bill.status = 'FULLY_ASSIGNED' then
    update public.bills set status = 'OPEN' where id = p_bill_id;
    update public.tables set status = 'BILL_IN_PROGRESS'
      where id = v_bill.table_id and status = 'FULLY_ASSIGNED';
  end if;
end;
$$;

create or replace function public.refresh_status_from_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id uuid;
begin
  select bi.bill_id into v_bill_id
  from public.bill_items bi
  where bi.id = coalesce(new.bill_item_id, old.bill_item_id);

  if v_bill_id is not null then
    perform public.apply_assignment_status(v_bill_id);
  end if;

  return null;
end;
$$;

create trigger item_claims_refresh_status
  after insert or update or delete on public.item_claims
  for each row execute function public.refresh_status_from_claim();

create or replace function public.refresh_status_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_assignment_status(coalesce(new.bill_id, old.bill_id));
  return null;
end;
$$;

create trigger bill_items_refresh_status
  after insert or update or delete on public.bill_items
  for each row execute function public.refresh_status_from_item();

-- ---------------------------------------------------------------------------
-- Completion, validated server-side
-- ---------------------------------------------------------------------------

create or replace function public.validate_bill_completion(p_bill_id uuid)
returns table (is_valid boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_item_count integer;
  v_assigned bigint;
  v_people_sum bigint;
  v_overclaimed integer;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    return query select false, 'This bill does not exist.'; return;
  end if;

  select count(*) into v_item_count from public.bill_items where bill_id = p_bill_id;
  if v_item_count = 0 then
    return query select false, 'There is nothing on this bill yet.'; return;
  end if;

  if v_bill.total_cents <= 0 then
    return query select false, 'The bill total has not been set.'; return;
  end if;

  -- Belt and braces: the claim trigger already prevents this.
  select count(*) into v_overclaimed
  from public.bill_items bi
  where bi.quantity > 1
    and (select coalesce(sum(ic.quantity), 0) from public.item_claims ic where ic.bill_item_id = bi.id) > bi.quantity;

  if v_overclaimed > 0 then
    return query select false, 'Some items are claimed more times than they exist.'; return;
  end if;

  v_assigned := public.bill_assigned_cents(p_bill_id);
  if v_assigned <> v_bill.total_cents then
    return query select false, 'Some items have not been claimed yet.'; return;
  end if;

  select coalesce(sum(t.total_cents), 0) into v_people_sum
  from public.participant_totals t
  where t.table_id = v_bill.table_id;

  if v_people_sum <> v_bill.total_cents then
    return query select false, 'The shares do not add up to the bill total.'; return;
  end if;

  return query select true, null::text;
end;
$$;

-- Closes the bill. Only the admin who owns the table may call it, and only
-- when every validation passes.
create or replace function public.complete_bill(p_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_is_admin boolean;
  v_check record;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    raise exception 'This bill does not exist.';
  end if;

  select exists (
    select 1 from public.tables t
    where t.id = v_bill.table_id and t.admin_id = (select auth.uid())
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only the admin of this table can complete the bill.';
  end if;

  select * into v_check from public.validate_bill_completion(p_bill_id);
  if not v_check.is_valid then
    raise exception '%', v_check.reason;
  end if;

  update public.bills
    set status = 'COMPLETED', completed_at = now()
    where id = p_bill_id
    returning * into v_bill;

  update public.tables set status = 'COMPLETED' where id = v_bill.table_id;

  return v_bill;
end;
$$;

create or replace function public.start_bill(p_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    raise exception 'This bill does not exist.';
  end if;

  if not exists (
    select 1 from public.tables t
    where t.id = v_bill.table_id and t.admin_id = (select auth.uid())
  ) then
    raise exception 'Only the admin of this table can start the bill.';
  end if;

  update public.bills set status = 'OPEN' where id = p_bill_id and status = 'DRAFT'
    returning * into v_bill;

  update public.tables set status = 'BILL_IN_PROGRESS'
    where id = v_bill.table_id and status = 'WAITING_FOR_GUESTS';

  return v_bill;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Admin-only for now. Guest access arrives in a later step through a
-- controlled session-token mechanism; nothing here is open to anon.
-- ---------------------------------------------------------------------------

create or replace function public.is_table_admin(p_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tables t
    where t.id = p_table_id and t.admin_id = (select auth.uid())
  );
$$;

create or replace function public.is_bill_admin(p_bill_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bills b
    join public.tables t on t.id = b.table_id
    where b.id = p_bill_id and t.admin_id = (select auth.uid())
  );
$$;

create or replace function public.is_bill_item_admin(p_bill_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bill_items bi
    join public.bills b on b.id = bi.bill_id
    join public.tables t on t.id = b.table_id
    where bi.id = p_bill_item_id and t.admin_id = (select auth.uid())
  );
$$;

alter table public.profiles enable row level security;
alter table public.tables enable row level security;
alter table public.participants enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.item_claims enable row level security;

-- profiles
create policy "Admins read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Admins update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Admins create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

-- tables
create policy "Admins read their own tables"
  on public.tables for select to authenticated
  using (admin_id = (select auth.uid()));

create policy "Admins create their own tables"
  on public.tables for insert to authenticated
  with check (admin_id = (select auth.uid()));

create policy "Admins update their own tables"
  on public.tables for update to authenticated
  using (admin_id = (select auth.uid()))
  with check (admin_id = (select auth.uid()));

create policy "Admins delete their own tables"
  on public.tables for delete to authenticated
  using (admin_id = (select auth.uid()));

-- participants
create policy "Admins read participants of their tables"
  on public.participants for select to authenticated
  using (public.is_table_admin(table_id));

create policy "Admins add participants to their tables"
  on public.participants for insert to authenticated
  with check (public.is_table_admin(table_id));

create policy "Admins update participants of their tables"
  on public.participants for update to authenticated
  using (public.is_table_admin(table_id))
  with check (public.is_table_admin(table_id));

create policy "Admins remove participants of their tables"
  on public.participants for delete to authenticated
  using (public.is_table_admin(table_id));

-- bills
create policy "Admins read bills of their tables"
  on public.bills for select to authenticated
  using (public.is_table_admin(table_id));

create policy "Admins create bills for their tables"
  on public.bills for insert to authenticated
  with check (public.is_table_admin(table_id));

create policy "Admins update bills of their tables"
  on public.bills for update to authenticated
  using (public.is_table_admin(table_id))
  with check (public.is_table_admin(table_id));

create policy "Admins delete bills of their tables"
  on public.bills for delete to authenticated
  using (public.is_table_admin(table_id));

-- bill_items
create policy "Admins read items of their bills"
  on public.bill_items for select to authenticated
  using (public.is_bill_admin(bill_id));

create policy "Admins create items on their bills"
  on public.bill_items for insert to authenticated
  with check (public.is_bill_admin(bill_id));

create policy "Admins update items of their bills"
  on public.bill_items for update to authenticated
  using (public.is_bill_admin(bill_id))
  with check (public.is_bill_admin(bill_id));

create policy "Admins delete items of their bills"
  on public.bill_items for delete to authenticated
  using (public.is_bill_admin(bill_id));

-- item_claims
create policy "Admins read claims on their bills"
  on public.item_claims for select to authenticated
  using (public.is_bill_item_admin(bill_item_id));

create policy "Admins create claims on their bills"
  on public.item_claims for insert to authenticated
  with check (public.is_bill_item_admin(bill_item_id));

create policy "Admins update claims on their bills"
  on public.item_claims for update to authenticated
  using (public.is_bill_item_admin(bill_item_id))
  with check (public.is_bill_item_admin(bill_item_id));

create policy "Admins delete claims on their bills"
  on public.item_claims for delete to authenticated
  using (public.is_bill_item_admin(bill_item_id));

-- The guest secret is never needed by a client. Keep it out of reach even for
-- the table's own admin; read participants through `table_participants`.
revoke select (session_token) on public.participants from anon, authenticated;

create or replace view public.table_participants
with (security_invoker = true) as
select id, table_id, name, is_admin, joined_at, last_seen_at, is_active
from public.participants;

-- ---------------------------------------------------------------------------
-- How to try this out
--
-- There is no seed data on purpose: no fake production users. To exercise the
-- schema, sign up an admin through the app, then run (as that admin):
--
--   insert into tables (admin_id, name, restaurant_name)
--   values (auth.uid(), 'Friday Dinner', 'Trattoria Roma')
--   returning id, invite_code;
--
--   insert into participants (table_id, name, is_admin) values
--     ('<table-id>', 'George', true),
--     ('<table-id>', 'Alex', false),
--     ('<table-id>', 'Andrei', false),
--     ('<table-id>', 'Maria', false);
--
--   insert into bills (table_id, total_cents, subtotal_cents)
--   values ('<table-id>', 8500, 8500) returning id;
--
--   insert into bill_items (bill_id, name, quantity, unit_price_cents, total_price_cents) values
--     ('<bill-id>', 'Pizza Margherita', 1, 3000, 3000),
--     ('<bill-id>', 'Pasta Carbonara',  1, 2000, 2000),
--     ('<bill-id>', 'Coca Cola',        4,  500, 2000),
--     ('<bill-id>', 'Beer',             3,  500, 1500);
--
-- Then claim items and watch `bill_summaries` and `participant_totals`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Corrections applied after the first run (kept here so a fresh project gets
-- the final shape in one pass).
-- ---------------------------------------------------------------------------

-- Participant totals scoped to a single bill. The table-level view sums every
-- bill at that table, which is the wrong figure for validating one bill.
create or replace view public.bill_participant_totals
with (security_invoker = true) as
select
  bi.bill_id,
  p.id as participant_id,
  p.name,
  coalesce(sum(s.amount_cents), 0)::bigint as total_cents
from public.bill_items bi
join public.item_claim_shares s on s.bill_item_id = bi.id
join public.participants p on p.id = s.participant_id
group by bi.bill_id, p.id;

-- Read-only money helpers must NOT be SECURITY DEFINER: as definer they
-- bypassed RLS, letting any signed-in admin read another admin's totals by id.
-- As invoker the caller's policies apply, and calls made from inside the
-- definer functions (status triggers, complete_bill) still see everything.
create or replace function public.bill_assigned_cents(p_bill_id uuid)
returns bigint language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(
    public.item_assigned_cents(
      bi.quantity,
      bi.unit_price_cents,
      bi.total_price_cents,
      (select coalesce(sum(ic.quantity), 0) from public.item_claims ic where ic.bill_item_id = bi.id)
    )
  ), 0)::bigint
  from public.bill_items bi
  where bi.bill_id = p_bill_id;
$$;

create or replace function public.bill_remaining_cents(p_bill_id uuid)
returns bigint language sql stable security invoker set search_path = '' as $$
  select coalesce((select total_cents from public.bills where id = p_bill_id), 0)
    - public.bill_assigned_cents(p_bill_id);
$$;

create or replace function public.validate_bill_completion(p_bill_id uuid)
returns table (is_valid boolean, reason text)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_bill public.bills%rowtype;
  v_item_count integer;
  v_assigned bigint;
  v_people_sum bigint;
  v_overclaimed integer;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    return query select false, 'This bill does not exist.'; return;
  end if;

  select count(*) into v_item_count from public.bill_items where bill_id = p_bill_id;
  if v_item_count = 0 then
    return query select false, 'There is nothing on this bill yet.'; return;
  end if;

  if v_bill.total_cents <= 0 then
    return query select false, 'The bill total has not been set.'; return;
  end if;

  select count(*) into v_overclaimed
  from public.bill_items bi
  where bi.bill_id = p_bill_id
    and bi.quantity > 1
    and (select coalesce(sum(ic.quantity), 0) from public.item_claims ic where ic.bill_item_id = bi.id) > bi.quantity;

  if v_overclaimed > 0 then
    return query select false, 'Some items are claimed more times than they exist.'; return;
  end if;

  v_assigned := public.bill_assigned_cents(p_bill_id);
  if v_assigned <> v_bill.total_cents then
    return query select false, 'Some items have not been claimed yet.'; return;
  end if;

  select coalesce(sum(t.total_cents), 0) into v_people_sum
  from public.bill_participant_totals t
  where t.bill_id = p_bill_id;

  if v_people_sum <> v_bill.total_cents then
    return query select false, 'The shares do not add up to the bill total.'; return;
  end if;

  return query select true, null::text;
end;
$$;

-- Keep the guest secret out of client reach. A column-level REVOKE is a no-op
-- while the role still holds a table-wide SELECT grant, so the table
-- privilege goes first and the safe columns are granted back explicitly.
revoke select, insert, update on public.participants from anon, authenticated;

grant select (id, table_id, name, is_admin, joined_at, last_seen_at, is_active)
  on public.participants to authenticated;
grant insert (id, table_id, name, is_admin, is_active)
  on public.participants to authenticated;
grant update (name, is_admin, last_seen_at, is_active)
  on public.participants to authenticated;
grant delete on public.participants to authenticated;

comment on view public.table_participants is
  'Safe read path for participants: every column except session_token. Prefer this over select * on participants.';

-- Every SECURITY DEFINER function in `public` is reachable at /rest/v1/rpc/...
-- Postgres also grants EXECUTE to PUBLIC on every new function, and PUBLIC
-- covers anon and authenticated, so the revoke has to name PUBLIC explicitly.
-- Triggers keep working because they run as the table owner.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_claim_rules() from public, anon, authenticated;
revoke execute on function public.refresh_status_from_claim() from public, anon, authenticated;
revoke execute on function public.refresh_status_from_item() from public, anon, authenticated;
revoke execute on function public.apply_assignment_status(uuid) from public, anon, authenticated;

revoke execute on function public.complete_bill(uuid) from public, anon;
revoke execute on function public.start_bill(uuid) from public, anon;
revoke execute on function public.validate_bill_completion(uuid) from public, anon;
revoke execute on function public.bill_assigned_cents(uuid) from public, anon;
revoke execute on function public.bill_remaining_cents(uuid) from public, anon;
revoke execute on function public.generate_invite_code(integer) from public, anon;
revoke execute on function public.item_assigned_cents(integer, bigint, bigint, bigint) from public, anon;
revoke execute on function public.is_table_admin(uuid) from public, anon;
revoke execute on function public.is_bill_admin(uuid) from public, anon;
revoke execute on function public.is_bill_item_admin(uuid) from public, anon;

-- Grant back only what a signed-in admin genuinely needs.
grant execute on function public.complete_bill(uuid) to authenticated;
grant execute on function public.start_bill(uuid) to authenticated;
grant execute on function public.validate_bill_completion(uuid) to authenticated;
grant execute on function public.bill_assigned_cents(uuid) to authenticated;
grant execute on function public.bill_remaining_cents(uuid) to authenticated;
-- Column default when inserting a table.
grant execute on function public.generate_invite_code(integer) to authenticated;
-- Used inside the security_invoker views.
grant execute on function public.item_assigned_cents(integer, bigint, bigint, bigint) to authenticated;
-- Evaluated by the RLS policies as the querying role; they only answer
-- "does the caller own this?".
grant execute on function public.is_table_admin(uuid) to authenticated;
grant execute on function public.is_bill_admin(uuid) to authenticated;
grant execute on function public.is_bill_item_admin(uuid) to authenticated;
