-- ---------------------------------------------------------------------------
-- Make the grants on `restaurants` say what the rules already mean
--
-- The table was created with Supabase's default privileges, which hand `anon`
-- and `authenticated` all of SELECT/INSERT/UPDATE/DELETE. The migration that
-- created it then wrote `grant select, insert, update ... to authenticated`,
-- which reads like a restriction but is purely additive — it revoked nothing.
--
-- Nothing was exploitable: RLS has no DELETE policy, so a direct delete
-- affects zero rows, and `anon` has no policy at all. But "no DELETE grant, so
-- the function is the only route" was written down as the reason, and it was
-- not true. That is the dangerous kind of wrong — the next change reads it,
-- believes the grant is absent, adds a permissive DELETE policy, and quietly
-- opens a path around `owner_delete_restaurant`'s owner check.
--
-- So the privileges are brought in line with the rules rather than the
-- sentence being softened:
--
--   * `anon` loses everything. Guests reach data only through SECURITY DEFINER
--     functions, which is the architecture everywhere else in this schema;
--     `restaurants` was the one table that quietly disagreed.
--   * `authenticated` loses DELETE. Removing a restaurant goes through
--     `owner_delete_restaurant`, which runs as the definer and is unaffected,
--     and merging goes through `owner_merge_restaurants` for the same reason.
--
-- RLS stays exactly as it was. This is defence in depth, not the defence.
-- ---------------------------------------------------------------------------

revoke all on public.restaurants from anon;

revoke delete on public.restaurants from authenticated;

-- Restated so the intended set is visible in one place rather than inferred
-- from what the default privileges happened to leave behind.
grant select, insert, update on public.restaurants to authenticated;
