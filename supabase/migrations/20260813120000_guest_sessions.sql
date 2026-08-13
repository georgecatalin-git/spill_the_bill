-- Guest invitations and guest sessions.
--
-- Guests never get a Supabase Auth account. They join with an invite code,
-- receive an opaque session token, and reach their table ONLY through the
-- SECURITY DEFINER functions below. The `anon` role keeps zero direct table
-- access, so a guest cannot swap a UUID and read someone else's table.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Secure randomness
-- ---------------------------------------------------------------------------

-- Invite codes were generated with random(), which is seeded and predictable.
-- Draw from the CSPRNG instead. Rejection sampling keeps the distribution even
-- across the 32-character alphabet.
create or replace function public.generate_invite_code(p_length integer default 6)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_byte integer;
  v_attempts integer := 0;
begin
  loop
    v_code := '';
    while length(v_code) < p_length loop
      v_byte := get_byte(extensions.gen_random_bytes(1), 0);
      -- 256 is not a multiple of 32; discarding the tail keeps it uniform.
      if v_byte < 256 - (256 % length(v_alphabet)) then
        v_code := v_code || substr(v_alphabet, (v_byte % length(v_alphabet)) + 1, 1);
      end if;
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

/** 32 bytes from the CSPRNG. Never Math.random(), never predictable. */
create or replace function public.generate_session_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- Session resolution
--
-- Every guest function starts here. One place decides whether a token is
-- real, which participant it belongs to, and which table that participant may
-- see. Nothing downstream trusts a client-supplied id.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_guest_session(p_session_token text)
returns public.participants
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
begin
  if p_session_token is null or length(p_session_token) < 32 then
    raise exception 'Your session has expired.' using errcode = '28000';
  end if;

  select * into v_participant
  from public.participants
  where session_token = p_session_token;

  if not found then
    raise exception 'Your session has expired.' using errcode = '28000';
  end if;

  return v_participant;
end;
$$;

/** Cheap check the client can call on launch to see if its stored session still works. */
create or replace function public.validate_guest_session(p_session_token text)
returns table (
  participant_id uuid,
  table_id uuid,
  guest_name text,
  is_active boolean,
  table_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
  v_table public.tables%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);
  select * into v_table from public.tables where id = v_participant.table_id;

  if not found then
    raise exception 'Your session has expired.' using errcode = '28000';
  end if;

  return query select
    v_participant.id, v_participant.table_id, v_participant.name,
    v_participant.is_active, v_table.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------

/**
 * Turns an invite code into a guest session.
 *
 * Passing the token of an existing session rejoins that participant instead of
 * creating a second row, which is what happens when a guest reopens the link
 * or comes back after leaving.
 */
