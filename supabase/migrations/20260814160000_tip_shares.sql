-- Splits the tip evenly across everyone currently active at the table.
--
-- Item shares answer "what did you eat" — proportional to what was claimed.
-- The tip is a different question: a flat social convention, split by
-- headcount, not by who ordered more. It gets its own view rather than being
-- folded into `item_claim_shares`, and largest remainder keeps it exact to
-- the cent, the same method used everywhere else money is divided here.
--
-- "Active at the table" means `participants.is_active`, read live: someone
-- who joins or leaves changes the split immediately, the same as every other
-- figure in this app, and the existing realtime broadcast on `participants`
-- already covers it — no new trigger needed.

create or replace view public.bill_tip_shares
with (security_invoker = true) as
with active_people as (
  select
    b.id as bill_id,
    p.id as participant_id,
    p.name,
    p.joined_at,
    count(*) over (partition by b.id) as active_count
  from public.bills b
  join public.participants p
    on p.table_id = b.table_id and p.is_active
),
ranked as (
  select
    ap.*,
    row_number() over (partition by ap.bill_id order by ap.joined_at, ap.participant_id) as rn
  from active_people ap
)
select
  r.bill_id,
  r.participant_id,
  r.name,
  r.active_count,
  (
    (b.tip_cents / r.active_count)
    + case when r.rn <= (b.tip_cents % r.active_count) then 1 else 0 end
  )::bigint as tip_share_cents
from ranked r
join public.bills b on b.id = r.bill_id;

comment on view public.bill_tip_shares is
  'The bill''s tip, split evenly by headcount among participants currently active at the table. Not proportional to what anyone claimed — a flat per-person share, largest remainder to keep cents exact.';

/** Guest read: same shape as `get_guest_totals`, so the two lists line up. */
create or replace function public.get_guest_tip_shares(p_session_token text)
returns table (
  participant_id uuid,
  participant_name text,
  is_me boolean,
  tip_share_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants%rowtype;
  v_bill public.bills%rowtype;
begin
  v_participant := public.resolve_guest_session(p_session_token);

  select * into v_bill
  from public.bills
  where table_id = v_participant.table_id
  order by created_at
  limit 1;

  if not found then
    return;
  end if;

  return query
    select s.participant_id, s.name, (s.participant_id = v_participant.id), s.tip_share_cents
    from public.bill_tip_shares s
    where s.bill_id = v_bill.id
    order by s.name;
end;
$$;

revoke execute on function public.get_guest_tip_shares(text) from public;
grant execute on function public.get_guest_tip_shares(text) to anon, authenticated;
