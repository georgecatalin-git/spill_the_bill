-- Fixes "Could not load the people at this table." for every admin.
--
-- `settlement_tracking` added `settled_at` and `settled_by` to `participants`
-- and put them in the `table_participants` view, but never granted SELECT on
-- them. Column privileges are not retroactive: a column added after the grant
-- is simply not in it, and Postgres refuses the whole read rather than the two
-- columns — so the admin's participant list stopped loading entirely, which is
-- the list the bill screen, the overview and the finish flow are all built on.
--
-- This is the same trap AGENTS.md already records from the other direction:
-- `participants` deliberately has no table-wide SELECT, precisely so
-- `session_token` stays unreachable. The cost of that design is that every new
-- column has to be granted on purpose. Adding one and forgetting is a silent
-- outage, not a warning.
--
-- `anon` is deliberately left out. Guests never read this table directly —
-- they go through the `get_guest_*` functions, which are SECURITY DEFINER and
-- return only what a guest is allowed to see.

grant select (settled_at, settled_by) on public.participants to authenticated;
