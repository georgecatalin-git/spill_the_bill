-- ---------------------------------------------------------------------------
-- Leaving a table stops the reading too
--
-- `leave_table` set `is_active = false`, and every write path checked it — a
-- departed guest could not claim, un-claim, or change anything. But
-- `resolve_guest_session` never looked at the flag, and every *read* went
-- through it. So someone who left kept the whole table: the item list, who
-- ordered what, everyone's name, what each person owed, who had already paid,
-- and the path to the receipt photo — which shows the table, the time, the
-- order, and sometimes the last digits of a card.
--
-- The session token is never rotated either, so "kept" meant permanently.
--
-- The check belongs in the resolver rather than in each of the fifteen
-- readers: one place to be right, and no way to add a sixteenth reader that
-- forgets.
--
-- Two callers must still work on an inactive participant, and they are the
-- reason this is a parameter rather than a plain `if`:
--
--   * `validate_guest_session` *reports* `is_active` — that is how the app
--     knows to offer "you left this table, join again?". Making it throw would
--     turn a rejoinable state into a dead end.
--   * `leave_table` should stay idempotent. Leaving twice is not an error.
--
-- Rejoining is unaffected: `join_table` sets `is_active = true` on an existing
-- token and never goes through the resolver.
-- ---------------------------------------------------------------------------

-- The one-argument form has to go, or a one-argument call would keep resolving
-- to it and the new default would never apply.
drop function if exists public.resolve_guest_session(text);

create function public.resolve_guest_session(
  p_session_token text,
  p_require_active boolean default true
)
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

  -- The same sentence the claim guards already use, so a guest who left sees
  -- one explanation whether they tried to read or to write.
  if p_require_active and not v_participant.is_active then
    raise exception 'You have left this table.' using errcode = '28000';
  end if;

  return v_participant;
end;
$$;

comment on function public.resolve_guest_session(text, boolean) is
  'Turns a guest session token into their participant row. Refuses a guest who has left unless the caller explicitly asks otherwise — only validate_guest_session and leave_table do.';

revoke execute on function public.resolve_guest_session(text, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The two that must tolerate an inactive guest
-- ---------------------------------------------------------------------------

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
  -- Reports the flag rather than enforcing it: this is the call that lets the
  -- app say "you left — join again?" instead of a dead end.
  v_participant := public.resolve_guest_session(p_session_token, false);
  select * into v_table from public.tables where id = v_participant.table_id;

  if not found then
    raise exception 'Your session has expired.' using errcode = '28000';
  end if;

  return query select
    v_participant.id, v_participant.table_id, v_participant.name,
    v_participant.is_active, v_table.status;
end;
$$;

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
  -- Idempotent on purpose: leaving a table you already left is not an error.
  v_participant := public.resolve_guest_session(p_session_token, false);

  update public.participants
    set is_active = false, last_seen_at = now()
    where id = v_participant.id;
end;
$$;
