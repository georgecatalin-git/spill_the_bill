-- Tracks who has actually handed over their money.
--
-- Everything up to now answers "what do you owe". This answers "did you pay",
-- which is the other half of splitting a bill and the part that otherwise
-- lives in someone's memory until the next argument.
--
-- Only the admin marks people paid: they are the one the money physically
-- reaches, so their record is the one worth keeping. A guest declaring
-- themselves paid would be a claim, not a confirmation — the two are
-- different things and conflating them is how the argument starts.
--
-- Settlement is deliberately allowed on a COMPLETED bill. `freeze_completed_bills`
-- stops the bill's FIGURES from changing; who has paid is not a figure on the
-- receipt, and in practice most people pay AFTER the bill is closed. Freezing
-- that too would make the feature useless exactly when it is needed.

alter table public.participants
  add column if not exists settled_at timestamptz,
  add column if not exists settled_by uuid references public.profiles(id) on delete set null;

comment on column public.participants.settled_at is
  'When the admin confirmed this person handed over their share. Null means unpaid.';
comment on column public.participants.settled_by is
  'Which admin confirmed the payment. Kept so a disputed settlement has an author.';

-- `participants` has no table-wide SELECT, so `session_token` stays
-- unreachable — which means a new column is invisible until it is granted, and
-- Postgres refuses the WHOLE read rather than just the ungranted columns.
-- Without this, `table_participants` stops loading for every admin.
grant select (settled_at, settled_by) on public.participants to authenticated;

/**
 * Marks one participant paid or unpaid.
 *
 * Takes the table id rather than trusting a bill id from the client, and
 * verifies the caller owns that table before touching anything — the same
 * boundary every other admin write goes through.
 */
create or replace function public.set_participant_settled(
  p_participant_id uuid,
  p_settled boolean
)
returns public.participants
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
  v_bill_id uuid;
begin
  select * into v_participant
  from public.participants
  where id = p_participant_id;

  if not found then
    raise exception 'That person is not at this table.' using errcode = '22000';
  end if;

  if not public.is_table_admin(v_participant.table_id) then
    raise exception 'Only the table admin can record a payment.' using errcode = '42501';
  end if;

  update public.participants
  set
    settled_at = case when p_settled then now() else null end,
    settled_by = case when p_settled then (select auth.uid()) else null end
  where id = p_participant_id
  returning * into v_participant;

  -- Tell every device at this table, through the channel they already watch.
  select id into v_bill_id
  from public.bills
  where table_id = v_participant.table_id
  order by created_at
  limit 1;

  perform public.broadcast_bill_change(v_bill_id, 'participants', 'UPDATE');

  return v_participant;
end;
$$;

revoke execute on function public.set_participant_settled(uuid, boolean) from public, anon;
grant execute on function public.set_participant_settled(uuid, boolean) to authenticated;

/**
 * Guest read: who at this table has paid.
 *
 * Guests see the state but cannot change it. Seeing it matters — it is how
 * someone knows their own payment was registered, and how the group sees who
 * is still outstanding without asking out loud.
 */
create or replace function public.get_guest_settlements(p_session_token text)
returns table (
  participant_id uuid,
  participant_name text,
  is_me boolean,
  settled boolean,
  settled_at timestamptz
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
      p.id,
      p.name,
      (p.id = v_participant.id),
      (p.settled_at is not null),
      p.settled_at
    from public.participants p
    where p.table_id = v_participant.table_id
      and p.is_active
    order by p.joined_at;
end;
$$;

revoke execute on function public.get_guest_settlements(text) from public;
grant execute on function public.get_guest_settlements(text) to anon, authenticated;

-- The admin reads settlement straight off `table_participants`, which already
-- excludes the guest secret; the two new columns ride along with it.
--
-- Every existing column is restated in its original order — a `create or
-- replace view` that drops one would break the readers that select it, and
-- `last_seen_at` is easy to lose sight of when adding to the end.
create or replace view public.table_participants
with (security_invoker = true) as
select
  p.id,
  p.table_id,
  p.name,
  p.is_admin,
  p.joined_at,
  p.last_seen_at,
  p.is_active,
  p.settled_at,
  p.settled_by
from public.participants p;