create or replace function public.join_table(
  p_invite_code text,
  p_guest_name text,
  p_session_token text default null
)
returns table (
  participant_id uuid,
  table_id uuid,
  guest_name text,
  session_token text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_table public.tables%rowtype;
  v_name text;
  v_existing public.participants%rowtype;
  v_token text;
  v_id uuid;
begin
  v_name := trim(coalesce(p_guest_name, ''));

  if v_name = '' then
    raise exception 'Please enter your name.' using errcode = '22000';
  end if;

  if length(v_name) > 60 then
    raise exception 'That name is too long.' using errcode = '22000';
  end if;

  -- Codes are stored uppercase; accept whatever casing the link carried.
  select * into v_table
  from public.tables
  where invite_code = upper(trim(coalesce(p_invite_code, '')));

  if not found then
    raise exception 'Invalid invitation link.' using errcode = '22000';
  end if;

  if v_table.status = 'COMPLETED' then
    raise exception 'This table is no longer accepting guests.' using errcode = '22000';
  end if;

  -- Rejoin path: same device, same table.
  if p_session_token is not null then
    select * into v_existing
    from public.participants
    where session_token = p_session_token and participants.table_id = v_table.id;

    if found then
      update public.participants
        set name = v_name, is_active = true, last_seen_at = now()
        where id = v_existing.id;

      return query select v_existing.id, v_table.id, v_name, p_session_token;
      return;
    end if;
  end if;

  v_token := public.generate_session_token();

  insert into public.participants (table_id, name, is_admin, session_token, last_seen_at)
  values (v_table.id, v_name, false, v_token, now())
  returning id into v_id;

  return query select v_id, v_table.id, v_name, v_token;
end;
$$;

/**
 * Leaves the table without erasing history.
 *
 * The participant row stays so past claims and totals still make sense; only
 * the presence flag changes.
 */
create or replace function public.leave_table(p_session_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  update public.participants
    set is_active = false, last_seen_at = now()
    where id = v_participant.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest reads — each one scoped to the session's own table
-- ---------------------------------------------------------------------------

create or replace function public.get_guest_table(p_session_token text)
returns table (
  id uuid,
  name text,
  restaurant_name text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  -- admin_id, invite_code and timestamps are deliberately not returned.
  return query
    select t.id, t.name, t.restaurant_name, t.status
    from public.tables t
    where t.id = v_participant.table_id;
end;
$$;

create or replace function public.get_guest_participants(p_session_token text)
returns table (
  id uuid,
  name text,
  is_admin boolean,
  is_active boolean,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  -- session_token is never selected here.
  return query
    select p.id, p.name, p.is_admin, p.is_active, p.joined_at
    from public.participants p
    where p.table_id = v_participant.table_id
    order by p.joined_at;
end;
$$;

create or replace function public.get_guest_bill(p_session_token text)
returns table (
  id uuid,
  status text,
  currency text,
  total_cents bigint,
  assigned_cents bigint,
  remaining_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  return query
    select
      b.id, b.status, b.currency, b.total_cents,
      public.bill_assigned_cents(b.id),
      b.total_cents - public.bill_assigned_cents(b.id)
    from public.bills b
    where b.table_id = v_participant.table_id
    order by b.created_at
    limit 1;
end;
$$;

create or replace function public.get_guest_items(p_session_token text)
returns table (
  id uuid,
  name text,
  quantity integer,
  unit_price_cents bigint,
  total_price_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  return query
    select bi.id, bi.name, bi.quantity, bi.unit_price_cents, bi.total_price_cents
    from public.bill_items bi
    join public.bills b on b.id = bi.bill_id
    where b.table_id = v_participant.table_id
    order by bi.created_at;
end;
$$;

create or replace function public.get_guest_claims(p_session_token text)
returns table (
  bill_item_id uuid,
  participant_id uuid,
  quantity integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  return query
    select ic.bill_item_id, ic.participant_id, ic.quantity
    from public.item_claims ic
    join public.bill_items bi on bi.id = ic.bill_item_id
    join public.bills b on b.id = bi.bill_id
    where b.table_id = v_participant.table_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Guests call these with the publishable key, so they arrive as `anon`. The
-- functions themselves are the authorisation boundary; `anon` still has no
-- direct access to any table.
-- ---------------------------------------------------------------------------

revoke execute on function public.generate_session_token() from public, anon, authenticated;
revoke execute on function public.resolve_guest_session(text) from public, anon, authenticated;

-- The linter will flag these as "callable by anon". That is the design: the
-- functions themselves are the authorisation boundary, and `anon` still has no
-- direct access to any table.
revoke execute on function public.join_table(text, text, text) from public;
revoke execute on function public.leave_table(text) from public;
revoke execute on function public.validate_guest_session(text) from public;
revoke execute on function public.get_guest_table(text) from public;
revoke execute on function public.get_guest_participants(text) from public;
revoke execute on function public.get_guest_bill(text) from public;
revoke execute on function public.get_guest_items(text) from public;
revoke execute on function public.get_guest_claims(text) from public;

grant execute on function public.join_table(text, text, text) to anon, authenticated;
grant execute on function public.leave_table(text) to anon, authenticated;
grant execute on function public.validate_guest_session(text) to anon, authenticated;
grant execute on function public.get_guest_table(text) to anon, authenticated;
grant execute on function public.get_guest_participants(text) to anon, authenticated;
grant execute on function public.get_guest_bill(text) to anon, authenticated;
grant execute on function public.get_guest_items(text) to anon, authenticated;
grant execute on function public.get_guest_claims(text) to anon, authenticated;

-- bill_assigned_cents is called inside get_guest_bill, which runs as definer,
-- so `anon` does not need EXECUTE on it and must not have it.
revoke execute on function public.bill_assigned_cents(uuid) from public, anon;
